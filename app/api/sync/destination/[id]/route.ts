// POST /api/sync/destination/[id]
// Triggers spot discovery pipeline for a destination.
// Should be called from admin panel or cron — not from user-facing UI.
// Protected by a sync secret key.

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrSyncKey } from "@/lib/auth/api-guard";
import { discoverSpotsForDestination } from "@/lib/services/discoveryService";
import prisma from "@/lib/db/prisma";


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireAdminOrSyncKey(request);
  if (!guard.authorized) return guard.response;

  const destinationId = parseInt(id);
  if (isNaN(destinationId)) {
    return NextResponse.json({ error: "Invalid destination ID" }, { status: 400 });
  }

  try {
    const destination = await prisma.destination.findUnique({
      where: { id: destinationId },
      select: { id: true, name: true, slug: true, isActive: true },
    });

    if (!destination) {
      return NextResponse.json({ error: "Destination not found" }, { status: 404 });
    }

    if (!destination.isActive) {
      return NextResponse.json({ error: "Destination is not active" }, { status: 400 });
    }

    console.log(`[SyncRoute] Starting discovery for destination: ${destination.name}`);

    const result = await discoverSpotsForDestination(destination.id, destination.name);

    return NextResponse.json({
      success: true,
      destinationName: result.destinationName,
      jobId: result.jobId,
      spotsDiscovered: result.spotsDiscovered,
      spotsCreated: result.spotsCreated,
      spotsUpdated: result.spotsUpdated,
      errors: result.errors.slice(0, 10), // Limit error list in response
    });
  } catch (error) {
    console.error(`POST /api/sync/destination/${id} error:`, error);
    return NextResponse.json({ error: "Discovery pipeline failed" }, { status: 500 });
  }
}

// GET to check sync status for a destination
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const destinationId = parseInt(id);

  if (isNaN(destinationId)) {
    return NextResponse.json({ error: "Invalid destination ID" }, { status: 400 });
  }

  try {
    const jobs = await prisma.apiSyncJob.findMany({
      where: { scopeType: "destination", scopeId: destinationId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const spotCount = await prisma.spot.count({
      where: { destinationId, isActive: true },
    });

    return NextResponse.json({ jobs, spotCount });
  } catch (error) {
    console.error(`GET /api/sync/destination/${id} error:`, error);
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}
