// GET /api/spots/[slug]
// Returns full spot details by slug

import { NextRequest, NextResponse } from "next/server";
import { getSpotBySlug } from "@/lib/services/spotService";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const spot = await getSpotBySlug(slug);

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    return NextResponse.json({ spot });
  } catch (error) {
    console.error(`GET /api/spots/${slug} error:`, error);
    return NextResponse.json({ error: "Failed to fetch spot" }, { status: 500 });
  }
}
