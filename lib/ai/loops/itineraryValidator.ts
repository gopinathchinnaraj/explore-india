// Loop Engineering — Itinerary Validator
// Validates AI-generated itineraries against constraints and data.
// The validator belongs to the application, not the AI.
// Server-side only.

import prisma from "@/lib/db/prisma";
import {
  LOOP_CONFIG,
  type ItineraryPlan,
  type ItineraryDay,
  type ItinerarySpotItem,
  type ValidationResult,
  type ValidationIssue,
} from "./loopState";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Validate an itinerary plan against:
 * - Day count constraint
 * - Category constraints
 * - Geographic distance feasibility
 * - Spot duplication
 * - Minimum/maximum spots per day
 * - Time feasibility
 */
export async function validateItinerary(
  plan: ItineraryPlan,
  constraints: string[]
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // ── 1. Day count ────────────────────────────────────────────────────────────
  const expectedDays = constraints
    .map((c) => c.match(/(\d+)\s*day/i))
    .find(Boolean)?.[1];
  if (expectedDays && plan.itinerary.length !== parseInt(expectedDays)) {
    issues.push({
      severity: "error",
      code: "DAY_COUNT_MISMATCH",
      message: `Plan has ${plan.itinerary.length} day(s) but the constraint requires ${expectedDays} day(s).`,
      suggested_action: `Adjust the itinerary to exactly ${expectedDays} day(s).`,
    });
  }

  // ── 2. Duplicate spots ─────────────────────────────────────────────────────
  const allSpotIds = plan.itinerary.flatMap((d) => d.items.map((i) => i.spot_id));
  const uniqueIds = new Set(allSpotIds);
  if (uniqueIds.size < allSpotIds.length) {
    issues.push({
      severity: "error",
      code: "DUPLICATE_SPOTS",
      message: "The same spot appears more than once in the itinerary.",
      suggested_action: "Replace duplicate spots with different nearby attractions.",
    });
  }

  // ── 3. Category requirements ────────────────────────────────────────────────
  const requiresHistorical = constraints.some((c) => /historical|heritage|temple/i.test(c));
  const requiresFood = constraints.some((c) => /food|eat|restaurant|cuisine/i.test(c));

  if (requiresHistorical) {
    const hasHistorical = plan.itinerary.some((d) =>
      d.items.some((i) =>
        i.categories.some((c) =>
          ["Historical", "Temples", "Culture", "UNESCO"].includes(c)
        )
      )
    );
    if (!hasHistorical) {
      issues.push({
        severity: "error",
        code: "MISSING_HISTORICAL",
        message: "The user requested historical places but none are included.",
        suggested_action: "Add historical or temple spots like Virupaksha Temple.",
      });
    }
  }

  if (requiresFood) {
    const hasFood = plan.itinerary.some((d) =>
      d.items.some((i) => i.categories.includes("Food"))
    );
    if (!hasFood) {
      issues.push({
        severity: "warning",
        code: "MISSING_FOOD",
        message: "User requested food spots but none are included.",
        suggested_action: "Add a food spot or restaurant recommendation.",
      });
    }
  }

  // ── 4. Spots per day ────────────────────────────────────────────────────────
  for (const day of plan.itinerary) {
    if (day.items.length < LOOP_CONFIG.MIN_SPOTS_PER_DAY) {
      issues.push({
        severity: "warning",
        code: "TOO_FEW_SPOTS",
        message: `Day ${day.day} has only ${day.items.length} spot(s). Recommend at least ${LOOP_CONFIG.MIN_SPOTS_PER_DAY}.`,
        suggested_action: `Add more spots to Day ${day.day}.`,
      });
    }
    if (day.items.length > LOOP_CONFIG.MAX_SPOTS_PER_DAY) {
      issues.push({
        severity: "warning",
        code: "TOO_MANY_SPOTS",
        message: `Day ${day.day} has ${day.items.length} spots which may be too ambitious.`,
        suggested_action: `Limit Day ${day.day} to ${LOOP_CONFIG.MAX_SPOTS_PER_DAY} spots.`,
      });
    }
  }

  // ── 5. Geographic distance check ────────────────────────────────────────────
  const spotIds = [...uniqueIds];
  if (spotIds.length > 0) {
    const spotCoords = await prisma.spot.findMany({
      where: { id: { in: spotIds } },
      select: { id: true, latitude: true, longitude: true, name: true },
    });
    const coordMap = Object.fromEntries(spotCoords.map((s) => [s.id, s]));

    for (const day of plan.itinerary) {
      for (let i = 0; i < day.items.length - 1; i++) {
        const a = coordMap[day.items[i].spot_id];
        const b = coordMap[day.items[i + 1].spot_id];
        if (a && b) {
          const distKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
          const travelMin = (distKm / LOOP_CONFIG.TRAVEL_SPEED_KMH) * 60;
          if (distKm > 15) {
            issues.push({
              severity: "warning",
              code: "LARGE_TRAVEL_DISTANCE",
              message: `Day ${day.day}: "${a.name}" → "${b.name}" is ${distKm.toFixed(1)}km (≈${Math.round(travelMin)} min travel). Consider grouping nearby spots.`,
              suggested_action: "Reorder or replace to minimize travel between spots.",
            });
          }
        }
      }
    }
  }

  // ── 6. Time feasibility ─────────────────────────────────────────────────────
  for (const day of plan.itinerary) {
    let currentMin = 0;
    for (const item of day.items) {
      if (item.start_time) {
        const startMin = parseTime(item.start_time);
        if (startMin < currentMin) {
          issues.push({
            severity: "warning",
            code: "TIME_OVERLAP",
            message: `Day ${day.day}: "${item.name}" start time ${item.start_time} conflicts with previous spot end time.`,
            suggested_action: "Adjust start times to avoid overlap.",
          });
        }
        currentMin = startMin + (item.duration_minutes || 60) + LOOP_CONFIG.VISIT_BUFFER_MINUTES;
      }
    }
    // Day ends too late?
    if (currentMin > 22 * 60) {
      issues.push({
        severity: "warning",
        code: "DAY_TOO_LONG",
        message: `Day ${day.day} schedule extends past 10 PM. Consider removing the last spot.`,
        suggested_action: "Reduce spots or adjust timing.",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    valid: !hasErrors,
    issues,
    suggested_action: hasErrors
      ? issues.find((i) => i.severity === "error")?.suggested_action
      : undefined,
  };
}

/**
 * Parse an itinerary from AI output.
 * Returns null if the output is invalid JSON or missing required fields.
 * AI output must be validated before use — never trusted directly.
 */
export function parseItineraryOutput(raw: string): ItineraryPlan | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      !Array.isArray(parsed.itinerary) ||
      typeof parsed.destination !== "string"
    ) {
      return null;
    }

    // Normalize each day and spot
    const itinerary: ItineraryDay[] = parsed.itinerary.map((day: unknown) => {
      const d = day as Record<string, unknown>;
      return {
        day: Number(d.day) || 1,
        items: Array.isArray(d.items)
          ? (d.items as unknown[]).map((item: unknown) => {
              const it = item as Record<string, unknown>;
              return {
                spot_id: Number(it.spot_id) || 0,
                name: String(it.name || ""),
                slug: String(it.slug || ""),
                start_time: String(it.start_time || "09:00"),
                duration_minutes: Number(it.duration_minutes) || 60,
                categories: Array.isArray(it.categories)
                  ? it.categories.map(String)
                  : [],
                reason: String(it.reason || ""),
              } as ItinerarySpotItem;
            })
          : [],
        summary: typeof d.summary === "string" ? d.summary : undefined,
      };
    });

    return {
      destination: String(parsed.destination),
      duration_days: Number(parsed.duration_days) || itinerary.length,
      itinerary,
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
      sources_used: Array.isArray(parsed.sources_used) ? parsed.sources_used.map(String) : [],
      generated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
