// SerpApi Google Maps integration
// Used for destination discovery and place details
// Server-side only - NEVER import in client components

import { serpApiRequest, SerpApiError } from "./client";

export interface MapsLocalResult {
  position: number;
  title: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  reviews_link?: string;
  photos_link?: string;
  gps_coordinates?: {
    latitude: number;
    longitude: number;
  };
  place_id_search?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  type?: string;
  types?: string[];
  address?: string;
  open_now?: boolean;
  phone?: string;
  website?: string;
  description?: string;
  thumbnail?: string;
  operating_hours?: Record<string, string>;
}

export interface MapsLocalResponse {
  local_results?: MapsLocalResult[];
  search_metadata?: {
    id: string;
    status: string;
    created_at: string;
  };
  error?: string;
}

export interface NormalizedPlace {
  name: string;
  placeId: string | null;
  dataId: string | null;
  dataCid: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  thumbnailUrl: string | null;
  type: string | null;
  types: string[];
  description: string | null;
  reviewsLink: string | null;
  photosLink: string | null;
}

/** Map a raw SerpApi local result to our normalized shape. */
export function normalizeLocalResult(result: MapsLocalResult): NormalizedPlace {
  return {
    name: result.title,
    placeId: result.place_id || null,
    dataId: result.data_id || null,
    dataCid: result.data_cid || null,
    latitude: result.gps_coordinates?.latitude ?? null,
    longitude: result.gps_coordinates?.longitude ?? null,
    address: result.address || null,
    rating: result.rating ?? null,
    reviewCount: result.reviews ?? null,
    thumbnailUrl: result.thumbnail || null,
    type: result.type || null,
    types: result.types || [],
    description: result.description || null,
    reviewsLink: result.reviews_link || null,
    photosLink: result.photos_link || null,
  };
}

/**
 * Raw Google Maps search. `ll` biases results to a location ("@lat,lng,zoomz").
 */
export async function searchGoogleMapsRaw(
  query: string,
  options: { ll?: string; hl?: string; gl?: string; start?: number } = {}
): Promise<MapsLocalResponse> {
  return serpApiRequest<MapsLocalResponse>({
    engine: "google_maps",
    q: query,
    type: "search",
    hl: options.hl || "en",
    gl: options.gl || "in",
    ...(options.ll && { ll: options.ll }),
    ...(options.start && { start: options.start }),
  });
}

/**
 * Search for places on Google Maps via SerpApi
 * Used to discover tourism destinations
 */
export async function searchGoogleMapsLocal(
  query: string,
  options: {
    location?: string;
    ll?: string;
    hl?: string;
    gl?: string;
    limit?: number;
  } = {}
): Promise<NormalizedPlace[]> {
  const response = await serpApiRequest<MapsLocalResponse>({
    engine: "google_maps",
    q: query,
    type: "search",
    hl: options.hl || "en",
    gl: options.gl || "in",
    ...(options.location && { location: options.location }),
    ...(options.ll && { ll: options.ll }),
  });

  const results = response.local_results || [];
  return results.slice(0, options.limit || 20).map(normalizeLocalResult);
}

interface MapsPlaceResponse {
  place_results?: MapsLocalResult & { images?: Array<{ title?: string; thumbnail?: string }> };
  error?: string;
}

/**
 * Fetch current details for a single known place (rating, review count, address, description).
 */
export async function fetchPlaceDetails(target: {
  placeId?: string | null;
  dataId?: string | null;
  latitude?: number;
  longitude?: number;
}): Promise<NormalizedPlace | null> {
  let params: { engine: string; [key: string]: string | number | boolean | undefined };
  if (target.placeId) {
    params = { engine: "google_maps", type: "place", place_id: target.placeId, hl: "en" };
  } else if (target.dataId && target.latitude !== undefined && target.longitude !== undefined) {
    params = {
      engine: "google_maps",
      type: "place",
      data: `!4m5!3m4!1s${target.dataId}!8m2!3d${target.latitude}!4d${target.longitude}`,
      hl: "en",
    };
  } else {
    return null;
  }
  const response = await serpApiRequest<MapsPlaceResponse>(params);
  return response.place_results ? normalizeLocalResult(response.place_results) : null;
}

export interface MapsReviewItem {
  position?: number;
  link?: string;
  rating?: number;
  date?: string;
  iso_date?: string;
  iso_date_of_last_edit?: string;
  images?: string[];
  source?: string;
  review_id?: string;
  user?: {
    name?: string;
    link?: string;
    thumbnail?: string;
    contributor_id?: string;
    local_guide?: boolean;
    reviews?: number;
    photos?: number;
  };
  snippet?: string;
  extracted_snippet?: {
    original?: string;
    translated?: string;
  };
  details?: Record<string, unknown>;
  likes?: number;
}

