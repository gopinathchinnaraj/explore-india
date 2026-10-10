// Loop Engineering — Itinerary Loop
// The controlled AI loop for generating and improving travel itineraries.
// Implements: Plan → Retrieve → Act → Validate → Improve → Final
// Server-side only.

import OpenAI from "openai";
import {
  createInitialLoopState,
  LOOP_CONFIG,
  type LoopState,
  type ItineraryPlan,
} from "./loopState";
import { validateItinerary, parseItineraryOutput } from "./itineraryValidator";
import type { ContextPackage } from "@/lib/ai/context/contextBuilder";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are Explore India AI — a grounded travel itinerary planner for India.

RULES (enforced by the application):
1. Only include spots that are listed in the AVAILABLE SPOTS section.
2. Never invent ratings, review counts, coordinates, or opening hours.
3. If a spot's information is unavailable, acknowledge it.
4. Prefer spots with higher ratings and more reviews.
5. Group nearby spots in the same time block to minimize travel.
6. Start days at 08:00, end by 20:00.
7. Include food/meal breaks if the user asked for food.

Output ONLY valid JSON in this exact structure (no other text):
{
  "destination": "string",
  "duration_days": number,
  "itinerary": [
    {
      "day": 1,
      "items": [
        {
          "spot_id": number,
          "name": "string",
          "slug": "string",
          "start_time": "HH:MM",
          "duration_minutes": number,
          "categories": ["string"],
          "reason": "string"
        }
      ],
      "summary": "string"
    }
  ],
  "notes": ["string"],
  "sources_used": ["Explore India database"]
}`;

export interface ItineraryLoopResult {
  plan: ItineraryPlan | null;
  finalState: LoopState;
  iterations: number;
  validationHistory: Array<{ iteration: number; valid: boolean; issues: string[] }>;
  error?: string;
}

/**
 * Run the full itinerary generation loop.
 * Implements Loop Engineering: Plan → Validate → Improve → Final
 * with MAX_ITERATIONS hard cap.
 */
export async function runItineraryLoop(
  contextPackage: ContextPackage,
  destinationSlug: string,
  destinationName: string
): Promise<ItineraryLoopResult> {
  if (!openai) {
    return {
      plan: null,
      finalState: createInitialLoopState("", destinationSlug, destinationName, [], ""),
      iterations: 0,
      validationHistory: [],
      error: "OpenAI is not configured",
    };
  }

  const constraints = extractConstraints(contextPackage.userContext);
  const state = createInitialLoopState(
    contextPackage.userContext.rawQuery,
    destinationSlug,
    destinationName,
    constraints,
    contextPackage.promptText
  );

  const validationHistory: ItineraryLoopResult["validationHistory"] = [];

  console.log(`[ItineraryLoop] Starting for "${destinationName}", constraints: ${constraints.join(", ")}`);

  while (state.iteration < state.max_iterations && state.status !== "done" && state.status !== "failed") {
    state.iteration++;
    console.log(`[ItineraryLoop] Iteration ${state.iteration}/${state.max_iterations} — status: ${state.status}`);

    // ── Generate or Improve ──────────────────────────────────────────────────
    state.status = state.iteration === 1 ? "planning" : "improving";
    const userMessage = buildUserMessage(state);

    let rawOutput = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.3,
      });
      rawOutput = completion.choices[0]?.message?.content || "";
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.error(`[ItineraryLoop] OpenAI error on iteration ${state.iteration}:`, msg);
      state.status = "failed";
      return { plan: state.current_plan, finalState: state, iterations: state.iteration, validationHistory, error: msg };
    }

    // ── Parse Output ─────────────────────────────────────────────────────────
    const parsed = parseItineraryOutput(rawOutput);
    if (!parsed) {
      console.warn(`[ItineraryLoop] Could not parse AI output on iteration ${state.iteration}`);
      if (state.iteration >= state.max_iterations) break;
      continue;
    }
    state.current_plan = parsed;

    // ── Validate ─────────────────────────────────────────────────────────────
    state.status = "validating";
    const validation = await validateItinerary(parsed, state.constraints);
    state.validation = validation;

    validationHistory.push({
      iteration: state.iteration,
      valid: validation.valid,
      issues: validation.issues.map((i) => i.message),
    });

    console.log(`[ItineraryLoop] Validation: valid=${validation.valid}, issues=${validation.issues.length}`);

    if (validation.valid) {
      state.status = "done";
      break;
    }

    // If we've hit max iterations, return the best plan we have
    if (state.iteration >= state.max_iterations) {
      console.log(`[ItineraryLoop] Reached max iterations, returning best plan`);
      break;
    }
  }

  return {
    plan: state.current_plan,
    finalState: state,
    iterations: state.iteration,
    validationHistory,
  };
}

function buildUserMessage(state: LoopState): string {
  const lines = [
    `User Request: ${state.goal}`,
    `Destination: ${state.destinationName}`,
    "",
    state.context_prompt,
  ];

  if (state.iteration > 1 && state.validation && state.current_plan) {
    lines.push("\n=== PREVIOUS PLAN HAD ISSUES ===");
    lines.push("Issues to fix:");
    for (const issue of state.validation.issues.filter((i) => i.severity === "error")) {
      lines.push(`- [${issue.code}] ${issue.message}`);
      if (issue.suggested_action) lines.push(`  Fix: ${issue.suggested_action}`);
    }
    lines.push("\nGenerate an improved itinerary that fixes these issues.");
  } else {
    lines.push("\nGenerate a travel itinerary using ONLY the spots listed in AVAILABLE SPOTS above.");
    if (state.constraints.length > 0) {
      lines.push(`Constraints: ${state.constraints.join(", ")}`);
    }
  }

  return lines.join("\n");
}

function extractConstraints(userContext: ContextPackage["userContext"]): string[] {
  const constraints: string[] = [];

  if (userContext.days) {
    constraints.push(`${userContext.days} day trip`);
  }

  if (userContext.categories && userContext.categories.length > 0) {
    constraints.push(`Include: ${userContext.categories.join(", ")}`);
  }

  if (/food|eat|restaurant/i.test(userContext.rawQuery)) {
    constraints.push("Include food spots");
  }

  if (/historical|heritage|ancient/i.test(userContext.rawQuery)) {
    constraints.push("historical places required");
  }

  if (/review|highly rated|best/i.test(userContext.rawQuery)) {
    constraints.push("prioritize highly reviewed spots");
  }

  return constraints;
}
