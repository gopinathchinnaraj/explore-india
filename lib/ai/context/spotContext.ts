// Spot context module
// Retrieves structured spot data from PostgreSQL for AI context
// Server-side only

import prisma from "@/lib/db/prisma";

export interface SpotContextItem {
  id: number;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  categories: string[];
  description: string | null;
  isVerified: boolean;
  discoveryScore: number | null;
}

/**
 * Get spots for a destination, optionally filtered by category.
 * Returns a concise list suitable for AI context (not the full DB record).
 */
export async function getSpotsContext(
  destinationId: number,
  options: {
    categoryNames?: string[];
    limit?: number;
    orderByScore?: boolean;
  } = {}
): Promise<SpotContextItem[]> {
  const where: Record<string, unknown> = {
    destinationId,
    isActive: true,
  };

  if (options.categoryNames && options.categoryNames.length > 0) {
    where.categories = {
      some: {
        category: {
          name: { in: options.categoryNames },
        },
      },
    };
  }

  const spots = await prisma.spot.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      latitude: true,
      longitude: true,
      address: true,
      rating: true,
      reviewCount: true,
      description: true,
      isVerified: true,
      discoveryScore: true,
      categories: {
        select: { category: { select: { name: true } } },
      },
    },
    orderBy: options.orderByScore
      ? [{ discoveryScore: "desc" }, { rating: "desc" }]
      : [{ rating: "desc" }, { name: "asc" }],
    take: options.limit || 20,
  });

  return spots.map((s) => ({
    ...s,
    categories: s.categories.map((c) => c.category.name),
  }));
}

/**
 * Serialize spot context items into a compact string for the AI prompt.
 */
export function serializeSpotsContext(spots: SpotContextItem[]): string {
  if (spots.length === 0) return "No spots available.";
  return spots
    .map((s) => {
      const cat = s.categories.join(", ");
      const rating = s.rating ? `★${s.rating}` : "";
      const reviews = s.reviewCount ? `(${s.reviewCount.toLocaleString()} reviews)` : "";
      return `- ${s.name} [${cat}] ${rating} ${reviews}`.trim();
    })
    .join("\n");
}
