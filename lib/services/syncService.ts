// Sync service — the single entry point for refreshing spot data from external providers.
// Admin-triggered only. Public pages never reach this module.
//
//   syncSpotResources()  refresh chosen resources for one spot (details/photos/reviews/videos/nearby)
//   startBulkSync()      run a resumable, rate-limit-aware job over many spots in the background
//   ensureSpotCover()    make sure a spot has a working main photo
//
// Every provider call is recorded in ApiSyncJob by the underlying services, and each
// successful resource refresh stamps its own last*SyncAt column on the spot.

import { createHash } from "crypto";
import prisma from "@/lib/db/prisma";
import { SerpApiError } from "@/lib/serpapi/client";
import { fetchPlaceDetails } from "@/lib/serpapi/maps";
import { sizedImageUrl } from "@/lib/media/image";
import { syncSpotPhotos } from "./spotPhotoService";
import { syncSpotReviews } from "./spotReviewService";
import { syncSpotVideos } from "./spotVideoService";
import { computeNearbyForSpots } from "./spotService";

export const SYNC_RESOURCES = ["details", "photos", "reviews", "videos", "nearby"] as const;
export type SyncResource = (typeof SYNC_RESOURCES)[number];

export interface ResourceResult {
  success: boolean;
  skipped?: boolean;
  changed?: boolean;
  message?: string;
  error?: string;
}

const TIMESTAMP_FIELD: Record<SyncResource, string> = {
  details: "lastDetailsSyncAt",
  photos: "lastPhotosSyncAt",
  reviews: "lastReviewsSyncAt",
  videos: "lastVideosSyncAt",
  nearby: "lastNearbySyncAt",
};

/** Resources that cost SerpApi credits. Nearby is pure coordinate math. */
const PAID_RESOURCES: SyncResource[] = ["details", "photos", "reviews", "videos"];

export function isSyncResource(value: unknown): value is SyncResource {
  return typeof value === "string" && (SYNC_RESOURCES as readonly string[]).includes(value);
}

export function isRateLimitError(err: unknown): boolean {
  return err instanceof SerpApiError && (err.statusCode === 429 || /rate limit|run out of searches/i.test(err.message));
}

// ─── Concurrency guard ────────────────────────────────────────────────────────
// Prevents two refreshes of the same spot+resource running at once (e.g. a double click,
// or a bulk job overlapping a manual refresh). Process-local, which matches our single
// Next.js server deployment.

const runningLocks = new Set<string>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T | "LOCKED"> {
  if (runningLocks.has(key)) return "LOCKED";
  runningLocks.add(key);
  try {
    return await fn();
  } finally {
    runningLocks.delete(key);
  }
}

// ─── Main photo ───────────────────────────────────────────────────────────────

async function isImageReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

/**
 * Ensure the spot has a working cover photo. If the current cover is missing or broken,
 * promote the primary (or first) stored photo. Returns the cover URL in use.
 */
export async function ensureSpotCover(spotId: number, options: { verify?: boolean } = {}): Promise<string | null> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      coverImageUrl: true,
      images: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }], take: 5, select: { id: true, imageUrl: true, thumbnailUrl: true } },
    },
  });
  if (!spot) return null;

  const current = spot.coverImageUrl;
  const currentOk = current && !current.includes("/gps-proxy/") && (!options.verify || (await isImageReachable(current)));
  if (currentOk) return current;

  for (const img of spot.images) {
    const candidate = sizedImageUrl(img.imageUrl, 1200, 900) || img.imageUrl;
    if (!options.verify || (await isImageReachable(candidate))) {
      await prisma.$transaction([
        prisma.spotImage.updateMany({ where: { spotId }, data: { isPrimary: false } }),
        prisma.spotImage.update({ where: { id: img.id }, data: { isPrimary: true } }),
        prisma.spot.update({ where: { id: spotId }, data: { coverImageUrl: candidate } }),
      ]);
      return candidate;
    }
  }
  return current;
}

/** Admin action: use a specific stored photo as the spot's main photo. */
export async function setSpotCover(spotId: number, imageId: number): Promise<string> {
  const img = await prisma.spotImage.findFirst({ where: { id: imageId, spotId } });
  if (!img) throw new Error("Photo not found for this spot");
  const url = sizedImageUrl(img.imageUrl, 1200, 900) || img.imageUrl;
  await prisma.$transaction([
    prisma.spotImage.updateMany({ where: { spotId }, data: { isPrimary: false } }),
    prisma.spotImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
    prisma.spot.update({ where: { id: spotId }, data: { coverImageUrl: url } }),
  ]);
  return url;
}

