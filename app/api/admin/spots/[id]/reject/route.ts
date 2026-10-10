// POST /api/admin/spots/[id]/reject — mark a spot REJECTED
// Admin-only

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { setSpotStatus } from "@/lib/services/spotStatusService";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const { id } = await params;
  const spotId = parseInt(id);
  if (isNaN(spotId)) {
    return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });
  }

  try {
    const result = await setSpotStatus([spotId], "REJECTED");
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(`POST /api/admin/spots/${id}/reject error:`, error);
    return NextResponse.json({ error: "Failed to update spot" }, { status: 500 });
  }
}
