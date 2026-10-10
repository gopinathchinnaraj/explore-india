// Script to sync/populate all Destinations as Spots in the database
// Ensures all destinations appear in the Admin Spots management UI.
// Run with: npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/sync-destinations-to-spots.ts

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

async function main() {
  console.log("🔄 Starting Destinations -> Spots sync...");

  const destinations = await prisma.destination.findMany({
    include: {
      categories: true,
      images: true,
      reviews: true,
      videos: true,
      externalPlaces: true,
      spots: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${destinations.length} destinations in database.`);

  let createdCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;

  for (const dest of destinations) {
    // Check if a spot with this destinationId and matching or similar name already exists
    const existingSpot = dest.spots.find(
      (s) => s.name.toLowerCase() === dest.name.toLowerCase()
    ) || (dest.spots.length === 1 ? dest.spots[0] : null);

    let spotId: number;

    if (existingSpot) {
      // Already exists - update its details if needed
      await prisma.spot.update({
        where: { id: existingSpot.id },
        data: {
          isActive: dest.isActive,
          status: "APPROVED",
          ...(dest.coverImageUrl && { coverImageUrl: dest.coverImageUrl }),
          ...(dest.rating && { rating: dest.rating }),
          ...(dest.reviewCount && { reviewCount: dest.reviewCount }),
          ...(dest.description && { description: dest.description }),
          lastSyncedAt: new Date(),
        },
      });
      spotId = existingSpot.id;
      updatedCount++;
    } else {
      // Determine unique slug
      let baseSlug = dest.slug || slugify(dest.name);
      let targetSlug = baseSlug;
      let counter = 1;

      while (await prisma.spot.findUnique({ where: { slug: targetSlug } })) {
        targetSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      const discoveryScore = dest.rating
        ? Math.min(98, Math.round(dest.rating * 18 + (dest.reviewCount ? Math.min(10, Math.log10(dest.reviewCount) * 2) : 0)))
        : 80;

      const newSpot = await prisma.spot.create({
        data: {
          destinationId: dest.id,
          name: dest.name,
          slug: targetSlug,
          description: dest.description,
          latitude: dest.latitude,
          longitude: dest.longitude,
          address: dest.address,
          rating: dest.rating,
          reviewCount: dest.reviewCount,
          coverImageUrl: dest.coverImageUrl,
          discoverySource: "GOOGLE_MAPS",
          discoveryScore,
          isVerified: true,
          isActive: dest.isActive,
          status: "APPROVED",
          lastSyncedAt: new Date(),
          lastDetailsSyncAt: new Date(),
          lastPhotosSyncAt: dest.images.length > 0 ? new Date() : null,
          lastReviewsSyncAt: dest.reviews.length > 0 ? new Date() : null,
          lastVideosSyncAt: dest.videos.length > 0 ? new Date() : null,
        },
      });
      spotId = newSpot.id;
      createdCount++;
    }

    // Sync categories
    for (const dc of dest.categories) {
      await prisma.spotCategory
        .upsert({
          where: {
            spotId_categoryId: {
              spotId,
              categoryId: dc.categoryId,
            },
          },
          create: {
            spotId,
            categoryId: dc.categoryId,
          },
          update: {},
        })
        .catch(() => {});
    }

    // Sync images to SpotImage if not already present
    for (const img of dest.images) {
      const existingImg = await prisma.spotImage.findFirst({
        where: { spotId, imageUrl: img.url },
      });
      if (!existingImg) {
        await prisma.spotImage
          .create({
            data: {
              spotId,
              imageUrl: img.url,
              caption: img.alt || `${dest.name} photo`,
              sourceUrl: img.source || "google_maps",
              isPrimary: img.isPrimary,
            },
          })
          .catch(() => {});
      }
    }

    // Sync reviews to SpotReview
    for (const rev of dest.reviews) {
      if (rev.externalReviewId) {
        const existingRev = await prisma.spotReview.findFirst({
          where: { spotId, externalReviewId: rev.externalReviewId },
        });
        if (!existingRev) {
          await prisma.spotReview
            .create({
              data: {
                spotId,
                source: rev.source || "google_maps",
                externalReviewId: rev.externalReviewId,
                authorName: rev.authorName,
                authorAvatarUrl: rev.authorAvatarUrl,
                rating: rev.rating,
                reviewText: rev.reviewText,
                publishedAt: rev.publishedAt,
                reviewUrl: rev.reviewUrl,
              },
            })
            .catch(() => {});
        }
      }
    }

    // Sync videos to SpotVideo
    for (const vid of dest.videos) {
      const existingVid = await prisma.spotVideo.findFirst({
        where: { spotId, provider: vid.provider, videoId: vid.videoId },
      });
      if (!existingVid) {
        await prisma.spotVideo
          .create({
            data: {
              spotId,
              provider: vid.provider,
              videoId: vid.videoId,
              title: vid.title,
              description: vid.description,
              channelName: vid.channelName,
              channelId: vid.channelId,
              thumbnailUrl: vid.thumbnailUrl,
              durationSeconds: vid.durationSeconds,
              viewCount: vid.viewCount,
              publishedAt: vid.publishedAt,
              videoUrl: vid.videoUrl,
              contentType: "OTHER",
            },
          })
          .catch(() => {});
      }
    }

    // Sync ExternalPlace
    for (const ep of dest.externalPlaces) {
      const existingEp = await prisma.externalPlace.findFirst({
        where: { spotId, provider: ep.provider },
      });
      if (!existingEp) {
        await prisma.externalPlace
          .create({
            data: {
              spotId,
              provider: ep.provider,
              externalPlaceId: ep.externalPlaceId,
              externalDataId: ep.externalDataId,
              externalCid: ep.externalCid,
              externalUrl: ep.externalUrl,
              rawName: ep.rawName,
              lastSyncedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    }
  }

  const finalTotalSpots = await prisma.spot.count();
  console.log("\n✅ Sync complete!");
  console.log(`   - Spots created: ${createdCount}`);
  console.log(`   - Spots updated: ${updatedCount}`);
  console.log(`   - Total spots in database now: ${finalTotalSpots}`);
}

main()
  .catch((e) => {
    console.error("❌ Sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
