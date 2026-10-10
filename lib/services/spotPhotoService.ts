// Spot photo service
// Handles fetching, caching, and storing customer photos for individual spots
// via SerpApi Google Maps Photos
// Server-side only

import prisma from "@/lib/db/prisma";
import { fetchPlacePhotos } from "@/lib/serpapi/photos";
import { getSpotExternalPlace } from "./spotService";
import { searchGoogleMapsLocal } from "@/lib/serpapi/maps";
import { sizedImageUrl } from "@/lib/media/image";
import type { SpotImage } from "@prisma/client";
import type { SpotPhoto } from "@/types/spot";

const MIN_CACHED_PHOTOS = 4;

function toThumbnailUrl(url: string): string {
  if (url.includes("=w") || url.includes("=s")) {
    return url.replace(/=w\d+-h\d+[^=]*/, "=w600-h450-k-no");
  }
  return url;
}

export function serializeSpotPhotos(images: SpotImage[]): SpotPhoto[] {
  return images.map((img) => ({
    id: img.id,
    spotId: img.spotId,
    provider: img.provider || "google_maps",
    imageUrl: img.imageUrl,
    thumbnailUrl: img.thumbnailUrl || toThumbnailUrl(img.imageUrl),
    caption: img.caption,
    sourceUrl: img.sourceUrl,
    isPrimary: img.isPrimary,
    createdAt: img.createdAt.toISOString(),
  }));
}

/**
 * Get cached photos for a spot, or fetch from SerpApi Google Maps Photos if insufficient.
 */
export async function getSpotPhotos(
  spotId: number,
  options: { limit?: number } = {}
): Promise<{
  photos: SpotPhoto[];
  totalCount: number;
  fromCache: boolean;
  error?: string;
}> {
  const limit = options.limit || 20;

  // 1. Check database for existing photos
  const cached = await prisma.spotImage.findMany({
    where: { spotId },
    orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
    take: limit,
  });

  if (cached.length >= MIN_CACHED_PHOTOS) {
    return {
      photos: serializeSpotPhotos(cached),
      totalCount: cached.length,
      fromCache: true,
    };
  }

  // 2. Fetch fresh photos via sync
  try {
    const fresh = await syncSpotPhotos(spotId);
    return {
      photos: fresh.slice(0, limit),
      totalCount: fresh.length,
      fromCache: false,
    };
  } catch (error) {
    console.error(`[SpotPhotoService] Failed to sync photos for spot ${spotId}:`, error);
    return {
      photos: serializeSpotPhotos(cached),
      totalCount: cached.length,
      fromCache: true,
      error: cached.length === 0 ? "Photos temporarily unavailable" : undefined,
    };
  }
}

/**
 * Synchronize photos for a spot from Google Maps Photos via SerpApi.
 * Updates PostgreSQL and records ApiSyncJob.
 */
export async function syncSpotPhotos(
  spotId: number,
  providedDataId?: string | null
): Promise<SpotPhoto[]> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      id: true,
      name: true,
      destinationId: true,
      coverImageUrl: true,
      destination: { select: { name: true, state: { select: { name: true } } } },
    },
  });

  if (!spot) {
    throw new Error(`Spot ${spotId} not found`);
  }

  // Create sync job record
  const job = await prisma.apiSyncJob.create({
    data: {
      engine: "google_maps_photos",
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

    // Auto-discover if data_id is missing
    if (!targetDataId) {
      try {
        console.log(`[SpotPhotoService] Auto-discovering Google Maps ID for spot "${spot.name}"...`);
        // Search in the spot's own region so places across India resolve correctly
        const places = await searchGoogleMapsLocal(`${spot.name}, ${spot.destination.name}, ${spot.destination.state.name}`, { limit: 1 });
        if (places.length > 0 && places[0].dataId) {
          targetDataId = places[0].dataId;

          await prisma.externalPlace.upsert({
            where: { spotId_provider: { spotId, provider: "google_maps" } },
            create: {
              spotId,
              provider: "google_maps",
              externalDataId: places[0].dataId,
              externalPlaceId: places[0].placeId || undefined,
              externalCid: places[0].dataCid || undefined,
              externalUrl: places[0].photosLink || undefined,
              rawName: places[0].name,
              lastSyncedAt: new Date(),
            },
            update: {
              externalDataId: places[0].dataId,
              externalPlaceId: places[0].placeId || undefined,
              externalCid: places[0].dataCid || undefined,
              externalUrl: places[0].photosLink || undefined,
              lastSyncedAt: new Date(),
            },
          });
        }
      } catch (discErr) {
        console.warn(`[SpotPhotoService] Discovery failed for "${spot.name}":`, discErr);
      }
    }

    if (!targetDataId) {
      await prisma.apiSyncJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: "No Google Maps data_id found",
        },
      });
      const existing = await prisma.spotImage.findMany({ where: { spotId } });
      return serializeSpotPhotos(existing);
    }

    console.log(`[SpotPhotoService] Fetching photos for spot "${spot.name}" (data_id: ${targetDataId})`);
    const { photos: fetchedPhotos } = await fetchPlacePhotos(targetDataId, { limit: 20 });

    let createdCount = 0;
    for (let i = 0; i < fetchedPhotos.length; i++) {
      const p = fetchedPhotos[i];
      const existing = await prisma.spotImage.findFirst({
        where: { spotId, imageUrl: p.imageUrl },
      });

      if (!existing) {
        await prisma.spotImage.create({
          data: {
            spotId,
            provider: "google_maps",
            imageUrl: p.imageUrl,
            thumbnailUrl: p.thumbnailUrl,
            caption: p.authorName ? `Photo by ${p.authorName}` : `${spot.name} photo`,
            sourceUrl: p.photoMetaLink,
            isPrimary: i === 0 && !spot.coverImageUrl,
          },
        });
        createdCount++;
      }
    }

    // Auto-update spot coverImageUrl if missing
    if (!spot.coverImageUrl && fetchedPhotos.length > 0) {
      await prisma.spot.update({
        where: { id: spotId },
        data: { coverImageUrl: sizedImageUrl(fetchedPhotos[0].imageUrl, 1200, 900) || fetchedPhotos[0].imageUrl },
      });
    }

    // Complete job
    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        itemsProcessed: fetchedPhotos.length,
        itemsCreated: createdCount,
      },
    });

    const allImages = await prisma.spotImage.findMany({
      where: { spotId },
      orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
    });

    return serializeSpotPhotos(allImages);
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
