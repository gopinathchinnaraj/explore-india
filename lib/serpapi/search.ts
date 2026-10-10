// SerpApi Google Search integration
// Used to gather travel context for the AI assistant
// Server-side only - NEVER import in client components

import { serpApiRequest, SerpApiError } from "./client";

export interface GoogleSearchResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  displayed_link?: string;
  thumbnail?: string;
}

export interface GoogleSearchResponse {
  organic_results?: GoogleSearchResult[];
  answer_box?: {
    type?: string;
    title?: string;
    answer?: string;
    snippet?: string;
    snippet_highlighted_words?: string[];
    link?: string;
    displayed_link?: string;
  };
  knowledge_graph?: {
    title?: string;
    type?: string;
    description?: string;
    source?: {
      name?: string;
      link?: string;
    };
  };
  error?: string;
}

export interface NormalizedSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface SearchContext {
  query: string;
  results: NormalizedSearchResult[];
  answerBox: GoogleSearchResponse["answer_box"] | null;
  knowledgeGraph: GoogleSearchResponse["knowledge_graph"] | null;
}

/**
 * Search Google for travel information about a destination
 * Results are used as context for the AI travel assistant
 */
export async function searchTravelContext(
  destinationName: string,
  topic: "best_time" | "things_to_do" | "travel_tips" | "nearby_places" | "general"
): Promise<SearchContext> {
  const queryMap: Record<string, string> = {
    best_time: `best time to visit ${destinationName} India`,
    things_to_do: `things to do in ${destinationName} tourist attractions`,
    travel_tips: `${destinationName} travel guide tips`,
    nearby_places: `places near ${destinationName} India tourism`,
    general: `${destinationName} India travel information`,
  };

  const query = queryMap[topic] || queryMap.general;

  try {
    const response = await serpApiRequest<GoogleSearchResponse>({
      engine: "google",
      q: query,
      gl: "in",
      hl: "en",
      num: 5,
    });

    const results = (response.organic_results || [])
      .slice(0, 5)
      .map((result): NormalizedSearchResult => ({
        title: result.title,
        url: result.link,
        snippet: result.snippet,
        position: result.position,
      }));

    return {
      query,
      results,
      answerBox: response.answer_box || null,
      knowledgeGraph: response.knowledge_graph || null,
    };
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    throw new SerpApiError(
      `Failed to search Google: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }
}

/**
 * General Google search - used for AI assistant queries
 */
export async function googleSearch(query: string): Promise<SearchContext> {
  try {
    const response = await serpApiRequest<GoogleSearchResponse>({
      engine: "google",
      q: query,
      gl: "in",
      hl: "en",
      num: 8,
    });

    const results = (response.organic_results || [])
      .slice(0, 8)
      .map((result): NormalizedSearchResult => ({
        title: result.title,
        url: result.link,
        snippet: result.snippet,
        position: result.position,
      }));

    return {
      query,
      results,
      answerBox: response.answer_box || null,
      knowledgeGraph: response.knowledge_graph || null,
    };
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    throw new SerpApiError(
      `Failed to search: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }
}
