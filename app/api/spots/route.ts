// GET /api/spots?destinationId=&category=&q=&limit=
// Returns spots for a destination (map pins at zoomed-in level)

import { NextRequest, NextResponse } from "next/server";
import { getSpotsForDestination, searchSpots } from "@/lib/services/spotService";
import prisma from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const destinationId = params.get("destinationId");
  const destinationSlug = params.get("destination");
  const category = params.get("category") || undefined;
  const query = params.get("q") || undefined;
  const limit = params.get("limit") ? parseInt(params.get("limit")!) : undefined;

  try {
    // Search mode
    if (query) {
      const results = await searchSpots(query, {
        categorySlug: category,
        limit,
      });
      return NextResponse.json({ spots: results, query });
    }

    // Resolve destination
    let resolvedDestinationId: number | null = null;

    if (destinationId) {
      resolvedDestinationId = parseInt(destinationId);
    } else if (destinationSlug) {
      const dest = await prisma.destination.findUnique({
        where: { slug: destinationSlug },
        select: { id: true },
      });
      resolvedDestinationId = dest?.id || null;
    }

    if (!resolvedDestinationId) {
      return NextResponse.json(
        { error: "destinationId or destination (slug) parameter is required", spots: [] },
        { status: 400 }
      );
    }

    const spots = await getSpotsForDestination(resolvedDestinationId, {
      categorySlug: category,
      limit,
    });

    return NextResponse.json({ spots });
  } catch (error) {
    console.error("GET /api/spots error:", error);
    return NextResponse.json({ error: "Failed to fetch spots", spots: [] }, { status: 500 });
  }
}
