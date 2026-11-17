// Keep every place at up to 3 working photos, using free Wikipedia / Wikimedia Commons
// images where the stored ones are dead.
//
// Google photo links stored from SerpApi are temporary and start returning 403 after a
// while. This:
//   1. checks every stored image link and treats 4xx responses as dead,
//   2. for spots with no working image, matches the spot to a Wikipedia article (near
//      its coordinates, with a similar name) and stores up to 3 photos from it,
//   3. removes dead image rows and trims every spot to MAX_PHOTOS (cover kept first).
// Wikimedia links are permanent and need no API key.
//
// Run:   npm run backfill:photos -- --dry-run   (show what would change)
//        npm run backfill:photos                 (apply)
// Removed rows are backed up to prisma/data/.photo-backup-<timestamp>.json first.

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_PHOTOS = 3;
const USER_AGENT = "ExploreIndia/1.0 (photo backfill; contact via project repo)";
const WIKIMEDIA_WIDTHS = [60, 120, 250, 330, 500, 960, 1280, 1920];
const MAX_KM = 15;

interface WikiSummary {
  title: string;
  type?: string;
  coordinates?: { lat: number; lon: number };
  thumbnail?: { source: string; width: number };
  originalimage?: { source: string; width: number };
  content_urls?: { desktop?: { page?: string } };
}
interface Photo {
  imageUrl: string;
  thumbnailUrl: string;
  file: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
    } catch {
      // network blip or timeout: retry
    }
    await sleep(1200 * attempt);
  }
  return null;
}

/** 4xx means the link is gone; network errors are not treated as dead. */
async function isDead(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0" },
      signal: AbortSignal.timeout(12000),
    });
    await res.body?.cancel().catch(() => {});
    return res.status >= 400 && res.status < 500;
  } catch {
    return false;
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const GENERIC = new Set(["the", "of", "at", "and", "in", "near", "sri", "shri", "india", "view", "point"]);
function tokens(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !GENERIC.has(t));
}
// Article kinds that are never the place itself ("Belagavi division" for "Belagavi Fort")
// unless the spot's own name says so
const OTHER_KINDS = /^(division|district|taluk|taluka|tehsil|mandal|constituency|subdivision|railway|station|junction|airport|university|college|school|hospital|municipality|corporation|cantonment|block|village|town|city)$/;

/** Share of the spot's name words found in the article title (prefix match handles spelling variants) */
function nameScore(spotName: string, title: string): number {
  const a = tokens(spotName);
  const b = tokens(title);
  if (!a.length || !b.length) return 0;
  if (b.some((t) => OTHER_KINDS.test(t) && !a.includes(t))) return 0;
  const hit = a.filter((t) => b.some((u) => u === t || (t.length >= 5 && u.length >= 5 && (u.startsWith(t.slice(0, 5)) || t.startsWith(u.slice(0, 5))))));
  return hit.length / a.length;
}

/** Skip maps, flags, logos, icons and diagrams: they are not photos of the place */
function looksLikePhoto(fileOrUrl: string): boolean {
  const file = decodeURIComponent(fileOrUrl.split("/").pop() || "").toLowerCase();
  if (!/\.(jpe?g|png|webp)$/.test(file.replace(/^\d+px-/, ""))) return false;
  return !/(map|locator|location|flag|seal|logo|emblem|coat_of_arms|diagram|plan\b|icon|symbol|commons-|wiki|portal|question_book|edit-clear|ambox)/.test(file);
}

function fileName(url: string): string {
  const parts = url.split("?")[0].split("/");
  const last = decodeURIComponent(parts.pop() || "");
  // thumb URLs end in "<width>px-<File>"; originals end in "<File>"
  return last.replace(/^\d+px-/, "");
}

