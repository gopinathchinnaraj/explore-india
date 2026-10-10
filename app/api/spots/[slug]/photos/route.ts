// GET /api/spots/[slug]/photos
// Returns customer photos for an individual spot (database only — refreshed through the admin sync pipeline)

import { NextRequest, NextResponse } from "next/server";
import { getSpotBySlug } from "@/lib/services/spotService";
import { getPublicSpotPhotos } from "@/lib/services/publicReadService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const limit = request.nextUrl.searchParams.get("limit")
    ? parseInt(request.nextUrl.searchParams.get("limit")!)
    : 20;

  try {
    const spot = await getSpotBySlug(slug);
    if (!spot) {
      return NextResponse.json({ error: "Spot not found", photos: [] }, { status: 404 });
    }

    const result = await getPublicSpotPhotos(spot.id, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET /api/spots/${slug}/photos error:`, error);
    return NextResponse.json(
      { error: "Photos temporarily unavailable", photos: [] },
      { status: 500 }
    );
  }
}
