// Pure helper with no API access, so public read paths can use it without
// pulling in the SerpApi-backed video sync service.

import type { VideoContentType } from "@/types/spot";

/**
 * Classify video content type from title/description heuristics.
 * AI classification is handled in the AI classifier; this is a lightweight fallback.
 */
export function classifyVideoContentType(title: string, description?: string | null): VideoContentType {
  const text = `${title} ${description || ""}`.toLowerCase();
  if (text.includes("documentary") || text.includes("history") || text.includes("historical")) return "DOCUMENTARY";
  if (text.includes("travel guide") || text.includes("complete guide") || text.includes("travel guide")) return "TRAVEL_GUIDE";
  if (text.includes("vlog") || text.includes("day trip") || text.includes("i visited")) return "VLOG";
  if (text.includes("walking tour") || text.includes("walk through")) return "WALKING_TOUR";
  if (text.includes("history") || text.includes("ancient") || text.includes("empire")) return "HISTORY";
  if (text.includes("#shorts") || (title.length < 30 && !text.includes("travel"))) return "SHORT";
  return "TRAVEL_GUIDE";
}
