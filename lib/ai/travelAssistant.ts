// AI Travel Assistant — Orchestrator
// Routes user requests to the appropriate handler:
//   - Itinerary requests → Loop Engineering
//   - General questions → Context Engineering + Harness tools
// Replaces the old simple prompt → OpenAI pattern.
// Server-side only.

import OpenAI from "openai";
import { buildContextPackage } from "@/lib/ai/context/contextBuilder";
import { parseUserContext } from "@/lib/ai/context/userContext";
import type { ItineraryPlan } from "@/lib/ai/loops/loopState";
import { getOpenAITools, HARNESS_RULES, type ToolName } from "@/lib/ai/tools/toolDefinitions";
import { ToolExecutor } from "@/lib/ai/tools/toolExecutor";
import { runItineraryLoop } from "@/lib/ai/loops/itineraryLoop";
import prisma from "@/lib/db/prisma";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface AIResponse {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  destinationContext?: string;
  itinerary?: unknown; // structured itinerary when intent = "itinerary"
  loopIterations?: number;
  error?: string;
}

const SYSTEM_PROMPT_BASE = `You are Explore India AI — a knowledgeable, grounded travel assistant for India.

You have access to a database of tourism destinations and spots. You can call tools to retrieve information.

RULES (enforced):
1. Never invent ratings, review counts, coordinates, or factual data.
2. If information is unavailable, say so — do not hallucinate.
3. Use tools to retrieve specific information before answering.
4. If unsure, ask for clarification rather than guessing.
5. Keep responses concise, practical, and travel-focused.
6. Always cite the source (database, visitor reviews, etc.) when giving specific facts.`;

/**
 * Main AI orchestrator.
 * Context Engineering → Harness → (Loop if itinerary) → Response
 */
export async function askTravelAssistant(
  question: string,
  destinationSlug?: string,
  spotId?: number
): Promise<AIResponse> {
  if (!openai) {
    return {
      answer:
        "The AI Travel Assistant is not configured. Please add your OPENAI_API_KEY to .env.local to enable this feature.",
      sources: [],
      error: "OPENAI_API_KEY not configured",
    };
  }

  const userContext = parseUserContext(question, destinationSlug);

  console.log(`[AIOrchestrator] intent=${userContext.intent}, destination=${destinationSlug}, spot=${spotId}`);

  try {
    // ── Step 1: Build Context Package ─────────────────────────────────────────
    const contextPackage = await buildContextPackage(question, destinationSlug, spotId);

    // ── Step 2: Route to appropriate handler ──────────────────────────────────
    if (userContext.intent === "itinerary" && destinationSlug && contextPackage.destination) {
      return handleItineraryRequest(question, contextPackage, destinationSlug, contextPackage.destination.name);
    }

    return handleGeneralQuestion(question, contextPackage);
  } catch (error) {
    console.error("[AIOrchestrator] Error:", error);
    return {
      answer: "The AI Travel Assistant is temporarily unavailable. Please try again later.",
      sources: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle itinerary requests using Loop Engineering.
 */
async function handleItineraryRequest(
  question: string,
  contextPackage: ReturnType<typeof buildContextPackage> extends Promise<infer T> ? T : never,
  destinationSlug: string,
  destinationName: string
): Promise<AIResponse> {
  console.log(`[AIOrchestrator] Running itinerary loop for ${destinationName}`);

  const loopResult = await runItineraryLoop(contextPackage, destinationSlug, destinationName);

  if (loopResult.error && !loopResult.plan) {
    return {
      answer: `I couldn't generate an itinerary: ${loopResult.error}`,
      sources: [],
      error: loopResult.error,
    };
  }

  if (!loopResult.plan) {
    return {
      answer:
        `I wasn't able to generate a complete itinerary for ${destinationName} based on the available information. ` +
        `Please try a more specific request or check if spots have been added to the database.`,
      sources: [],
      itinerary: null,
      loopIterations: loopResult.iterations,
    };
  }

  // Generate a human-readable summary of the itinerary
  const summary = formatItinerarySummary(loopResult.plan);

  return {
    answer: summary,
    sources: contextPackage.sources
      .filter((s) => s.url)
      .map((s) => ({ title: s.name, url: s.url! })),
    destinationContext: destinationName,
    itinerary: loopResult.plan,
    loopIterations: loopResult.iterations,
  };
}

/**
 * Handle general questions using Context Engineering + Harness tools.
 */
async function handleGeneralQuestion(
  question: string,
  contextPackage: ReturnType<typeof buildContextPackage> extends Promise<infer T> ? T : never
): Promise<AIResponse> {
  const executor = new ToolExecutor();
  const tools = getOpenAITools();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT_BASE },
    {
      role: "user",
      content: contextPackage.promptText
        ? `${contextPackage.promptText}\n\nUser question: ${question}`
        : question,
    },
  ];

  let toolCallCount = 0;
  let finalAnswer = "";

  // Agentic loop with tool calls
  while (toolCallCount < HARNESS_RULES.MAX_TOOL_CALLS_PER_REQUEST) {
    const completion = await openai!.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: "auto",
      max_tokens: 1200,
      temperature: 0.5,
    });

    const choice = completion.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (choice.finish_reason === "stop" || !msg.tool_calls || msg.tool_calls.length === 0) {
      finalAnswer = msg.content || "";
      break;
    }

    // Execute tool calls
    for (const toolCall of msg.tool_calls) {
      toolCallCount++;
      // OpenAI tool calls always have a function property at runtime
      const tc = toolCall as unknown as { function: { name: string; arguments: string }; id: string };
      const toolName = tc.function.name as ToolName;
      let args: Record<string, unknown> = {};

      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      console.log(`[AIOrchestrator] Tool call: ${toolName}`);
      const result = await executor.execute(toolName, args);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(
          result.success ? result.data : { error: result.error }
        ),
      });
    }
  }

  if (!finalAnswer) {
    finalAnswer = "I wasn't able to generate a complete response. Please try rephrasing your question.";
  }

  return {
    answer: finalAnswer,
    sources: contextPackage.sources
      .filter((s) => s.url)
      .map((s) => ({ title: s.name, url: s.url! })),
    destinationContext: contextPackage.destination?.name,
  };
}

