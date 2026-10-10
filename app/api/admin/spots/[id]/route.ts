// GET    /api/admin/spots/[id] — full spot detail for admin, including sync history
// PATCH  /api/admin/spots/[id] — edit fields, change status, choose the main photo
// PUT    /api/admin/spots/[id] — alias of PATCH (kept for older clients)
// DELETE /api/admin/spots/[id] — archive (soft delete)
// Admin-only — DB queries only

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { isSpotStatus, setSpotStatus } from "@/lib/services/spotStatusService";
import { setSpotCover } from "@/lib/services/syncService";
import { computeNearbyForSpots } from "@/lib/services/spotService";

type Params = { params: Promise<{ id: string }> };

async function parseId(params: Params["params"]) {
  const { id } = await params;
  const spotId = parseInt(id);
  return isNaN(spotId) ? null : spotId;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const spotId = await parseId(params);
  if (spotId === null) return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });

  try {
    const [spot, jobs] = await Promise.all([
      prisma.spot.findUnique({
        where: { id: spotId },
        include: {
          destination: { select: { id: true, name: true, slug: true } },
          categories: { select: { category: { select: { id: true, name: true, slug: true, icon: true } } } },
          images: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
          reviews: { orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }], take: 50 },
          videos: { orderBy: [{ relevanceScore: { sort: "desc", nulls: "last" } }, { viewCount: { sort: "desc", nulls: "last" } }], take: 30 },
          externalPlaces: true,
          nearbyFrom: {
            include: {
              nearbySpot: {
                select: { id: true, name: true, slug: true, rating: true, coverImageUrl: true, status: true, latitude: true, longitude: true },
              },
            },
            orderBy: { distanceMeters: "asc" },
            take: 20,
          },
          facts: { orderBy: { fetchedAt: "desc" } },
          _count: { select: { images: true, reviews: true, videos: true, nearbyFrom: true } },
        },
      }),
      prisma.apiSyncJob.findMany({
        where: { scopeType: "spot", scopeId: spotId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    if (!spot) return NextResponse.json({ error: "Spot not found" }, { status: 404 });

    const iso = (d: Date | null) => d?.toISOString() || null;
    return NextResponse.json({
      spot: {
        ...spot,
        categories: spot.categories.map((c) => c.category),
        reviews: spot.reviews.map((r) => ({ ...r, publishedAt: iso(r.publishedAt), fetchedAt: r.fetchedAt.toISOString() })),
        videos: spot.videos.map((v) => ({
          ...v,
          viewCount: v.viewCount ? Number(v.viewCount) : null,
          publishedAt: iso(v.publishedAt),
          fetchedAt: v.fetchedAt.toISOString(),
        })),
        images: spot.images.map((img) => ({ ...img, createdAt: img.createdAt.toISOString() })),
        externalPlaces: spot.externalPlaces.map((ep) => ({
          ...ep,
          lastSyncedAt: iso(ep.lastSyncedAt),
          createdAt: ep.createdAt.toISOString(),
        })),
        nearbyFrom: spot.nearbyFrom.map((n) => ({
          distanceMeters: n.distanceMeters,
          distanceKm: (n.distanceMeters / 1000).toFixed(1),
          relationshipType: n.relationshipType,
          spot: n.nearbySpot,
        })),
        facts: spot.facts.map((f) => ({ ...f, fetchedAt: f.fetchedAt.toISOString(), updatedAt: f.updatedAt.toISOString() })),
        lastSyncedAt: iso(spot.lastSyncedAt),
        lastDetailsSyncAt: iso(spot.lastDetailsSyncAt),
        lastReviewsSyncAt: iso(spot.lastReviewsSyncAt),
        lastVideosSyncAt: iso(spot.lastVideosSyncAt),
        lastPhotosSyncAt: iso(spot.lastPhotosSyncAt),
        lastNearbySyncAt: iso(spot.lastNearbySyncAt),
        createdAt: spot.createdAt.toISOString(),
        updatedAt: spot.updatedAt.toISOString(),
      },
      jobs: jobs.map((j) => ({
        ...j,
        startedAt: iso(j.startedAt),
        finishedAt: iso(j.finishedAt),
        createdAt: j.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error(`GET /api/admin/spots/${spotId} error:`, error);
    return NextResponse.json({ error: "Failed to fetch spot" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const spotId = await parseId(params);
  if (spotId === null) return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });

  try {
    const body = await request.json();
    const data: Prisma.SpotUncheckedUpdateInput = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description || null;
    if (body.address !== undefined) data.address = body.address || null;
    if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl || null;
    if (body.destinationId !== undefined) data.destinationId = Number(body.destinationId);
    const lat = body.latitude !== undefined ? parseFloat(body.latitude) : undefined;
    const lng = body.longitude !== undefined ? parseFloat(body.longitude) : undefined;
    if (lat !== undefined && !isNaN(lat)) data.latitude = lat;
    if (lng !== undefined && !isNaN(lng)) data.longitude = lng;

    if (Object.keys(data).length > 0) {
      await prisma.spot.update({ where: { id: spotId }, data });
    }

    if (Array.isArray(body.categoryIds)) {
      const ids = body.categoryIds.map(Number).filter(Boolean);
      await prisma.$transaction([
        prisma.spotCategory.deleteMany({ where: { spotId } }),
        prisma.spotCategory.createMany({ data: ids.map((categoryId: number) => ({ spotId, categoryId })) }),
      ]);
    }

    if (body.coverImageId !== undefined) {
      await setSpotCover(spotId, Number(body.coverImageId));
    }

    if (isSpotStatus(body.status)) {
      await setSpotStatus([spotId], body.status);
    }

    // Coordinates moved: nearby distances are now wrong
    if (data.latitude !== undefined || data.longitude !== undefined) {
      await computeNearbyForSpots([spotId]);
    }

    const spot = await prisma.spot.findUnique({
      where: { id: spotId },
      select: { id: true, name: true, status: true, isActive: true, coverImageUrl: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, spot: { ...spot, updatedAt: spot?.updatedAt.toISOString() } });
  } catch (error) {
    console.error(`PATCH /api/admin/spots/${spotId} error:`, error);
    return NextResponse.json(
      { error: "Failed to update spot", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const spotId = await parseId(params);
  if (spotId === null) return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });

  try {
    await setSpotStatus([spotId], "ARCHIVED");
    return NextResponse.json({ success: true, message: "Spot archived" });
  } catch (error) {
    console.error(`DELETE /api/admin/spots/${spotId} error:`, error);
    return NextResponse.json({ error: "Failed to archive spot" }, { status: 500 });
  }
}
