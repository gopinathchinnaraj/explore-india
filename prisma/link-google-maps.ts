// Link approved spots that have no Google Maps record (e.g. curated Wikipedia places) to
// their Google Maps listing, so reviews and details can be synced for them.
//
// For each unlinked spot it runs ONE SerpApi Google Maps search (1 credit) for the spot's
// name biased to its coordinates, and accepts a result only if it is within MAX_KM and
// the names match. It stores the place_id / data_id, and fills rating + review count only
// when the spot has none. Curated names, descriptions and photos are never changed.
//
// Run:   npm run link:google -- --limit 3     (try a few first)
//        npm run link:google                  (all unlinked spots)
// Stops on SerpApi rate limits; re-running continues with the spots still unlinked.

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { searchGoogleMapsRaw, normalizeLocalResult, type MapsLocalResult, type NormalizedPlace } from "../lib/serpapi/maps";
import { SerpApiError } from "../lib/serpapi/client";

const prisma = new PrismaClient();
const MAX_KM = 3;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const GENERIC = new Set(["the", "of", "at", "and", "in", "near", "sri", "shri", "india"]);
function tokens(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !GENERIC.has(t));
}
/** Share of words matching in either direction (prefix match tolerates spelling variants) */
function nameScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const same = (x: string, y: string) => x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5));
  const ab = ta.filter((t) => tb.some((u) => same(t, u))).length / ta.length;
  const ba = tb.filter((t) => ta.some((u) => same(t, u))).length / tb.length;
  return Math.max(ab, ba);
}

async function main() {
  const spots = await prisma.spot.findMany({
    where: {
      status: "APPROVED",
      isActive: true,
      externalPlaces: { none: { provider: "google_maps", externalDataId: { not: null } } },
    },
    select: { id: true, name: true, latitude: true, longitude: true, rating: true, reviewCount: true, destination: { select: { name: true } } },
    orderBy: [{ discoveryScore: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take: LIMIT,
  });
  console.log(`${spots.length} unlinked spots${LIMIT ? ` (limit ${LIMIT})` : ""} · about ${spots.length} SerpApi credits\n`);

  let linked = 0;
  let unmatched = 0;
  for (const spot of spots) {
    const here = { lat: spot.latitude, lng: spot.longitude };
    let candidates: NormalizedPlace[];
    try {
      const res = (await searchGoogleMapsRaw(spot.name, { ll: `@${spot.latitude},${spot.longitude},14z` })) as {
        local_results?: MapsLocalResult[];
        place_results?: MapsLocalResult;
      };
      candidates = [...(res.place_results ? [res.place_results] : []), ...(res.local_results ?? [])].map(normalizeLocalResult);
    } catch (err) {
      if (err instanceof SerpApiError && /rate limit/i.test(err.message)) {
        console.log(`\nStopped: SerpApi rate limit reached after ${linked + unmatched} spots. Run again later to continue.`);
        break;
      }
      console.log(`${spot.name.padEnd(42).slice(0, 42)} ✗ error: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const best = candidates
      .filter((c) => c.dataId && c.latitude != null && c.longitude != null)
      .map((c) => ({ c, km: haversineKm(here, { lat: c.latitude!, lng: c.longitude! }), score: nameScore(spot.name, c.name) }))
      .filter((x) => x.km <= MAX_KM && (x.score >= 0.5 || x.km <= 0.3))
      .sort((a, b) => b.score - a.score || a.km - b.km)[0];

    if (!best) {
      unmatched++;
      console.log(`${spot.name.padEnd(42).slice(0, 42)} — no confident match (${candidates.length} results)`);
      continue;
    }

    const { c } = best;
    await prisma.externalPlace.create({
      data: {
        spotId: spot.id,
        provider: "google_maps",
        externalPlaceId: c.placeId,
        externalDataId: c.dataId,
        externalCid: c.dataCid,
        externalUrl: c.reviewsLink || c.photosLink || undefined,
        rawName: c.name,
        lastSyncedAt: new Date(),
      },
    });
    const fill: { rating?: number; reviewCount?: number } = {};
    if (spot.rating == null && c.rating != null) fill.rating = c.rating;
    if (spot.reviewCount == null && c.reviewCount != null) fill.reviewCount = c.reviewCount;
    if (Object.keys(fill).length) await prisma.spot.update({ where: { id: spot.id }, data: fill });

    linked++;
    console.log(
      `${spot.name.padEnd(42).slice(0, 42)} → ${c.name} (${best.km.toFixed(2)} km, name ${Math.round(best.score * 100)}%${c.rating ? `, ★${c.rating} · ${c.reviewCount}` : ""})`
    );
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`\nLinked ${linked}; no confident match for ${unmatched}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
