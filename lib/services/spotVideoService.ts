// Spot video service
// Fetches, classifies, and caches travel videos for individual spots
// Uses multiple YouTube search queries and AI classification
// Server-side only

import prisma from "@/lib/db/prisma";
import { searchYouTubeVideos, type NormalizedVideo } from "@/lib/serpapi/youtube";
import { classifyDestinationVideosBatch, rankAndSelectDiverseVideos } from "@/lib/ai/classifier";
import type { VideoContentType } from "@/types/spot";

const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "24", 10);

// Multiple search query suffixes for richer discovery
const VIDEO_QUERY_SUFFIXES = [
  "travel guide",
  "travel vlog",
  "documentary",
  "history",
  "tourism",
];

/**
 * Get cached videos for a spot, or fetch from SerpApi YouTube if stale.
 * Runs multiple searches and deduplicates results.
 * Returns 5–10 high-quality videos.
 */
export async function getSpotVideos(
  spotId: number,
  spotName: string,
  destinationName: string,
  options: { limit?: number } = {}
) {
  const limit = options.limit || 10;
  const cacheAge = new Date();
  cacheAge.setHours(cacheAge.getHours() - CACHE_TTL_HOURS);

  const cachedVideos = await prisma.spotVideo.findMany({
    where: { spotId, fetchedAt: { gte: cacheAge } },
    orderBy: [{ relevanceScore: "desc" }, { viewCount: "desc" }],
    take: limit,
  });

  if (cachedVideos.length >= 5) {
    console.log(`[SpotVideoService] Cache hit for spot ${spotId} (${cachedVideos.length} videos)`);
    return { videos: serializeVideos(cachedVideos), fromCache: true };
  }

  // Fetch from multiple YouTube queries via sync
  try {
    await syncSpotVideos(spotId, spotName, destinationName, { limit });

    const sorted = await prisma.spotVideo.findMany({
      where: { spotId, fetchedAt: { gte: cacheAge } },
      orderBy: [{ relevanceScore: "desc" }, { viewCount: "desc" }],
      take: limit,
    });

    return { videos: serializeVideos(sorted), fromCache: false };
  } catch (error) {
    console.error(`[SpotVideoService] Error fetching videos for spot ${spotId}:`, error);
    return {
      videos: serializeVideos(cachedVideos),
      fromCache: false,
      error: cachedVideos.length === 0 ? "Videos temporarily unavailable" : undefined,
    };
  }
}

/**
 * Synchronize travel videos for a spot from YouTube via SerpApi.
 * Runs multi-query search, deduplicates, AI-classifies, and updates PostgreSQL.
 */
