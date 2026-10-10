// Seed iconic places across India from the curated list in prisma/data/india-places.ts.
// Facts come from Wikipedia's REST API (coordinates, intro text, lead photo) — free and
// keyless, with the article linked as the source. Idempotent: re-running updates in place.
//
// Run with: npm run seed:india
// Remove everything it created: spots/destinations with discoverySource = "CURATED".

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { INDIA_PLACES, INDIA_STATES } from "./data/india-places";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();
const USER_AGENT = "ExploreIndia/1.0 (hackathon demo; contact via project repo)";
const WIKIMEDIA_WIDTHS = [60, 120, 250, 330, 500, 960, 1280, 1920];

interface WikiSummary {
  title: string;
  extract?: string;
  description?: string;
  coordinates?: { lat: number; lon: number };
  thumbnail?: { source: string; width: number };
  originalimage?: { source: string; width: number };
  content_urls?: { desktop?: { page?: string } };
  wikibase_item?: string;
}

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Wikimedia thumbnail at an allowed width that the original can satisfy */
function wikimediaThumb(summary: WikiSummary, wanted: number): string | null {
  const thumb = summary.thumbnail?.source;
  const originalWidth = summary.originalimage?.width ?? 0;
  if (!thumb) return null;
  if (thumb.includes("Special:FilePath")) return thumb.replace(/width=\d+/, `width=${wanted >= 960 ? 1280 : 330}`);
  const clean = thumb.split("?")[0];
  const allowed = WIKIMEDIA_WIDTHS.filter((w) => w <= originalWidth);
  const width = allowed.filter((w) => w <= wanted).pop();
  if (!width) return summary.originalimage?.source?.split("?")[0] ?? clean;
  return clean.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}

// Responses are cached locally so re-runs don't hit Wikipedia again
const CACHE_FILE = path.resolve(process.cwd(), "prisma/data/.wiki-cache.json");
const cache: Record<string, WikiSummary | null> = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      // 429 / 5xx: back off and retry
    } catch {
      // Network blip: retry
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return null;
}

