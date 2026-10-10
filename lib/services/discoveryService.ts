// Discovery service
// Admin-only content acquisition. Two explicit steps so SerpApi credits are spent deliberately
// and nothing reaches the public site without an admin decision:
//
//   1. searchCandidates(query)   one Google Maps search (cached 7 days) → normalized, deduplicated
//                                candidates, each marked "new" or "already in your database"
//   2. importCandidates(keys)    selected candidates → AI categories → Spot + ExternalPlace rows
//                                with status PENDING_REVIEW (review queue) or APPROVED (public now)
//
// Photos, reviews and videos are fetched later, in the background, only for approved spots
// (see syncService.enrichMissingResources). This keeps a discovery run to a single API call.

import { createHash } from "crypto";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  searchGoogleMapsRaw,
  normalizeLocalResult,
  type MapsLocalResponse,
  type MapsLocalResult,
  type NormalizedPlace,
} from "@/lib/serpapi/maps";
import { classifySpot } from "@/lib/ai/classifier";
import { sizedImageUrl } from "@/lib/media/image";

const SEARCH_CACHE_DAYS = 7;

// Google Maps place types that are rarely tourist attractions. Flagged, never auto-hidden.
const NON_ATTRACTION_TYPES =
  /supermarket|grocery|department store|shopping mall|\bmall\b|store$|\bshop\b|bank|atm|hospital|clinic|school|college|office|company|corporate|real estate|car rental|petrol|gas station|pharmacy|hotel|lodge|guest house|homestay|resort|restaurant|cafe|bakery|sweet shop|travel agency|tour agency|tour operator/i;

export interface DiscoveryCandidate {
  key: string;
  name: string;
  placeId: string | null;
  dataId: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  thumbnailUrl: string | null;
  type: string | null;
  types: string[];
  description: string | null;
  score: number;
  flags: string[];
  likelyAttraction: boolean;
  existing: { id: number; name: string; status: string } | null;
  nearestDestination: { id: number; name: string; distanceKm: number } | null;
}

