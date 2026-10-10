// POST /api/ai/itinerary
// Loop Engineering endpoint — generates a validated itinerary via the AI loop
// Server-side only — OpenAI key never exposed to browser

import { NextRequest, NextResponse } from "next/server";
import { buildContextPackage } from "@/lib/ai/context/contextBuilder";
import { runItineraryLoop } from "@/lib/ai/loops/itineraryLoop";
import prisma from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, destinationSlug } = body;

    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return NextResponse.json({ error: "Please provide a valid question (at least 3 characters)" }, { status: 400 });
    }

    if (question.length > 500) {
      return NextResponse.json({ error: "Question is too long (max 500 characters)" }, { status: 400 });
    }

    if (!destinationSlug || typeof destinationSlug !== "string") {
      return NextResponse.json({ error: "destinationSlug is required for itinerary generation" }, { status: 400 });
    }

    // Resolve destination
    const destination = await prisma.destination.findUnique({
      where: { slug: destinationSlug },
      select: { id: true, name: true, slug: true },
    });

    if (!destination) {
      return NextResponse.json({ error: `Destination "${destinationSlug}" not found` }, { status: 404 });
    }

    // Build context package
    const contextPackage = await buildContextPackage(
      question.trim(),
      destinationSlug
    );

    // Run itinerary loop
    const loopResult = await runItineraryLoop(
      contextPackage,
      destinationSlug,
      destination.name
    );

    return NextResponse.json({
      destination: destination.name,
      plan: loopResult.plan,
      iterations: loopResult.iterations,
      validationHistory: loopResult.validationHistory,
      finalStatus: loopResult.finalState.status,
      error: loopResult.error,
    });
  } catch (error) {
    console.error("POST /api/ai/itinerary error:", error);
    return NextResponse.json(
      { error: "Itinerary generation failed. Please try again." },
      { status: 500 }
    );
  }
}
