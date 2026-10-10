// Public read service
// Everything the public site shows is read from PostgreSQL only.
// SerpApi is never called from here — acquisition and refresh happen through
// the admin sync pipeline (see syncService.ts).

import prisma from "@/lib/db/prisma";
import { sizedImageUrl } from "@/lib/media/image";
import { classifyVideoContentType } from "./spotVideoService";
import type { MapSpot, ReviewSortOrder } from "@/types/spot";

export type { MapSpot };

/** Prisma filter for anything that may be shown publicly. */
export const PUBLIC_SPOT_WHERE = { status: "APPROVED", isActive: true } as const;

// ─── Map ──────────────────────────────────────────────────────────────────────

/** All approved spots, lightweight, for map markers and client-side filtering. */
export async function getMapSpots(): Promise<MapSpot[]> {
  const spots = await prisma.spot.findMany({
    where: PUBLIC_SPOT_WHERE,
    select: {
      id: true,
      slug: true,
      name: true,
      latitude: true,
      longitude: true,
      rating: true,
      reviewCount: true,
      coverImageUrl: true,
      address: true,
      discoverySource: true,
      discoveryScore: true,
      destination: { select: { id: true, name: true, slug: true, state: { select: { name: true } } } },
      categories: { select: { category: { select: { id: true, name: true, slug: true, icon: true } } } },
      images: {
        select: { thumbnailUrl: true, imageUrl: true },
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
        take: 1,
      },
    },
    orderBy: [{ discoveryScore: "desc" }, { rating: "desc" }],
  });

  return spots.map(({ images, categories, destination, discoverySource, discoveryScore, ...s }) => ({
    ...s,
    coverImageUrl: s.coverImageUrl || images[0]?.thumbnailUrl || images[0]?.imageUrl || null,
    categories: categories.map((c) => c.category),
    destination: { id: destination.id, name: destination.name, slug: destination.slug },
    state: destination.state.name,
    featured: discoverySource === "CURATED",
    score: discoveryScore ?? 0,
  }));
}

// ─── Spot media ───────────────────────────────────────────────────────────────

export async function getPublicSpotPhotos(spotId: number, limit = 30) {
  const images = await prisma.spotImage.findMany({
    where: { spotId },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    take: limit,
  });
  return {
    photos: images.map((img) => ({
      id: img.id,
      spotId: img.spotId,
      provider: img.provider || "google_maps",
      imageUrl: sizedImageUrl(img.imageUrl, 1600, 1200) || img.imageUrl,
      thumbnailUrl: sizedImageUrl(img.thumbnailUrl || img.imageUrl, 600, 450) || img.imageUrl,
      caption: img.caption,
      sourceUrl: img.sourceUrl,
      isPrimary: img.isPrimary,
      createdAt: img.createdAt.toISOString(),
    })),
    totalCount: images.length,
  };
}

function reviewOrder(sort: ReviewSortOrder) {
  switch (sort) {
    case "newest":
      return [{ publishedAt: { sort: "desc" as const, nulls: "last" as const } }];
    case "highest":
      return [{ rating: { sort: "desc" as const, nulls: "last" as const } }, { id: "desc" as const }];
    case "lowest":
      return [{ rating: { sort: "asc" as const, nulls: "last" as const } }, { id: "desc" as const }];
    default:
      // "relevant": longer, rated reviews first is a reasonable proxy
      return [{ rating: { sort: "desc" as const, nulls: "last" as const } }, { publishedAt: { sort: "desc" as const, nulls: "last" as const } }];
  }
}

export async function getPublicSpotReviews(spotId: number, sort: ReviewSortOrder = "relevant", limit = 20) {
  const [reviews, agg] = await Promise.all([
    prisma.spotReview.findMany({ where: { spotId }, orderBy: reviewOrder(sort), take: limit }),
    prisma.spotReview.aggregate({ where: { spotId }, _avg: { rating: true }, _count: { id: true } }),
  ]);
  return {
    reviews: reviews.map((r) => ({
      ...r,
      publishedAt: r.publishedAt?.toISOString() || null,
      fetchedAt: r.fetchedAt.toISOString(),
    })),
    totalCount: agg._count.id,
    averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
    sort,
  };
}

export async function getPublicSpotVideos(spotId: number, limit = 12) {
  const videos = await prisma.spotVideo.findMany({
    where: { spotId },
    orderBy: [{ relevanceScore: { sort: "desc", nulls: "last" } }, { viewCount: { sort: "desc", nulls: "last" } }],
    take: limit,
  });
  return {
    videos: videos.map((v) => ({
      ...v,
      viewCount: v.viewCount ? Number(v.viewCount) : null,
      publishedAt: v.publishedAt?.toISOString() || null,
      fetchedAt: v.fetchedAt.toISOString(),
    })),
  };
}

// ─── Destination media (own records + media of its approved spots) ───────────

