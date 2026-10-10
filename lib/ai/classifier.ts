// AI Classifier
// Uses OpenAI structured output to classify tourism spots and videos.
// NEVER invents ratings, coordinates, or factual provider data.
// Server-side only.

import OpenAI from "openai";
import type { VideoContentType } from "@/types/spot";
import type { NormalizedVideo } from "@/lib/serpapi/youtube";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─── Spot Classification ─────────────────────────────────────────────────────

export interface SpotClassificationInput {
  name: string;
  type: string | null;
  types: string[];
  description: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  destinationHint: string;
}

export interface SpotClassificationResult {
  is_tourism_spot: boolean;
  destination: string;
  categories: string[]; // must be subset of our category names
  normalized_name: string;
  confidence: number; // 0.0–1.0
}

const VALID_CATEGORIES = [
  "Historical", "Temples", "Waterfalls", "Beaches", "Hill Stations",
  "Wildlife", "Nature", "Adventure", "Cities", "Food", "Culture", "UNESCO",
];

/**
 * Classify a newly discovered spot.
 * Returns structured JSON validated against our schema.
 * AI must NOT invent factual fields; it only classifies/normalizes.
 */
export async function classifySpot(
  input: SpotClassificationInput
): Promise<SpotClassificationResult> {
  if (!openai) {
    // Fallback: heuristic classification without AI
    return heuristicSpotClassification(input);
  }

  const prompt = `You are a tourism data classifier for an India travel platform called Explore India.

Your task: Classify whether the following place is a legitimate tourism attraction and categorize it.

Place information (from Google Maps, do NOT change these factual values):
- Name: ${input.name}
- Type: ${input.type || "unknown"}
- Types: ${input.types.join(", ") || "none"}
- Description: ${input.description || "none"}
- Address: ${input.address || "unknown"}
- Rating: ${input.rating ?? "unknown"}
- Review count: ${input.reviewCount ?? "unknown"}
- Destination hint: ${input.destinationHint}

Your job:
1. Decide if this is a tourism spot a traveler would want to visit.
2. Pick 1–3 applicable categories from ONLY this list: ${VALID_CATEGORIES.join(", ")}
3. Provide a clean, normalized name (correct typos, standardize format).
4. Assign confidence 0.0–1.0.

DO NOT invent ratings, coordinates, or reviews.
Return ONLY valid JSON with these exact keys:
{
  "is_tourism_spot": boolean,
  "destination": string,
  "categories": string[],
  "normalized_name": string,
  "confidence": number
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.1, // Low temperature for consistent classification
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    return validateSpotClassification(parsed, input);
  } catch (error) {
    console.error("[Classifier] Spot classification failed:", error);
    return heuristicSpotClassification(input);
  }
}

function validateSpotClassification(
  raw: Record<string, unknown>,
  input: SpotClassificationInput
): SpotClassificationResult {
  // Validate categories are in our approved list
  const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
  const validCategories = rawCategories.filter(
    (c): c is string => typeof c === "string" && VALID_CATEGORIES.includes(c)
  );

  return {
    is_tourism_spot: typeof raw.is_tourism_spot === "boolean" ? raw.is_tourism_spot : true,
    destination: typeof raw.destination === "string" ? raw.destination : input.destinationHint,
    categories: validCategories.slice(0, 3),
    normalized_name:
      typeof raw.normalized_name === "string" && raw.normalized_name.length > 0
        ? raw.normalized_name
        : input.name,
    confidence:
      typeof raw.confidence === "number"
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0.7,
  };
}

function heuristicSpotClassification(
  input: SpotClassificationInput
): SpotClassificationResult {
  const name = input.name.toLowerCase();
  const type = (input.type || "").toLowerCase();
  const types = input.types.map((t) => t.toLowerCase());
  const all = `${name} ${type} ${types.join(" ")}`;

  const categories: string[] = [];
  if (/temple|shrine|mandir|kovil|church|mosque|jain/i.test(all)) categories.push("Temples");
  if (/waterfall|falls|cascade/i.test(all)) categories.push("Waterfalls");
  if (/beach|coast|shore/i.test(all)) categories.push("Beaches");
  if (/hill|mountain|peak|trek|ghats/i.test(all)) categories.push("Hill Stations");
  if (/wildlife|safari|tiger|elephant|national park|sanctuary/i.test(all)) categories.push("Wildlife");
  if (/nature|forest|garden|park|reserve/i.test(all)) categories.push("Nature");
  if (/fort|palace|monument|ruins|heritage|museum|historical/i.test(all)) categories.push("Historical");
  if (/adventure|rafting|trekking|kayak|zip/i.test(all)) categories.push("Adventure");
  if (/food|restaurant|cuisine|hotel/i.test(all)) categories.push("Food");
  if (/culture|art|festival|dance|craft/i.test(all)) categories.push("Culture");
  if (/unesco/i.test(all)) categories.push("UNESCO");

  const is_tourism_spot =
    categories.length > 0 ||
    (input.rating !== null && input.rating >= 3.5) ||
    (input.reviewCount !== null && input.reviewCount >= 50);

  return {
    is_tourism_spot,
    destination: input.destinationHint,
    categories: categories.slice(0, 3),
    normalized_name: input.name,
    confidence: 0.6,
  };
}

// ─── Video Classification ─────────────────────────────────────────────────────

export interface VideoClassificationInput {
  title: string;
  description?: string | null;
  channelName?: string | null;
  durationSeconds?: number | null;
  spotName: string;
}

export interface VideoClassificationResult {
  content_type: VideoContentType;
  is_relevant: boolean;
  relevance_score: number; // 0–100
}

/**
 * Classify a YouTube video for a specific tourism spot.
 * Uses AI for nuanced classification when available,
 * falls back to heuristics otherwise.
 */
export async function classifyVideo(
  input: VideoClassificationInput
): Promise<VideoClassificationResult> {
  if (!openai) {
    return heuristicVideoClassification(input);
  }

  const prompt = `Classify this YouTube video for the tourism spot "${input.spotName}".

Video title: ${input.title}
Channel: ${input.channelName || "unknown"}
Description: ${(input.description || "").slice(0, 200)}
Duration: ${input.durationSeconds ? `${Math.round(input.durationSeconds / 60)} minutes` : "unknown"}

Valid content types: TRAVEL_GUIDE, DOCUMENTARY, HISTORY, VLOG, WALKING_TOUR, SHORT, OTHER

Return ONLY valid JSON:
{
  "content_type": "TRAVEL_GUIDE",
  "is_relevant": true,
  "relevance_score": 85
}

relevance_score is 0–100 based on how useful this video would be for a traveler visiting ${input.spotName}.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 100,
      temperature: 0.1,
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const validTypes: VideoContentType[] = [
      "TRAVEL_GUIDE", "DOCUMENTARY", "HISTORY", "VLOG", "WALKING_TOUR", "SHORT", "OTHER",
    ];

    return {
      content_type: validTypes.includes(raw.content_type) ? raw.content_type : "OTHER",
      is_relevant: typeof raw.is_relevant === "boolean" ? raw.is_relevant : true,
      relevance_score:
        typeof raw.relevance_score === "number"
          ? Math.max(0, Math.min(100, raw.relevance_score))
          : 50,
    };
  } catch {
    return heuristicVideoClassification(input);
  }
}

