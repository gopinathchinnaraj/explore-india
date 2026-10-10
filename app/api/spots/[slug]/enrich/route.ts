// POST /api/spots/[slug]/enrich
// Triggers independent auto-enrichment (Photos, Reviews, Videos) for a spot
// Admin-only: this spends SerpApi credits, so it is never callable by public visitors

import { NextRequest, NextResponse } from "next/server";
import { getSpotBySlug } from "@/lib/services/spotService";
import { enrichSpot } from "@/lib/services/placeDiscoveryService";
import { requireAdminApi } from "@/lib/auth/api-guard";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const { slug } = await params;

  try {
    const spot = await getSpotBySlug(slug);
    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const result = await enrichSpot(spot.id);
    return NextResponse.json({
      success: true,
      spotId: spot.id,
      name: spot.name,
      enrichmentStatus: result.status,
      spot: result.spot,
    });
  } catch (error) {
    console.error(`POST /api/spots/${slug}/enrich error:`, error);
    return NextResponse.json(
      { error: "Spot enrichment failed", details: String(error) },
      { status: 500 }
    );
  }
}