// ─── Single-spot refresh ──────────────────────────────────────────────────────

async function refreshDetails(spotId: number): Promise<ResourceResult> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      name: true,
      latitude: true,
      longitude: true,
      rating: true,
      reviewCount: true,
      address: true,
      description: true,
      coverImageUrl: true,
      externalPlaces: { where: { provider: "google_maps" } },
    },
  });
  if (!spot) return { success: false, error: "Spot not found" };
  const ext = spot.externalPlaces[0];
  if (!ext?.externalPlaceId && !ext?.externalDataId) {
    return { success: false, error: "No Google Maps identifier stored for this spot" };
  }

  const job = await prisma.apiSyncJob.create({
    data: { engine: "google_maps", scopeType: "spot", scopeId: spotId, scopeName: spot.name, status: "RUNNING", startedAt: new Date() },
  });

  try {
    const place = await fetchPlaceDetails({
      placeId: ext.externalPlaceId,
      dataId: ext.externalDataId,
      latitude: spot.latitude,
      longitude: spot.longitude,
    });
    if (!place) throw new Error("Provider returned no place details");

    // Only fill fields the provider actually returned; never blank out admin edits
    const next = {
      rating: place.rating ?? spot.rating,
      reviewCount: place.reviewCount ?? spot.reviewCount,
      address: place.address ?? spot.address,
      description: spot.description || place.description || null,
      coverImageUrl: spot.coverImageUrl || sizedImageUrl(place.thumbnailUrl, 1200, 900),
    };
    const hash = (v: object) => createHash("sha1").update(JSON.stringify(v)).digest("hex");
    const before = {
      rating: spot.rating,
      reviewCount: spot.reviewCount,
      address: spot.address,
      description: spot.description,
      coverImageUrl: spot.coverImageUrl,
    };
    const changed = hash(before) !== hash(next);

    // Skip the write entirely when nothing changed — only stamp the successful check
    await prisma.spot.update({
      where: { id: spotId },
      data: { ...(changed ? next : {}), lastDetailsSyncAt: new Date(), lastSyncedAt: new Date() },
    });
    await prisma.externalPlace.update({ where: { id: ext.id }, data: { lastSyncedAt: new Date(), rawName: place.name } });
    await prisma.apiSyncJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", finishedAt: new Date(), itemsProcessed: 1, itemsUpdated: changed ? 1 : 0 },
    });
    return { success: true, changed, message: changed ? "Details updated" : "No changes" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.apiSyncJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: msg } });
    throw err;
  }
}

async function runResource(spotId: number, resource: SyncResource): Promise<ResourceResult> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      name: true,
      destination: { select: { name: true } },
      externalPlaces: { where: { provider: "google_maps" }, select: { externalDataId: true } },
    },
  });
  if (!spot) return { success: false, error: "Spot not found" };
  const dataId = spot.externalPlaces[0]?.externalDataId || undefined;

  switch (resource) {
    case "details":
      return refreshDetails(spotId);
    case "photos": {
      const photos = await syncSpotPhotos(spotId, dataId);
      await ensureSpotCover(spotId);
      await stamp(spotId, resource);
      return { success: true, message: `${photos.length} photos stored` };
    }
    case "reviews": {
      const reviews = await syncSpotReviews(spotId, dataId);
      await stamp(spotId, resource);
      return { success: true, message: `${reviews.length} reviews stored` };
    }
    case "videos": {
      await syncSpotVideos(spotId, spot.name, spot.destination.name);
      await stamp(spotId, resource);
      const count = await prisma.spotVideo.count({ where: { spotId } });
      return { success: true, message: `${count} videos stored` };
    }
    case "nearby": {
      const n = await computeNearbyForSpots([spotId]);
      return { success: true, message: `${n} nearby spots` };
    }
  }
}

async function stamp(spotId: number, resource: SyncResource) {
  const now = new Date();
  await prisma.spot.update({
    where: { id: spotId },
    data: { [TIMESTAMP_FIELD[resource]]: now, lastSyncedAt: now },
  });
}

/**
 * Refresh the requested resources for one spot. Each resource is isolated: one failing
 * provider never blocks the others. Rate-limit errors are re-thrown after recording, so
 * bulk jobs can stop instead of burning through retries.
 */
