// Harness Engineering — Tool Definitions
// Defines what the AI is allowed to do. Each tool has:
// - Typed parameters
// - Description
// - Validation rules
// The AI sees tool names and descriptions, never API keys or DB connections.
// Server-side only.

export type ToolName =
  | "search_destinations"
  | "search_spots"
  | "get_spot_details"
  | "get_nearby_spots"
  | "get_reviews"
  | "get_videos"
  | "search_fresh_information";

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, ToolParameterDef>;
}

export interface ToolParameterDef {
  type: "string" | "number" | "string[]" | "boolean";
  description: string;
  required: boolean;
  enum?: string[];
  min?: number;
  max?: number;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_destinations",
    description: "Search for broad travel destinations (Hampi, Coorg, etc.) by name or category.",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      limit: { type: "number", description: "Max results (1–20)", required: false, min: 1, max: 20 },
    },
  },
  {
    name: "search_spots",
    description:
      "Search for individual tourism spots inside a destination. Example: temples in Hampi, waterfalls near Coorg.",
    parameters: {
      destination: {
        type: "string",
        description: "Destination name or slug (e.g. 'hampi')",
        required: true,
      },
      category: {
        type: "string",
        description: "Category filter",
        required: false,
        enum: [
          "Historical", "Temples", "Waterfalls", "Beaches", "Hill Stations",
          "Wildlife", "Nature", "Adventure", "Cities", "Food", "Culture", "UNESCO",
        ],
      },
      limit: { type: "number", description: "Max results (1–20)", required: false, min: 1, max: 20 },
    },
  },
  {
    name: "get_spot_details",
    description: "Get detailed information about a specific spot by its slug.",
    parameters: {
      slug: { type: "string", description: "Spot slug (e.g. 'virupaksha-temple-hampi')", required: true },
    },
  },
  {
    name: "get_nearby_spots",
    description: "Find tourism spots geographically near a given spot.",
    parameters: {
      spot_id: { type: "number", description: "ID of the source spot", required: true },
      radius_km: { type: "number", description: "Search radius in kilometers (1–50)", required: false, min: 1, max: 50 },
      limit: { type: "number", description: "Max results", required: false, min: 1, max: 20 },
    },
  },
  {
    name: "get_reviews",
    description: "Fetch recent visitor reviews for a spot.",
    parameters: {
      spot_id: { type: "number", description: "Spot ID", required: true },
      sort: {
        type: "string",
        description: "Sort order",
        required: false,
        enum: ["relevant", "newest", "highest", "lowest"],
      },
      limit: { type: "number", description: "Max reviews", required: false, min: 1, max: 15 },
    },
  },
  {
    name: "get_videos",
    description: "Get travel videos for a spot.",
    parameters: {
      spot_id: { type: "number", description: "Spot ID", required: true },
      content_types: {
        type: "string[]",
        description: "Preferred content types",
        required: false,
      },
      limit: { type: "number", description: "Max videos", required: false, min: 1, max: 10 },
    },
  },
  {
    name: "search_fresh_information",
    description:
      "Search Google for current/real-time information about a place. Use when the user asks about opening hours, current conditions, or recent news. This calls an external search API.",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
    },
  },
];

// OpenAI function-calling format for TOOL_DEFINITIONS
export function getOpenAITools(): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, def]) => [
            key,
            {
              type: def.type === "string[]" ? "array" : def.type,
              ...(def.type === "string[]" ? { items: { type: "string" } } : {}),
              description: def.description,
              ...(def.enum ? { enum: def.enum } : {}),
            },
          ])
        ),
        required: Object.entries(tool.parameters)
          .filter(([, def]) => def.required)
          .map(([key]) => key),
      },
    },
  }));
}

// ─── Harness Rules (enforced in code, not just prompts) ─────────────────────

export const HARNESS_RULES = {
  MAX_TOOL_CALLS_PER_REQUEST: 5,
  MAX_QUERY_LENGTH: 500,
  ALLOW_FRESH_SEARCH: true, // can disable to reduce SerpApi usage
  FORBIDDEN_FIELDS: ["api_key", "database_url", "password", "secret"],
} as const;

/**
 * Validate that tool arguments are safe and conform to type definitions.
 */
export function validateToolArgs(
  toolName: ToolName,
  args: Record<string, unknown>
): { valid: boolean; error?: string } {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!tool) return { valid: false, error: `Unknown tool: ${toolName}` };

  for (const [paramName, def] of Object.entries(tool.parameters)) {
    if (def.required && !(paramName in args)) {
      return { valid: false, error: `Missing required parameter: ${paramName}` };
    }

    const val = args[paramName];
    if (val === undefined) continue;

    if (def.type === "number" && typeof val !== "number") {
      return { valid: false, error: `Parameter ${paramName} must be a number` };
    }

    if (def.type === "string" && typeof val !== "string") {
      return { valid: false, error: `Parameter ${paramName} must be a string` };
    }

    if (def.type === "number" && def.min !== undefined && (val as number) < def.min) {
      return { valid: false, error: `Parameter ${paramName} must be >= ${def.min}` };
    }

    if (def.type === "number" && def.max !== undefined && (val as number) > def.max) {
      return { valid: false, error: `Parameter ${paramName} must be <= ${def.max}` };
    }

    if (def.enum && typeof val === "string" && !def.enum.includes(val)) {
      return { valid: false, error: `Parameter ${paramName} must be one of: ${def.enum.join(", ")}` };
    }
  }

  // Security check: reject if any arg value contains a forbidden keyword
  const allValues = JSON.stringify(args).toLowerCase();
  for (const forbidden of HARNESS_RULES.FORBIDDEN_FIELDS) {
    if (allValues.includes(forbidden)) {
      return { valid: false, error: "Argument contains disallowed content" };
    }
  }

  return { valid: true };
}
