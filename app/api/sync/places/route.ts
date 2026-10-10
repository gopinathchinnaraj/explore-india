// POST /api/sync/places
// Discovers places on Google Maps via SerpApi and automatically builds
// the complete Spot record: Place Identity + Photos + Reviews + Videos.

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrSyncKey } from "@/lib/auth/api-guard";
import { discoverPlacesAndAutoWire } from "@/lib/services/placeDiscoveryService";


export async function POST(request: NextRequest) {
  const guard = await requireAdminOrSyncKey(request);
  if (!guard.authorized) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const query = body.query || "karnataka tourism places";
    const destinationId = body.destinationId ? parseInt(body.destinationId, 10) : undefined;
    const limit = body.limit ? parseInt(body.limit, 10) : 15;
    // Enrichment costs several SerpApi calls per place, so it is opt-in
    const autoEnrich = body.autoEnrich === true;

    console.log(`[SyncPlacesRoute] Discovering & auto-wiring query: "${query}" (limit=${limit})`);

    const result = await discoverPlacesAndAutoWire(query, {
      destinationId,
      limit,
      autoEnrich,
    });

    return NextResponse.json({
      success: true,
      query: result.query,
      totalFound: result.totalFound,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      spots: result.spots.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        destination: s.destination.name,
        imagesCount: s.images.length,
        reviewsCount: s.reviews.length,
        videosCount: s.videos.length,
        rating: s.rating,
      })),
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    console.error("POST /api/sync/places error:", error);
    return NextResponse.json(
      { error: "Place discovery and auto-wiring failed", details: String(error) },
      { status: 500 }
    );
  }
}
