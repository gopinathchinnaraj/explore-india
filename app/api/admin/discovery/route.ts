// /api/admin/discovery — admin-only content acquisition
//
// POST { query, destinationId?, fresh? }
//   Free-text Google Maps search via SerpApi (cached 7 days per query). Returns candidates
//   marked as new or already in the database. Writes nothing to the spots table.
//
// GET ?status=&q=&destinationId=
//   The review queue: spots awaiting a decision (DISCOVERED / PENDING_REVIEW by default).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { searchCandidates } from "@/lib/services/discoveryService";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { isRateLimitError } from "@/lib/services/syncService";

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  try {
    const body = (await request.json()) as { query?: string; destinationId?: number | string; fresh?: boolean };
    const query = (body.query || "").trim();
    if (query.length < 2) {
      return NextResponse.json({ error: "Enter at least 2 characters to search" }, { status: 400 });
    }
    const destinationId = body.destinationId ? Number(body.destinationId) : undefined;

    const result = await searchCandidates(query, { destinationId, fresh: Boolean(body.fresh) });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/discovery error:", error);
    const status = isRateLimitError(error) ? 429 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discovery search failed" },
      { status }
    );
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const params = request.nextUrl.searchParams;
  const destinationId = params.get("destinationId");
  const q = params.get("q")?.trim();
  const statusParam = params.get("status");
  const statuses = statusParam ? statusParam.split(",") : ["DISCOVERED", "PENDING_REVIEW"];

  try {
    const candidates = await prisma.spot.findMany({
      where: {
        status: { in: statuses },
        ...(destinationId ? { destinationId: parseInt(destinationId) } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { address: { contains: q, mode: "insensitive" as const } },
                { destination: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        destination: { select: { id: true, name: true } },
        categories: { select: { category: { select: { id: true, name: true, icon: true } } } },
        images: { select: { thumbnailUrl: true, imageUrl: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }], take: 1 },
        externalPlaces: { select: { provider: true, externalPlaceId: true }, take: 1 },
        _count: { select: { images: true, reviews: true, videos: true } },
      },
      orderBy: [{ createdAt: "desc" }, { discoveryScore: { sort: "desc", nulls: "last" } }],
      take: 200,
    });

    return NextResponse.json({
      candidates: candidates.map(({ images, ...s }) => ({
        ...s,
        coverImageUrl: s.coverImageUrl || images[0]?.thumbnailUrl || images[0]?.imageUrl || null,
        categories: s.categories.map((c) => c.category),
        lastSyncedAt: s.lastSyncedAt?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/discovery error:", error);
    return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }
}
