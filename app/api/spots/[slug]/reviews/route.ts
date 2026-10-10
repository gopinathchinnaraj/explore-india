// GET /api/spots/[slug]/reviews?sort=relevant|newest|highest|lowest&limit=
// Returns stored reviews for a spot (database only)

import { NextRequest, NextResponse } from "next/server";
import { getSpotBySlug } from "@/lib/services/spotService";
import { getPublicSpotReviews } from "@/lib/services/publicReadService";
import type { ReviewSortOrder } from "@/types/spot";

const VALID_SORTS: ReviewSortOrder[] = ["relevant", "newest", "highest", "lowest"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;
  const sortParam = searchParams.get("sort") || "relevant";
  const sort: ReviewSortOrder = VALID_SORTS.includes(sortParam as ReviewSortOrder)
    ? (sortParam as ReviewSortOrder)
    : "relevant";
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 15;

  try {
    const spot = await getSpotBySlug(slug);
    if (!spot) {
      return NextResponse.json({ error: "Spot not found", reviews: [] }, { status: 404 });
    }

    const result = await getPublicSpotReviews(spot.id, sort, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET /api/spots/${slug}/reviews error:`, error);
    return NextResponse.json({ error: "Failed to fetch reviews", reviews: [] }, { status: 500 });
  }
}
