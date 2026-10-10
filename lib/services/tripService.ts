// Trip planner — turns a visitor's saved places into a day-by-day itinerary.
//
// Harness: the model only sees the approved spots the visitor picked (from our database),
// never invents places, and must answer in a fixed JSON shape.
// Loop: its answer is validated (every stop exactly once, only known ids, sensible days)
// and repaired; if the model is unavailable or the answer can't be repaired, a
// deterministic plan built from the optimised route is returned instead.

import OpenAI from "openai";
import prisma from "@/lib/db/prisma";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export const MAX_TRIP_STOPS = 14;

export interface TripStop {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  state: string;
  destination: string;
  categories: string[];
  rating: number | null;
}

export interface TripDay {
  day: number;
  title: string;
  stops: Array<{ id: number; name: string; note: string }>;
  travelKm: number;
}

export interface TripPlan {
  title: string;
  summary: string;
  days: TripDay[];
  tips: string[];
  route: Array<{ id: number; name: string; latitude: number; longitude: number }>;
  totalKm: number;
  source: "ai" | "route";
}

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Nearest-neighbour ordering starting from the first stop — short, sensible routes. */
export function orderRoute<T extends { latitude: number; longitude: number }>(stops: T[]): T[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops];
  const route = [remaining.shift()!];
  while (remaining.length) {
    const last = route[route.length - 1];
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (haversineKm(last, remaining[i]) < haversineKm(last, remaining[best])) best = i;
    }
    route.push(remaining.splice(best, 1)[0]);
  }
  return route;
}

function legKm(stops: Array<{ latitude: number; longitude: number }>) {
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += haversineKm(stops[i - 1], stops[i]);
  return Math.round(km);
}

/** Each day's travel includes the hop from the previous day's last stop */
function withTravel(days: TripDay[], byId: Map<number, { latitude: number; longitude: number }>): TripDay[] {
  return days.map((d, i) => {
    const prevLast = i > 0 ? days[i - 1].stops[days[i - 1].stops.length - 1] : null;
    const pts = [...(prevLast ? [prevLast] : []), ...d.stops].map((s) => byId.get(s.id)!).filter(Boolean);
    return { ...d, travelKm: legKm(pts) };
  });
}

/** Split an ordered route into days: a long hop (> 250 km) or 3 stops ends the day. */
function routeDays(route: TripStop[], maxDays?: number): TripStop[][] {
  const days: TripStop[][] = [];
  let current: TripStop[] = [];
  for (const stop of route) {
    const prev = current[current.length - 1];
    if (current.length && (current.length >= 3 || (prev && haversineKm(prev, stop) > 250))) {
      days.push(current);
      current = [];
    }
    current.push(stop);
  }
  if (current.length) days.push(current);
  // Squeeze into the requested number of days by merging the closest neighbours
  while (maxDays && days.length > maxDays) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < days.length - 1; i++) {
      const gap = haversineKm(days[i][days[i].length - 1], days[i + 1][0]);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    days.splice(best, 2, [...days[best], ...days[best + 1]]);
  }
  return days;
}

function deterministicPlan(route: TripStop[], days?: number): TripPlan {
  const grouped = routeDays(route, days);
  const states = [...new Set(route.map((s) => s.state))];
  return {
    title: states.length === 1 ? `${states[0]} in ${grouped.length} days` : `India across ${states.length} states`,
    summary: `A ${grouped.length}-day route through ${route.length} places, ordered to keep travel short.`,
    days: withTravel(
      grouped.map((stops, i) => ({
        day: i + 1,
        title: [...new Set(stops.map((s) => s.destination))].join(" · "),
        stops: stops.map((s) => ({ id: s.id, name: s.name, note: s.categories.slice(0, 2).join(" & ") || "Explore" })),
        travelKm: 0,
      })),
      new Map(route.map((s) => [s.id, s]))
    ),
    tips: ["Check opening hours and local festivals before you travel — they change through the year."],
    route: route.map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude })),
    totalKm: legKm(route),
    source: "route",
  };
}

async function loadStops(spotIds: number[]): Promise<TripStop[]> {
  const spots = await prisma.spot.findMany({
    where: { id: { in: spotIds }, status: "APPROVED", isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      latitude: true,
      longitude: true,
      rating: true,
      destination: { select: { name: true, state: { select: { name: true } } } },
      categories: { select: { category: { select: { name: true } } } },
    },
  });
  const byId = new Map(spots.map((s) => [s.id, s]));
  // Keep the visitor's order for the starting point
  return spotIds
    .map((id) => byId.get(id))
    .filter((s): s is (typeof spots)[number] => Boolean(s))
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      rating: s.rating,
      state: s.destination.state.name,
      destination: s.destination.name,
      categories: s.categories.map((c) => c.category.name),
    }));
}

