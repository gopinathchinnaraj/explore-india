// Harness Engineering — Tool Executor
// Executes validated tool calls. The AI never has direct DB or API access.
// All tool results are sanitized before returning to the AI.
// Server-side only.

import { validateToolArgs, HARNESS_RULES, type ToolName } from "./toolDefinitions";
import { getDestinations, searchDestinations } from "@/lib/services/destinationService";
import { searchSpots, getSpotBySlug, getNearbySpots } from "@/lib/services/spotService";
// Database-only readers: visitors' questions must never spend SerpApi credits.
// Fresh data reaches the database only through the admin sync pipeline.
import { getPublicSpotReviews, getPublicSpotVideos } from "@/lib/services/publicReadService";
import prisma from "@/lib/db/prisma";

export interface ToolCallResult {
  toolName: ToolName;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Track tool calls per request to enforce MAX_TOOL_CALLS_PER_REQUEST
export class ToolExecutor {
  private callCount = 0;

  async execute(
    toolName: ToolName,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    // Rule: limit tool calls
    if (this.callCount >= HARNESS_RULES.MAX_TOOL_CALLS_PER_REQUEST) {
      return {
        toolName,
        success: false,
        error: `Maximum tool calls (${HARNESS_RULES.MAX_TOOL_CALLS_PER_REQUEST}) reached for this request`,
      };
    }

    // Validate arguments
    const validation = validateToolArgs(toolName, args);
    if (!validation.valid) {
      return { toolName, success: false, error: validation.error };
    }

    this.callCount++;
    console.log(`[ToolExecutor] Executing tool: ${toolName} (call ${this.callCount}/${HARNESS_RULES.MAX_TOOL_CALLS_PER_REQUEST})`);

    try {
      const data = await this.dispatch(toolName, args);
      return { toolName, success: true, data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ToolExecutor] Tool ${toolName} failed:`, msg);
      return { toolName, success: false, error: msg };
    }
  }

  private async dispatch(toolName: ToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case "search_destinations":
        return this.searchDestinations(args);

      case "search_spots":
        return this.searchSpots(args);

      case "get_spot_details":
        return this.getSpotDetails(args);

      case "get_nearby_spots":
        return this.getNearbySpots(args);

      case "get_reviews":
        return this.getReviews(args);

      case "get_videos":
        return this.getVideos(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async searchDestinations(args: Record<string, unknown>) {
    const query = String(args.query);
    const limit = typeof args.limit === "number" ? args.limit : 10;
    const results = await searchDestinations(query);
    return results.slice(0, limit).map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      rating: d.rating,
      reviewCount: d.reviewCount,
      categories: d.categories.map((c) => c.name),
      address: d.address,
    }));
  }

  private async searchSpots(args: Record<string, unknown>) {
    const place = typeof args.destination === "string" ? args.destination.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const category = typeof args.category === "string" ? args.category : undefined;
    const limit = typeof args.limit === "number" ? args.limit : 10;

    const categorySlug = category ? category.toLowerCase().replace(/\s+/g, "-") : undefined;

    // Resolve the area. An exact state ("Karnataka", "Goa") searches the whole state.
    // Anything else ("Hampi", "Agra") is a loose area match on destination name, spot
    // name and address — spots of one town are often spread over several destinations.
    // A partial state name ("Tamil") is the last resort.
    let scopeName: string | null = null;
    let spots: Awaited<ReturnType<typeof searchSpots>> = [];
    if (place) {
      const exactState = await prisma.state.findFirst({
        where: {
          isActive: true,
          OR: [{ name: { equals: place, mode: "insensitive" } }, { slug: place.toLowerCase().replace(/\s+/g, "-") }],
        },
        select: { id: true, name: true },
      });
      if (exactState) {
        scopeName = exactState.name;
        spots = await searchSpots(query, { stateId: exactState.id, categorySlug, limit });
      } else {
        scopeName = place;
        spots = await searchSpots(query, { area: place, categorySlug, limit });
        if (spots.length === 0) {
          const partialState = await prisma.state.findFirst({
            where: { isActive: true, name: { contains: place, mode: "insensitive" } },
            select: { id: true, name: true },
          });
          if (partialState) {
            scopeName = partialState.name;
            spots = await searchSpots(query, { stateId: partialState.id, categorySlug, limit });
          }
        }
      }
    } else {
      spots = await searchSpots(query, { categorySlug, limit });
    }

    if (spots.length === 0) {
      return {
        message: `No stored spots matched${scopeName ? ` in ${scopeName}` : ""}${query ? ` for "${query}"` : ""}${category ? ` in category ${category}` : ""}.`,
        spots: [],
      };
    }

    return {
      destination: scopeName,
      spots: spots.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        rating: s.rating,
        reviewCount: s.reviewCount,
        categories: s.categories.map((c) => c.name),
        latitude: s.latitude,
        longitude: s.longitude,
      })),
    };
  }

  private async getSpotDetails(args: Record<string, unknown>) {
    const slug = String(args.slug);
    const spot = await getSpotBySlug(slug);
    if (!spot) return { error: `Spot "${slug}" not found` };

    return {
      id: spot.id,
      name: spot.name,
      description: spot.description,
      rating: spot.rating,
      reviewCount: spot.reviewCount,
      address: spot.address,
      categories: spot.categories.map((c) => c.name),
      latitude: spot.latitude,
      longitude: spot.longitude,
      destination: spot.destination.name,
    };
  }

  private async getNearbySpots(args: Record<string, unknown>) {
    const spotId = Number(args.spot_id);
    const radiusKm = typeof args.radius_km === "number" ? args.radius_km : 10;
    const limit = typeof args.limit === "number" ? args.limit : 8;

    const nearby = await getNearbySpots(spotId, { radiusKm, limit });
    return nearby.map((n) => ({
      id: n.id,
      name: n.name,
      slug: n.slug,
      distanceKm: n.distanceKm,
      rating: n.rating,
      categories: n.categories.map((c) => c.name),
    }));
  }

  private async getReviews(args: Record<string, unknown>) {
    const spotId = Number(args.spot_id);
    const sort = (args.sort as "relevant" | "newest" | "highest" | "lowest") || "relevant";
    const limit = typeof args.limit === "number" ? args.limit : 8;

    const result = await getPublicSpotReviews(spotId, sort, limit);
    // Return only what the AI needs — not raw DB records
    return result.reviews.map((r) => ({
      authorName: r.authorName,
      rating: r.rating,
      text: r.reviewText?.slice(0, 300),
      publishedAt: r.publishedAt,
    }));
  }

  private async getVideos(args: Record<string, unknown>) {
    const spotId = Number(args.spot_id);
    const limit = typeof args.limit === "number" ? args.limit : 6;

    const result = await getPublicSpotVideos(spotId, limit);
    return result.videos.map((v) => ({
      title: v.title,
      channel: v.channelName,
      contentType: v.contentType,
      url: v.videoUrl,
      viewCount: v.viewCount,
    }));
  }

}
