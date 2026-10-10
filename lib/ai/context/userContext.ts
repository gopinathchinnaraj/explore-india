// User context module
// Parses intent, constraints, and preferences from raw user input
// Server-side only

export interface UserContext {
  rawQuery: string;
  // Detected intent
  intent:
    | "itinerary"      // "plan my trip", "create itinerary", "2 days in …"
    | "question"       // general question
    | "spot_info"      // "tell me about Virupaksha Temple"
    | "food_search"    // "where to eat in …"
    | "nearby_search"  // "places near …"
    | "history"        // "why is … famous", "history of …"
    | "current_info";  // "is it open today", "best time to visit"
  // Extracted constraints
  days?: number;
  categories?: string[];
  destination?: string;
  spot?: string;
  requiresLiveData: boolean; // true if question needs SerpApi fresh data
}

const DAYS_PATTERNS = [
  /(\d+)\s*day/i,
  /(\d+)\s*night/i,
  /(\w+)\s*day/i,
];
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, a: 1, an: 1,
};

const CATEGORY_KEYWORDS: Record<string, string> = {
  temple: "Temples", temple_pl: "Temples", shrine: "Temples",
  waterfall: "Waterfalls", falls: "Waterfalls", water: "Waterfalls",
  beach: "Beaches", beaches: "Beaches", coast: "Beaches",
  hill: "Hill Stations", mountain: "Hill Stations", trek: "Adventure",
  wildlife: "Wildlife", safari: "Wildlife", nature: "Nature", forest: "Nature",
  historical: "Historical", history: "Historical", heritage: "Historical", ancient: "Historical",
  adventure: "Adventure", rafting: "Adventure",
  food: "Food", restaurant: "Food", eat: "Food", cuisine: "Food",
  culture: "Culture", art: "Culture", festival: "Culture",
  unesco: "UNESCO",
};

/**
 * Parse the user's raw query into a structured UserContext.
 * This is entirely deterministic — no AI call needed here.
 */
export function parseUserContext(rawQuery: string, destinationSlug?: string): UserContext {
  const q = rawQuery.toLowerCase();

  // Detect intent
  const intent = detectIntent(q);

  // Extract days
  let days: number | undefined;
  for (const pattern of DAYS_PATTERNS) {
    const match = q.match(pattern);
    if (match) {
      const val = parseInt(match[1]) || WORD_NUMBERS[match[1]?.toLowerCase()];
      if (val && val > 0 && val <= 14) { days = val; break; }
    }
  }

  // Extract categories from keywords
  const categories: string[] = [];
  for (const [kw, cat] of Object.entries(CATEGORY_KEYWORDS)) {
    if (q.includes(kw) && !categories.includes(cat)) {
      categories.push(cat);
    }
  }

  // Detect destination from slug or query
  const destination = destinationSlug
    ? destinationSlug.replace(/-/g, " ")
    : extractDestinationHint(q);

  // Does this need live SerpApi data?
  const requiresLiveData = /open today|opening hours|closed|current|right now|weather|today/i.test(q);

  return {
    rawQuery,
    intent,
    days,
    categories: categories.length > 0 ? categories : undefined,
    destination,
    requiresLiveData,
  };
}

function detectIntent(q: string): UserContext["intent"] {
  if (/plan|itinerary|schedule|day \d|trip plan|visit.*days|days.*visit/i.test(q)) {
    return "itinerary";
  }
  if (/where.*eat|food|restaurant|cuisine|dining/i.test(q)) {
    return "food_search";
  }
  if (/near|nearby|around|close to|within/i.test(q)) {
    return "nearby_search";
  }
  if (/history|why.*famous|origin|ancient|about|founded|heritage/i.test(q)) {
    return "history";
  }
  if (/open|hours|timing|weather|current|today/i.test(q)) {
    return "current_info";
  }
  if (/tell me about|what is|describe|overview of/i.test(q)) {
    return "spot_info";
  }
  return "question";
}

function extractDestinationHint(q: string): string | undefined {
  const match = q.match(/(?:in|at|visit|about|near|from)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
  return match?.[1];
}
