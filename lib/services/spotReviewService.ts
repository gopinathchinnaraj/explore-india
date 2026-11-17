// Spot review service
// Fetches, caches, and stores reviews for individual spots
// Server-side only

import { createHash } from "crypto";
import prisma from "@/lib/db/prisma";
import { fetchPlaceReviews, type NormalizedReview } from "@/lib/serpapi/maps";
import { getSpotExternalPlace } from "./spotService";
import type { ReviewSortOrder } from "@/types/spot";

const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "24", 10);
// Reviews older than 1 year are not stored (per architecture requirement)
const REVIEW_MAX_AGE_DAYS = 365;

/**
 * Get cached reviews for a spot, or fetch from SerpApi if stale.
 * Supports sort order: relevant | newest | highest | lowest
 */
export async function getSpotReviews(
  spotId: number,
  options: { sort?: ReviewSortOrder; limit?: number } = {}
) {
  const sort = options.sort || "relevant";
  const limit = options.limit || 15;

  const cacheAge = new Date();
  cacheAge.setHours(cacheAge.getHours() - CACHE_TTL_HOURS);

  // Determine DB order based on sort preference
  const orderBy = getDbOrderBy(sort);

  const cachedReviews = await prisma.spotReview.findMany({
    where: {
      spotId,
      fetchedAt: { gte: cacheAge },
    },
    orderBy,
    take: limit,
  });

  if (cachedReviews.length > 0) {
    console.log(`[SpotReviewService] Cache hit for spot ${spotId}, sort=${sort}`);
    return {
      reviews: serializeReviews(cachedReviews),
      fromCache: true,
      sort,
    };
  }

  // Fetch fresh reviews via sync
  try {
    const reviews = await syncSpotReviews(spotId, undefined, sort);
    const sorted = await prisma.spotReview.findMany({
      where: { spotId, fetchedAt: { gte: cacheAge } },
      orderBy,
      take: limit,
    });
    return { reviews: serializeReviews(sorted), fromCache: false, sort };
  } catch (error) {
    console.error(`[SpotReviewService] Error fetching reviews for spot ${spotId}:`, error);
    return {
      reviews: serializeReviews(cachedReviews),
      fromCache: false,
      sort,
      error: cachedReviews.length === 0 ? "Reviews temporarily unavailable" : undefined,
    };
  }
}

/**
 * Synchronize reviews for a spot from Google Maps Reviews via SerpApi.
 * Updates PostgreSQL and records ApiSyncJob.
 */
export async function syncSpotReviews(
  spotId: number,
  providedDataId?: string | null,
  sort: ReviewSortOrder = "relevant"
) {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: { id: true, name: true },
  });

  if (!spot) {
    throw new Error(`Spot ${spotId} not found`);
  }

  // Create sync job
  const job = await prisma.apiSyncJob.create({
    data: {
      engine: "google_maps_reviews",
      scopeType: "spot",
      scopeId: spotId,
      scopeName: spot.name,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    let targetDataId = providedDataId;
    if (!targetDataId) {
      const ext = await getSpotExternalPlace(spotId, "google_maps");
      targetDataId = ext?.externalDataId;
    }

    if (!targetDataId) {
      await prisma.apiSyncJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: "No Google Maps data_id configured for spot",
        },
      });
      return [];
    }

    const serpSortBy = mapSortToSerp(sort);
    console.log(`[SpotReviewService] Syncing reviews for "${spot.name}" (data_id: ${targetDataId})`);

    const { reviews: fetched, placeInfo } = await fetchPlaceReviews(targetDataId, {
      limit: 20,
      sortBy: serpSortBy,
    });

    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - REVIEW_MAX_AGE_DAYS);

    const filtered = fetched.filter((r) => {
      if (!r.publishedAt) return true;
      return r.publishedAt >= cutoff;
    });

    const { stored: createdCount } = await storeReviews(spotId, filtered, now);

    // Update spot rating and reviewCount if placeInfo was returned
    if (placeInfo?.rating || placeInfo?.reviews) {
      await prisma.spot.update({
        where: { id: spotId },
        data: {
          rating: placeInfo.rating ?? undefined,
          reviewCount: placeInfo.reviews ?? undefined,
          lastSyncedAt: now,
        },
      });
    }

    // Mark job completed
    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        itemsProcessed: fetched.length,
        itemsCreated: createdCount,
      },
    });

    return prisma.spotReview.findMany({ where: { spotId } });
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

/** Stable fallback id so re-syncing the same review updates it instead of duplicating it */
function reviewExtId(review: NormalizedReview): string {
  return (
    review.externalReviewId ??
    `hash:${createHash("sha1").update(`${review.authorName}|${review.rating}|${review.reviewText}`).digest("hex")}`
  );
}