export async function planTrip(spotIds: number[], options: { days?: number; style?: string } = {}): Promise<TripPlan> {
  const stops = await loadStops(spotIds.slice(0, MAX_TRIP_STOPS));
  if (stops.length === 0) throw new Error("None of these places are available");

  const route = orderRoute(stops);
  const fallback = deterministicPlan(route, options.days);
  if (!openai || stops.length < 2) return fallback;

  const known = new Map(route.map((s) => [s.id, s]));
  const prompt = `You are an expert India travel planner. Build a realistic day-by-day itinerary.

RULES
- Use ONLY these places, each exactly once, referenced by "id". Do not add any other place.
- Keep the given route order unless swapping two neighbours clearly saves travel.
- ${options.days ? `Use exactly ${options.days} days.` : "Choose a realistic number of days (long journeys between regions need their own day)."}
- Notes must be practical (what to do, best time of day). Never invent ticket prices, timings or ratings.
${options.style ? `- Travel style: ${options.style}` : ""}

PLACES (in route order; km = distance from previous)
${route
  .map((s, i) => {
    const km = i ? Math.round(haversineKm(route[i - 1], s)) : 0;
    return `- id ${s.id}: ${s.name} — ${s.destination}, ${s.state} (${s.categories.join(", ") || "attraction"})${i ? `, ${km} km` : ""}`;
  })
  .join("\n")}

Return JSON only:
{"title": string, "summary": string (1-2 sentences), "days": [{"day": number, "title": string, "stops": [{"id": number, "note": string}]}], "tips": string[] (max 4)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1400,
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content || "{}") as {
      title?: unknown;
      summary?: unknown;
      days?: Array<{ title?: unknown; stops?: Array<{ id?: unknown; note?: unknown }> }>;
      tips?: unknown;
    };

    // Validate & repair: known ids only, each once, missing ones appended to the closest day
    const used = new Set<number>();
    const days: TripDay[] = [];
    for (const d of Array.isArray(raw.days) ? raw.days : []) {
      const dayStops = (Array.isArray(d.stops) ? d.stops : [])
        .map((st) => ({ id: Number(st.id), note: typeof st.note === "string" ? st.note.slice(0, 220) : "" }))
        .filter((st) => known.has(st.id) && !used.has(st.id))
        .map((st) => {
          used.add(st.id);
          return { id: st.id, name: known.get(st.id)!.name, note: st.note };
        });
      if (dayStops.length) {
        days.push({
          day: days.length + 1,
          title: typeof d.title === "string" && d.title.trim() ? d.title.slice(0, 80) : `Day ${days.length + 1}`,
          stops: dayStops,
          travelKm: legKm(dayStops.map((s) => known.get(s.id)!)),
        });
      }
    }
    if (days.length === 0) return fallback;

    // Enforce the requested length: merge the closest neighbouring days until it fits
    while (options.days && days.length > options.days) {
      let best = 0;
      let bestGap = Infinity;
      for (let i = 0; i < days.length - 1; i++) {
        const a = known.get(days[i].stops[days[i].stops.length - 1].id)!;
        const b = known.get(days[i + 1].stops[0].id)!;
        const gap = haversineKm(a, b);
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      }
      const merged = days[best];
      const next = days.splice(best + 1, 1)[0];
      merged.title = `${merged.title} & ${next.title}`.slice(0, 80);
      merged.stops.push(...next.stops);
      merged.travelKm = legKm(merged.stops.map((x) => known.get(x.id)!));
      days.forEach((d, i) => (d.day = i + 1));
    }

    for (const s of route) {
      if (used.has(s.id)) continue;
      const lastDay = days[days.length - 1];
      lastDay.stops.push({ id: s.id, name: s.name, note: "Worth adding if time allows." });
      lastDay.travelKm = legKm(lastDay.stops.map((x) => known.get(x.id)!));
    }

    const ordered = days.flatMap((d) => d.stops.map((s) => known.get(s.id)!));
    return {
      title: typeof raw.title === "string" ? raw.title.slice(0, 90) : fallback.title,
      summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : fallback.summary,
      days: withTravel(days, known),
      tips: Array.isArray(raw.tips) ? raw.tips.filter((t): t is string => typeof t === "string").slice(0, 4) : fallback.tips,
      route: ordered.map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude })),
      totalKm: legKm(ordered),
      source: "ai",
    };
  } catch (err) {
    console.warn("[TripService] AI planning failed, using route plan:", err);
    return fallback;
  }
}
