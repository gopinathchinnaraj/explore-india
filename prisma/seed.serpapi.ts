// SerpAPI-powered seed script
// Enriches/creates destinations using live Google Maps data via SerpAPI
//
// Prerequisites:
//   1. Add SERPAPI_API_KEY to .env
//   2. Run `npm run db:push` first to create the tables
//   3. Run `npm run seed` first to seed base structure (country, state, categories)
//
// Usage:
//   npm run seed:serpapi
//   npm run seed:serpapi -- --reviews   (also fetch real reviews)
//   npm run seed:serpapi -- --photos    (also fetch real photos)
//   npm run seed:serpapi -- --spots     (discover and auto-wire spots with photos, reviews, videos)

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

// ─── SerpAPI plumbing (inline to avoid Next.js module issues in ts-node) ─────

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_BASE = "https://serpapi.com/search.json";

function checkKey() {
  if (!SERPAPI_API_KEY) {
    console.error("\n\u274c  SERPAPI_API_KEY is not set in .env");
    console.error("    Get a free key at https://serpapi.com/");
    process.exit(1);
  }
}

async function serpRequest<T>(params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams({
    api_key: SERPAPI_API_KEY!,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });

  const res = await fetch(`${SERPAPI_BASE}?${qs}`);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`SerpAPI ${res.status}: ${text}`);
  }
  const data = await res.json() as T & { error?: string };
  if ((data as { error?: string }).error) {
    throw new Error(`SerpAPI error: ${(data as { error?: string }).error}`);
  }
  return data;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapsResult {
  title: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  address?: string;
  rating?: number;
  reviews?: number;
  thumbnail?: string;
  type?: string;
  types?: string[];
  description?: string;
  reviews_link?: string;
  photos_link?: string;
}

interface MapsResponse {
  local_results?: MapsResult[];
}

interface ReviewItem {
  review_id?: string;
  user?: { name?: string; thumbnail?: string; link?: string };
  rating?: number;
  iso_date?: string;
  date?: string;
  snippet?: string;
}

interface ReviewsResponse {
  reviews?: ReviewItem[];
  place_info?: { title?: string; rating?: number; reviews?: number };
}

interface PhotoItem {
  thumbnail?: string;
  image?: string;
  user?: { name?: string; link?: string };
}

interface PhotosResponse {
  photos?: PhotoItem[];
}

// ─── Search queries per category ─────────────────────────────────────────────

