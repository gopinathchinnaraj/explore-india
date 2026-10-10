// GET /api/destinations
// Returns all active destinations (summary view for map markers)

import { NextRequest, NextResponse } from "next/server";
import { getDestinations, getPopularDestinations } from "@/lib/services/destinationService";

export async function GET(request: NextRequest) {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        destinations: [],
        error: "DATABASE_URL not configured. Please add your PostgreSQL connection string to .env.local",
        setupRequired: true,
      },
      { status: 200 } // Return 200 so the UI can show a helpful message
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category") || undefined;
  const popular = searchParams.get("popular") === "true";
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

  try {
    if (popular) {
      const destinations = await getPopularDestinations({ limit });
      return NextResponse.json({ destinations });
    }

    const destinations = await getDestinations({
      categorySlug: category,
    });
    return NextResponse.json({ destinations });
  } catch (error) {
    console.error("GET /api/destinations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch destinations. Check DATABASE_URL configuration.", destinations: [] },
      { status: 500 }
    );
  }
}
