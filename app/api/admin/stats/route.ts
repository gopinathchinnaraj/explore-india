// GET /api/admin/stats
// Dashboard aggregates: content counts, review queue, coverage gaps, recent and failed sync jobs
// Admin-only — never call from user-facing code

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { failStaleJobs } from "@/lib/services/syncService";

const PUBLIC = { status: "APPROVED", isActive: true };

export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  try {
    await failStaleJobs();
    const dayAgo = new Date(Date.now() - 86400000);

    const [
      destinationCount,
      spotTotal,
      spotByStatus,
      reviewCount,
      videoCount,
      photoCount,
      recentJobs,
      failedJobs24h,
      jobs24h,
      noPhotos,
      lastSuccess,
      recentSpots,
    ] = await Promise.all([
      prisma.destination.count({ where: { isActive: true } }),
      prisma.spot.count(),
      prisma.spot.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.spotReview.count(),
      prisma.spotVideo.count(),
      prisma.spotImage.count(),
      prisma.apiSyncJob.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.apiSyncJob.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } }),
      prisma.apiSyncJob.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.spot.count({ where: { ...PUBLIC, images: { none: {} } } }),
      prisma.apiSyncJob.groupBy({ by: ["engine"], where: { status: "COMPLETED" }, _max: { finishedAt: true } }),
      prisma.spot.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, name: true, status: true, coverImageUrl: true, createdAt: true, destination: { select: { name: true } } },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of spotByStatus) statusMap[row.status] = row._count.id;

    return NextResponse.json({
      destinations: destinationCount,
      spots: {
        total: spotTotal,
        approved: statusMap["APPROVED"] || 0,
        pending: statusMap["PENDING_REVIEW"] || 0,
        discovered: statusMap["DISCOVERED"] || 0,
        rejected: statusMap["REJECTED"] || 0,
        archived: statusMap["ARCHIVED"] || 0,
        publicWithoutPhotos: noPhotos,
      },
      reviews: reviewCount,
      videos: videoCount,
      photos: photoCount,
      jobs24h,
      failedJobs24h,
      lastSuccessfulSync: Object.fromEntries(lastSuccess.map((r) => [r.engine, r._max.finishedAt?.toISOString() || null])),
      recentSpots: recentSpots.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
      recentJobs: recentJobs.map((j) => ({
        ...j,
        startedAt: j.startedAt?.toISOString() || null,
        finishedAt: j.finishedAt?.toISOString() || null,
        createdAt: j.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