async function fetchSummary(title: string): Promise<WikiSummary | null> {
  if (title in cache && cache[title]?.coordinates && cache[title]?.thumbnail) return cache[title];
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const summary = await getJson<WikiSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}?redirect=true`);
  // Some articles omit coordinates from the summary; the action API usually has them
  if (summary && !summary.coordinates) {
    const q = await getJson<{ query?: { pages?: Record<string, { coordinates?: Array<{ lat: number; lon: number }> }> } }>(
      `https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&coprimary=all&titles=${slug}&format=json&redirects=1`
    );
    const coords = Object.values(q?.query?.pages || {})[0]?.coordinates?.[0];
    if (coords) summary.coordinates = { lat: coords.lat, lon: coords.lon };
  }
  // Last resort: the article's Wikidata item usually has a coordinate location (P625)
  // …and Wikidata also fills in a missing lead photo (P18 "image")
  if (summary && (!summary.coordinates || !summary.thumbnail) && summary.wikibase_item) {
    type Claim<V> = { mainsnak?: { datavalue?: { value?: V } } };
    const wd = await getJson<{
      entities?: Record<string, { claims?: { P625?: Claim<{ latitude: number; longitude: number }>[]; P18?: Claim<string>[] } }>;
    }>(`https://www.wikidata.org/wiki/Special:EntityData/${summary.wikibase_item}.json`);
    const claims = Object.values(wd?.entities || {})[0]?.claims;
    const v = claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!summary.coordinates && v) summary.coordinates = { lat: v.latitude, lon: v.longitude };
    const file = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!summary.thumbnail && file) {
      // Commons serves any allowed width through Special:FilePath
      const base = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}`;
      summary.thumbnail = { source: `${base}?width=330`, width: 330 };
      summary.originalimage = { source: `${base}?width=1280`, width: 1280 };
    }
  }
  cache[title] = summary;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return summary;
}

async function main() {
  console.log(`🇮🇳 Seeding ${INDIA_PLACES.length} curated places across India…`);

  const country = await prisma.country.upsert({
    where: { code: "IN" },
    update: {},
    create: { name: "India", code: "IN", slug: "india" },
  });

  // States & union territories
  const stateIds = new Map<string, number>();
  for (const s of INDIA_STATES) {
    const state = await prisma.state.upsert({
      where: { slug: slugify(s.name) },
      update: {},
      create: { name: s.name, slug: slugify(s.name), countryId: country.id },
    });
    stateIds.set(s.name, state.id);
  }

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(categories.map((c) => [c.slug, c.id]));

  // Existing spots for de-duplication (name + proximity)
  const existing = await prisma.spot.findMany({ select: { id: true, name: true, latitude: true, longitude: true, discoverySource: true } });

  // 1. Fetch Wikipedia data (SEED_ONLY="Title A,Title B" limits the run to those articles)
  const only = process.env.SEED_ONLY?.split(",").map((t) => t.trim()).filter(Boolean);
  const places = only?.length ? INDIA_PLACES.filter((p) => only.includes(p.wiki)) : INDIA_PLACES;
  const fetched: Array<{ place: (typeof INDIA_PLACES)[number]; summary: WikiSummary }> = [];
  for (const place of places) {
    const summary = await fetchSummary(place.wiki);
    if (!summary?.coordinates) {
      console.warn(`  ⚠️  ${place.wiki}: no Wikipedia coordinates — skipped`);
      continue;
    }
    fetched.push({ place, summary });
    await new Promise((r) => setTimeout(r, 250)); // be polite to the API
  }
  console.log(`  ✓ Wikipedia data for ${fetched.length}/${INDIA_PLACES.length} places`);

  // 2. Destinations (one per area, centred on its places)
  const byDestination = new Map<string, typeof fetched>();
  for (const f of fetched) {
    const key = `${f.place.state}::${f.place.destination}`;
    byDestination.set(key, [...(byDestination.get(key) || []), f]);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let order = 0;

  for (const [key, items] of byDestination) {
    const [stateName, destName] = key.split("::");
    const stateId = stateIds.get(stateName)!;
    const lat = items.reduce((s, i) => s + i.summary.coordinates!.lat, 0) / items.length;
    const lng = items.reduce((s, i) => s + i.summary.coordinates!.lon, 0) / items.length;
    const destCats = [...new Set(items.flatMap((i) => i.place.categories))];

    let destination = await prisma.destination.findFirst({ where: { name: destName, stateId } });
    if (!destination) {
      let slug = slugify(destName);
      if (await prisma.destination.findUnique({ where: { slug } })) slug = `${slug}-${slugify(stateName)}`;
      destination = await prisma.destination.create({
        data: {
          name: destName,
          slug,
          countryId: country.id,
          stateId,
          latitude: lat,
          longitude: lng,
          address: `${destName}, ${stateName}`,
          coverImageUrl: wikimediaThumb(items[0].summary, 1280),
          categories: {
            create: destCats.filter((c) => categoryId.has(c)).map((c) => ({ categoryId: categoryId.get(c)! })),
          },
        },
      });
    }

    // 3. Spots
    for (const { place, summary } of items) {
      order++;
      const name = place.name || summary.title;
      const coords = { lat: summary.coordinates!.lat, lng: summary.coordinates!.lon };
      const pageUrl = summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(place.wiki)}`;
      const cover = wikimediaThumb(summary, 1280);
      const thumb = wikimediaThumb(summary, 330);
      const description = summary.extract?.trim() || summary.description || null;
      const slug = slugify(name);

      // Skip if a non-curated spot already covers this place (e.g. discovered via Google Maps)
      const duplicate = existing.find(
        (e) =>
          e.discoverySource !== "CURATED" &&
          haversineKm(coords, { lat: e.latitude, lng: e.longitude }) < 0.4 &&
          (slugify(e.name).includes(slugify(name).slice(0, 8)) || slugify(name).includes(slugify(e.name).slice(0, 8)))
      );
      if (duplicate) {
        skipped++;
        continue;
      }

      const data = {
        destinationId: destination.id,
        name,
        description,
        latitude: coords.lat,
        longitude: coords.lng,
        address: `${place.destination}, ${place.state}`,
        coverImageUrl: cover,
        discoverySource: "CURATED",
        // Curated icons rank first; earlier entries in the list rank higher
        discoveryScore: Math.max(60, 100 - Math.floor(order / 6)),
        isVerified: true,
        isActive: true,
        status: "APPROVED",
        lastDetailsSyncAt: new Date(),
        lastSyncedAt: new Date(),
      };

      // Identify curated places by their Wikipedia article, so renaming never duplicates them
      const linked = await prisma.externalPlace.findFirst({
        where: { provider: "wikipedia", externalPlaceId: summary.title, spotId: { not: null } },
        select: { spot: { select: { id: true, discoverySource: true } } },
      });
      const prior = linked?.spot ?? (await prisma.spot.findUnique({ where: { slug }, select: { id: true, discoverySource: true } }));
      if (prior && prior.discoverySource !== "CURATED") {
        skipped++;
        continue;
      }

      const spot = prior
        ? await prisma.spot.update({ where: { id: prior.id }, data })
        : await prisma.spot.create({ data: { ...data, slug } });
      if (prior) updated++;
      else created++;

      await prisma.spotCategory.deleteMany({ where: { spotId: spot.id } });
      await prisma.spotCategory.createMany({
        data: place.categories.filter((c) => categoryId.has(c)).map((c) => ({ spotId: spot.id, categoryId: categoryId.get(c)! })),
        skipDuplicates: true,
      });

      if (cover) {
        await prisma.spotImage.deleteMany({ where: { spotId: spot.id, provider: "wikimedia" } });
        await prisma.spotImage.create({
          data: {
            spotId: spot.id,
            provider: "wikimedia",
            imageUrl: cover,
            thumbnailUrl: thumb,
            caption: "Photo: Wikimedia Commons",
            sourceUrl: pageUrl,
            isPrimary: true,
          },
        });
      }

      await prisma.externalPlace.upsert({
        where: { spotId_provider: { spotId: spot.id, provider: "wikipedia" } },
        create: { spotId: spot.id, provider: "wikipedia", externalPlaceId: summary.title, externalUrl: pageUrl, rawName: summary.title, lastSyncedAt: new Date() },
        update: { externalPlaceId: summary.title, externalUrl: pageUrl, lastSyncedAt: new Date() },
      });
    }
  }

  console.log(`  ✓ Spots: ${created} created, ${updated} updated, ${skipped} skipped (already in database)`);
  console.log(`  ✓ ${INDIA_STATES.length} states/UTs, ${byDestination.size} destinations`);
  console.log("Run the free 'Nearby' sync in /admin/sync to link nearby places.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
