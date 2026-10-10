// Loop Engineering — Loop State and Configuration
// Defines the state machine for AI itinerary loops.
// Server-side only.

export const LOOP_CONFIG = {
  MAX_ITERATIONS: 3,
  MAX_SPOTS_PER_DAY: 5,
  MIN_SPOTS_PER_DAY: 2,
  TRAVEL_SPEED_KMH: 15, // Assume slow travel (auto-rickshaw/walking in tourist areas)
  VISIT_BUFFER_MINUTES: 30, // Buffer between spots
} as const;

export interface ItinerarySpotItem {
  spot_id: number;
  name: string;
  slug?: string;
  start_time: string; // "HH:MM"
  duration_minutes: number;
  categories: string[];
  reason: string;
  latitude?: number;
  longitude?: number;
  distanceFromPrevKm?: number;
}

export interface ItineraryDay {
  day: number;
  items: ItinerarySpotItem[];
  summary?: string;
}

export interface ItineraryPlan {
  destination: string;
  duration_days: number;
  itinerary: ItineraryDay[];
  notes: string[];
  sources_used: string[];
  generated_at: string;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  suggested_action?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  suggested_action?: string;
}

export interface LoopState {
  goal: string;
  constraints: string[];
  destinationSlug: string;
  destinationName: string;
  current_plan: ItineraryPlan | null;
  validation: ValidationResult | null;
  iteration: number;
  max_iterations: number;
  status: "planning" | "validating" | "improving" | "done" | "failed";
  context_prompt: string;
}

export function createInitialLoopState(
  goal: string,
  destinationSlug: string,
  destinationName: string,
  constraints: string[],
  contextPrompt: string
): LoopState {
  return {
    goal,
    constraints,
    destinationSlug,
    destinationName,
    current_plan: null,
    validation: null,
    iteration: 0,
    max_iterations: LOOP_CONFIG.MAX_ITERATIONS,
    status: "planning",
    context_prompt: contextPrompt,
  };
}