export async function syncSpotVideos(
  spotId: number,
  spotName: string,
  destinationName: string,
  options: { limit?: number } = {}
) {
  const limit = options.limit || 10;

  // Create sync job
  const job = await prisma.apiSyncJob.create({
    data: {
      engine: "youtube",
      scopeType: "spot",
      scopeId: spotId,
      scopeName: spotName,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const queries = buildSearchQueries(spotName, destinationName);
    const allResults = await fetchMultipleQueries(queries);
    const deduped = deduplicateByVideoId(allResults);

    console.log(`[SpotVideoService] Fetched ${deduped.length} unique raw videos for "${spotName}"`);

    // AI / Heuristic classification
    const classified = await classifyDestinationVideosBatch(deduped, spotName);
    const selected = rankAndSelectDiverseVideos(classified, Math.max(limit, 8));

    const now = new Date();
    let createdCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const v = selected[i];
      try {
        await prisma.spotVideo.upsert({
          where: {
            spotId_provider_videoId: {
              spotId,
              provider: v.provider,
              videoId: v.videoId,
            },
          },
          create: {
            spotId,
            provider: v.provider,
            videoId: v.videoId,
            title: v.title,
            description: v.description,
            channelName: v.channelName,
            channelId: v.channelId,
            thumbnailUrl: v.thumbnailUrl,
            durationSeconds: v.durationSeconds,
            viewCount: v.viewCount ? BigInt(v.viewCount) : null,
            publishedAt: v.publishedAt,
            videoUrl: v.videoUrl,
            contentType: v.category,
            relevanceScore: v.relevanceScore,
            fetchedAt: now,
          },
          update: {
            title: v.title,
            description: v.description,
            channelName: v.channelName,
            thumbnailUrl: v.thumbnailUrl,
            durationSeconds: v.durationSeconds,
            viewCount: v.viewCount ? BigInt(v.viewCount) : null,
            publishedAt: v.publishedAt,
            videoUrl: v.videoUrl,
            // contentType and relevanceScore are left alone so admin-curated videos keep
            // their category and position after a refresh
            fetchedAt: now,
          },
        });
        createdCount++;
      } catch (upsertErr) {
        console.warn(`[SpotVideoService] Upsert failed for video ${v.videoId}:`, upsertErr);
      }
    }

    // Mark job completed
    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        itemsProcessed: deduped.length,
        itemsCreated: createdCount,
      },
    });

    const results = await prisma.spotVideo.findMany({
      where: { spotId },
      orderBy: [{ relevanceScore: "desc" }, { viewCount: "desc" }],
      take: limit,
    });

    return serializeVideos(results);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: errorMsg,
      },
    });
    throw error;
  }
}

function buildSearchQueries(spotName: string, destinationName: string): string[] {
  return VIDEO_QUERY_SUFFIXES.map((suffix) => `${spotName} ${destinationName} ${suffix}`);
}

async function fetchMultipleQueries(queries: string[]): Promise<NormalizedVideo[]> {
  const results: NormalizedVideo[] = [];
  for (const query of queries.slice(0, 3)) { // limit to 3 queries to save API quota
    try {
      const videos = await searchYouTubeVideos(query, { limit: 6 });
      results.push(...videos);
    } catch (err) {
      console.warn(`[SpotVideoService] Query failed: "${query}"`, err);
    }
  }
  return results;
}

