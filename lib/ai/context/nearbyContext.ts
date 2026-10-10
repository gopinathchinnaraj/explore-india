// Nearby context module
// Provides geographically relevant spots for AI context
// Server-side only

import prisma from "@/lib/db/prisma";

export interface NearbyContextItem {
  name: string;
  slug: string;
  categories: string[];
  distanceKm: number;
  rating: number | null;
}

/**
 * Get nearby spots for a given spot, suitable for AI context.
 * Uses pre-computed SpotNearby table when available.
 */
export async function getNearbyContext(
  spotId: number,
  options: { radiusKm?: number; limit?: number } = {}
): Promise<NearbyContextItem[]> {
  const radiusKm = options.radiusKm ?? 15;
  const limit = options.limit ?? 8;

  const nearby = await prisma.spotNearby.findMany({
    where: {
      spotId,
      distanceMeters: { lte: radiusKm * 1000 },
    },
    include: {
      nearbySpot: {
        select: {
          name: true,
          slug: true,
          rating: true,
          categories: {
            select: { category: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { distanceMeters: "asc" },
    take: limit,
  });

  return nearby.map((n) => ({
    name: n.nearbySpot.name,
    slug: n.nearbySpot.slug,
    categories: n.nearbySpot.categories.map((c) => c.category.name),
    distanceKm: Math.round((n.distanceMeters / 1000) * 10) / 10,
    rating: n.nearbySpot.rating,
  }));
}

/**
 * Serialize nearby context into a compact string for AI prompt.
 */
export function serializeNearbyContext(items: NearbyContextItem[]): string {
  if (items.length === 0) return "No nearby spots computed yet.";
  return items
    .map((n) => {
      const cat = n.categories.join(", ");
      const rating = n.rating ? ` ★${n.rating}` : "";
      return `- ${n.name} [${cat}]${rating} — ${n.distanceKm}km away`;
    })
    .join("\n");
}
