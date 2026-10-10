// GET /api/destinations/[slug]/nearby
// Returns nearby destinations based on geographic distance

import { NextRequest, NextResponse } from "next/server";
import { getDestinationBySlug, getNearbyDestinations } from "@/lib/services/destinationService";

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

    const nearby = await getNearbyDestinations(
      destination.latitude,
      destination.longitude,
      { radiusKm: 100, limit: 8, excludeSlug: slug }
    );

    return NextResponse.json({ nearby });
  } catch (error) {
    console.error(`GET /api/destinations/${slug}/nearby error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch nearby destinations", nearby: [] },
      { status: 500 }
    );
  }
}
