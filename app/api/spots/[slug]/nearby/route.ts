// GET /api/spots/[slug]/nearby?radius=&limit=
// Returns nearby spots with distance

import { NextRequest, NextResponse } from "next/server";
import { getSpotBySlug, getNearbySpots } from "@/lib/services/spotService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const radiusKm = request.nextUrl.searchParams.get("radius")
    ? parseFloat(request.nextUrl.searchParams.get("radius")!)
    : 15;
  const limit = request.nextUrl.searchParams.get("limit")
    ? parseInt(request.nextUrl.searchParams.get("limit")!)
    : 8;

  try {
    const spot = await getSpotBySlug(slug);
    if (!spot) {
      return NextResponse.json({ error: "Spot not found", nearby: [] }, { status: 404 });
    }

    const nearby = await getNearbySpots(spot.id, { radiusKm, limit });
    return NextResponse.json({ nearby });
  } catch (error) {
    console.error(`GET /api/spots/${slug}/nearby error:`, error);
    return NextResponse.json({ error: "Failed to fetch nearby spots", nearby: [] }, { status: 500 });
  }
}