export async function syncSpotResources(
  spotId: number,
  resources: SyncResource[]
): Promise<Record<string, ResourceResult>> {
  const results: Record<string, ResourceResult> = {};
  let rateLimited: unknown = null;

  for (const resource of resources) {
    if (rateLimited && PAID_RESOURCES.includes(resource)) {
      results[resource] = { success: false, skipped: true, error: "Skipped: SerpApi rate limit reached" };
      continue;
    }
    try {
      const out = await withLock(`${spotId}:${resource}`, () => runResource(spotId, resource));
      results[resource] =
        out === "LOCKED" ? { success: false, skipped: true, error: "A refresh for this resource is already running" } : out;
    } catch (err) {
      if (isRateLimitError(err)) rateLimited = err;
      results[resource] = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return results;
}

/**
 * Background enrichment used after a spot is approved: fetch only what the spot is missing.
 */
export async function enrichMissingResources(spotId: number): Promise<Record<string, ResourceResult>> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      lastPhotosSyncAt: true,
      lastReviewsSyncAt: true,
      lastVideosSyncAt: true,
      _count: { select: { images: true, reviews: true, videos: true } },
    },
  });
  if (!spot) return {};
  const needed: SyncResource[] = [];
  if (spot._count.images === 0 && !spot.lastPhotosSyncAt) needed.push("photos");
  if (spot._count.reviews === 0 && !spot.lastReviewsSyncAt) needed.push("reviews");
  if (spot._count.videos === 0 && !spot.lastVideosSyncAt) needed.push("videos");
  needed.push("nearby");
  const results = await syncSpotResources(spotId, needed);
  await ensureSpotCover(spotId);
  return results;
}

/**
 * After a spot becomes public, refresh its own nearby list and those of spots around it
 * so it immediately shows up as "nearby" elsewhere.
 */
export async function refreshNearbyAround(spotId: number): Promise<void> {
  const spot = await prisma.spot.findUnique({ where: { id: spotId }, select: { latitude: true, longitude: true } });
  if (!spot) return;
  const d = 0.3; // ~30 km
  const neighbours = await prisma.spot.findMany({
    where: {
      isActive: true,
      status: "APPROVED",
      latitude: { gte: spot.latitude - d, lte: spot.latitude + d },
      longitude: { gte: spot.longitude - d, lte: spot.longitude + d },
    },
    select: { id: true },
  });
  await computeNearbyForSpots([spotId, ...neighbours.map((n) => n.id).filter((id) => id !== spotId)]);
}

// ─── Bulk sync jobs ───────────────────────────────────────────────────────────

export type BulkScope = "missing" | "all" | "stale";

export interface BulkSyncOptions {
  resources: SyncResource[];
  scope: BulkScope;
  destinationId?: number;
  /** Which spot statuses to include; defaults to APPROVED (public) spots only */
  statuses?: string[];
  limit?: number;
}

const STALE_DAYS = 30;
const PAUSE_BETWEEN_SPOTS_MS = 1200;

/** Spots (and their resources) a bulk job should process, given the scope. */
export async function planBulkSync(opts: BulkSyncOptions): Promise<Array<{ id: number; resources: SyncResource[] }>> {
  const spots = await prisma.spot.findMany({
    where: {
      status: { in: opts.statuses?.length ? opts.statuses : ["APPROVED"] },
      ...(opts.destinationId ? { destinationId: opts.destinationId } : {}),
    },
    select: {
      id: true,
      lastDetailsSyncAt: true,
      lastPhotosSyncAt: true,
      lastReviewsSyncAt: true,
      lastVideosSyncAt: true,
      lastNearbySyncAt: true,
      _count: { select: { images: true, reviews: true, videos: true, nearbyFrom: true } },
    },
    orderBy: [{ discoveryScore: { sort: "desc", nulls: "last" } }, { id: "asc" }],
  });

  const staleBefore = Date.now() - STALE_DAYS * 86400000;
  const isStale = (d: Date | null) => !d || d.getTime() < staleBefore;

  const plan = spots
    .map((s) => {
      const res = opts.resources.filter((r) => {
        if (opts.scope === "all") return true;
        const last = (s as unknown as Record<string, Date | null>)[TIMESTAMP_FIELD[r]];
        if (opts.scope === "stale") return isStale(last);
        // "missing": never synced and nothing stored
        switch (r) {
          case "details":
            return !s.lastDetailsSyncAt;
          case "photos":
            return s._count.images === 0;
          case "reviews":
            return s._count.reviews === 0 && !s.lastReviewsSyncAt;
          case "videos":
            return s._count.videos === 0 && !s.lastVideosSyncAt;
          case "nearby":
            return s._count.nearbyFrom === 0 || !s.lastNearbySyncAt;
        }
      });
      return { id: s.id, resources: res };
    })
    .filter((p) => p.resources.length > 0);

  return opts.limit ? plan.slice(0, opts.limit) : plan;
}

