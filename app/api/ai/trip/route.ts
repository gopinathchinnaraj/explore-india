// POST /api/ai/trip — day-by-day itinerary for a visitor's saved places
// Body: { spotIds: number[], days?: number, style?: string }
// Uses only approved spots from the database; the AI answer is validated server-side.

import { NextRequest, NextResponse } from "next/server";
import { planTrip, MAX_TRIP_STOPS } from "@/lib/services/tripService";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const spotIds = (Array.isArray(body.spotIds) ? body.spotIds : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
    if (spotIds.length === 0) {
      return NextResponse.json({ error: "Add at least one place to your trip" }, { status: 400 });
    }
    if (spotIds.length > MAX_TRIP_STOPS) {
      return NextResponse.json({ error: `A trip can have up to ${MAX_TRIP_STOPS} places` }, { status: 400 });
    }
    const days = body.days ? Math.min(21, Math.max(1, Number(body.days))) : undefined;
    const style = typeof body.style === "string" ? body.style.slice(0, 80) : undefined;

    const plan = await planTrip(spotIds, { days, style });
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("POST /api/ai/trip error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not plan this trip" }, { status: 500 });
  }
}
