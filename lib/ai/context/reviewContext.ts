// Review context module
// Selects, filters, and compresses review evidence for AI context
// Server-side only

import prisma from "@/lib/db/prisma";

export interface ReviewContextItem {
  authorName: string | null;
  rating: number | null;
  reviewText: string | null;
  publishedAt: string | null;
  source: string;
}

const ONE_YEAR_AGO = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
};

/**
 * Get the most evidence-rich reviews for a spot.
 * Filters to recent (1 year), ranks by rating + recency,
 * and truncates text to keep prompt compact.
 */
export async function getReviewContext(
  spotId: number,
  options: { limit?: number; maxTextLength?: number } = {}
): Promise<ReviewContextItem[]> {
  const limit = options.limit || 8;
  const maxLen = options.maxTextLength || 200;

  const reviews = await prisma.spotReview.findMany({
    where: {
      spotId,
      publishedAt: { gte: ONE_YEAR_AGO() },
      reviewText: { not: null },
      rating: { gte: 1 },
    },
    select: {
      authorName: true,
      rating: true,
      reviewText: true,
      publishedAt: true,
      source: true,
    },
    orderBy: [{ rating: "desc" }, { publishedAt: "desc" }],
    take: limit * 2, // fetch more, then filter
  });

  // Deduplicate by content similarity (naive: skip exact same text)
  const seen = new Set<string>();
  const unique = reviews.filter((r) => {
    if (!r.reviewText) return false;
    const key = r.reviewText.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, limit).map((r) => ({
    authorName: r.authorName,
    rating: r.rating,
    reviewText: r.reviewText ? r.reviewText.slice(0, maxLen) : null,
    publishedAt: r.publishedAt?.toISOString().slice(0, 10) || null,
    source: r.source,
  }));
}

/**
 * Also look up reviews for a destination (backward compat with DestinationReview)
 */
export async function getDestinationReviewContext(
  destinationId: number,
  options: { limit?: number; maxTextLength?: number } = {}
): Promise<ReviewContextItem[]> {
  const limit = options.limit || 8;
  const maxLen = options.maxTextLength || 200;

  const reviews = await prisma.destinationReview.findMany({
    where: {
      destinationId,
      publishedAt: { gte: ONE_YEAR_AGO() },
      reviewText: { not: null },
    },
    select: {
      authorName: true,
      rating: true,
      reviewText: true,
      publishedAt: true,
      source: true,
    },
    orderBy: [{ rating: "desc" }, { publishedAt: "desc" }],
    take: limit,
  });

  return reviews.map((r) => ({
    authorName: r.authorName,
    rating: r.rating,
    reviewText: r.reviewText ? r.reviewText.slice(0, maxLen) : null,
    publishedAt: r.publishedAt?.toISOString().slice(0, 10) || null,
    source: r.source,
  }));
}

/**
 * Serialize reviews into a compact string for AI prompt.
 */
export function serializeReviewContext(reviews: ReviewContextItem[]): string {
  if (reviews.length === 0) return "No recent reviews available.";
  return reviews
    .map((r) => {
      const stars = r.rating ? `★${r.rating}` : "";
      const date = r.publishedAt ? ` (${r.publishedAt})` : "";
      const text = r.reviewText ? ` — "${r.reviewText}"` : "";
      return `${r.authorName || "Visitor"} ${stars}${date}${text}`;
    })
    .join("\n");
}
