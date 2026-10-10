// Harness Engineering — Tool Executor
// Executes validated tool calls. The AI never has direct DB or API access.
// All tool results are sanitized before returning to the AI.
// Server-side only.

import { validateToolArgs, HARNESS_RULES, type ToolName } from "./toolDefinitions";
import { getDestinations, searchDestinations } from "@/lib/services/destinationService";
import { searchSpots, getSpotBySlug, getNearbySpots } from "@/lib/services/spotService";
import { getSpotReviews } from "@/lib/services/spotReviewService";
import { getSpotVideos } from "@/lib/services/spotVideoService";
import { googleSearch } from "@/lib/serpapi/search";
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

      case "search_fresh_information":
        return this.searchFreshInfo(args);

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
    const destinationName = String(args.destination);
    const category = typeof args.category === "string" ? args.category : undefined;
    const limit = typeof args.limit === "number" ? args.limit : 10;

    // Find destination by name or slug
    const destination = await prisma.destination.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { contains: destinationName, mode: "insensitive" } },
          { slug: { contains: destinationName.toLowerCase().replace(/\s+/g, "-"), mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    });

    if (!destination) {
      return { message: `No destination found matching "${destinationName}"`, spots: [] };
    }

    const spots = await searchSpots("", {
      destinationId: destination.id,
      categorySlug: category ? category.toLowerCase().replace(/\s+/g, "-") : undefined,
      limit,
    });

    return {
      destination: destination.name,
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

    const result = await getSpotReviews(spotId, { sort, limit });
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

    const spot = await prisma.spot.findUnique({
      where: { id: spotId },
      select: { name: true, destination: { select: { name: true } } },
    });

    if (!spot) return { error: "Spot not found" };

    const result = await getSpotVideos(spotId, spot.name, spot.destination.name, { limit });
    return result.videos.map((v) => ({
      title: v.title,
      channel: v.channelName,
      contentType: v.contentType,
      url: v.videoUrl,
      viewCount: v.viewCount,
    }));
  }

  private async searchFreshInfo(args: Record<string, unknown>) {
    if (!HARNESS_RULES.ALLOW_FRESH_SEARCH) {
      return { message: "Live search is currently disabled" };
    }

    const query = String(args.query);

    // Rule: maximum query length
    if (query.length > HARNESS_RULES.MAX_QUERY_LENGTH) {
      throw new Error(`Query too long (max ${HARNESS_RULES.MAX_QUERY_LENGTH} chars)`);
    }

    console.log(`[ToolExecutor] Fresh search: "${query}"`);
    const result = await googleSearch(query);

    return {
      query,
      answerBox: result.answerBox?.snippet || null,
      results: result.results.slice(0, 5).map((r) => ({
        title: r.title,
        snippet: r.snippet,
        url: r.url,
      })),
    };
  }
}
