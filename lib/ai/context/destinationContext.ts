// Destination context module
// Retrieves structured destination data from PostgreSQL for AI context
// Server-side only

import prisma from "@/lib/db/prisma";

export interface DestinationContextData {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  state: string;
  categories: string[];
  facts: Array<{ factType: string; title: string | null; content: string }>;
  spotCount: number;
}

/**
 * Retrieve full destination context from DB for AI consumption.
 */
export async function getDestinationContext(
  slug: string
): Promise<DestinationContextData | null> {
  const destination = await prisma.destination.findUnique({
    where: { slug, isActive: true },
    include: {
      state: { select: { name: true } },
      categories: {
        select: { category: { select: { name: true } } },
      },
      facts: {
        where: { factType: { in: ["best_time", "things_to_do", "travel_tips", "history", "ai_summary"] } },
        orderBy: { fetchedAt: "desc" },
        take: 5,
      },
      _count: { select: { spots: { where: { isActive: true } } } },
    },
  });

  if (!destination) return null;

  return {
    id: destination.id,
    name: destination.name,
    slug: destination.slug,
    description: destination.description,
    latitude: destination.latitude,
    longitude: destination.longitude,
    address: destination.address,
    rating: destination.rating,
    reviewCount: destination.reviewCount,
    state: destination.state.name,
    categories: destination.categories.map((c) => c.category.name),
    facts: destination.facts.map((f) => ({
      factType: f.factType,
      title: f.title,
      content: f.content.slice(0, 500), // Truncate long content
    })),
    spotCount: destination._count.spots,
  };
}

/**
 * Serialize destination context into a compact string for the AI prompt.
 */
export function serializeDestinationContext(ctx: DestinationContextData): string {
  const lines = [
    `Destination: ${ctx.name}`,
    `Location: ${ctx.state}, India`,
    `Rating: ${ctx.rating ? `${ctx.rating}/5` : "not rated"} (${ctx.reviewCount?.toLocaleString() || 0} reviews)`,
    `Categories: ${ctx.categories.join(", ") || "general"}`,
    `Spots available: ${ctx.spotCount}`,
    ctx.description ? `About: ${ctx.description.slice(0, 400)}` : "",
    ...ctx.facts.map((f) => `${f.title || f.factType}: ${f.content.slice(0, 200)}`),
  ];
  return lines.filter(Boolean).join("\n");
}
