// GET /api/spots/[slug]/videos?limit=
// Returns stored, classified travel videos for a spot (database only)

import { NextRequest, NextResponse } from "next/server";
import { getSpotBySlug } from "@/lib/services/spotService";
import { getPublicSpotVideos } from "@/lib/services/publicReadService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const limit = request.nextUrl.searchParams.get("limit")
    ? parseInt(request.nextUrl.searchParams.get("limit")!)
    : 10;

  try {
    const spot = await getSpotBySlug(slug);
    if (!spot) {
      return NextResponse.json({ error: "Spot not found", videos: [] }, { status: 404 });
    }

    const result = await getPublicSpotVideos(spot.id, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET /api/spots/${slug}/videos error:`, error);
    return NextResponse.json({ error: "Failed to fetch videos", videos: [] }, { status: 500 });
  }
}