const CATEGORY_QUERIES: Array<{ query: string; categories: string[] }> = [
  { query: "historical monuments Karnataka tourism",       categories: ["historical", "culture"] },
  { query: "ancient temples Karnataka pilgrimage sites",  categories: ["temples", "culture"] },
  { query: "waterfalls Karnataka scenic nature",          categories: ["waterfalls", "nature"] },
  { query: "beaches Karnataka coastal tourism",           categories: ["beaches", "nature"] },
  { query: "hill stations Karnataka viewpoints",          categories: ["hill-stations", "nature"] },
  { query: "wildlife sanctuary national park Karnataka",  categories: ["wildlife", "nature"] },
  { query: "adventure trekking Karnataka",                categories: ["adventure", "nature"] },
  { query: "UNESCO heritage sites Karnataka",             categories: ["unesco", "historical"] },
  { query: "popular tourist destinations Bengaluru",      categories: ["cities", "culture"] },
  { query: "food street market Mysore Udupi Karnataka",  categories: ["food", "culture"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  checkKey();

  const fetchReviews = process.argv.includes("--reviews");
  const fetchPhotos = process.argv.includes("--photos");
  const fetchSpots = process.argv.includes("--spots") || process.argv.includes("--places");

  console.log("Seeding with SerpAPI...");
  if (fetchReviews) console.log("  -> will also fetch real reviews per destination");
  if (fetchPhotos) console.log("  -> will also fetch real photos per destination");
  if (fetchSpots) console.log("  -> will discover and auto-wire spots for Karnataka tourism");

  // Ensure base country & state exist
  const india = await prisma.country.upsert({
    where: { code: "IN" },
    update: {},
    create: { name: "India", code: "IN", slug: "india", isActive: true },
  });

  const karnataka = await prisma.state.upsert({
    where: { slug: "karnataka" },
    update: {},
    create: { name: "Karnataka", slug: "karnataka", countryId: india.id, isActive: true },
  });

  // Build category map
  const dbCategories = await prisma.category.findMany();
  const categoryMap: Record<string, number> = {};
  dbCategories.forEach((c) => { categoryMap[c.slug] = c.id; });

  // Gather places from every query, deduplicate by name
  const seenNames = new Set<string>();
  const allPlaces: Array<MapsResult & { inferredCategories: string[] }> = [];

  for (const { query, categories } of CATEGORY_QUERIES) {
    console.log(`\nQuerying: "${query}"`);

    try {
      const resp = await serpRequest<MapsResponse>({
        engine: "google_maps",
        q: query,
        type: "search",
        gl: "in",
        hl: "en",
      });

      const results = resp.local_results || [];
      console.log(`  -> ${results.length} results`);

      for (const place of results) {
        if (!place.title || !place.gps_coordinates) continue;
        const key = place.title.toLowerCase().trim();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        allPlaces.push({ ...place, inferredCategories: categories });
      }
    } catch (err) {
      console.warn(`  WARN: ${err instanceof Error ? err.message : err}`);
    }

    await sleep(1200);
  }

  console.log(`\n${allPlaces.length} unique places to upsert`);

  let created = 0;
  let updated = 0;
  let reviewsAdded = 0;
  let photosAdded = 0;
  let spotsAdded = 0;

  for (const place of allPlaces) {
    const { latitude, longitude } = place.gps_coordinates!;
    const slug = slugify(place.title);

    try {
      const destination = await prisma.destination.upsert({
        where: { slug },
        update: {
          ...(place.rating !== undefined && { rating: place.rating }),
          ...(place.reviews !== undefined && { reviewCount: place.reviews }),
          ...(place.thumbnail && { coverImageUrl: place.thumbnail }),
          ...(place.address && { address: place.address }),
        },
        create: {
          name: place.title,
          slug,
          description: place.description || null,
          latitude,
          longitude,
          address: place.address || null,
          rating: place.rating || null,
          reviewCount: place.reviews || null,
          coverImageUrl: place.thumbnail || null,
          countryId: india.id,
          stateId: karnataka.id,
          isActive: true,
        },
      });

      const isNew = destination.createdAt.getTime() === destination.updatedAt.getTime();
      isNew ? created++ : updated++;

      // Store Google Maps IDs in ExternalPlace for future review fetches
      if (place.data_id || place.place_id) {
        await prisma.externalPlace.upsert({
          where: {
            destinationId_provider: {
              destinationId: destination.id,
              provider: "google_maps",
            },
          },
          update: {
            externalPlaceId: place.place_id || null,
            externalDataId: place.data_id || null,
            externalUrl: place.reviews_link || null,
            rawName: place.title,
            lastSyncedAt: new Date(),
          },
          create: {
            destinationId: destination.id,
            provider: "google_maps",
            externalPlaceId: place.place_id || null,
            externalDataId: place.data_id || null,
            externalUrl: place.reviews_link || null,
            rawName: place.title,
            lastSyncedAt: new Date(),
          },
        });
      }

      // Link categories
      const validCats = place.inferredCategories.filter((s) => categoryMap[s]);
      await Promise.allSettled(
        validCats.map((catSlug) =>
          prisma.destinationCategory.upsert({
            where: {
              destinationId_categoryId: {
                destinationId: destination.id,
                categoryId: categoryMap[catSlug],
              },
            },
            update: {},
            create: {
              destinationId: destination.id,
              categoryId: categoryMap[catSlug],
            },
          })
        )
      );

      // Optionally fetch real reviews
      if (fetchReviews && place.data_id) {
        try {
          await sleep(800);
          const reviewResp = await serpRequest<ReviewsResponse>({
            engine: "google_maps_reviews",
            data_id: place.data_id,
            hl: "en",
          });

          const reviews = (reviewResp.reviews || []).slice(0, 8);
          for (const r of reviews) {
            if (!r.snippet) continue;
            await prisma.destinationReview
              .create({
                data: {
                  destinationId: destination.id,
                  source: "google_maps",
                  externalReviewId: r.review_id || null,
                  authorName: r.user?.name || null,
                  authorAvatarUrl: r.user?.thumbnail || null,
                  rating: r.rating || null,
                  reviewText: r.snippet,
                  publishedAt: r.iso_date ? new Date(r.iso_date) : null,
                  reviewUrl: r.user?.link || null,
                },
              })
              .catch(() => {
                // Duplicate — skip
              });
            reviewsAdded++;
          }
        } catch (err) {
          console.warn(`  WARN reviews for ${place.title}: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Optionally fetch real photos
      if (fetchPhotos && place.data_id) {
        try {
          await sleep(800);
          const photoResp = await serpRequest<PhotosResponse>({
            engine: "google_maps_photos",
            data_id: place.data_id,
            hl: "en",
          });

          const photos = (photoResp.photos || []).slice(0, 8);
          for (const p of photos) {
            const imgUrl = p.image || p.thumbnail;
            if (!imgUrl) continue;
            await prisma.destinationImage
              .create({
                data: {
                  destinationId: destination.id,
                  url: imgUrl,
                  alt: p.user?.name ? `Photo by ${p.user.name}` : `${place.title} photo`,
                  source: "google_maps",
                },
              })
              .catch(() => {});
            photosAdded++;
          }
        } catch (err) {
          console.warn(`  WARN photos for ${place.title}: ${err instanceof Error ? err.message : err}`);
        }
      }

      console.log(`  ${isNew ? "CREATE" : "UPDATE"} ${place.title} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
    } catch (err) {
      console.warn(`  SKIP ${place.title}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Auto-wire tourism spots if --spots or --places requested
  if (fetchSpots) {
    console.log("\nDiscovering spots for Karnataka tourism places...");
    try {
      const spotResp = await serpRequest<MapsResponse>({
        engine: "google_maps",
        q: "karnataka tourism places",
        type: "search",
        gl: "in",
        hl: "en",
      });

      const spotResults = spotResp.local_results || [];
      console.log(`Found ${spotResults.length} tourism attractions from Google Maps`);

      const allDests = await prisma.destination.findMany({
        select: { id: true, name: true, slug: true, latitude: true, longitude: true },
      });

      for (const place of spotResults) {
        if (!place.title || !place.gps_coordinates) continue;
        const { latitude, longitude } = place.gps_coordinates;
        const spotSlug = slugify(place.title);

        let nearestDest = allDests[0];
        let minD = Infinity;
        for (const d of allDests) {
          const dist = Math.hypot(d.latitude - latitude, d.longitude - longitude);
          if (dist < minD) {
            minD = dist;
            nearestDest = d;
          }
        }

        if (!nearestDest) continue;

        const spot = await (prisma as any).spot.upsert({
          where: { slug: spotSlug },
          update: {
            rating: place.rating ?? undefined,
            reviewCount: place.reviews ?? undefined,
            coverImageUrl: place.thumbnail ?? undefined,
            address: place.address ?? undefined,
            lastSyncedAt: new Date(),
          },
          create: {
            destinationId: nearestDest.id,
            name: place.title,
            slug: spotSlug,
            description: place.description || null,
            latitude,
            longitude,
            address: place.address || null,
            rating: place.rating || null,
            reviewCount: place.reviews || null,
            coverImageUrl: place.thumbnail || null,
            discoverySource: "GOOGLE_MAPS",
            discoveryScore: place.reviews && place.reviews > 1000 ? 90 : 70,
            isVerified: true,
            isActive: true,
            lastSyncedAt: new Date(),
          },
        });

        if (place.data_id || place.place_id) {
          const existingExternal = await prisma.externalPlace.findFirst({
            where: { spotId: spot.id, provider: "google_maps" },
          });

          if (existingExternal) {
            await prisma.externalPlace.update({
              where: { id: existingExternal.id },
              data: {
                externalPlaceId: place.place_id || null,
                externalDataId: place.data_id || null,
                externalCid: place.data_cid || null,
                externalUrl: place.reviews_link || null,
                rawName: place.title,
                lastSyncedAt: new Date(),
              },
            });
          } else {
            await prisma.externalPlace.create({
              data: {
                spotId: spot.id,
                provider: "google_maps",
                externalPlaceId: place.place_id || null,
                externalDataId: place.data_id || null,
                externalCid: place.data_cid || null,
                externalUrl: place.reviews_link || null,
                rawName: place.title,
                lastSyncedAt: new Date(),
              },
            });
          }
        }

        console.log(`  SPOT ${spot.name} (${spot.slug}) linked to destination ${nearestDest.name}`);
        spotsAdded++;
      }
    } catch (err) {
      console.warn("  Error in spot discovery:", err);
    }
  }

  console.log("\nSerpAPI seed complete!");
  console.log(`  ${created} destinations created`);
  console.log(`  ${updated} destinations updated`);
  if (fetchReviews) console.log(`  ${reviewsAdded} reviews imported`);
  if (fetchPhotos) console.log(`  ${photosAdded} photos imported`);
  if (fetchSpots) console.log(`  ${spotsAdded} spots auto-wired`);
  console.log("\nTip: Run with --reviews, --photos, or --spots for deep data ingestion");
}

main()
  .catch((e) => {
    console.error("SerpAPI seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