function formatItinerarySummary(plan: ItineraryPlan): string {
  const lines = [`Here's your ${plan.duration_days}-day itinerary for ${plan.destination}:\n`];

  for (const day of plan.itinerary) {
    lines.push(`**Day ${day.day}**`);
    for (const item of day.items) {
      lines.push(`  ${item.start_time} — ${item.name} (${item.duration_minutes} min)`);
      if (item.reason) lines.push(`    ↳ ${item.reason}`);
    }
    if (day.summary) lines.push(`  *${day.summary}*`);
    lines.push("");
  }

  if (plan.notes && plan.notes.length > 0) {
    lines.push("**Notes:**");
    plan.notes.forEach((n: string) => lines.push(`• ${n}`));
  }

  return lines.join("\n");
}

/**
 * Generate an AI summary for a destination — cached as a DestinationFact.
 * Preserved from original implementation for backward compatibility.
 */
export async function generateDestinationSummary(
  destinationId: number,
  destinationName: string,
): Promise<string | null> {
  if (!openai) return null;

  const existing = await prisma.destinationFact.findFirst({
    where: {
      destinationId,
      factType: "ai_summary",
      fetchedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  if (existing) return existing.content;

  try {
    const contextPackage = await buildContextPackage(
      `Give a 2-sentence travel summary for ${destinationName}`,
      destinationName.toLowerCase().replace(/\s+/g, "-")
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a travel writer creating concise destination summaries. Never invent facts.",
        },
        {
          role: "user",
          content: `Write a 2-3 sentence travel summary for ${destinationName} in Karnataka, India.\n\n${contextPackage.promptText}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const summary = completion.choices[0]?.message?.content || "";

    if (summary) {
      await prisma.destinationFact.create({
        data: {
          destinationId,
          factType: "ai_summary",
          title: `AI Travel Summary for ${destinationName}`,
          content: summary,
          source: "openai",
          fetchedAt: new Date(),
        },
      });
    }

    return summary;
  } catch (error) {
    console.error("[AIOrchestrator] Failed to generate summary:", error);
    return null;
  }
}
