// POST /api/admin/discovery/import
// Body: { searchId, keys: string[], destinationId?, approve?: boolean }
// Creates spots from selected search candidates. Approved spots are public immediately;
// their photos/reviews/videos are fetched in the background after the response.

import { NextRequest, NextResponse, after } from "next/server";
import { importCandidates } from "@/lib/services/discoveryService";
import { enrichMissingResources, refreshNearbyAround } from "@/lib/services/syncService";
import { requireAdminApi } from "@/lib/auth/api-guard";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  try {
    const body = (await request.json()) as {
      searchId?: number;
      keys?: string[];
      destinationId?: number | string | null;
      approve?: boolean;
    };
    if (!body.searchId || !Array.isArray(body.keys) || body.keys.length === 0) {
      return NextResponse.json({ error: "searchId and at least one candidate key are required" }, { status: 400 });
    }
    if (body.keys.length > 40) {
      return NextResponse.json({ error: "Import at most 40 places at a time" }, { status: 400 });
    }

    const status = body.approve ? "APPROVED" : "PENDING_REVIEW";
    const result = await importCandidates({
      searchId: Number(body.searchId),
      keys: body.keys,
      destinationId: body.destinationId ? Number(body.destinationId) : undefined,
      status,
    });

    if (body.approve && result.created.length > 0) {
      const ids = result.created.map((c) => c.id);
      after(async () => {
        for (const id of ids) {
          try {
            await enrichMissingResources(id);
            await refreshNearbyAround(id);
          } catch (err) {
            console.warn(`[Discovery import] Background enrichment failed for spot ${id}:`, err);
          }
        }
      });
    }

    return NextResponse.json({ ...result, status, enrichmentQueued: Boolean(body.approve) });
  } catch (error) {
    console.error("POST /api/admin/discovery/import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
