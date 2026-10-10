// Context Builder — Core of Context Engineering
// Assembles the right information in the right structure for the AI.
// "What should the AI know?" — answered here.
// Server-side only.

import { parseUserContext, type UserContext } from "./userContext";
import {
  getDestinationContext,
  serializeDestinationContext,
  type DestinationContextData,
} from "./destinationContext";
import { getSpotsContext, serializeSpotsContext, type SpotContextItem } from "./spotContext";
import { getReviewContext, getDestinationReviewContext, serializeReviewContext } from "./reviewContext";
import { getVideoContext, serializeVideoContext } from "./videoContext";
import { getNearbyContext, serializeNearbyContext } from "./nearbyContext";
import { googleSearch } from "@/lib/serpapi/search";

export interface ContextPackage {
  userContext: UserContext;
  destination: DestinationContextData | null;
  spots: SpotContextItem[];
  reviewSummary: string;
  videoSummary: string;
  nearbySummary: string;
  freshSearchSummary: string;
  sources: Array<{ type: string; name: string; url?: string }>;
  // Serialized prompt-ready string
  promptText: string;
}

/**
 * Build a task-specific context package for the AI.
 *
 * Context Engineering principle:
 * - Different intents get different context
 * - We filter, rank, and compress before sending to OpenAI
 * - We NEVER send the entire database
 * - We NEVER send SerpApi raw JSON to the frontend
 */
export async function buildContextPackage(
  rawQuery: string,
  destinationSlug?: string,
  spotId?: number
): Promise<ContextPackage> {
  const userContext = parseUserContext(rawQuery, destinationSlug);
  const sources: ContextPackage["sources"] = [];

  // ── 1. Destination Context ──────────────────────────────────────────────────
  let destination: DestinationContextData | null = null;
  if (destinationSlug) {
    destination = await getDestinationContext(destinationSlug).catch(() => null);
    if (destination) sources.push({ type: "database", name: destination.name });
  }

  // ── 2. Spot Context (task-specific filtering) ───────────────────────────────
  let spots: SpotContextItem[] = [];
  if (destination) {
    const limit = userContext.intent === "itinerary" ? 20 : 10;
    spots = await getSpotsContext(destination.id, {
      categoryNames: selectCategoriesForIntent(userContext),
      limit,
      orderByScore: true,
    }).catch(() => []);
    if (spots.length > 0) sources.push({ type: "database", name: `${spots.length} spots` });
  }

  // ── 3. Review Context (compressed) ─────────────────────────────────────────
  let reviewSummary = "";
  if (spotId) {
    const reviews = await getReviewContext(spotId, { limit: 6 }).catch(() => []);
    reviewSummary = serializeReviewContext(reviews);
  } else if (destination) {
    const reviews = await getDestinationReviewContext(destination.id, { limit: 5 }).catch(() => []);
    reviewSummary = serializeReviewContext(reviews);
  }

  // ── 4. Video Context ────────────────────────────────────────────────────────
  let videoSummary = "";
  if (spotId && (userContext.intent === "history" || userContext.intent === "spot_info")) {
    const videos = await getVideoContext(spotId, { limit: 3 }).catch(() => []);
    videoSummary = serializeVideoContext(videos);
  }

  // ── 5. Nearby Context ───────────────────────────────────────────────────────
  let nearbySummary = "";
  if (spotId && (userContext.intent === "itinerary" || userContext.intent === "nearby_search")) {
    const nearby = await getNearbyContext(spotId, { limit: 6 }).catch(() => []);
    nearbySummary = serializeNearbyContext(nearby);
  }

  // ── 6. Fresh External Context (SerpApi — only when live data is needed) ─────
  let freshSearchSummary = "";
  if (userContext.requiresLiveData) {
    try {
      const query = destinationSlug
        ? `${rawQuery} ${destinationSlug.replace(/-/g, " ")} Karnataka India`
        : rawQuery;
      const result = await googleSearch(query);
      const snippets = result.results.slice(0, 3).map((r) => r.snippet).join("\n");
      if (snippets) {
        freshSearchSummary = snippets;
        sources.push({ type: "live_search", name: "Google Search", url: undefined });
      }
    } catch (err) {
      console.warn("[ContextBuilder] Live search failed:", err);
    }
  }

  // ── 7. Build prompt text ────────────────────────────────────────────────────
  const promptText = assemblePromptText({
    userContext,
    destination,
    spots,
    reviewSummary,
    videoSummary,
    nearbySummary,
    freshSearchSummary,
  });

  return {
    userContext,
    destination,
    spots,
    reviewSummary,
    videoSummary,
    nearbySummary,
    freshSearchSummary,
    sources,
    promptText,
  };
}

/**
 * Select relevant category filters based on user intent.
 * Example: food intent → only Food spots.
 */
function selectCategoriesForIntent(ctx: UserContext): string[] | undefined {
  switch (ctx.intent) {
    case "food_search":
      return ["Food"];
    case "history":
      return ["Historical", "Temples", "Culture", "UNESCO"];
    case "nearby_search":
      return ctx.categories;
    default:
      return ctx.categories;
  }
}

function assemblePromptText(data: {
  userContext: UserContext;
  destination: DestinationContextData | null;
  spots: SpotContextItem[];
  reviewSummary: string;
  videoSummary: string;
  nearbySummary: string;
  freshSearchSummary: string;
}): string {
  const parts: string[] = [];

  if (data.destination) {
    parts.push("=== DESTINATION ===");
    parts.push(serializeDestinationContext(data.destination));
  }

  if (data.spots.length > 0) {
    parts.push("\n=== AVAILABLE SPOTS ===");
    parts.push(serializeSpotsContext(data.spots));
  }

  if (data.reviewSummary && data.reviewSummary !== "No recent reviews available.") {
    parts.push("\n=== RECENT VISITOR REVIEWS ===");
    parts.push(data.reviewSummary);
  }

  if (data.videoSummary && data.videoSummary !== "No travel videos indexed yet.") {
    parts.push("\n=== TRAVEL VIDEOS ===");
    parts.push(data.videoSummary);
  }

  if (data.nearbySummary && data.nearbySummary !== "No nearby spots computed yet.") {
    parts.push("\n=== NEARBY SPOTS ===");
    parts.push(data.nearbySummary);
  }

  if (data.freshSearchSummary) {
    parts.push("\n=== CURRENT SEARCH INFO ===");
    parts.push(data.freshSearchSummary);
  }

  if (data.userContext.days) {
    parts.push(`\n=== USER CONSTRAINT ===\nTrip duration: ${data.userContext.days} day(s)`);
  }

  return parts.join("\n").trim();
}
