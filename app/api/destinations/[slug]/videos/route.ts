// GET /api/destinations/[slug]/videos
// Returns travel videos for a destination (database only — refreshed through the admin sync pipeline)

import { NextRequest, NextResponse } from "next/server";
import { getDestinationBySlug } from "@/lib/services/destinationService";
import { getPublicDestinationVideos } from "@/lib/services/publicReadService";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const destination = await getDestinationBySlug(slug);

    if (!destination) {
      return NextResponse.json(
        { error: "Destination not found" },
        { status: 404 }
      );
    }

    const result = await getPublicDestinationVideos(destination.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET /api/destinations/${slug}/videos error:`, error);
    return NextResponse.json(
      { error: "Videos temporarily unavailable", videos: [] },
      { status: 500 }
    );
  }
}