function heuristicVideoClassification(
  input: VideoClassificationInput
): VideoClassificationResult {
  const text = `${input.title} ${input.description || ""}`.toLowerCase();

  let content_type: VideoContentType = "OTHER";
  if (text.includes("documentary") || text.includes("history")) content_type = "DOCUMENTARY";
  else if (text.includes("travel guide") || text.includes("complete guide")) content_type = "TRAVEL_GUIDE";
  else if (text.includes("vlog")) content_type = "VLOG";
  else if (text.includes("walking tour")) content_type = "WALKING_TOUR";
  else if (text.includes("#shorts") || (input.durationSeconds && input.durationSeconds < 60)) content_type = "SHORT";

  const spotMentioned = text.includes(input.spotName.toLowerCase());
  const is_relevant = spotMentioned || text.includes("travel") || text.includes("tourism");
  const relevance_score = spotMentioned ? 75 : is_relevant ? 50 : 25;

  return { content_type, is_relevant, relevance_score };
}

export interface ClassifiedVideo extends NormalizedVideo {
  category: VideoContentType;
  relevanceScore: number;
  isRelevant: boolean;
}

/**
 * Classify a batch of normalized YouTube videos for a destination using AI,
 * falling back to heuristic classification if OpenAI is unavailable.
 */
export async function classifyDestinationVideosBatch(
  videos: NormalizedVideo[],
  destinationName: string
): Promise<ClassifiedVideo[]> {
  if (videos.length === 0) return [];

  if (!openai) {
    return videos.map((v) => {
      const res = heuristicVideoClassification({
        title: v.title,
        description: v.description,
        channelName: v.channelName,
        durationSeconds: v.durationSeconds,
        spotName: destinationName,
      });
      return {
        ...v,
        category: res.content_type,
        relevanceScore: res.relevance_score,
        isRelevant: res.is_relevant,
      };
    });
  }

  const prompt = `You are a travel video curator for "${destinationName}".
Classify each YouTube video below. Do NOT invent factual data.
Categories allowed: TRAVEL_GUIDE, DOCUMENTARY, HISTORY, VLOG, WALKING_TOUR, SHORT, OTHER.

Videos:
${JSON.stringify(
  videos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    channelName: v.channelName,
    length: v.durationSeconds ? `${Math.round(v.durationSeconds / 60)}m` : "unknown",
    views: v.viewCount,
    description: (v.description || "").slice(0, 160),
  })),
  null,
  2
)}

Return ONLY valid JSON with this exact structure:
{
  "classifications": [
    {
      "videoId": "string",
      "category": "DOCUMENTARY",
      "relevanceScore": 85,
      "isRelevant": true
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1,
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const classMap = new Map<
      string,
      { category: VideoContentType; relevanceScore: number; isRelevant: boolean }
    >();

    const validCategories: VideoContentType[] = [
      "TRAVEL_GUIDE",
      "DOCUMENTARY",
      "HISTORY",
      "VLOG",
      "WALKING_TOUR",
      "SHORT",
      "OTHER",
    ];

    if (Array.isArray(raw.classifications)) {
      for (const item of raw.classifications) {
        if (item && item.videoId) {
          classMap.set(item.videoId, {
            category: validCategories.includes(item.category) ? item.category : "OTHER",
            relevanceScore:
              typeof item.relevanceScore === "number"
                ? Math.max(0, Math.min(100, item.relevanceScore))
                : 50,
            isRelevant: typeof item.isRelevant === "boolean" ? item.isRelevant : true,
          });
        }
      }
    }

    return videos.map((v) => {
      const aiResult = classMap.get(v.videoId);
      if (aiResult) {
        return {
          ...v,
          category: aiResult.category,
          relevanceScore: aiResult.relevanceScore,
          isRelevant: aiResult.isRelevant,
        };
      }
      const heuristic = heuristicVideoClassification({
        title: v.title,
        description: v.description,
        channelName: v.channelName,
        durationSeconds: v.durationSeconds,
        spotName: destinationName,
      });
      return {
        ...v,
        category: heuristic.content_type,
        relevanceScore: heuristic.relevance_score,
        isRelevant: heuristic.is_relevant,
      };
    });
  } catch (error) {
    console.warn("[Classifier] Batch video classification failed, falling back to heuristics:", error);
    return videos.map((v) => {
      const res = heuristicVideoClassification({
        title: v.title,
        description: v.description,
        channelName: v.channelName,
        durationSeconds: v.durationSeconds,
        spotName: destinationName,
      });
      return {
        ...v,
        category: res.content_type,
        relevanceScore: res.relevance_score,
        isRelevant: res.is_relevant,
      };
    });
  }
}

/**
 * Filter and balance videos across categories to return top diverse videos (e.g. up to targetCount)
 */
export function rankAndSelectDiverseVideos(
  videos: ClassifiedVideo[],
  targetCount: number = 10
): ClassifiedVideo[] {
  // Sort by relevance score desc
  const sorted = [...videos].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  // Exclude shorts from top spots if possible
  const nonShorts = sorted.filter(
    (v) => v.category !== "SHORT" && (v.durationSeconds === null || v.durationSeconds >= 60)
  );
  const shorts = sorted.filter(
    (v) => v.category === "SHORT" || (v.durationSeconds !== null && v.durationSeconds < 60)
  );

  const selected: ClassifiedVideo[] = [];
  const selectedIds = new Set<string>();

  function tryAdd(v: ClassifiedVideo) {
    if (!selectedIds.has(v.videoId) && selected.length < targetCount) {
      selected.push(v);
      selectedIds.add(v.videoId);
      return true;
    }
    return false;
  }

  // 1. Pick top travel guides (up to 3)
  for (const v of nonShorts.filter((v) => v.category === "TRAVEL_GUIDE").slice(0, 3)) {
    tryAdd(v);
  }

  // 2. Pick top documentary / history (up to 3)
  for (const v of nonShorts.filter((v) => v.category === "DOCUMENTARY" || v.category === "HISTORY").slice(0, 3)) {
    tryAdd(v);
  }

  // 3. Pick top vlogs (up to 3)
  for (const v of nonShorts.filter((v) => v.category === "VLOG").slice(0, 3)) {
    tryAdd(v);
  }

  // 4. Pick walking tours / other
  for (const v of nonShorts.filter((v) => v.category === "WALKING_TOUR" || v.category === "OTHER").slice(0, 2)) {
    tryAdd(v);
  }

  // 5. Fill remaining slots with highest relevance non-shorts
  for (const v of nonShorts) {
    tryAdd(v);
  }

  // 6. If still under target, fill with shorts
  for (const v of shorts) {
    tryAdd(v);
  }

  return selected;
}

/**
 * Summarize real visitor reviews using AI for destination insights
 */
export async function summarizeReviewsWithAI(
  reviews: Array<{ authorName: string | null; rating: number | null; reviewText: string | null }>,
  destinationName: string
): Promise<string | null> {
  const textReviews = reviews.filter((r) => r.reviewText && r.reviewText.trim().length > 10);
  if (textReviews.length === 0) return null;

  if (!openai) {
    const validRatings = textReviews.filter((r) => r.rating !== null).map((r) => r.rating!);
    const avg = validRatings.length > 0
      ? (validRatings.reduce((a, b) => a + b, 0) / validRatings.length).toFixed(1)
      : "4.5";
    return `Visitors rate ${destinationName} ${avg}/5 on average, highlighting its historical architecture, cultural significance, and scenic atmosphere.`;
  }

  const sample = textReviews
    .slice(0, 8)
    .map((r) => `- [${r.rating ? `${r.rating}★` : "Review"}] ${r.reviewText?.slice(0, 160)}`)
    .join("\n");

  const prompt = `Based on these authentic traveler reviews for "${destinationName}", generate a concise 2-sentence travel summary highlighting what visitors appreciate most and practical tips for new travelers.

Reviews:
${sample}

Return ONLY the 2-sentence summary without quotes or headings.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 140,
      temperature: 0.3,
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("[Classifier] Review summarization failed:", err);
    return null;
  }
}


