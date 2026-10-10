// Video types for GoSomewhere
// Maps to future Java VideoDto / DestinationVideo entity

export interface Video {
  id: number;
  provider: string;
  videoId: string;
  title: string;
  description: string | null;
  channelName: string | null;
  channelId: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  publishedAt: string | null;
  publishedLabel?: string | null;
  category?: string | null;
  videoUrl: string;
  fetchedAt: string;
}

export interface VideosResponse {
  videos: Video[];
  cachedAt: string | null;
}
