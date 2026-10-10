// SerpApi Google Maps Photos integration
// Used to find authentic traveler photos for destinations
// Server-side only - NEVER import in client components

import { serpApiRequest, SerpApiError } from "./client";

export interface SerpApiPhotoItem {
  thumbnail?: string;
  image?: string;
  user?: {
    link?: string;
    user_id?: string;
    name?: string;
  };
  photo_meta_serpapi_link?: string;
}

export interface SerpApiPhotoCategory {
  title?: string;
  id?: string;
}

export interface GoogleMapsPhotosResponse {
  search_metadata?: {
    id?: string;
    status?: string;
  };
  search_parameters?: {
    engine?: string;
    data_id?: string;
  };
  categories?: SerpApiPhotoCategory[];
  photos?: SerpApiPhotoItem[];
  serpapi_pagination?: {
    next?: string;
    next_page_token?: string;
  };
  error?: string;
}

export interface NormalizedPhoto {
  imageUrl: string;
  thumbnailUrl: string;
  authorName: string | null;
  authorProfileUrl: string | null;
  authorId: string | null;
  photoMetaLink: string | null;
  source: string;
}

/**
 * Fetch customer photos for a Google Maps place via SerpApi
 */
export async function fetchPlacePhotos(
  dataId: string,
  options: {
    limit?: number;
    categoryId?: string;
    hl?: string;
  } = {}
): Promise<{
  photos: NormalizedPhoto[];
  categories: Array<{ id: string; title: string }>;
  nextPageToken?: string;
}> {
  if (!dataId) {
    return { photos: [], categories: [] };
  }

  const requestedLimit = options.limit || 24;

  try {
    const params: { engine: string; [key: string]: string | number | boolean | undefined } = {
      engine: "google_maps_photos",
      data_id: dataId,
      hl: options.hl || "en",
      ...(options.categoryId && { category_id: options.categoryId }),
    };

    const response = await serpApiRequest<GoogleMapsPhotosResponse>(params);
    let rawPhotos = response.photos || [];
    let nextToken = response.serpapi_pagination?.next_page_token;

    // If more than 20 photos requested and page 2 is available, fetch page 2
    if (requestedLimit > 20 && nextToken && rawPhotos.length < requestedLimit) {
      try {
        const page2Response = await serpApiRequest<GoogleMapsPhotosResponse>({
          ...params,
          next_page_token: nextToken,
        });
        if (page2Response.photos?.length) {
          rawPhotos = [...rawPhotos, ...page2Response.photos];
          nextToken = page2Response.serpapi_pagination?.next_page_token;
        }
      } catch (pageErr) {
        console.warn("[Photos] Optional page 2 fetch error:", pageErr);
      }
    }

    const categories = (response.categories || [])
      .filter((c): c is { id: string; title: string } => Boolean(c.id && c.title))
      .map((c) => ({ id: c.id!, title: c.title! }));

    // Normalize photos
    const normalized: NormalizedPhoto[] = [];
    const seenUrls = new Set<string>();

    for (const p of rawPhotos) {
      const imageUrl = p.image || p.thumbnail;
      if (!imageUrl || seenUrls.has(imageUrl)) continue;
      seenUrls.add(imageUrl);

      const thumbnailUrl = p.thumbnail || p.image || imageUrl;

      normalized.push({
        imageUrl,
        thumbnailUrl,
        authorName: p.user?.name?.trim() || null,
        authorProfileUrl: p.user?.link || null,
        authorId: p.user?.user_id || null,
        photoMetaLink: p.photo_meta_serpapi_link || null,
        source: "google_maps",
      });

      if (normalized.length >= requestedLimit) break;
    }

    return {
      photos: normalized,
      categories,
      nextPageToken: nextToken,
    };
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    throw new SerpApiError(
      `Failed to fetch photos: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }
}
