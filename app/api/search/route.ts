// GET /api/search?q=query&type=all|destinations|spots
// Unified search over stored destinations and approved spots (database only).

import { NextRequest, NextResponse } from "next/server";
import { searchDestinations } from "@/lib/services/destinationService";
import { searchSpots } from "@/lib/services/spotService";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  const type = request.nextUrl.searchParams.get("type") || "all"; // all | destinations | spots

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters", results: [] },
      { status: 400 }
    );
  }

  try {
    const q = query.trim();
    const [destinations, spots] = await Promise.all([
      type === "all" || type === "destinations" ? searchDestinations(q) : Promise.resolve([]),
      type === "all" || type === "spots" ? searchSpots(q, { limit: 20 }) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      results: destinations,
      destinations,
      spots,
      query: q,
    });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed", results: [] }, { status: 500 });
  }
}
