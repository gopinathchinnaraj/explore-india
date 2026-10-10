// Spot review service
// Fetches, caches, and stores reviews for individual spots
// Server-side only

import { createHash } from "crypto";
import prisma from "@/lib/db/prisma";
import { fetchPlaceReviews } from "@/lib/serpapi/maps";
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

    let createdCount = 0;
    for (const review of filtered) {
      // Stable fallback id so re-syncing the same review updates it instead of duplicating it
      const extId =
        review.externalReviewId ??
        `hash:${createHash("sha1").update(`${review.authorName}|${review.rating}|${review.reviewText}`).digest("hex")}`;
      try {
        await prisma.spotReview.upsert({
          where: {
            spotId_source_externalReviewId: {
              spotId,
              source: review.source,
              externalReviewId: extId,
            },
          },
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
        createdCount++;
      } catch (upsertErr) {
        console.warn(`[SpotReviewService] Failed to upsert review:`, upsertErr);
      }
    }

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

function mapSortToSerp(sort: ReviewSortOrder): "qualityScore" | "newestFirst" | "highestRating" | "lowestRating" {
  switch (sort) {
    case "newest":   return "newestFirst";
    case "highest":  return "highestRating";
    case "lowest":   return "lowestRating";
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
