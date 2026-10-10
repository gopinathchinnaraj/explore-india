// GET  /api/admin/sync?status=&scope=&page= — sync job history + data coverage summary
// POST /api/admin/sync — start a bulk sync job (or preview it with dryRun: true)
//   Body: { resources: SyncResource[], scope: "missing"|"stale"|"all", destinationId?, statuses?, dryRun? }
// Admin-only. Bulk jobs run after the response and report progress through GET.

import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth/api-guard";
import {
  isSyncResource,
  planBulkSync,
  estimateCredits,
  createBulkSyncJob,
  runBulkSync,
  getRunningBulkJob,
  failStaleJobs,
  type BulkScope,
  type BulkSyncOptions,
} from "@/lib/services/syncService";

export const maxDuration = 800;

const PUBLIC = { status: "APPROVED", isActive: true };

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const params = request.nextUrl.searchParams;
  const status = params.get("status") || undefined;
  const scope = params.get("scope") || undefined;
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const limit = 25;

  try {
    await failStaleJobs();

    const where: Prisma.ApiSyncJobWhereInput = {};
    if (status) where.status = status;
    if (scope) where.scopeType = scope;

    const [jobs, total, byStatus, running, coverage] = await Promise.all([
      prisma.apiSyncJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.apiSyncJob.count({ where }),
      prisma.apiSyncJob.groupBy({ by: ["status"], _count: { id: true }, where: scope ? { scopeType: scope } : {} }),
      getRunningBulkJob(),
      Promise.all([
        prisma.spot.count({ where: PUBLIC }),
        prisma.spot.count({ where: { ...PUBLIC, images: { none: {} } } }),
        prisma.spot.count({ where: { ...PUBLIC, reviews: { none: {} } } }),
        prisma.spot.count({ where: { ...PUBLIC, videos: { none: {} } } }),
        prisma.spot.count({ where: { ...PUBLIC, nearbyFrom: { none: {} } } }),
        prisma.spot.count({ where: { ...PUBLIC, lastDetailsSyncAt: null } }),
        prisma.spot.count({ where: { status: { in: ["DISCOVERED", "PENDING_REVIEW"] } } }),
      ]),
    ]);

    const iso = (d: Date | null) => d?.toISOString() || null;
    const serialize = (j: (typeof jobs)[number]) => ({
      ...j,
      startedAt: iso(j.startedAt),
      finishedAt: iso(j.finishedAt),
      createdAt: j.createdAt.toISOString(),
    });

    const [publicSpots, noPhotos, noReviews, noVideos, noNearby, noDetails, awaitingReview] = coverage;
    return NextResponse.json({
      jobs: jobs.map(serialize),
      running: running ? serialize(running) : null,
      statusCounts: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
      pagination: { page, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      coverage: { publicSpots, noPhotos, noReviews, noVideos, noNearby, noDetails, awaitingReview },
    });
  } catch (error) {
    console.error("GET /api/admin/sync error:", error);
    return NextResponse.json({ error: "Failed to load sync data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  try {
    const body = await request.json();
    const resources = (Array.isArray(body.resources) ? body.resources : []).filter(isSyncResource);
    const scope: BulkScope = ["missing", "stale", "all"].includes(body.scope) ? body.scope : "missing";
    if (resources.length === 0) {
      return NextResponse.json({ error: "Choose at least one resource to sync" }, { status: 400 });
    }

    const opts: BulkSyncOptions = {
      resources,
      scope,
      destinationId: body.destinationId ? Number(body.destinationId) : undefined,
      statuses: Array.isArray(body.statuses) ? body.statuses : undefined,
      limit: body.limit ? Math.min(500, Number(body.limit)) : undefined,
    };

    const plan = await planBulkSync(opts);
    const credits = estimateCredits(plan);

    if (body.dryRun) {
      return NextResponse.json({ spots: plan.length, estimatedCredits: credits });
    }

    if (plan.length === 0) {
      return NextResponse.json({ error: "Nothing to sync — everything selected is already up to date" }, { status: 400 });
    }

    await failStaleJobs();
    const running = await getRunningBulkJob();
    if (running) {
      return NextResponse.json({ error: `Bulk sync #${running.id} is already running`, jobId: running.id }, { status: 409 });
    }

    const label = `${scope === "missing" ? "Missing" : scope === "stale" ? "Stale (30d+)" : "All"} ${resources.join(", ")} · ${plan.length} spots`;
    const job = await createBulkSyncJob(opts, plan.length, label);
    after(() => runBulkSync(job.id, opts));

    return NextResponse.json({ jobId: job.id, spots: plan.length, estimatedCredits: credits }, { status: 202 });
  } catch (error) {
    console.error("POST /api/admin/sync error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start sync" }, { status: 500 });
  }
}
