// GET    /api/admin/sync/[id] — one job's current state (used for progress polling)
// DELETE /api/admin/sync/[id] — cancel a running bulk job (stops before the next spot)
// Admin-only

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/api-guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const jobId = parseInt((await params).id);
  if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const job = await prisma.apiSyncJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    job: {
      ...job,
      startedAt: job.startedAt?.toISOString() || null,
      finishedAt: job.finishedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;

  const jobId = parseInt((await params).id);
  if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const { count } = await prisma.apiSyncJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "CANCELLED", finishedAt: new Date(), error: "Cancelled by admin" },
  });
  if (count === 0) return NextResponse.json({ error: "Job is not running" }, { status: 409 });
  return NextResponse.json({ success: true });
}
