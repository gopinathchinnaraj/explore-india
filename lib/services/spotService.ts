// Spot service layer
// Individual tourism attraction CRUD and discovery operations
// Server-side only — maps cleanly to future Java SpotService

import prisma from "@/lib/db/prisma";
import type { SpotSummary, Spot, NearbySpot } from "@/types/spot";

const SPOT_SUMMARY_SELECT = {
  id: true,
  destinationId: true,
  name: true,
  slug: true,
  latitude: true,
  longitude: true,
  address: true,
  rating: true,
  reviewCount: true,
  coverImageUrl: true,
  discoveryScore: true,
  isVerified: true,
  categories: {
    select: {
      category: {
        select: { id: true, name: true, slug: true, icon: true },
      },
    },
  },
} as const;

function normalizeSpotCategories(
  cats: Array<{ category: { id: number; name: string; slug: string; icon: string | null } }>
) {
  return cats.map((c) => c.category);
}

/**
 * Get all active spots for a destination
 */
export async function getSpotsForDestination(
  destinationId: number,
  options: { categorySlug?: string; limit?: number } = {}
): Promise<SpotSummary[]> {
  const where: Record<string, unknown> = {
    destinationId,
    isActive: true,
    status: "APPROVED", // Only approved spots are visible to users
  };

  if (options.categorySlug) {
    where.categories = {
      some: { category: { slug: options.categorySlug } },
    };
  }

  const spots = await prisma.spot.findMany({
    where,
    select: SPOT_SUMMARY_SELECT,
    orderBy: [{ discoveryScore: "desc" }, { rating: "desc" }, { name: "asc" }],
    take: options.limit || 50,
  });

  return spots.map((s) => ({
    ...s,
    categories: normalizeSpotCategories(s.categories),
  }));
}

/**
 * Get a single spot by slug (full detail)
 */
