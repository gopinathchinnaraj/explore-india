// SerpApi base client
// All API calls are server-side only — NEVER import this in client components
// The API key is read from environment variables and never exposed to the browser

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_BASE_URL = "https://serpapi.com/search.json";

export class SerpApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public serpApiError?: string
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

export interface SerpApiRequestParams {
  engine: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Makes a server-side request to SerpApi.
 * Never call this from client components.
 */
export async function serpApiRequest<T = unknown>(
  params: SerpApiRequestParams
): Promise<T> {
  if (!SERPAPI_API_KEY) {
    throw new SerpApiError(
      "SERPAPI_API_KEY is not configured. Please add it to your .env.local file."
    );
  }

  const searchParams = new URLSearchParams({
    api_key: SERPAPI_API_KEY,
    ...Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ),
  });

  const url = `${SERPAPI_BASE_URL}?${searchParams.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ExploreIndia/1.0",
      },
      // Next.js fetch cache — revalidate every hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new SerpApiError("SerpApi rate limit reached. Please try again later.", 429);
      }
      if (response.status === 401) {
        throw new SerpApiError("Invalid SerpApi API key.", 401);
      }
      throw new SerpApiError(
        `SerpApi request failed: ${response.statusText}`,
        response.status
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new SerpApiError(`SerpApi error: ${data.error}`, undefined, data.error);
    }

    return data as T;
  } catch (error) {
    if (error instanceof SerpApiError) {
      throw error;
    }
    throw new SerpApiError(
      `Failed to connect to SerpApi: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if SerpApi is configured
 */
export function isSerpApiConfigured(): boolean {
  return Boolean(SERPAPI_API_KEY);
}
