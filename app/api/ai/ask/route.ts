// POST /api/ai/ask
// AI travel assistant endpoint - server-side only
// NEVER expose OpenAI key to browser

import { NextRequest, NextResponse } from "next/server";
import { askTravelAssistant } from "@/lib/ai/travelAssistant";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, destinationSlug } = body;

    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return NextResponse.json(
        { error: "Please provide a valid question (at least 3 characters)" },
        { status: 400 }
      );
    }

    if (question.length > 500) {
      return NextResponse.json(
        { error: "Question is too long (max 500 characters)" },
        { status: 400 }
      );
    }

    const result = await askTravelAssistant(
      question.trim(),
      destinationSlug || undefined
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ai/ask error:", error);
    return NextResponse.json(
      {
        answer: "The AI assistant is temporarily unavailable. Please try again later.",
        sources: [],
        error: "Service unavailable",
      },
      { status: 500 }
    );
  }
}
