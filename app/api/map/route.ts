// GET /api/map
// Everything the public map needs in one request: approved spots and active destinations.
// Database only — whatever the admin approves appears here on the next load.

import { NextResponse } from "next/server";
import { getMapSpots } from "@/lib/services/publicReadService";
import { getDestinations } from "@/lib/services/destinationService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [spots, destinations] = await Promise.all([getMapSpots(), getDestinations()]);
    return NextResponse.json({ spots, destinations });
  } catch (error) {
    console.error("GET /api/map error:", error);
    return NextResponse.json({ error: "Failed to load map data", spots: [], destinations: [] }, { status: 500 });
  }
}
