// Video context module
// Selects relevant travel videos for AI context
// Server-side only

import prisma from "@/lib/db/prisma";

export interface VideoContextItem {
  title: string;
  channelName: string | null;
  contentType: string;
  videoUrl: string;
  viewCount: number | null;
  relevanceScore: number | null;
}

/**
 * Get the most relevant videos for a spot for AI context.
 * Prefers DOCUMENTARY and TRAVEL_GUIDE over VLOG.
 */
export async function getVideoContext(
  spotId: number,
  options: { limit?: number } = {}
): Promise<VideoContextItem[]> {
  const limit = options.limit || 5;

  const videos = await prisma.spotVideo.findMany({
    where: {
      spotId,
      contentType: { in: ["DOCUMENTARY", "HISTORY", "TRAVEL_GUIDE", "WALKING_TOUR"] },
    },
    select: {
      title: true,
      channelName: true,
      contentType: true,
      videoUrl: true,
      viewCount: true,
      relevanceScore: true,
    },
    orderBy: [{ relevanceScore: "desc" }, { viewCount: "desc" }],
    take: limit,
  });

  return videos.map((v) => ({
    ...v,
    viewCount: v.viewCount ? Number(v.viewCount) : null,
  }));
}

/**
 * Serialize video context into a compact string for AI prompt.
 */
export function serializeVideoContext(videos: VideoContextItem[]): string {
  if (videos.length === 0) return "No travel videos indexed yet.";
  return videos
    .map((v) => {
      const type = v.contentType.replace("_", " ").toLowerCase();
      const views = v.viewCount ? ` (${(v.viewCount / 1000).toFixed(0)}K views)` : "";
      return `- "${v.title}" [${type}] by ${v.channelName || "unknown channel"}${views}`;
    })
    .join("\n");
}