function deduplicateByVideoId(videos: NormalizedVideo[]): NormalizedVideo[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (!v.videoId || seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}

/**
 * Classify video content type from title/description heuristics.
 * AI classification is handled in the AI classifier; this is a lightweight fallback.
 */
export function classifyVideoContentType(title: string, description?: string | null): VideoContentType {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (text.includes("documentary") || text.includes("history") || text.includes("historical")) return "DOCUMENTARY";
  if (text.includes("travel guide") || text.includes("complete guide") || text.includes("travel guide")) return "TRAVEL_GUIDE";
  if (text.includes("vlog") || text.includes("day trip") || text.includes("i visited")) return "VLOG";
  if (text.includes("walking tour") || text.includes("walk through")) return "WALKING_TOUR";
  if (text.includes("history") || text.includes("ancient") || text.includes("empire")) return "HISTORY";
  if (text.includes("#shorts") || (title.length < 30 && !text.includes("travel"))) return "SHORT";
  return "TRAVEL_GUIDE";
}

/**
 * Compute a relevance score (0–100) for a video.
 * Based on content type, view count, and other heuristics.
 * Does NOT claim views are "most liked" — only uses actual data.
 */
function computeRelevanceScore(video: NormalizedVideo, position: number): number {
  let score = 50;
  const type = classifyVideoContentType(video.title, video.description);
  const typeBonus: Record<VideoContentType, number> = {
    DOCUMENTARY: 25,
    TRAVEL_GUIDE: 20,
    HISTORY: 20,
    WALKING_TOUR: 15,
    VLOG: 10,
    OTHER: 5,
    SHORT: -10,
  };
  score += typeBonus[type] || 0;
  score -= position * 2; // earlier in results = higher relevance
  if (video.viewCount && video.viewCount > 100_000) score += 10;
  if (video.viewCount && video.viewCount > 1_000_000) score += 5;
  return Math.max(0, Math.min(100, score));
}

function buildVideoCreate(
  spotId: number,
  video: NormalizedVideo,
  position: number,
  now: Date
) {
  const contentType = classifyVideoContentType(video.title, video.description);
  const relevanceScore = computeRelevanceScore(video, position);
  return {
    spotId,
    provider: video.provider,
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    channelName: video.channelName,
    channelId: video.channelId,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    viewCount: video.viewCount ? BigInt(video.viewCount) : null,
    publishedAt: video.publishedAt,
    videoUrl: video.videoUrl,
    contentType,
    relevanceScore,
    fetchedAt: now,
  };
}

function buildVideoUpdate(video: NormalizedVideo, position: number, now: Date) {
  const contentType = classifyVideoContentType(video.title, video.description);
  const relevanceScore = computeRelevanceScore(video, position);
  return {
    title: video.title,
    description: video.description,
    channelName: video.channelName,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    viewCount: video.viewCount ? BigInt(video.viewCount) : null,
    publishedAt: video.publishedAt,
    videoUrl: video.videoUrl,
    contentType,
    relevanceScore,
    fetchedAt: now,
  };
}

function serializeVideos(videos: Awaited<ReturnType<typeof prisma.spotVideo.findMany>>) {
  return videos.map((v) => ({
    ...v,
    viewCount: v.viewCount ? Number(v.viewCount) : null,
    publishedAt: v.publishedAt?.toISOString() || null,
    fetchedAt: v.fetchedAt.toISOString(),
  }));
}

// ─── Admin-curated videos ─────────────────────────────────────────────────────

/** Score given to videos an admin adds by hand, so they are listed first. */
export const MANUAL_VIDEO_SCORE = 100;

const VIDEO_TYPES: VideoContentType[] = ["TRAVEL_GUIDE", "DOCUMENTARY", "HISTORY", "VLOG", "WALKING_TOUR", "SHORT", "OTHER"];

export function isVideoContentType(value: unknown): value is VideoContentType {
  return typeof value === "string" && (VIDEO_TYPES as string[]).includes(value);
}

/**
 * Extract the 11-character video id from any common YouTube link
 * (watch, youtu.be, shorts, embed, live, mobile) or a bare id.
 */
export function parseYouTubeId(input: string): { id: string; isShort: boolean } | null {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return { id: text, isShort: false };
  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  let isShort = false;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live" || first === "v") {
      id = second;
      isShort = first === "shorts";
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, isShort } : null;
}

/**
 * Add a YouTube video to a spot from a link. Title, channel and thumbnail come from
 * YouTube's public oEmbed endpoint (free, no API key, no SerpApi credits).
 * Re-adding an existing video just pins it to the top with the chosen category.
 */
export async function addSpotVideoFromUrl(spotId: number, link: string, contentType?: VideoContentType) {
  const parsed = parseYouTubeId(link);
  if (!parsed) throw new Error(`Not a YouTube link: ${link}`);
  const { id, isShort } = parsed;
  const watchUrl = isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;

  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`YouTube couldn't find a public, embeddable video for ${link}`);
  }
  const meta = (await res.json()) as { title?: string; author_name?: string; author_url?: string };
  const type = contentType ?? (isShort ? "SHORT" : classifyVideoContentType(meta.title || ""));

  const data = {
    title: meta.title || "YouTube video",
    channelName: meta.author_name || null,
    channelId: meta.author_url || null,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    videoUrl: watchUrl,
    contentType: type,
    relevanceScore: MANUAL_VIDEO_SCORE,
    fetchedAt: new Date(),
  };

  const video = await prisma.spotVideo.upsert({
    where: { spotId_provider_videoId: { spotId, provider: "youtube", videoId: id } },
    create: { spotId, provider: "youtube", videoId: id, ...data },
    update: data,
  });
  return video;
}
