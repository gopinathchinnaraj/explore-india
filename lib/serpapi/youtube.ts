// SerpApi YouTube search integration
// Used to find travel videos for destinations and spots
// Server-side only - NEVER import in client components

import { serpApiRequest, SerpApiError } from "./client";

export interface YouTubeSearchResult {
  position?: number;
  position_on_page?: number;
  id?: string;
  video_id?: string;
  title: string;
  link: string;
  serpapi_link?: string;
  channel?: {
    name?: string;
    id?: string;
    link?: string;
    thumbnail?: string;
    verified?: boolean;
    subscribers?: string;
  };
  published_date?: string;
  views?: number;
  length?: string;
  duration?: string;
  description?: string;
  thumbnail?: {
    static?: string;
    rich?: string;
  };
  extensions?: string[];
}

export interface YouTubeSearchResponse {
  video_results?: YouTubeSearchResult[];
  error?: string;
}

export interface NormalizedVideo {
  videoId: string;
  title: string;
  description: string | null;
  channelName: string | null;
  channelId: string | null;
  channelUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  publishedAt: Date | null;
  publishedLabel: string | null;
  videoUrl: string;
  provider: string;
}

/**
 * Parse YouTube duration string (e.g. "10:56" or "1:00:32") into total seconds
 */
export function parseDuration(value?: string): number | null {
  if (!value || typeof value !== "string") return null;
  const parts = value.trim().split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p) || p < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

/**
 * Safely parse a date from YouTube.
 * Relative strings like "2y ago", "4mo ago", "3 days ago" cannot safely become exact Dates,
 * so this returns null for them while avoiding "Invalid Date" Prisma errors.
 */
export function parsePublishedDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();

  // YouTube relative display strings
  if (/ago$/i.test(trimmed) || /streamed/i.test(trimmed)) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Parse numeric view counts safely
 */
export function parseViewCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.trunc(num);
}

/**
 * Normalize a raw SerpApi YouTube video result into standard app format
 */
export function normalizeYoutubeVideo(result: YouTubeSearchResult): NormalizedVideo | null {
  if (!result || !result.title || !result.link) {
    return null;
  }

  // Extract YouTube video ID
  const videoIdMatch = result.link.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/
  );
  const videoId = result.video_id || result.id || videoIdMatch?.[1] || "";

  if (!videoId) {
    return null;
  }

  const durationStr = result.length || result.duration;
  const durationSeconds = parseDuration(durationStr);
  const viewCount = parseViewCount(result.views);
  const publishedAt = parsePublishedDate(result.published_date);
  const publishedLabel = result.published_date?.trim() || null;

  const thumbnailUrl =
    result.thumbnail?.static ||
    result.thumbnail?.rich ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title: result.title.trim(),
    description: result.description?.trim() || null,
    channelName: result.channel?.name?.trim() || null,
    channelId: result.channel?.id || null,
    channelUrl: result.channel?.link || null,
    thumbnailUrl,
    durationSeconds,
    viewCount,
    publishedAt,
    publishedLabel,
    videoUrl: result.link,
    provider: "youtube",
  };
}

/**
 * Search for YouTube travel videos about a destination
 */
export async function searchYouTubeVideos(
  destinationName: string,
  options: {
    limit?: number;
    suffix?: string;
    query?: string;
  } = {}
): Promise<NormalizedVideo[]> {
  const query = options.query || `${destinationName} ${options.suffix || "travel guide"}`.trim();

  try {
    const response = await serpApiRequest<YouTubeSearchResponse>({
      engine: "youtube",
      search_query: query,
    });

    const results = response.video_results || [];

    const normalized = results
      .map(normalizeYoutubeVideo)
      .filter((v): v is NormalizedVideo => v !== null);

    // Deduplicate by videoId
    const seen = new Set<string>();
    const deduped: NormalizedVideo[] = [];
    for (const v of normalized) {
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        deduped.push(v);
      }
    }

    return deduped.slice(0, options.limit || 12);
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    throw new SerpApiError(
      `Failed to search YouTube: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }
}
