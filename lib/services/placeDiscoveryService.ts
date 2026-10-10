// Place Discovery & Auto-Wiring Orchestration Service
// Discovers places via Google Maps SerpApi, classifies with AI, creates Spot & ExternalPlace,
// and automatically enriches with Photos (Maps Photos), Reviews (Maps Reviews), and Videos (YouTube).
// Server-side only - NEVER call from browser

import prisma from "@/lib/db/prisma";
import { searchGoogleMapsLocal, type NormalizedPlace, type MapsLocalResult } from "@/lib/serpapi/maps";
import { classifySpot } from "@/lib/ai/classifier";
import { syncSpotPhotos, serializeSpotPhotos } from "./spotPhotoService";
import { syncSpotReviews } from "./spotReviewService";
import { syncSpotVideos } from "./spotVideoService";
import { computeNearbyRelationships } from "./spotService";
import type { CompleteSpot, SpotEnrichmentStatus, SpotPhoto } from "@/types/spot";

/**
 * Haversine distance in km between two GPS coordinates
 */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the closest active Destination to a given latitude/longitude
 */
async function findClosestDestination(latitude: number, longitude: number): Promise<{ id: number; name: string; slug: string }> {
  const destinations = await prisma.destination.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, latitude: true, longitude: true },
  });

  if (destinations.length === 0) {
    throw new Error("No active destinations found in database. Seed destinations first.");
  }

  let closest = destinations[0];
  let minDistance = haversineDistanceKm(latitude, longitude, closest.latitude, closest.longitude);

  for (let i = 1; i < destinations.length; i++) {
    const d = destinations[i];
    const dist = haversineDistanceKm(latitude, longitude, d.latitude, d.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closest = d;
    }
  }

  return closest;
}

/**
 * Generate a unique slug for a spot within a destination
 */
