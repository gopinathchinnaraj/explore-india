// Destination service layer
// All database access is here — keeps API routes thin
// Maps cleanly to future Java DestinationService

import prisma from "@/lib/db/prisma";
import type { Destination, DestinationSummary, NearbyDestination } from "@/types/destination";

const DESTINATION_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  latitude: true,
  longitude: true,
  rating: true,
  reviewCount: true,
  coverImageUrl: true,
  address: true,
  state: {
    select: { name: true, id: true },
  },
  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
          description: true,
        },
      },
    },
  },
};

function normalizeCategories(
  cats: Array<{ category: { id: number; name: string; slug: string; icon: string | null; description: string | null } }>
) {
  return cats.map((c) => c.category);
}

/**
 * Get all active destinations (summary view for map markers)
 */
export async function getDestinations(options: {
  categorySlug?: string;
  stateId?: number;
  isActive?: boolean;
} = {}): Promise<DestinationSummary[]> {
  const where: Record<string, unknown> = {
    isActive: options.isActive !== undefined ? options.isActive : true,
  };

  if (options.stateId) {
    where.stateId = options.stateId;
  }

  if (options.categorySlug) {
    where.categories = {
      some: {
        category: {
          slug: options.categorySlug,
        },
      },
    };
  }

  const destinations = await prisma.destination.findMany({
    where,
    select: DESTINATION_SUMMARY_SELECT,
    orderBy: [{ rating: "desc" }, { name: "asc" }],
  });

  return destinations.map((d) => ({
    ...d,
    categories: normalizeCategories(d.categories),
  }));
}

/**
 * Get a single destination by slug (full detail view)
 */
export async function getDestinationBySlug(slug: string): Promise<Destination | null> {
  const destination = await prisma.destination.findUnique({
    where: { slug, isActive: true },
    include: {
      country: {
        select: { id: true, name: true, code: true },
      },
      state: {
        select: { id: true, name: true },
      },
      district: {
        select: { id: true, name: true },
      },
      categories: {
        select: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              icon: true,
              description: true,
            },
          },
        },
      },
    },
  });

  if (!destination) return null;

  return {
    ...destination,
    categories: normalizeCategories(destination.categories),
  };
}

/**
 * Search destinations by name or description
 */
export async function searchDestinations(query: string): Promise<DestinationSummary[]> {
  const destinations = await prisma.destination.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { address: { contains: query, mode: "insensitive" } },
        {
          categories: {
            some: {
              category: {
                name: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
      ],
    },
    select: DESTINATION_SUMMARY_SELECT,
    take: 20,
    orderBy: [{ rating: "desc" }],
  });

  return destinations.map((d) => ({
    ...d,
    categories: normalizeCategories(d.categories),
  }));
}

/**
 * Get nearby destinations using Haversine distance calculation
 * Future: Replace with PostGIS ST_DWithin for better performance
 */
export async function getNearbyDestinations(
  latitude: number,
  longitude: number,
  options: {
    radiusKm?: number;
    limit?: number;
    excludeSlug?: string;
  } = {}
): Promise<NearbyDestination[]> {
  const radiusKm = options.radiusKm || 50;
  const limit = options.limit || 8;

  // Get all destinations and calculate distance in application code
  // Future: Use PostGIS for efficient spatial queries
  const destinations = await prisma.destination.findMany({
    where: {
      isActive: true,
      ...(options.excludeSlug && { slug: { not: options.excludeSlug } }),
    },
    select: DESTINATION_SUMMARY_SELECT,
  });

  // Haversine formula for distance calculation
  function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const withDistance = destinations
    .map((d) => ({
      ...d,
      categories: normalizeCategories(d.categories),
      distanceKm: haversineDistance(latitude, longitude, d.latitude, d.longitude),
    }))
    .filter((d) => d.distanceKm <= radiusKm && d.distanceKm > 0)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return withDistance;
}

/**
 * Get popular destinations (by rating and review count)
 */
export async function getPopularDestinations(
  options: { stateId?: number; limit?: number } = {}
): Promise<DestinationSummary[]> {
  const destinations = await prisma.destination.findMany({
    where: {
      isActive: true,
      rating: { not: null },
      ...(options.stateId && { stateId: options.stateId }),
    },
    select: DESTINATION_SUMMARY_SELECT,
    orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
    take: options.limit || 6,
  });

  return destinations.map((d) => ({
    ...d,
    categories: normalizeCategories(d.categories),
  }));
}

/**
 * Get or create external place record for a destination
 */
export async function getExternalPlace(destinationId: number, provider: string) {
  return prisma.externalPlace.findFirst({
    where: { destinationId, provider },
  });
}

/**
 * Upsert external place data
 */
export async function upsertExternalPlace(data: {
  destinationId: number;
  provider: string;
  externalPlaceId?: string;
  externalDataId?: string;
  externalUrl?: string;
  rawName?: string;
}) {
  return prisma.externalPlace.upsert({
    where: {
      destinationId_provider: {
        destinationId: data.destinationId,
        provider: data.provider,
      },
    },
    update: {
      ...data,
      lastSyncedAt: new Date(),
    },
    create: {
      ...data,
      lastSyncedAt: new Date(),
    },
  });
}