export async function getSpotBySlug(slug: string): Promise<Spot | null> {
  const spot = await prisma.spot.findFirst({
    where: { slug, isActive: true, status: "APPROVED" } as any,
    include: {
      destination: { select: { id: true, name: true, slug: true } },
      categories: {
        select: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      },
    },
  });

  if (!spot) return null;

  const s = spot as typeof spot & { lastSyncedAt?: Date | null };
  return {
    ...s,
    destination: s.destination,
    categories: normalizeSpotCategories(s.categories),
    lastSyncedAt: s.lastSyncedAt?.toISOString() || null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Get a spot by ID
 */
export async function getSpotById(id: number): Promise<Spot | null> {
  const spot = await prisma.spot.findFirst({
    where: { id, isActive: true, status: "APPROVED" } as any,
    include: {
      destination: { select: { id: true, name: true, slug: true } },
      categories: {
        select: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      },
    },
  });

  if (!spot) return null;

  const s = spot as typeof spot & { lastSyncedAt?: Date | null };
  return {
    ...s,
    destination: s.destination,
    categories: normalizeSpotCategories(s.categories),
    lastSyncedAt: s.lastSyncedAt?.toISOString() || null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Search spots by name or description across all destinations
 */
export async function searchSpots(
  query: string,
  options: { destinationId?: number; categorySlug?: string; limit?: number } = {}
): Promise<SpotSummary[]> {
  const where: Record<string, unknown> = {
    isActive: true,
    status: "APPROVED", // Only approved spots visible to users
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { address: { contains: query, mode: "insensitive" } },
    ],
  };

  if (options.destinationId) where.destinationId = options.destinationId;

  if (options.categorySlug) {
    where.categories = {
      some: { category: { slug: options.categorySlug } },
    };
  }

  const spots = await prisma.spot.findMany({
    where,
    select: SPOT_SUMMARY_SELECT,
    take: options.limit || 20,
    orderBy: [{ discoveryScore: "desc" }, { rating: "desc" }],
  });

  return spots.map((s) => ({
    ...s,
    categories: normalizeSpotCategories(s.categories),
  }));
}

/**
 * Calculate Haversine distance between two coordinate pairs
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * Get nearby spots using coordinate-based Haversine calculation
 * Future: replace with PostGIS ST_DWithin
 */
export async function getNearbySpots(
  spotId: number,
  options: { radiusKm?: number; limit?: number } = {}
): Promise<NearbySpot[]> {
  const radiusKm = options.radiusKm ?? 10;
  const limit = options.limit ?? 10;

  // Get the source spot
  const source = await prisma.spot.findUnique({
    where: { id: spotId },
    select: { latitude: true, longitude: true, destinationId: true },
  });
  if (!source) return [];

  // Prefer pre-computed SpotNearby if available
  const precomputed = await prisma.spotNearby.findMany({
    where: {
      spotId,
      distanceMeters: { lte: radiusKm * 1000 },
      // Never surface spots that are not public
      nearbySpot: { isActive: true, status: "APPROVED" },
    },
    include: {
      nearbySpot: {
        select: {
          ...SPOT_SUMMARY_SELECT,
        },
      },
    },
    orderBy: { distanceMeters: "asc" },
    take: limit,
  });

  if (precomputed.length > 0) {
    return precomputed.map((n) => ({
      ...n.nearbySpot,
      categories: normalizeSpotCategories(n.nearbySpot.categories),
      distanceKm: n.distanceMeters / 1000,
      distanceMeters: n.distanceMeters,
      relationshipType: n.relationshipType,
    }));
  }

  // Fallback: runtime calculation across all public spots within a bounding box
  // IMPORTANT: status filter required — only public APPROVED spots
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.1, Math.cos((source.latitude * Math.PI) / 180)));
  const allSpots = await prisma.spot.findMany({
    where: {
      isActive: true,
      status: "APPROVED",
      id: { not: spotId },
      latitude: { gte: source.latitude - latDelta, lte: source.latitude + latDelta },
      longitude: { gte: source.longitude - lngDelta, lte: source.longitude + lngDelta },
    },
    select: SPOT_SUMMARY_SELECT,
  });

  return allSpots
    .map((s) => {
      const distKm = haversineKm(source.latitude, source.longitude, s.latitude, s.longitude);
      return {
        ...s,
        categories: normalizeSpotCategories(s.categories),
        distanceKm: distKm,
        distanceMeters: distKm * 1000,
        relationshipType: s.destinationId === source.destinationId ? "WITHIN_DESTINATION" : "RECOMMENDED",
      };
    })
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/**
 * Upsert a spot from discovery data.
 * Uses external provider ID as the deduplication key.
 */
export async function upsertSpotFromDiscovery(data: {
  destinationId: number;
  name: string;
  slug: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  coverImageUrl?: string | null;
  discoverySource: string;
  discoveryScore?: number | null;
  categoryIds?: number[];
  externalPlaceId?: string | null;
  externalDataId?: string | null;
  externalCid?: string | null;
}): Promise<{ spot: { id: number; name: string; slug: string }; created: boolean }> {
  // Check for existing by external ID first
  if (data.externalPlaceId || data.externalDataId) {
    const existing = await prisma.externalPlace.findFirst({
      where: {
        provider: "google_maps",
        OR: [
          ...(data.externalPlaceId ? [{ externalPlaceId: data.externalPlaceId }] : []),
          ...(data.externalDataId ? [{ externalDataId: data.externalDataId }] : []),
        ],
        spotId: { not: null },
      },
      select: { spotId: true, spot: { select: { id: true, name: true, slug: true } } },
    });

    if (existing?.spot) {
      // Update rating and review count only (don't overwrite manual edits)
      await prisma.spot.update({
        where: { id: existing.spot.id },
        data: {
          rating: data.rating ?? undefined,
          reviewCount: data.reviewCount ?? undefined,
          lastSyncedAt: new Date(),
        },
      });
      await prisma.externalPlace.updateMany({
        where: { spotId: existing.spot.id, provider: "google_maps" },
        data: { lastSyncedAt: new Date() },
      });
      return { spot: existing.spot, created: false };
    }
  }

  // Create new spot
  const spot = await prisma.spot.create({
    data: {
      destinationId: data.destinationId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      rating: data.rating,
      reviewCount: data.reviewCount,
      coverImageUrl: data.coverImageUrl,
      discoverySource: data.discoverySource,
      discoveryScore: data.discoveryScore,
      status: "DISCOVERED",  // Must be approved by admin before users see it
      isActive: false,       // Inactive until approved
      lastSyncedAt: new Date(),
    },
    select: { id: true, name: true, slug: true },
  });

  // Link categories
  if (data.categoryIds && data.categoryIds.length > 0) {
    await prisma.spotCategory.createMany({
      data: data.categoryIds.map((categoryId) => ({ spotId: spot.id, categoryId })),
      skipDuplicates: true,
    });
  }

  // Store external place reference
  if (data.externalPlaceId || data.externalDataId) {
    await prisma.externalPlace.create({
      data: {
        spotId: spot.id,
        provider: "google_maps",
        externalPlaceId: data.externalPlaceId,
        externalDataId: data.externalDataId,
        externalCid: data.externalCid,
        lastSyncedAt: new Date(),
      },
    });
  }

  console.log(`[SpotService] Created new spot: ${spot.name} (id=${spot.id})`);
  return { spot, created: true };
}

/**
 * Get the external place record for a spot
 */
export async function getSpotExternalPlace(spotId: number, provider = "google_maps") {
  return prisma.externalPlace.findUnique({
    where: { spotId_provider: { spotId, provider } },
  });
}

const NEARBY_RADIUS_KM = 30;
const NEARBY_MAX_PER_SPOT = 15;

/**
 * Recompute stored SpotNearby rows for the given spots (or every public spot).
 * Pure coordinate math — never calls SerpApi. Considers all public spots,
 * not just the same destination, so nearby attractions across areas are found.
 * Returns the number of relationships written.
 */
export async function computeNearbyForSpots(spotIds?: number[]): Promise<number> {
  const publicSpots = await prisma.spot.findMany({
    where: { isActive: true, status: "APPROVED" },
    select: { id: true, latitude: true, longitude: true, destinationId: true },
  });
  const targets = spotIds
    ? await prisma.spot.findMany({
        where: { id: { in: spotIds } },
        select: { id: true, latitude: true, longitude: true, destinationId: true },
      })
    : publicSpots;

  let written = 0;
  for (const a of targets) {
    const rows = publicSpots
      .filter((b) => b.id !== a.id)
      .map((b) => {
        const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
        return {
          spotId: a.id,
          nearbySpotId: b.id,
          distanceMeters: Math.round(km * 1000),
          relationshipType: b.destinationId === a.destinationId ? "WITHIN_DESTINATION" : "RECOMMENDED",
        };
      })
      .filter((r) => r.distanceMeters <= NEARBY_RADIUS_KM * 1000)
      .sort((x, y) => x.distanceMeters - y.distanceMeters)
      .slice(0, NEARBY_MAX_PER_SPOT);

    await prisma.$transaction([
      prisma.spotNearby.deleteMany({ where: { spotId: a.id } }),
      prisma.spotNearby.createMany({ data: rows, skipDuplicates: true }),
      prisma.spot.update({ where: { id: a.id }, data: { lastNearbySyncAt: new Date() } }),
    ]);
    written += rows.length;
  }

  console.log(`[SpotService] Wrote ${written} nearby relationships for ${targets.length} spot(s)`);
  return written;
}

/**
 * Recompute nearby relationships for every spot in a destination.
 */
export async function computeNearbyRelationships(destinationId: number): Promise<number> {
  const spots = await prisma.spot.findMany({ where: { destinationId }, select: { id: true } });
  return computeNearbyForSpots(spots.map((s) => s.id));
}
