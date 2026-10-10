// POST /api/admin/spots/[id]/refresh — refresh selected resources for a single spot
// Body: { resource: "details" | "photos" | "reviews" | "videos" | "nearby" | "all" }
//    or { resources: [...] }
// Admin-only. Each resource is refreshed independently and stamps its own sync time.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { SYNC_RESOURCES, isSyncResource, syncSpotResources, ensureSpotCover } from "@/lib/services/syncService";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const { id } = await params;
  const spotId = parseInt(id);
  if (isNaN(spotId)) {
    return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requested: unknown[] = Array.isArray(body.resources) ? body.resources : [body.resource || "all"];
    const resources = requested.includes("all") ? [...SYNC_RESOURCES] : requested.filter(isSyncResource);

    if (resources.length === 0) {
      return NextResponse.json({ error: `resource must be one of: all, ${SYNC_RESOURCES.join(", ")}` }, { status: 400 });
    }

    const exists = await prisma.spot.findUnique({ where: { id: spotId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Spot not found" }, { status: 404 });

    const results = await syncSpotResources(spotId, resources);
    // "cover" is a free check: repair a broken main photo from stored photos
    if (body.repairCover !== false) await ensureSpotCover(spotId, { verify: true });

    return NextResponse.json({ spotId, resources, results });
  } catch (error) {
    console.error(`POST /api/admin/spots/${id}/refresh error:`, error);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
