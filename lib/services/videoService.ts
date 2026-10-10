// Video service layer
// Handles fetching, caching, AI classifying, and storing travel videos from SerpApi YouTube
// Server-side only

import prisma from "@/lib/db/prisma";
import {
  searchYouTubeVideos,
  type NormalizedVideo,
} from "@/lib/serpapi/youtube";
import {
  classifyDestinationVideosBatch,
  rankAndSelectDiverseVideos,
} from "@/lib/ai/classifier";
import { classifyVideoContentType } from "@/lib/services/spotVideoService";
import type { DestinationVideo } from "@prisma/client";

const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "24", 10);
const MIN_FRESH_VIDEOS = 10;

/**
 * Serialize Prisma DestinationVideo records for client responses,
 * handling BigInt conversion and inferring category tags.
 */
function serializeVideos(
  videos: DestinationVideo[],
  categoryOverrides?: Map<string, string>
) {
  return videos.map((v) => ({
    id: v.id,
    destinationId: v.destinationId,
    provider: v.provider,
    videoId: v.videoId,
    title: v.title,
    description: v.description,
    channelName: v.channelName,
    channelId: v.channelId,
    thumbnailUrl: v.thumbnailUrl,
    durationSeconds: v.durationSeconds,
    viewCount: v.viewCount ? Number(v.viewCount) : null,
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    videoUrl: v.videoUrl,
    fetchedAt: v.fetchedAt.toISOString(),
    category:
      categoryOverrides?.get(v.videoId) ||
      classifyVideoContentType(v.title, v.description),
  }));
}

/**
 * Get cached videos for a destination, or fetch from SerpApi YouTube if stale or insufficient.
 * Flow:
 * 1. Check PostgreSQL for fresh videos
 * 2. If >= 10 fresh videos exist, return them directly from DB
 * 3. Otherwise fetch video results from SerpApi YouTube
 * 4. Normalize SerpApi fields (duration -> seconds, views -> numeric, published_date -> safe Date or null)
 * 5. Deduplicate by videoId
 * 6. AI classify & rank diverse categories (TRAVEL_GUIDE, DOCUMENTARY, VLOG, HISTORY, etc.)
 * 7. Upsert into PostgreSQL (existing -> update, new -> create)
 * 8. Return fresh persisted records from PostgreSQL
 */
export async function getVideos(destinationId: number, destinationName: string) {
  const staleBefore = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);

  // 1. Check PostgreSQL for fresh videos
  const cachedVideos = await prisma.destinationVideo.findMany({
    where: {
      destinationId,
      fetchedAt: { gte: staleBefore },
    },
    orderBy: [{ viewCount: "desc" }, { id: "desc" }],
    take: MIN_FRESH_VIDEOS,
  });

  // 2. If enough fresh videos are cached, return DB records
  if (cachedVideos.length >= MIN_FRESH_VIDEOS) {
    return {
      videos: serializeVideos(cachedVideos),
      cachedAt: cachedVideos[0].fetchedAt.toISOString(),
      fromCache: true,
    };
  }

  // 3. Fallback: Fetch from SerpApi YouTube
  try {
    console.log(
      `[VideoService] Fetching YouTube videos for "${destinationName}" (cached fresh: ${cachedVideos.length}/${MIN_FRESH_VIDEOS})`
    );

    // Fetch primary travel guide query
    const primaryVideos = await searchYouTubeVideos(destinationName, {
      limit: 15,
      suffix: "travel guide",
    });

    let candidateVideos = [...primaryVideos];

    // If primary query gave fewer than 10 videos, augment with a documentary/vlog query
    if (candidateVideos.length < 10) {
      try {
        const extraVideos = await searchYouTubeVideos(destinationName, {
          limit: 10,
          suffix: "documentary",
        });
        candidateVideos.push(...extraVideos);
      } catch (err) {
        console.warn("[VideoService] Optional secondary search failed:", err);
      }
    }

    // Deduplicate candidates by videoId
    const seenIds = new Set<string>();
    const uniqueCandidates: NormalizedVideo[] = [];
    for (const v of candidateVideos) {
      if (!seenIds.has(v.videoId)) {
        seenIds.add(v.videoId);
        uniqueCandidates.push(v);
      }
    }

    // 4. AI classification & diversity ranking
    const classified = await classifyDestinationVideosBatch(
      uniqueCandidates,
      destinationName
    );

    const topVideos = rankAndSelectDiverseVideos(classified, 10);
    const now = new Date();

    // Map videoId -> classified category for quick reference
    const categoryMap = new Map<string, string>();
    for (const v of topVideos) {
      if (v.category) categoryMap.set(v.videoId, v.category);
    }

    // 5. Upsert into database
    await Promise.all(
      topVideos.map(async (video) => {
        return prisma.destinationVideo.upsert({
          where: {
            destinationId_provider_videoId: {
              destinationId,
              provider: "youtube",
              videoId: video.videoId,
            },
          },
          update: {
            title: video.title,
            description: video.description,
            channelName: video.channelName,
            channelId: video.channelId,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            viewCount: video.viewCount ? BigInt(video.viewCount) : null,
            publishedAt: video.publishedAt, // Safe Date | null (NEVER Invalid Date)
            videoUrl: video.videoUrl,
            fetchedAt: now,
          },
          create: {
            destinationId,
            provider: "youtube",
            videoId: video.videoId,
            title: video.title,
            description: video.description,
            channelName: video.channelName,
            channelId: video.channelId,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            viewCount: video.viewCount ? BigInt(video.viewCount) : null,
            publishedAt: video.publishedAt, // Safe Date | null (NEVER Invalid Date)
            videoUrl: video.videoUrl,
            fetchedAt: now,
          },
        });
      })
    );

    // 6. Query DB again for the persisted records
    const persistedVideos = await prisma.destinationVideo.findMany({
      where: { destinationId },
      orderBy: [{ viewCount: "desc" }, { id: "desc" }],
      take: 10,
    });

    return {
      videos: serializeVideos(persistedVideos, categoryMap),
      cachedAt: now.toISOString(),
      fromCache: false,
    };
  } catch (error) {
    console.error(`[VideoService] Failed to fetch videos for "${destinationName}":`, error);

    // Resilient fallback: return any existing DB videos even if older than cache age
    const fallbackVideos = await prisma.destinationVideo.findMany({
      where: { destinationId },
      orderBy: [{ viewCount: "desc" }, { id: "desc" }],
      take: 10,
    });

    if (fallbackVideos.length > 0) {
      return {
        videos: serializeVideos(fallbackVideos),
        cachedAt: fallbackVideos[0].fetchedAt.toISOString(),
        fromCache: true,
      };
    }

    return {
      videos: [],
      cachedAt: null,
      fromCache: false,
      error: "Videos temporarily unavailable",
    };
  }
}
