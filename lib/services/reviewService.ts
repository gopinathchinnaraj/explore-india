// Review service layer
// Handles fetching, caching, AI summarization, and storing reviews from SerpApi Google Maps
// Server-side only

import prisma from "@/lib/db/prisma";
import { fetchPlaceReviews, searchGoogleMapsLocal } from "@/lib/serpapi/maps";
import { getExternalPlace, upsertExternalPlace } from "./destinationService";
import { summarizeReviewsWithAI } from "@/lib/ai/classifier";
import type { DestinationReview } from "@prisma/client";

const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "24", 10);
const MIN_FRESH_REVIEWS = 5;

function computeAverageRating(reviews: Array<{ rating: number | null }>): number | null {
  const rated = reviews.filter((r): r is { rating: number } => typeof r.rating === "number" && r.rating > 0);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

function serializeReviews(reviews: DestinationReview[]) {
  return reviews.map((r) => ({
    id: r.id,
    destinationId: r.destinationId,
    source: r.source,
    externalReviewId: r.externalReviewId,
    authorName: r.authorName,
    authorAvatarUrl: r.authorAvatarUrl,
    rating: r.rating,
    reviewText: r.reviewText,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    reviewUrl: r.reviewUrl,
    fetchedAt: r.fetchedAt.toISOString(),
  }));
}

/**
 * Get cached reviews for a destination, or fetch from SerpApi Google Maps Reviews if stale.
 * Flow:
 * 1. Check PostgreSQL for fresh reviews
 * 2. If >= 5 fresh reviews exist, return from DB directly (fast, no external API call)
 * 3. If cache miss, look up or auto-discover ExternalPlace (Google Maps data_id / place_id)
 * 4. Call SerpApi Google Maps Reviews API with data_id
 * 5. Normalize fields, safely parsing published dates (prevents Invalid Date errors)
 * 6. Deduplicate & Upsert reviews into PostgreSQL
 * 7. Update destination rating & review count from Google place info
 * 8. Optionally generate AI traveler sentiment summary and save to DestinationFact
 * 9. Re-query PostgreSQL for the persisted records and return them
 */
export async function getReviews(destinationId: number) {
  const staleBefore = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);

  // 1. Check PostgreSQL for fresh reviews
  const cachedReviews = await prisma.destinationReview.findMany({
    where: {
      destinationId,
      fetchedAt: { gte: staleBefore },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 20,
  });

  // Check if an existing AI review summary exists in DestinationFact
  const existingFact = await prisma.destinationFact.findFirst({
    where: { destinationId, factType: "ai_review_summary" },
  });

  if (cachedReviews.length >= MIN_FRESH_REVIEWS) {
    return {
      reviews: serializeReviews(cachedReviews),
      totalCount: cachedReviews.length,
      averageRating: computeAverageRating(cachedReviews),
      source: "google_maps",
      cachedAt: cachedReviews[0].fetchedAt.toISOString(),
      fromCache: true,
      aiSummary: existingFact?.content || null,
    };
  }

  // 2. Fetch destination details for fallback discovery
  const destination = await prisma.destination.findUnique({
    where: { id: destinationId },
    select: { id: true, name: true, rating: true, reviewCount: true },
  });

  if (!destination) {
    return {
      reviews: [],
      totalCount: 0,
      averageRating: null,
      source: "google_maps",
      cachedAt: null,
      fromCache: false,
    };
  }

  // 3. Get external place (Google Maps data_id)
  let externalPlace = await getExternalPlace(destinationId, "google_maps");

  // Auto-discover external place if missing or data_id is not set
  if (!externalPlace?.externalDataId && !externalPlace?.externalPlaceId) {
    try {
      console.log(`[ReviewService] Discovering Google Maps ID for "${destination.name}"...`);
      const places = await searchGoogleMapsLocal(`${destination.name} Karnataka tourism`, { limit: 1 });
      if (places.length > 0 && (places[0].dataId || places[0].placeId)) {
        externalPlace = await upsertExternalPlace({
          destinationId,
          provider: "google_maps",
          externalDataId: places[0].dataId || undefined,
          externalPlaceId: places[0].placeId || undefined,
          externalUrl: places[0].reviewsLink || undefined,
          rawName: places[0].name,
        });

        // Update rating & count if available
        if (places[0].rating || places[0].reviewCount) {
          await prisma.destination.update({
            where: { id: destinationId },
            data: {
              ...(places[0].rating ? { rating: places[0].rating } : {}),
              ...(places[0].reviewCount ? { reviewCount: places[0].reviewCount } : {}),
            },
          });
        }
      }
    } catch (discoveryErr) {
      console.warn(`[ReviewService] Failed to auto-discover Google Maps ID for "${destination.name}":`, discoveryErr);
    }
  }

  const targetDataId = externalPlace?.externalDataId || undefined;
  const targetPlaceId = externalPlace?.externalPlaceId || undefined;

  if (!targetDataId && !targetPlaceId) {
    console.warn(`[ReviewService] No external Google Maps ID found for destination "${destination.name}" (${destinationId})`);
    // Return any existing DB reviews
    const fallbackReviews = await prisma.destinationReview.findMany({
      where: { destinationId },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    return {
      reviews: serializeReviews(fallbackReviews),
      totalCount: fallbackReviews.length,
      averageRating: computeAverageRating(fallbackReviews),
      source: "google_maps",
      cachedAt: fallbackReviews[0]?.fetchedAt.toISOString() || null,
      fromCache: true,
      aiSummary: existingFact?.content || null,
    };
  }

  // 4. Fetch reviews from SerpApi Google Maps Reviews engine
  try {
    console.log(
      `[ReviewService] Fetching Google Maps reviews for "${destination.name}" (data_id: ${targetDataId || targetPlaceId})`
    );

    const { reviews: fetchedReviews, placeInfo, topics } = await fetchPlaceReviews(
      { dataId: targetDataId, placeId: targetPlaceId },
      { limit: 20, sortBy: "qualityScore" }
    );

    const now = new Date();

    // 5. Deduplicate and upsert reviews into PostgreSQL
    for (const review of fetchedReviews) {
      // Find existing by externalReviewId or authorName + publishedAt
      const existing = review.externalReviewId
        ? await prisma.destinationReview.findFirst({
            where: {
              destinationId,
              source: "google_maps",
              externalReviewId: review.externalReviewId,
            },
          })
        : await prisma.destinationReview.findFirst({
            where: {
              destinationId,
              source: "google_maps",
              authorName: review.authorName,
              publishedAt: review.publishedAt,
            },
          });

      if (existing) {
        await prisma.destinationReview.update({
          where: { id: existing.id },
          data: {
            authorName: review.authorName,
            authorAvatarUrl: review.authorAvatarUrl,
            rating: review.rating,
            reviewText: review.reviewText,
            publishedAt: review.publishedAt, // Safe Date | null
            reviewUrl: review.reviewUrl,
            fetchedAt: now,
          },
        });
      } else {
        await prisma.destinationReview.create({
          data: {
            destinationId,
            source: "google_maps",
            externalReviewId: review.externalReviewId,
            authorName: review.authorName,
            authorAvatarUrl: review.authorAvatarUrl,
            rating: review.rating,
            reviewText: review.reviewText,
            publishedAt: review.publishedAt, // Safe Date | null
            reviewUrl: review.reviewUrl,
            fetchedAt: now,
          },
        });
      }
    }

    // 6. Update destination rating & count if place_info returned
    if (placeInfo?.rating || placeInfo?.reviews) {
      await prisma.destination.update({
        where: { id: destinationId },
        data: {
          ...(placeInfo.rating ? { rating: placeInfo.rating } : {}),
          ...(placeInfo.reviews ? { reviewCount: placeInfo.reviews } : {}),
        },
      });
    }

    // 7. Generate or refresh AI Review Summary
    let aiSummary = existingFact?.content || null;
    if (fetchedReviews.length > 0) {
      try {
        const generated = await summarizeReviewsWithAI(fetchedReviews, destination.name);
        if (generated) {
          aiSummary = generated;
          if (existingFact) {
            await prisma.destinationFact.update({
              where: { id: existingFact.id },
              data: { content: generated, fetchedAt: now },
            });
          } else {
            await prisma.destinationFact.create({
              data: {
                destinationId,
                factType: "ai_review_summary",
                title: "Traveler Consensus",
                content: generated,
                source: "Google Maps Reviews",
                fetchedAt: now,
              },
            });
          }
        }
      } catch (aiErr) {
        console.warn("[ReviewService] AI review summarization skipped:", aiErr);
      }
    }

    // 8. Re-query PostgreSQL for persisted reviews
    const persistedReviews = await prisma.destinationReview.findMany({
      where: { destinationId },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 20,
    });

    return {
      reviews: serializeReviews(persistedReviews),
      totalCount: persistedReviews.length,
      averageRating: computeAverageRating(persistedReviews),
      source: "google_maps",
      cachedAt: now.toISOString(),
      fromCache: false,
      aiSummary,
      topics: topics?.slice(0, 8).map((t) => t.keyword).filter((k): k is string => Boolean(k)),
      placeInfo,
    };
  } catch (error) {
    console.error(`[ReviewService] Failed to fetch Google Maps reviews for "${destination.name}":`, error);

    // Resilient fallback: return any existing DB reviews
    const fallbackReviews = await prisma.destinationReview.findMany({
      where: { destinationId },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 20,
    });

    return {
      reviews: serializeReviews(fallbackReviews),
      totalCount: fallbackReviews.length,
      averageRating: computeAverageRating(fallbackReviews),
      source: "google_maps",
      cachedAt: fallbackReviews[0]?.fetchedAt.toISOString() || null,
      fromCache: true,
      aiSummary: existingFact?.content || null,
      error: fallbackReviews.length === 0 ? "Reviews temporarily unavailable" : undefined,
    };
  }
}
