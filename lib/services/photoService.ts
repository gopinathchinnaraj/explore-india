// Photo service layer
// Handles fetching, caching, and storing customer photos from SerpApi Google Maps Photos
// Server-side only

import prisma from "@/lib/db/prisma";
import { fetchPlacePhotos } from "@/lib/serpapi/photos";
import { searchGoogleMapsLocal } from "@/lib/serpapi/maps";
import { getExternalPlace, upsertExternalPlace } from "./destinationService";
import type { DestinationImage } from "@prisma/client";

const MIN_CACHED_PHOTOS = 8;

/**
 * Format thumbnail URL from Google Photos URL for fast grid loading
 */
function toThumbnailUrl(url: string): string {
  if (url.includes("=w") || url.includes("=s")) {
    return url.replace(/=w\d+-h\d+[^=]*/, "=w600-h450-k-no");
  }
  return url;
}

function serializePhotos(images: DestinationImage[]) {
  return images.map((img) => ({
    id: img.id,
    destinationId: img.destinationId,
    url: img.url,
    thumbnailUrl: toThumbnailUrl(img.url),
    alt: img.alt,
    authorName: img.alt && !img.alt.includes("photo") ? img.alt : null,
    authorProfileUrl: null,
    source: img.source || "google_maps",
    createdAt: img.createdAt.toISOString(),
  }));
}

/**
 * Get cached photos for a destination, or fetch from SerpApi Google Maps Photos if insufficient.
 * Flow:
 * 1. Check PostgreSQL for cached destination images
 * 2. If >= 8 photos exist, return from DB directly (fast cache)
 * 3. If cache miss, look up or auto-discover ExternalPlace (Google Maps data_id)
 * 4. Call SerpApi Google Maps Photos API
 * 5. Deduplicate and insert new photos into PostgreSQL DestinationImage table
 * 6. Update destination coverImageUrl if missing
 * 7. Re-query PostgreSQL for persisted photos and return them
 */
export async function getPhotos(
  destinationId: number,
  options: {
    limit?: number;
    categoryId?: string;
  } = {}
) {
  const limit = options.limit || 30;

  // 1. Check PostgreSQL for existing photos
  const cachedPhotos = await prisma.destinationImage.findMany({
    where: { destinationId },
    orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
    take: limit,
  });

  if (cachedPhotos.length >= MIN_CACHED_PHOTOS) {
    return {
      photos: serializePhotos(cachedPhotos),
      totalCount: cachedPhotos.length,
      cachedAt: cachedPhotos[0].createdAt.toISOString(),
      fromCache: true,
    };
  }

  // 2. Fetch destination details
  const destination = await prisma.destination.findUnique({
    where: { id: destinationId },
    select: { id: true, name: true, coverImageUrl: true },
  });

  if (!destination) {
    return {
      photos: [],
      totalCount: 0,
      cachedAt: null,
      fromCache: false,
    };
  }

  // 3. Get external place (Google Maps data_id)
  let externalPlace = await getExternalPlace(destinationId, "google_maps");

  // Auto-discover if data_id is missing
  if (!externalPlace?.externalDataId && !externalPlace?.externalPlaceId) {
    try {
      console.log(`[PhotoService] Discovering Google Maps ID for "${destination.name}"...`);
      const places = await searchGoogleMapsLocal(`${destination.name} Karnataka tourism`, { limit: 1 });
      if (places.length > 0 && (places[0].dataId || places[0].placeId)) {
        externalPlace = await upsertExternalPlace({
          destinationId,
          provider: "google_maps",
          externalDataId: places[0].dataId || undefined,
          externalPlaceId: places[0].placeId || undefined,
          externalUrl: places[0].photosLink || places[0].reviewsLink || undefined,
          rawName: places[0].name,
        });

        // Set cover image if destination has none
        if (!destination.coverImageUrl && places[0].thumbnailUrl) {
          await prisma.destination.update({
            where: { id: destinationId },
            data: { coverImageUrl: places[0].thumbnailUrl },
          });
        }
      }
    } catch (discoveryErr) {
      console.warn(`[PhotoService] Failed to auto-discover Google Maps ID for "${destination.name}":`, discoveryErr);
    }
  }

  const targetDataId = externalPlace?.externalDataId;

  if (!targetDataId) {
    console.warn(`[PhotoService] No external Google Maps data_id found for destination "${destination.name}"`);
    return {
      photos: serializePhotos(cachedPhotos),
      totalCount: cachedPhotos.length,
      cachedAt: cachedPhotos[0]?.createdAt.toISOString() || null,
      fromCache: true,
    };
  }

  // 4. Fetch photos from SerpApi Google Maps Photos
  try {
    console.log(`[PhotoService] Fetching Google Maps photos for "${destination.name}" (data_id: ${targetDataId})`);

    const { photos: fetchedPhotos, categories } = await fetchPlacePhotos(targetDataId, {
      limit,
      categoryId: options.categoryId,
    });

    // 5. Deduplicate and persist into PostgreSQL
    for (const photo of fetchedPhotos) {
      const existing = await prisma.destinationImage.findFirst({
        where: {
          destinationId,
          url: photo.imageUrl,
        },
      });

      if (!existing) {
        await prisma.destinationImage.create({
          data: {
            destinationId,
            url: photo.imageUrl,
            alt: photo.authorName ? photo.authorName : `${destination.name} photo`,
            source: "google_maps",
            isPrimary: false,
          },
        });
      }
    }

    // If destination has no cover image, use first high-res photo
    if (!destination.coverImageUrl && fetchedPhotos.length > 0) {
      await prisma.destination.update({
        where: { id: destinationId },
        data: { coverImageUrl: fetchedPhotos[0].imageUrl },
      });
    }

    // 6. Query DB again for persisted photos
    const persistedPhotos = await prisma.destinationImage.findMany({
      where: { destinationId },
      orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
      take: limit,
    });

    return {
      photos: serializePhotos(persistedPhotos),
      totalCount: persistedPhotos.length,
      categories,
      cachedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (error) {
    console.error(`[PhotoService] Failed to fetch Google Maps photos for "${destination.name}":`, error);

    // Resilient fallback: return any existing DB photos
    return {
      photos: serializePhotos(cachedPhotos),
      totalCount: cachedPhotos.length,
      cachedAt: cachedPhotos[0]?.createdAt.toISOString() || null,
      fromCache: true,
      error: cachedPhotos.length === 0 ? "Photos temporarily unavailable" : undefined,
    };
  }
}
