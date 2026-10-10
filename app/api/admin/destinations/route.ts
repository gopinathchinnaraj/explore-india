// GET /api/admin/destinations?q= — destinations for admin pickers and filters
// Admin-only
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/api-guard";

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const q = request.nextUrl.searchParams.get("q")?.trim();

  try {
    const [destinations, approvedCounts] = await Promise.all([
      prisma.destination.findMany({
        where: q ? { name: { contains: q, mode: "insensitive" } } : {},
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          rating: true,
          reviewCount: true,
          latitude: true,
          longitude: true,
          _count: { select: { spots: true } },
        },
      }),
      prisma.spot.groupBy({ by: ["destinationId"], where: { status: "APPROVED", isActive: true }, _count: { id: true } }),
    ]);

    const approved = new Map(approvedCounts.map((r) => [r.destinationId, r._count.id]));
    return NextResponse.json({
      destinations: destinations.map((d) => ({ ...d, approvedSpots: approved.get(d.id) || 0 })),
    });
  } catch (error) {
    console.error("GET /api/admin/destinations error:", error);
    return NextResponse.json({ error: "Failed to fetch destinations" }, { status: 500 });
  }
}
