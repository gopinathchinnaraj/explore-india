// GET   /api/admin/spots — paginated, filterable spot list for the admin (all statuses)
// POST  /api/admin/spots — create a spot manually
// PATCH /api/admin/spots — change status for one spot ({ spotId }) or many ({ spotIds })
// Admin-only

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { isSpotStatus, setSpotStatus } from "@/lib/services/spotStatusService";
import { computeNearbyForSpots } from "@/lib/services/spotService";

const SORTS: Record<string, Prisma.SpotOrderByWithRelationInput[]> = {
  score: [{ discoveryScore: { sort: "desc", nulls: "last" } }, { rating: { sort: "desc", nulls: "last" } }, { name: "asc" }],
  newest: [{ createdAt: "desc" }],
  updated: [{ updatedAt: "desc" }],
  rating: [{ rating: { sort: "desc", nulls: "last" } }, { reviewCount: { sort: "desc", nulls: "last" } }],
  name: [{ name: "asc" }],
  synced: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
};

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const params = request.nextUrl.searchParams;
  const destinationId = params.get("destinationId");
  const status = params.get("status") || undefined;
  const search = params.get("search")?.trim() || undefined;
  const missing = params.get("missing") || undefined; // photos | reviews | videos
  const sort = SORTS[params.get("sort") || "score"] || SORTS.score;
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20")));
  const skip = (page - 1) * limit;

  try {
    const where: Prisma.SpotWhereInput = {};
    if (destinationId) where.destinationId = parseInt(destinationId);
    if (status) where.status = { in: status.split(",") };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { destination: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (missing === "photos") where.images = { none: {} };
    if (missing === "reviews") where.reviews = { none: {} };
    if (missing === "videos") where.videos = { none: {} };

    const [spots, total, statusCounts] = await Promise.all([
      prisma.spot.findMany({
        where,
        skip,
        take: limit,
        orderBy: sort,
        include: {
          destination: { select: { id: true, name: true, slug: true } },
          categories: {
            select: { category: { select: { id: true, name: true, slug: true, icon: true } } },
          },
          images: {
            select: { thumbnailUrl: true, imageUrl: true },
            orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
            take: 1,
          },
          _count: { select: { images: true, reviews: true, videos: true, nearbyFrom: true } },
        },
      }),
      prisma.spot.count({ where }),
      prisma.spot.groupBy({
        by: ["status"],
        _count: { id: true },
        where: { ...where, status: undefined },
      }),
    ]);

    const iso = (d: Date | null) => d?.toISOString() || null;
    const serialized = spots.map(({ images, ...s }) => ({
      ...s,
      categories: s.categories.map((c) => c.category),
      // Fall back to a stored photo when the cover is missing
      fallbackImageUrl: images[0]?.thumbnailUrl || images[0]?.imageUrl || null,
      lastSyncedAt: iso(s.lastSyncedAt),
      lastDetailsSyncAt: iso(s.lastDetailsSyncAt),
      lastReviewsSyncAt: iso(s.lastReviewsSyncAt),
      lastVideosSyncAt: iso(s.lastVideosSyncAt),
      lastPhotosSyncAt: iso(s.lastPhotosSyncAt),
      lastNearbySyncAt: iso(s.lastNearbySyncAt),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      spots: serialized,
      statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("GET /api/admin/spots error:", error);
    return NextResponse.json({ error: "Failed to fetch spots" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  try {
    const body = await request.json();
    const { destinationId, name, description, latitude, longitude, address, coverImageUrl, categoryIds } = body;
    const status = isSpotStatus(body.status) ? body.status : "APPROVED";

    if (!name || !destinationId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: "name, destinationId, latitude, and longitude are required" },
        { status: 400 }
      );
    }

    const baseSlug = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let slug = baseSlug;
    let counter = 2;
    while (await prisma.spot.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const spot = await prisma.spot.create({
      data: {
        destinationId: parseInt(destinationId),
        name,
        slug,
        description: description || null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || null,
        coverImageUrl: coverImageUrl || null,
        status,
        discoverySource: "MANUAL",
        isVerified: status === "APPROVED",
        isActive: status === "APPROVED",
        ...(Array.isArray(categoryIds) && categoryIds.length > 0
          ? { categories: { create: categoryIds.map((cId: number) => ({ category: { connect: { id: cId } } })) } }
          : {}),
      },
      include: {
        destination: { select: { id: true, name: true } },
        categories: { select: { category: true } },
      },
    });

    if (status === "APPROVED") await computeNearbyForSpots([spot.id]);

    return NextResponse.json({ spot }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/spots error:", error);
    return NextResponse.json(
      { error: "Failed to create spot", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  try {
    const body = (await request.json()) as { spotId?: number; spotIds?: number[]; status?: string };
    const ids = (body.spotIds?.length ? body.spotIds : body.spotId ? [body.spotId] : []).map(Number).filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "spotId or spotIds is required" }, { status: 400 });
    }
    if (!isSpotStatus(body.status)) {
      return NextResponse.json({ error: "A valid status is required" }, { status: 400 });
    }

    const result = await setSpotStatus(ids, body.status);
    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/admin/spots error:", error);
    return NextResponse.json({ error: "Failed to update spots" }, { status: 500 });
  }
}