async function approvedSpotIds(destinationId: number): Promise<number[]> {
  const spots = await prisma.spot.findMany({
    where: { destinationId, ...PUBLIC_SPOT_WHERE },
    select: { id: true },
  });
  return spots.map((s) => s.id);
}

export async function getPublicDestinationPhotos(destinationId: number, limit = 30) {
  const spotIds = await approvedSpotIds(destinationId);
  const [own, fromSpots] = await Promise.all([
    prisma.destinationImage.findMany({
      where: { destinationId },
      orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      take: limit,
    }),
    spotIds.length
      ? prisma.spotImage.findMany({
          where: { spotId: { in: spotIds } },
          orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  const photos = [
    ...own.map((img) => ({
      id: img.id,
      destinationId,
      url: sizedImageUrl(img.url, 1600, 1200) || img.url,
      thumbnailUrl: sizedImageUrl(img.url, 600, 450) || img.url,
      alt: img.alt,
      authorName: null,
      authorProfileUrl: null,
      source: img.source || "google_maps",
      createdAt: img.createdAt.toISOString(),
    })),
    ...fromSpots.map((img) => ({
      // Offset ids so they never collide with destination image ids in React keys
      id: 1_000_000 + img.id,
      destinationId,
      url: sizedImageUrl(img.imageUrl, 1600, 1200) || img.imageUrl,
      thumbnailUrl: sizedImageUrl(img.thumbnailUrl || img.imageUrl, 600, 450) || img.imageUrl,
      alt: img.caption,
      authorName: img.caption?.startsWith("Photo by ") ? img.caption.slice(9) : null,
      authorProfileUrl: null,
      source: img.provider || "google_maps",
      createdAt: img.createdAt.toISOString(),
    })),
  ].slice(0, limit);

  return {
    photos,
    totalCount: photos.length,
    cachedAt: photos[0]?.createdAt || null,
    fromCache: true,
  };
}

export async function getPublicDestinationReviews(destinationId: number, limit = 20) {
  const spotIds = await approvedSpotIds(destinationId);
  const [own, fromSpots, fact] = await Promise.all([
    prisma.destinationReview.findMany({
      where: { destinationId },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: limit,
    }),
    spotIds.length
      ? prisma.spotReview.findMany({
          where: { spotId: { in: spotIds } },
          orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
          take: limit,
        })
      : Promise.resolve([]),
    prisma.destinationFact.findFirst({ where: { destinationId, factType: "ai_review_summary" } }),
  ]);

  const reviews = [
    ...own.map((r) => ({ ...r, id: r.id })),
    ...fromSpots.map((r) => ({ ...r, id: 1_000_000 + r.id })),
  ]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      source: r.source,
      externalReviewId: r.externalReviewId,
      authorName: r.authorName,
      authorAvatarUrl: r.authorAvatarUrl,
      rating: r.rating,
      reviewText: r.reviewText,
      publishedAt: r.publishedAt?.toISOString() || null,
      reviewUrl: r.reviewUrl,
      fetchedAt: r.fetchedAt.toISOString(),
    }));

  const rated = reviews.filter((r) => typeof r.rating === "number");
  const averageRating = rated.length
    ? Math.round((rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length) * 10) / 10
    : null;

  return {
    reviews,
    totalCount: reviews.length,
    averageRating,
    source: "google_maps",
    cachedAt: reviews[0]?.fetchedAt || null,
    fromCache: true,
    aiSummary: fact?.content || null,
  };
}

export async function getPublicDestinationVideos(destinationId: number, limit = 12) {
  const spotIds = await approvedSpotIds(destinationId);
  const [own, fromSpots] = await Promise.all([
    prisma.destinationVideo.findMany({
      where: { destinationId },
      orderBy: [{ viewCount: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: limit,
    }),
    spotIds.length
      ? prisma.spotVideo.findMany({
          where: { spotId: { in: spotIds } },
          orderBy: [{ relevanceScore: { sort: "desc", nulls: "last" } }, { viewCount: { sort: "desc", nulls: "last" } }],
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const videos = [
    ...own.map((v) => ({ v, id: v.id, category: classifyVideoContentType(v.title, v.description) as string })),
    ...fromSpots.map((v) => ({ v, id: 1_000_000 + v.id, category: v.contentType })),
  ]
    .filter(({ v }) => (seen.has(v.videoId) ? false : (seen.add(v.videoId), true)))
    .slice(0, limit)
    .map(({ v, id, category }) => ({
      id,
      provider: v.provider,
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      channelName: v.channelName,
      channelId: v.channelId,
      thumbnailUrl: v.thumbnailUrl,
      durationSeconds: v.durationSeconds,
      viewCount: v.viewCount ? Number(v.viewCount) : null,
      publishedAt: v.publishedAt?.toISOString() || null,
      videoUrl: v.videoUrl,
      fetchedAt: v.fetchedAt.toISOString(),
      category,
    }));

  return { videos, cachedAt: videos[0]?.fetchedAt || null, fromCache: true };
}