/** Wikimedia thumbnail at an allowed width the original can satisfy */
function sizedThumb(url: string, wanted: number, originalWidth?: number): string {
  const clean = url.split("?")[0];
  if (!/\/thumb\//.test(clean)) return clean; // already the original file
  const width = WIKIMEDIA_WIDTHS.filter((w) => w <= wanted && (!originalWidth || w <= originalWidth)).pop() ?? 330;
  return clean.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}

async function summary(title: string): Promise<WikiSummary | null> {
  return getJson<WikiSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
}

interface Match {
  summary: WikiSummary;
  km: number | null;
  score: number;
  via: "nearby" | "search";
}

async function findArticle(spot: { name: string; latitude: number; longitude: number; state: string }): Promise<Match | null> {
  const here = { lat: spot.latitude, lng: spot.longitude };

  // 1. Articles physically near the spot, ranked by how well the name matches
  const geo = await getJson<{ query?: { geosearch?: Array<{ title: string; dist: number }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${spot.latitude}|${spot.longitude}&gsradius=10000&gslimit=50&format=json`
  );
  // Ties go to the title with the fewest extra words ("Aihole" over "Aihole Jain cave"), then distance
  const near = (geo?.query?.geosearch ?? [])
    .map((g) => ({ ...g, score: nameScore(spot.name, g.title), extra: Math.max(0, tokens(g.title).length - tokens(spot.name).length) }))
    .filter((g) => g.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.extra - b.extra || a.dist - b.dist);
  for (const g of near.slice(0, 3)) {
    const s = await summary(g.title);
    if (s && s.type !== "disambiguation") return { summary: s, km: g.dist / 1000, score: g.score, via: "nearby" };
  }

  // 2. Name search, accepted only if the article sits near the spot (or has no coordinates but an exact name)
  const search = await getJson<{ query?: { search?: Array<{ title: string }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${spot.name} ${spot.state}`)}&srlimit=5&format=json`
  );
  for (const r of search?.query?.search ?? []) {
    const score = nameScore(spot.name, r.title);
    if (score < 0.5) continue;
    const s = await summary(r.title);
    if (!s || s.type === "disambiguation") continue;
    const km = s.coordinates ? haversineKm(here, { lat: s.coordinates.lat, lng: s.coordinates.lon }) : null;
    if ((km !== null && km <= MAX_KM) || (km === null && score === 1)) return { summary: s, km, score, via: "search" };
  }
  return null;
}

/** Up to `max` photos from an article: its lead image first, then other photos on the page */
async function articlePhotos(s: WikiSummary, max: number): Promise<Photo[]> {
  const photos: Photo[] = [];
  const seen = new Set<string>();
  const add = (imageUrl: string, thumbnailUrl: string) => {
    const file = fileName(imageUrl);
    if (seen.has(file) || !looksLikePhoto(file)) return;
    seen.add(file);
    photos.push({ imageUrl, thumbnailUrl, file });
  };

  if (s.thumbnail?.source) {
    add(sizedThumb(s.thumbnail.source, 1280, s.originalimage?.width), sizedThumb(s.thumbnail.source, 330, s.originalimage?.width));
  }
  if (photos.length >= max) return photos;

  const list = await getJson<{ query?: { pages?: Record<string, { images?: Array<{ title: string }> }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=images&imlimit=50&format=json&titles=${encodeURIComponent(s.title)}`
  );
  const files = Object.values(list?.query?.pages ?? {})
    .flatMap((p) => p.images ?? [])
    .map((i) => i.title)
    .filter((t) => looksLikePhoto(t) && !seen.has(t.replace(/^File:/, "").replace(/ /g, "_")))
    .slice(0, 12);
  if (!files.length) return photos;

  const info = await getJson<{
    query?: { pages?: Record<string, { title: string; imageinfo?: Array<{ thumburl?: string; url?: string; width?: number; mime?: string }> }> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280&format=json&titles=${encodeURIComponent(files.join("|"))}`
  );
  // Keep the article's own order (more prominent images first)
  const byTitle = new Map(Object.values(info?.query?.pages ?? {}).map((p) => [p.title, p.imageinfo?.[0]]));
  for (const t of files) {
    const ii = byTitle.get(t);
    if (!ii?.thumburl || !/^image\/(jpeg|png|webp)$/.test(ii.mime || "") || (ii.width ?? 0) < 500) continue;
    add(ii.thumburl, sizedThumb(ii.thumburl, 330, ii.width));
    if (photos.length >= max) break;
  }
  return photos;
}

async function main() {
  const spots = await prisma.spot.findMany({
    where: { status: "APPROVED", isActive: true },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      coverImageUrl: true,
      destination: { select: { state: { select: { name: true } } } },
      images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }] },
    },
    orderBy: { id: "asc" },
  });

  // 1. Which stored links are dead?
  const urls = [...new Set(spots.flatMap((s) => [s.coverImageUrl, ...s.images.map((i) => i.imageUrl)]).filter(Boolean) as string[])];
  console.log(`Checking ${urls.length} image links for ${spots.length} spots…`);
  const deadUrls = new Set<string>();
  let next = 0;
  let checked = 0;
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        if (await isDead(url)) deadUrls.add(url);
        if (++checked % 100 === 0) console.log(`  checked ${checked}/${urls.length}`);
      }
    })
  );
  const working = (s: (typeof spots)[number]) => s.images.filter((i) => !deadUrls.has(i.imageUrl));
  const needs = spots.filter((s) => working(s).length === 0 && (!s.coverImageUrl || deadUrls.has(s.coverImageUrl)));
  console.log(`${deadUrls.size} dead links; ${needs.length} spots have no working image.\n`);

  // 2. Find Wikipedia photos for spots with none
  const found = new Map<number, { match: Match; photos: Photo[] }>();
  let i = 0;
  for (const spot of needs) {
    i++;
    const match = await findArticle({ ...spot, state: spot.destination.state?.name ?? "India" });
    const photos = match ? await articlePhotos(match.summary, MAX_PHOTOS) : [];
    if (match && photos.length) found.set(spot.id, { match, photos });
    const where = match ? `${match.summary.title} (${match.via}, ${match.km === null ? "no coords" : match.km.toFixed(1) + " km"})` : "";
    console.log(
      `[${i}/${needs.length}] ${spot.name.padEnd(40).slice(0, 40)} → ${match ? (photos.length ? `${photos.length} photo(s) from ${where}` : `no usable photo in ${where}`) : "no confident match"}`
    );
    await sleep(100);
  }
  console.log(`\nFound photos for ${found.size} of ${needs.length} spots.`);

  // 3. Plan the trim to MAX_PHOTOS working images per spot (cover first)
  const extra = spots.flatMap((s) => (found.has(s.id) ? [] : working(s).slice(MAX_PHOTOS)));
  const deadRows = spots.flatMap((s) => s.images.filter((img) => deadUrls.has(img.imageUrl)));
  console.log(`Would remove ${deadRows.length} dead image rows and ${extra.length} extra photos over the limit of ${MAX_PHOTOS}.`);
  if (DRY_RUN) {
    console.log("Dry run: nothing written.");
    return;
  }

  const backup = path.resolve(process.cwd(), `prisma/data/.photo-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      { removedImages: [...deadRows, ...extra], covers: spots.map((s) => ({ spotId: s.id, coverImageUrl: s.coverImageUrl })) },
      null,
      2
    )
  );
  console.log(`Backed up removed rows and all covers to ${path.relative(process.cwd(), backup)}`);

  // Store the new Wikipedia photos
  for (const [spotId, { match, photos }] of found) {
    const s = match.summary;
    const pageUrl = s.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`;
    await prisma.$transaction([
      prisma.spotImage.updateMany({ where: { spotId }, data: { isPrimary: false } }),
      prisma.spotImage.createMany({
        data: photos.map((p, idx) => ({
          spotId,
          provider: "wikimedia",
          imageUrl: p.imageUrl,
          thumbnailUrl: p.thumbnailUrl,
          caption: "Photo: Wikimedia Commons",
          sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.file)}`,
          isPrimary: idx === 0,
        })),
      }),
      prisma.spot.update({ where: { id: spotId }, data: { coverImageUrl: photos[0].imageUrl } }),
    ]);
    const linked = await prisma.externalPlace.findFirst({ where: { spotId, provider: "wikipedia" } });
    if (!linked) {
      await prisma.externalPlace.create({
        data: { spotId, provider: "wikipedia", externalPlaceId: s.title, externalUrl: pageUrl, rawName: s.title, lastSyncedAt: new Date() },
      });
    }
  }

  // Remove dead rows and extras, clear dead covers, and make sure every spot's cover is a kept photo
  const removed = await prisma.spotImage.deleteMany({ where: { id: { in: [...deadRows, ...extra].map((r) => r.id) } } });
  const cleared = await prisma.spot.updateMany({ where: { coverImageUrl: { in: [...deadUrls] } }, data: { coverImageUrl: null } });
  let recovered = 0;
  for (const s of spots) {
    if (found.has(s.id)) continue;
    const kept = working(s).slice(0, MAX_PHOTOS);
    if (!kept.length) continue;
    const coverOk = s.coverImageUrl && !deadUrls.has(s.coverImageUrl) && (kept.some((k) => k.imageUrl === s.coverImageUrl) || !s.images.some((k) => k.imageUrl === s.coverImageUrl));
    if (!coverOk) {
      await prisma.spot.update({ where: { id: s.id }, data: { coverImageUrl: kept[0].imageUrl } });
      recovered++;
    }
  }
  console.log(
    `Stored photos for ${found.size} spots; removed ${removed.count} image rows; cleared ${cleared.count} dead covers; reset ${recovered} covers to a kept photo.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