async function generateUniqueSpotSlug(name: string, destinationSlug: string): Promise<string> {
  const base = `${destinationSlug}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const existing = await prisma.spot.findUnique({ where: { slug: base }, select: { id: true } });
  if (!existing) return base;

  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Calculate internal discovery ranking score (0–100)
 */
function calculateDiscoveryScore(place: {
  rating?: number | null;
  reviewCount?: number | null;
  thumbnailUrl?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): number {
  let score = 0;
  if (place.rating) {
    score += Math.min(35, Math.round(((place.rating - 1) / 4) * 35));
  }
  if (place.reviewCount) {
    if (place.reviewCount >= 10000) score += 25;
    else if (place.reviewCount >= 1000) score += 20;
    else if (place.reviewCount >= 100) score += 12;
    else if (place.reviewCount >= 10) score += 5;
  }
  if (place.thumbnailUrl) score += 10;
  if (place.latitude && place.longitude) score += 10;
  if (place.description) score += 10;
  return Math.min(100, Math.max(10, score));
}

/**
 * Retrieve the complete spot record with images, reviews, videos, categories, and externalPlaces
 */
export async function getCompleteSpot(spotId: number): Promise<CompleteSpot | null> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: {
      destination: { select: { id: true, name: true, slug: true } },
      categories: {
        select: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
      },
      reviews: {
        orderBy: [{ rating: "desc" }, { publishedAt: "desc" }],
      },
      videos: {
        orderBy: [{ relevanceScore: "desc" }, { viewCount: "desc" }],
      },
      externalPlaces: true,
    },
  });

  if (!spot) return null;

  return {
    ...spot,
    categories: spot.categories.map((c) => c.category),
    images: serializeSpotPhotos(spot.images),
    reviews: spot.reviews.map((r) => ({
      ...r,
      publishedAt: r.publishedAt?.toISOString() || null,
      fetchedAt: r.fetchedAt.toISOString(),
    })),
    videos: spot.videos.map((v) => ({
      ...v,
      viewCount: v.viewCount ? Number(v.viewCount) : null,
      publishedAt: v.publishedAt?.toISOString() || null,
      fetchedAt: v.fetchedAt.toISOString(),
    })),
    externalPlaces: spot.externalPlaces.map((ep) => ({
      id: ep.id,
      provider: ep.provider,
      externalPlaceId: ep.externalPlaceId,
      externalDataId: ep.externalDataId,
      externalCid: ep.externalCid,
      externalUrl: ep.externalUrl,
      rawName: ep.rawName,
      lastSyncedAt: ep.lastSyncedAt?.toISOString() || null,
    })),
    lastSyncedAt: spot.lastSyncedAt?.toISOString() || null,
    createdAt: spot.createdAt.toISOString(),
    updatedAt: spot.updatedAt.toISOString(),
  };
}

/**
 * Enrich a spot independently across Photos, Reviews, and Videos using Promise.allSettled.
 * If one provider fails, the spot still exists and records the status in ApiSyncJob.
 */
export async function enrichSpot(
  spotId: number,
  options: { force?: boolean } = {}
): Promise<{
  spot: CompleteSpot | null;
  status: SpotEnrichmentStatus;
}> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: {
      destination: { select: { id: true, name: true, slug: true } },
      externalPlaces: { where: { provider: "google_maps" } },
    },
  });

  if (!spot) {
    throw new Error(`Spot ${spotId} not found`);
  }

  const externalPlace = spot.externalPlaces[0];
  const dataId = externalPlace?.externalDataId;

  console.log(`[PlaceDiscoveryService] Enriching spot: "${spot.name}" (id=${spot.id}, data_id=${dataId || "none"})`);

  // Run all three enrichment pipelines in parallel with individual error isolation
  const [photosResult, reviewsResult, videosResult] = await Promise.allSettled([
    syncSpotPhotos(spot.id, dataId),
    syncSpotReviews(spot.id, dataId),
    syncSpotVideos(spot.id, spot.name, spot.destination.name),
  ]);

  const status: SpotEnrichmentStatus = {
    photos: photosResult.status === "fulfilled" ? "COMPLETED" : "FAILED",
    reviews: reviewsResult.status === "fulfilled" ? "COMPLETED" : "FAILED",
    videos: videosResult.status === "fulfilled" ? "COMPLETED" : "FAILED",
    errors: {
      photos: photosResult.status === "rejected" ? String(photosResult.reason?.message || photosResult.reason) : undefined,
      reviews: reviewsResult.status === "rejected" ? String(reviewsResult.reason?.message || reviewsResult.reason) : undefined,
      videos: videosResult.status === "rejected" ? String(videosResult.reason?.message || videosResult.reason) : undefined,
    },
  };

  // Update spot lastSyncedAt
  await prisma.spot.update({
    where: { id: spot.id },
    data: { lastSyncedAt: new Date() },
  });

  const complete = await getCompleteSpot(spot.id);
  return { spot: complete, status };
}

/**
 * Discover, validate with AI, deduplicate, create Spot + ExternalPlace, and auto-enrich
 */
function normalizeRawPlace(raw: MapsLocalResult | NormalizedPlace): NormalizedPlace {
  if ("placeId" in raw) {
    return raw;
  }
  return {
    name: raw.title,
    placeId: raw.place_id || null,
    dataId: raw.data_id || null,
    dataCid: raw.data_cid || null,
    latitude: raw.gps_coordinates?.latitude || null,
    longitude: raw.gps_coordinates?.longitude || null,
    address: raw.address || null,
    rating: raw.rating || null,
    reviewCount: raw.reviews || null,
    thumbnailUrl: raw.thumbnail || null,
    type: raw.type || null,
    types: raw.types || [],
    description: raw.description || null,
    reviewsLink: raw.reviews_link || null,
    photosLink: raw.photos_link || null,
  };
}

/**
 * Discover, validate with AI, deduplicate, create Spot + ExternalPlace, and auto-enrich
 */
export async function discoverAndCreateSpot(
  rawPlace: MapsLocalResult | NormalizedPlace,
  options: {
    destinationId?: number;
    autoEnrich?: boolean;
  } = {}
): Promise<{
  spot: CompleteSpot | null;
  created: boolean;
  enrichmentStatus?: SpotEnrichmentStatus;
}> {
  const p = normalizeRawPlace(rawPlace);
  const { name, placeId, dataId, dataCid, latitude, longitude, rating, reviewCount, address, description, thumbnailUrl, type, types, reviewsLink } = p;

  if (!name || latitude === null || longitude === null) {
    throw new Error(`Incomplete place data for "${name || "unknown"}": requires name, latitude, and longitude`);
  }

  // 1. Check if spot already exists by external provider ID
  if (placeId || dataId) {
    const existingExt = await prisma.externalPlace.findFirst({
      where: {
        provider: "google_maps",
        OR: [
          ...(placeId ? [{ externalPlaceId: placeId }] : []),
          ...(dataId ? [{ externalDataId: dataId }] : []),
        ],
        spotId: { not: null },
      },
      include: {
        spot: true,
      },
    });

    if (existingExt?.spot) {
      console.log(`[PlaceDiscoveryService] Spot "${name}" already exists (id=${existingExt.spot.id}). Updating metadata...`);
      await prisma.spot.update({
        where: { id: existingExt.spot.id },
        data: {
          rating: rating ?? undefined,
          reviewCount: reviewCount ?? undefined,
          address: address ?? undefined,
          coverImageUrl: existingExt.spot.coverImageUrl || thumbnailUrl || undefined,
          lastSyncedAt: new Date(),
        },
      });

      let enrichmentStatus: SpotEnrichmentStatus | undefined;
      if (options.autoEnrich !== false) {
        const enriched = await enrichSpot(existingExt.spot.id);
        enrichmentStatus = enriched.status;
      }

      const complete = await getCompleteSpot(existingExt.spot.id);
      return { spot: complete, created: false, enrichmentStatus };
    }
  }

  // 2. Resolve destination
  let destinationId = options.destinationId;
  let destinationSlug = "karnataka";

  if (!destinationId) {
    const closest = await findClosestDestination(latitude, longitude);
    destinationId = closest.id;
    destinationSlug = closest.slug;
  } else {
    const dest = await prisma.destination.findUnique({
      where: { id: destinationId },
      select: { slug: true },
    });
    if (dest) destinationSlug = dest.slug;
  }

  // 3. AI Validation & Classification
  let normalizedName = name;
  let categoryIds: number[] = [];

  try {
    const aiResult = await classifySpot({
      name,
      type,
      types,
      description,
      address,
      rating,
      reviewCount,
      destinationHint: destinationSlug,
    });

    if (!aiResult.is_tourism_spot && aiResult.confidence >= 0.85) {
      console.log(`[PlaceDiscoveryService] Skipped "${name}": AI determined not a tourism spot (confidence=${aiResult.confidence})`);
      return { spot: null, created: false };
    }

    if (aiResult.normalized_name && aiResult.confidence >= 0.75) {
      normalizedName = aiResult.normalized_name;
    }

    if (aiResult.categories.length > 0) {
      const dbCategories = await prisma.category.findMany();
      for (const catName of aiResult.categories) {
        const found = dbCategories.find(
          (c) => c.name.toLowerCase() === catName.toLowerCase() || c.slug === catName.toLowerCase().replace(/\s+/g, "-")
        );
        if (found) categoryIds.push(found.id);
      }
    }
  } catch (aiErr) {
    console.warn(`[PlaceDiscoveryService] AI classification fallback for "${name}":`, aiErr);
  }

  // 4. Generate unique slug & discovery score
  const slug = await generateUniqueSpotSlug(normalizedName, destinationSlug);
  const discoveryScore = calculateDiscoveryScore({
    rating,
    reviewCount,
    thumbnailUrl,
    description,
    latitude,
    longitude,
  });

  // 5. Create Spot in PostgreSQL
  const spot = await prisma.spot.create({
    data: {
      destinationId,
      name: normalizedName,
      slug,
      description,
      latitude,
      longitude,
      address,
      rating,
      reviewCount,
      coverImageUrl: thumbnailUrl,
      discoverySource: "GOOGLE_MAPS",
      discoveryScore,
      status: "DISCOVERED",  // Requires admin approval before users see it
      isVerified: false,
      isActive: false,
      lastSyncedAt: new Date(),
    },
  });

  // Link categories
  if (categoryIds.length > 0) {
    await prisma.spotCategory.createMany({
      data: categoryIds.map((cid) => ({ spotId: spot.id, categoryId: cid })),
      skipDuplicates: true,
    });
  }

  // Link ExternalPlace
  await prisma.externalPlace.create({
    data: {
      spotId: spot.id,
      provider: "google_maps",
      externalPlaceId: placeId,
      externalDataId: dataId,
      externalCid: dataCid,
      externalUrl: reviewsLink,
      rawName: name,
      lastSyncedAt: new Date(),
    },
  });

  console.log(`[PlaceDiscoveryService] Created Spot: "${spot.name}" (id=${spot.id}) linked to destination ${destinationId}`);

  // Compute nearby relationships for this destination
  try {
    await computeNearbyRelationships(destinationId);
  } catch (nearbyErr) {
    console.warn("[PlaceDiscoveryService] computeNearbyRelationships error:", nearbyErr);
  }

  // 6. Auto-Enrich with Photos, Reviews, and Videos
  let enrichmentStatus: SpotEnrichmentStatus | undefined;
  if (options.autoEnrich !== false) {
    const enriched = await enrichSpot(spot.id);
    enrichmentStatus = enriched.status;
  }

  const complete = await getCompleteSpot(spot.id);
  return { spot: complete, created: true, enrichmentStatus };
}

/**
 * High-level Discovery runner:
 * Query Google Maps (e.g. "karnataka tourism places"), parse all local_results,
 * deduplicate, and auto-wire each into a complete Spot record!
 */
export async function discoverPlacesAndAutoWire(
  query: string,
  options: {
    destinationId?: number;
    limit?: number;
    autoEnrich?: boolean;
  } = {}
): Promise<{
  query: string;
  totalFound: number;
  createdCount: number;
  updatedCount: number;
  spots: CompleteSpot[];
  errors: string[];
}> {
  console.log(`[PlaceDiscoveryService] Starting place discovery for query: "${query}"`);
  const places = await searchGoogleMapsLocal(query, { limit: options.limit || 20 });

  const results: CompleteSpot[] = [];
  const errors: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const place of places) {
    try {
      const outcome = await discoverAndCreateSpot(place, {
        destinationId: options.destinationId,
        autoEnrich: options.autoEnrich !== false,
      });

      if (outcome.spot) {
        results.push(outcome.spot);
        if (outcome.created) createdCount++;
        else updatedCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PlaceDiscoveryService] Error processing "${place.name}":`, msg);
      errors.push(`${place.name}: ${msg}`);
    }
  }

  return {
    query,
    totalFound: places.length,
    createdCount,
    updatedCount,
    spots: results,
    errors,
  };
}