/** Estimated SerpApi calls for a plan (videos run several YouTube queries). */
export function estimateCredits(plan: Array<{ resources: SyncResource[] }>): number {
  const cost: Record<SyncResource, number> = { details: 1, photos: 1, reviews: 1, videos: 3, nearby: 0 };
  return plan.reduce((sum, p) => sum + p.resources.reduce((s, r) => s + cost[r], 0), 0);
}

export async function getRunningBulkJob() {
  return prisma.apiSyncJob.findFirst({ where: { scopeType: "bulk", status: { in: ["PENDING", "RUNNING"] } } });
}

/**
 * Create the job record. The caller runs `runBulkSync(job.id, opts)` after the response
 * (via next/server `after`) so the browser is never kept waiting.
 */
export async function createBulkSyncJob(opts: BulkSyncOptions, total: number, label: string) {
  return prisma.apiSyncJob.create({
    data: {
      engine: "bulk:" + opts.resources.join("+"),
      scopeType: "bulk",
      scopeId: opts.destinationId ?? null,
      scopeName: label,
      status: "PENDING",
      itemsProcessed: 0,
      // itemsCreated holds the planned total so the UI can show progress
      itemsCreated: total,
    },
  });
}

export async function runBulkSync(jobId: number, opts: BulkSyncOptions): Promise<void> {
  const plan = await planBulkSync(opts);
  await prisma.apiSyncJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), itemsCreated: plan.length },
  });

  const errors: string[] = [];
  let processed = 0;
  let updated = 0;

  try {
    for (const item of plan) {
      // Allow the admin to cancel a running job from the dashboard
      const current = await prisma.apiSyncJob.findUnique({ where: { id: jobId }, select: { status: true } });
      if (current?.status === "CANCELLED") return;

      const results = await syncSpotResources(item.id, item.resources);
      processed++;
      if (Object.values(results).some((r) => r.success)) updated++;
      for (const [res, r] of Object.entries(results)) {
        if (!r.success && !r.skipped) errors.push(`#${item.id} ${res}: ${r.error}`);
      }

      await prisma.apiSyncJob.update({
        where: { id: jobId },
        data: { itemsProcessed: processed, itemsUpdated: updated, error: errors.length ? errors.slice(-5).join("\n") : null },
      });

      const rateLimited = Object.values(results).some((r) => r.error && /rate limit/i.test(r.error));
      if (rateLimited) {
        await prisma.apiSyncJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error: `Stopped after ${processed}/${plan.length} spots: SerpApi rate limit reached. Run "missing data" again later to resume.`,
          },
        });
        return;
      }

      const usedPaid = item.resources.some((r) => PAID_RESOURCES.includes(r));
      if (usedPaid) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_SPOTS_MS));
    }

    await prisma.apiSyncJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", finishedAt: new Date(), itemsProcessed: processed, itemsUpdated: updated },
    });
  } catch (err) {
    await prisma.apiSyncJob.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** Mark jobs left RUNNING by a crashed/restarted server as failed, so the UI never shows ghosts. */
export async function failStaleJobs(): Promise<void> {
  const data = { status: "FAILED", finishedAt: new Date(), error: "Interrupted (server restarted or timed out)" };
  const singleCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const bulkCutoff = new Date(Date.now() - 6 * 3600 * 1000);
  await prisma.apiSyncJob.updateMany({
    where: { scopeType: { not: "bulk" }, status: { in: ["RUNNING", "PENDING"] }, createdAt: { lt: singleCutoff } },
    data,
  });
  await prisma.apiSyncJob.updateMany({
    where: { scopeType: "bulk", status: { in: ["RUNNING", "PENDING"] }, createdAt: { lt: bulkCutoff } },
    data,
  });
}