export interface MapsReviewsResponse {
  search_metadata?: {
    id?: string;
    status?: string;
  };
  place_info?: {
    title?: string;
    rating?: number;
    reviews?: number;
    type?: string;
    address?: string;
  };
  topics?: Array<{
    keyword?: string;
    mentions?: number;
    id?: string;
  }>;
  reviews?: MapsReviewItem[];
  serpapi_pagination?: {
    next?: string;
    next_page_token?: string;
  };
  error?: string;
}

export interface NormalizedReview {
  externalReviewId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorProfileUrl: string | null;
  rating: number | null;
  reviewText: string | null;
  publishedAt: Date | null;
  publishedLabel: string | null;
  reviewUrl: string | null;
  images: string[];
  likes: number;
  source: string;
}

/**
 * Safely parse date information from Google Maps review
 */
function parseReviewDate(isoDate?: string, relativeDate?: string): {
  publishedAt: Date | null;
  publishedLabel: string | null;
} {
  const label = relativeDate?.trim() || null;
  if (isoDate) {
    const d = new Date(isoDate.trim());
    if (!Number.isNaN(d.getTime())) {
      return { publishedAt: d, publishedLabel: label || isoDate };
    }
  }
  if (relativeDate && !/ago/i.test(relativeDate)) {
    const d = new Date(relativeDate.trim());
    if (!Number.isNaN(d.getTime())) {
      return { publishedAt: d, publishedLabel: label };
    }
  }
  return { publishedAt: null, publishedLabel: label };
}

/**
 * Fetch reviews for a place using Google Maps via SerpApi.
 * Accepts either a dataId string or an options object with dataId/placeId.
 */
export async function fetchPlaceReviews(
  target: string | { dataId?: string; placeId?: string },
  options: {
    hl?: string;
    limit?: number;
    sortBy?: "qualityScore" | "newestFirst" | "highestRating" | "lowestRating";
  } = {}
): Promise<{
  reviews: NormalizedReview[];
  placeInfo?: MapsReviewsResponse["place_info"];
  topics?: Array<{ keyword?: string; mentions?: number; id?: string }>;
  nextPageToken?: string;
}> {
  const dataId = typeof target === "string" ? target : target.dataId;
  const placeId = typeof target === "string" ? undefined : target.placeId;

  if (!dataId && !placeId) {
    return { reviews: [] };
  }

  const requestedLimit = options.limit || 15;

  try {
    const params: { engine: string; [key: string]: string | number | boolean | undefined } = {
      engine: "google_maps_reviews",
      hl: options.hl || "en",
      ...(dataId ? { data_id: dataId } : { place_id: placeId }),
      ...(options.sortBy && { sort_by: options.sortBy }),
    };

    const response = await serpApiRequest<MapsReviewsResponse>(params);
    let rawReviews = response.reviews || [];
    let nextToken = response.serpapi_pagination?.next_page_token;

    // If more reviews requested than page 1 (which returns ~8), fetch page 2
    if (requestedLimit > 10 && nextToken && rawReviews.length < requestedLimit) {
      try {
        const page2Response = await serpApiRequest<MapsReviewsResponse>({
          ...params,
          engine: "google_maps_reviews",
          next_page_token: nextToken,
        });
        if (page2Response.reviews?.length) {
          rawReviews = [...rawReviews, ...page2Response.reviews];
          nextToken = page2Response.serpapi_pagination?.next_page_token;
        }
      } catch (pageErr) {
        console.warn("[Maps] Optional page 2 review fetch error:", pageErr);
      }
    }

    const reviews = rawReviews.slice(0, requestedLimit).map((review): NormalizedReview => {
      const { publishedAt, publishedLabel } = parseReviewDate(
        review.iso_date,
        review.date
      );
      const text =
        review.extracted_snippet?.original ||
        review.snippet ||
        null;

      const userObj = review.user as Record<string, unknown> | undefined;
      const authorAvatarUrl =
        (typeof userObj?.thumbnail === "string" ? userObj.thumbnail : null) ||
        (typeof userObj?.photo === "string" ? userObj.photo : null) ||
        (typeof userObj?.image === "string" ? userObj.image : null) ||
        (typeof userObj?.avatar === "string" ? userObj.avatar : null) ||
        null;

      return {
        externalReviewId: review.review_id || null,
        authorName: review.user?.name?.trim() || null,
        authorAvatarUrl,
        authorProfileUrl: review.user?.link || null,
        rating: typeof review.rating === "number" ? review.rating : null,
        reviewText: text ? text.trim() : null,
        publishedAt,
        publishedLabel,
        reviewUrl: review.link || review.user?.link || null,
        images: Array.isArray(review.images) ? review.images : [],
        likes: typeof review.likes === "number" ? review.likes : 0,
        source: "google_maps",
      };
    });

    return {
      reviews,
      placeInfo: response.place_info,
      topics: response.topics,
      nextPageToken: nextToken,
    };
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    throw new SerpApiError(
      `Failed to fetch reviews: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }
}

