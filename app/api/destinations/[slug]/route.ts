// GET /api/destinations/[slug]
// Returns full destination details by slug

import { NextRequest, NextResponse } from "next/server";
import { getDestinationBySlug } from "@/lib/services/destinationService";

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

    return NextResponse.json({ destination });
  } catch (error) {
    console.error(`GET /api/destinations/${slug} error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch destination" },
      { status: 500 }
    );
  }
}