/** Upsert reviews for a spot; returns how many were stored and their external ids. */
async function storeReviews(spotId: number, reviews: NormalizedReview[], now: Date) {
  const ids: string[] = [];
  let stored = 0;
  for (const review of reviews) {
    const extId = reviewExtId(review);
    try {
      await prisma.spotReview.upsert({
        where: { spotId_source_externalReviewId: { spotId, source: review.source, externalReviewId: extId } },
        create: {
          spotId,
          source: review.source,
          externalReviewId: extId,
          authorName: review.authorName,
          authorAvatarUrl: review.authorAvatarUrl,
          rating: review.rating,
          reviewText: review.reviewText,
          publishedAt: review.publishedAt,
          reviewUrl: review.reviewUrl,
          fetchedAt: now,
        },
        update: {
          authorName: review.authorName,
          authorAvatarUrl: review.authorAvatarUrl,
          rating: review.rating,
          reviewText: review.reviewText,
          publishedAt: review.publishedAt,
          fetchedAt: now,
        },
      });
      ids.push(extId);
      stored++;
    } catch (upsertErr) {
      console.warn(`[SpotReviewService] Failed to upsert review:`, upsertErr);
    }
  }
  return { stored, ids };
}

/** Per side; one SerpApi page returns 10 reviews, so best + worst = 20 for 2 credits. */
export const BEST_WORST_PER_SIDE = 10;
// Low ratings are rarer, so look further back than for the general feed
const BEST_WORST_MAX_AGE_DAYS = 3 * 365;

/**
 * Store a balanced set of reviews for a spot: the 10 highest-rated and the 10
 * lowest-rated (2 SerpApi calls). Any other stored reviews for the spot are removed,
 * so a spot never holds more than 20.
 */
export async function syncSpotReviewsBestWorst(spotId: number, providedDataId?: string | null) {
  const spot = await prisma.spot.findUnique({ where: { id: spotId }, select: { id: true, name: true } });
  if (!spot) throw new Error(`Spot ${spotId} not found`);

  const job = await prisma.apiSyncJob.create({
    data: { engine: "google_maps_reviews", scopeType: "spot", scopeId: spotId, scopeName: spot.name, status: "RUNNING", startedAt: new Date() },
  });

  try {
    const dataId = providedDataId || (await getSpotExternalPlace(spotId, "google_maps"))?.externalDataId;
    if (!dataId) {
      await prisma.apiSyncJob.update({
        where: { id: job.id },
        data: { status: "FAILED", finishedAt: new Date(), error: "No Google Maps data_id configured for spot" },
      });
      return [];
    }

    console.log(`[SpotReviewService] Syncing best + worst reviews for "${spot.name}" (data_id: ${dataId})`);
    const [best, worst] = await Promise.all([
      fetchPlaceReviews(dataId, { limit: BEST_WORST_PER_SIDE, sortBy: "ratingHigh" }),
      fetchPlaceReviews(dataId, { limit: BEST_WORST_PER_SIDE, sortBy: "ratingLow" }),
    ]);

    const cutoff = new Date(Date.now() - BEST_WORST_MAX_AGE_DAYS * 86400000);
    const recent = (r: NormalizedReview) => !r.publishedAt || r.publishedAt >= cutoff;
    const seen = new Set<string>();
    const keep = [...best.reviews.filter(recent), ...worst.reviews.filter(recent)].filter((r) => {
      const id = reviewExtId(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const now = new Date();
    const { stored, ids } = await storeReviews(spotId, keep, now);

    // Cap the spot at this balanced set: drop anything else stored earlier
    if (ids.length > 0) {
      await prisma.spotReview.deleteMany({ where: { spotId, externalReviewId: { notIn: ids } } });
    }

    const placeInfo = best.placeInfo ?? worst.placeInfo;
    if (placeInfo?.rating || placeInfo?.reviews) {
      await prisma.spot.update({
        where: { id: spotId },
        data: { rating: placeInfo.rating ?? undefined, reviewCount: placeInfo.reviews ?? undefined, lastSyncedAt: now },
      });
    }

    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", finishedAt: new Date(), itemsProcessed: best.reviews.length + worst.reviews.length, itemsCreated: stored },
    });
    return prisma.spotReview.findMany({ where: { spotId } });
  } catch (error) {
    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

function getDbOrderBy(sort: ReviewSortOrder) {
  switch (sort) {
    case "newest":
      return [{ publishedAt: "desc" as const }];
    case "highest":
      return [{ rating: "desc" as const }, { publishedAt: "desc" as const }];
    case "lowest":
      return [{ rating: "asc" as const }, { publishedAt: "desc" as const }];
    case "relevant":
    default:
      return [{ publishedAt: "desc" as const }, { rating: "desc" as const }];
  }
}

function mapSortToSerp(sort: ReviewSortOrder): "qualityScore" | "newestFirst" | "ratingHigh" | "ratingLow" {
  switch (sort) {
    case "newest":   return "newestFirst";
    case "highest":  return "ratingHigh";
    case "lowest":   return "ratingLow";
    default:         return "qualityScore";
  }
}

function serializeReviews(reviews: Awaited<ReturnType<typeof prisma.spotReview.findMany>>) {
  return reviews.map((r) => ({
    ...r,
    publishedAt: r.publishedAt?.toISOString() || null,
    fetchedAt: r.fetchedAt.toISOString(),
  }));
}