export interface DiscoverySearchResult {
  searchId: number;
  query: string;
  fromCache: boolean;
  fetchedAt: string;
  candidates: DiscoveryCandidate[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(shri|sri|shree|the|temple|beach|falls|waterfalls?|fort)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function candidateKey(p: NormalizedPlace): string {
  if (p.placeId) return `pid:${p.placeId}`;
  if (p.dataId) return `did:${p.dataId}`;
  return `geo:${p.latitude?.toFixed(5)},${p.longitude?.toFixed(5)}`;
}

/**
 * Internal 0–100 ranking signal from provider data only. Not an external rating.
 */
export function computeDiscoveryScore(place: NormalizedPlace): number {
  let score = 0;
  if (place.rating !== null) score += Math.min(35, Math.round(((place.rating - 1) / 4) * 35));
  if (place.reviewCount !== null) {
    if (place.reviewCount >= 10000) score += 25;
    else if (place.reviewCount >= 1000) score += 20;
    else if (place.reviewCount >= 100) score += 12;
    else if (place.reviewCount >= 10) score += 5;
  }
  if (place.thumbnailUrl) score += 10;
  if (place.reviewsLink) score += 10;
  if (place.latitude && place.longitude) score += 10;
  if (place.description) score += 5;
  if (place.type || place.types.length > 0) score += 5;
  return Math.min(100, score);
}

async function uniqueSlug(name: string, destinationSlug: string): Promise<string> {
  const base = `${destinationSlug}-${name}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  let slug = base || `spot-${Date.now()}`;
  let n = 2;
  while (await prisma.spot.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

async function loadDestinations() {
  return prisma.destination.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, latitude: true, longitude: true },
  });
}

type DestinationPoint = Awaited<ReturnType<typeof loadDestinations>>[number];

function nearestDestination(lat: number, lng: number, destinations: DestinationPoint[]) {
  let best: { d: DestinationPoint; km: number } | null = null;
  for (const d of destinations) {
    const km = haversineKm(lat, lng, d.latitude, d.longitude);
    if (!best || km < best.km) best = { d, km };
  }
  return best;
}

/**
 * Find spots already in the database (any status) that match these places,
 * first by stable provider id, then by name + proximity.
 */
async function matchExisting(places: NormalizedPlace[]) {
  const placeIds = places.map((p) => p.placeId).filter((x): x is string => Boolean(x));
  const dataIds = places.map((p) => p.dataId).filter((x): x is string => Boolean(x));

  const externals = await prisma.externalPlace.findMany({
    where: {
      provider: "google_maps",
      spotId: { not: null },
      OR: [{ externalPlaceId: { in: placeIds } }, { externalDataId: { in: dataIds } }],
    },
    select: { externalPlaceId: true, externalDataId: true, spot: { select: { id: true, name: true, status: true } } },
  });

  const byPid = new Map<string, { id: number; name: string; status: string }>();
  const byDid = new Map<string, { id: number; name: string; status: string }>();
  for (const e of externals) {
    if (!e.spot) continue;
    if (e.externalPlaceId) byPid.set(e.externalPlaceId, e.spot);
    if (e.externalDataId) byDid.set(e.externalDataId, e.spot);
  }

  // Name + proximity fallback for spots created manually or without provider ids
  const lats = places.map((p) => p.latitude).filter((x): x is number => x !== null);
  const lngs = places.map((p) => p.longitude).filter((x): x is number => x !== null);
  const nearbySpots = lats.length
    ? await prisma.spot.findMany({
        where: {
          latitude: { gte: Math.min(...lats) - 0.01, lte: Math.max(...lats) + 0.01 },
          longitude: { gte: Math.min(...lngs) - 0.01, lte: Math.max(...lngs) + 0.01 },
        },
        select: { id: true, name: true, status: true, latitude: true, longitude: true },
      })
    : [];

  return (p: NormalizedPlace) => {
    if (p.placeId && byPid.has(p.placeId)) return byPid.get(p.placeId)!;
    if (p.dataId && byDid.has(p.dataId)) return byDid.get(p.dataId)!;
    if (p.latitude === null || p.longitude === null) return null;
    const n = normalizeName(p.name);
    const hit = nearbySpots.find((s) => {
      if (haversineKm(p.latitude!, p.longitude!, s.latitude, s.longitude) > 0.25) return false;
      const m = normalizeName(s.name);
      return n.length > 2 && m.length > 2 && (n.includes(m) || m.includes(n));
    });
    return hit ? { id: hit.id, name: hit.name, status: hit.status } : null;
  };
}

function dedupe(places: NormalizedPlace[]): NormalizedPlace[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const k = candidateKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Step 1: search ───────────────────────────────────────────────────────────

/**
 * Run (or reuse) one Google Maps search and return reviewable candidates.
 * Nothing is written to the spots table here.
 */
export async function searchCandidates(
  rawQuery: string,
  options: { destinationId?: number; fresh?: boolean } = {}
): Promise<DiscoverySearchResult> {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  if (query.length < 2) throw new Error("Enter at least 2 characters to search");

  let ll: string | undefined;
  if (options.destinationId) {
    const d = await prisma.destination.findUnique({
      where: { id: options.destinationId },
      select: { latitude: true, longitude: true },
    });
    if (d) ll = `@${d.latitude},${d.longitude},12z`;
  }

  const requestHash = createHash("sha1")
    .update(`google_maps|search|${query.toLowerCase()}|${ll ?? ""}`)
    .digest("hex");

  let cache = await prisma.apiRawData.findUnique({ where: { requestHash } });
  let fromCache = Boolean(cache && cache.expiresAt > new Date() && !options.fresh);

  if (!fromCache) {
    const job = await prisma.apiSyncJob.create({
      data: { engine: "google_maps", scopeType: "discovery", scopeName: query, status: "RUNNING", startedAt: new Date() },
    });
    try {
      const response = await searchGoogleMapsRaw(query, { ll });
      const expiresAt = new Date(Date.now() + SEARCH_CACHE_DAYS * 86400000);
      cache = await prisma.apiRawData.upsert({
        where: { requestHash },
        create: {
          provider: "serpapi",
          engine: "google_maps",
          requestHash,
          externalId: query,
          responseJson: response as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
        update: { responseJson: response as unknown as Prisma.InputJsonValue, fetchedAt: new Date(), expiresAt },
      });
      await prisma.apiSyncJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          itemsProcessed: response.local_results?.length ?? 0,
        },
      });
    } catch (err) {
      await prisma.apiSyncJob.update({
        where: { id: job.id },
        data: { status: "FAILED", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
    fromCache = false;
  }

  const candidates = await buildCandidates(cache!.responseJson as unknown as MapsLocalResponse);
  return {
    searchId: cache!.id,
    query,
    fromCache,
    fetchedAt: cache!.fetchedAt.toISOString(),
    candidates,
  };
}

async function buildCandidates(response: MapsLocalResponse): Promise<DiscoveryCandidate[]> {
  // A query for one specific place returns place_results instead of a list
  const r = response as MapsLocalResponse & { place_results?: MapsLocalResult };
  const raw = r.local_results?.length ? r.local_results : r.place_results ? [r.place_results] : [];

  const places = dedupe(raw.map(normalizeLocalResult)).filter((p) => p.latitude !== null && p.longitude !== null);
  const [findExisting, destinations] = await Promise.all([matchExisting(places), loadDestinations()]);

  return places
    .map((p): DiscoveryCandidate => {
      const flags: string[] = [];
      const typeText = [p.type, ...p.types].filter(Boolean).join(", ");
      if (typeText && NON_ATTRACTION_TYPES.test(typeText)) flags.push(`Type looks like a business: ${p.type || p.types[0]}`);
      if (p.reviewCount !== null && p.reviewCount < 20) flags.push("Very few reviews");
      if (!p.thumbnailUrl) flags.push("No photo");
      const near = nearestDestination(p.latitude!, p.longitude!, destinations);
      return {
        key: candidateKey(p),
        name: p.name,
        placeId: p.placeId,
        dataId: p.dataId,
        latitude: p.latitude!,
        longitude: p.longitude!,
        address: p.address,
        rating: p.rating,
        reviewCount: p.reviewCount,
        thumbnailUrl: sizedImageUrl(p.thumbnailUrl, 480, 360),
        type: p.type,
        types: p.types,
        description: p.description,
        score: computeDiscoveryScore(p),
        flags,
        likelyAttraction: !flags.some((f) => f.startsWith("Type looks like")),
        existing: findExisting(p),
        nearestDestination: near ? { id: near.d.id, name: near.d.name, distanceKm: Math.round(near.km * 10) / 10 } : null,
      };
    })
    .sort((a, b) => Number(Boolean(a.existing)) - Number(Boolean(b.existing)) || b.score - a.score);
}

// ─── Step 2: import ───────────────────────────────────────────────────────────

export interface ImportOptions {
  searchId: number;
  keys: string[];
  /** Assign all to this destination; otherwise each goes to its nearest destination */
  destinationId?: number;
  status: "APPROVED" | "PENDING_REVIEW";
}

export interface ImportResult {
  created: Array<{ id: number; name: string; status: string; destination: string }>;
  skipped: Array<{ name: string; reason: string; spotId?: number }>;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function importCandidates(opts: ImportOptions): Promise<ImportResult> {
  const cache = await prisma.apiRawData.findUnique({ where: { id: opts.searchId } });
  if (!cache) throw new Error("Search results expired — run the search again");

  const all = await buildCandidates(cache.responseJson as unknown as MapsLocalResponse);
  const wanted = new Set(opts.keys);
  const selected = all.filter((c) => wanted.has(c.key));

  const [categories, destinations] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
    loadDestinations(),
  ]);
  const fixedDestination = opts.destinationId ? destinations.find((d) => d.id === opts.destinationId) : undefined;
  if (opts.destinationId && !fixedDestination) throw new Error("Destination not found");

  const result: ImportResult = { created: [], skipped: [] };

  // AI classification in parallel (bounded) — categories + clean name only, never facts
  const classified = await mapWithConcurrency(selected, 4, async (c) => {
    if (c.existing) return { c, ai: null };
    try {
      const ai = await classifySpot({
        name: c.name,
        type: c.type,
        types: c.types,
        description: c.description,
        address: c.address,
        rating: c.rating,
        reviewCount: c.reviewCount,
        destinationHint: fixedDestination?.name || c.nearestDestination?.name || "India",
      });
      return { c, ai };
    } catch {
      return { c, ai: null };
    }
  });

  for (const { c, ai } of classified) {
    if (c.existing) {
      result.skipped.push({ name: c.name, reason: `Already in database (${c.existing.status})`, spotId: c.existing.id });
      continue;
    }

    const dest = fixedDestination ?? nearestDestination(c.latitude, c.longitude, destinations)?.d;
    if (!dest) {
      result.skipped.push({ name: c.name, reason: "No destination available — create one first" });
      continue;
    }

    const name = ai && ai.confidence >= 0.8 && ai.normalized_name ? ai.normalized_name : c.name;
    const categoryIds = (ai?.categories || [])
      .map((n) => categories.find((cat) => cat.name.toLowerCase() === n.toLowerCase() || cat.slug === n.toLowerCase().replace(/\s+/g, "-")))
      .filter((x): x is { id: number; name: string; slug: string } => Boolean(x))
      .map((x) => x.id);

    try {
      const slug = await uniqueSlug(name, dest.slug);
      const approved = opts.status === "APPROVED";
      const spot = await prisma.$transaction(async (tx) => {
        const created = await tx.spot.create({
          data: {
            destinationId: dest.id,
            name,
            slug,
            description: c.description,
            latitude: c.latitude,
            longitude: c.longitude,
            address: c.address,
            rating: c.rating,
            reviewCount: c.reviewCount,
            coverImageUrl: sizedImageUrl(c.thumbnailUrl, 1200, 900),
            discoverySource: "GOOGLE_MAPS",
            discoveryScore: c.score,
            status: opts.status,
            isActive: approved,
            isVerified: approved,
            lastSyncedAt: new Date(),
            lastDetailsSyncAt: new Date(),
            categories: categoryIds.length ? { create: categoryIds.map((categoryId) => ({ categoryId })) } : undefined,
          },
          select: { id: true, name: true, status: true },
        });
        await tx.externalPlace.create({
          data: {
            spotId: created.id,
            provider: "google_maps",
            externalPlaceId: c.placeId,
            externalDataId: c.dataId,
            rawName: c.name,
            lastSyncedAt: new Date(),
          },
        });
        return created;
      });
      result.created.push({ ...spot, destination: dest.name });
    } catch (err) {
      result.skipped.push({ name: c.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

// ─── Legacy entry point: discovery for a whole destination ───────────────────

export interface DiscoveryResult {
  destinationId: number;
  destinationName: string;
  jobId?: number;
  spotsDiscovered: number;
  spotsCreated: number;
  spotsUpdated: number;
  errors: string[];
}

/**
 * Run a few standard queries around a destination and queue every likely attraction
 * that is not yet in the database for admin review. No enrichment calls are made.
 */
export async function discoverSpotsForDestination(
  destinationId: number,
  destinationName: string
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    destinationId,
    destinationName,
    spotsDiscovered: 0,
    spotsCreated: 0,
    spotsUpdated: 0,
    errors: [],
  };
  const queries = [
    `tourist attractions in ${destinationName}`,
    `historical places in ${destinationName}`,
    `nature places near ${destinationName}`,
  ];

  for (const q of queries) {
    try {
      const search = await searchCandidates(q, { destinationId });
      result.jobId = search.searchId;
      const fresh = search.candidates.filter((c) => !c.existing && c.likelyAttraction);
      result.spotsDiscovered += search.candidates.length;
      result.spotsUpdated += search.candidates.length - fresh.length;
      if (fresh.length === 0) continue;
      const imported = await importCandidates({
        searchId: search.searchId,
        keys: fresh.map((c) => c.key),
        destinationId,
        status: "PENDING_REVIEW",
      });
      result.spotsCreated += imported.created.length;
      result.errors.push(...imported.skipped.filter((s) => !s.spotId).map((s) => `${s.name}: ${s.reason}`));
    } catch (err) {
      result.errors.push(`Query "${q}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
