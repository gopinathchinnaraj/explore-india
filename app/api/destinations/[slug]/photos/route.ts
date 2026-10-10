// GET /api/destinations/[slug]/photos
// Returns customer photos for a destination (database only — refreshed through the admin sync pipeline)

import { NextRequest, NextResponse } from "next/server";
import { getDestinationBySlug } from "@/lib/services/destinationService";
import { getPublicDestinationPhotos } from "@/lib/services/publicReadService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 30;

  try {
    const destination = await getDestinationBySlug(slug);

    if (!destination) {
      return NextResponse.json(
        { error: "Destination not found" },
        { status: 404 }
      );
    }

    const result = await getPublicDestinationPhotos(destination.id, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET /api/destinations/${slug}/photos error:`, error);
    return NextResponse.json(
      { error: "Photos temporarily unavailable", photos: [] },
      { status: 500 }
    );
  }
}
