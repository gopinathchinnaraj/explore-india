// Spot types for GoSomewhere
// Spots are individual tourism attractions inside a Destination

export interface SpotSummary {
  id: number;
  destinationId: number;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  coverImageUrl: string | null;
  discoveryScore: number | null;
  isVerified: boolean;
  categories: SpotCategoryInfo[];
}

export interface Spot extends SpotSummary {
  description: string | null;
  discoverySource: string;
  isActive?: boolean;
  status?: string;
  lastSyncedAt: string | null;
  lastDetailsSyncAt?: string | Date | null;
  lastReviewsSyncAt?: string | Date | null;
  lastVideosSyncAt?: string | Date | null;
  lastPhotosSyncAt?: string | Date | null;
  lastNearbySyncAt?: string | Date | null;
  createdAt: string;
  updatedAt: string;
  destination: {
    id: number;
    name: string;
    slug: string;
  };
}

export interface SpotCategoryInfo {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
}

export interface SpotReview {
  id: number;
  spotId: number;
  source: string;
  externalReviewId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  rating: number | null;
  reviewText: string | null;
  publishedAt: string | null;
  reviewUrl: string | null;
  fetchedAt: string;
}

export interface SpotVideo {
  id: number;
  spotId: number;
  provider: string;
  videoId: string;
  title: string;
  description: string | null;
  channelName: string | null;
  channelId: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  publishedAt: string | null;
  videoUrl: string;
  contentType: string;
  relevanceScore: number | null;
  fetchedAt: string;
}

export interface NearbySpot extends SpotSummary {
  distanceKm: number;
  distanceMeters: number;
  relationshipType: string;
}

export type VideoContentType =
  | "TRAVEL_GUIDE"
  | "DOCUMENTARY"
  | "HISTORY"
  | "VLOG"
  | "WALKING_TOUR"
  | "SHORT"
  | "OTHER";

export type ReviewSortOrder = "relevant" | "newest" | "highest" | "lowest";

export interface SpotPhoto {
  id: number;
  spotId: number;
  provider: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  sourceUrl: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface SpotEnrichmentStatus {
  photos: "COMPLETED" | "FAILED" | "SKIPPED";
  reviews: "COMPLETED" | "FAILED" | "SKIPPED";
  videos: "COMPLETED" | "FAILED" | "SKIPPED";
  errors: {
    photos?: string;
    reviews?: string;
    videos?: string;
  };
}

export interface CompleteSpot extends Spot {
  images: SpotPhoto[];
  reviews: SpotReview[];
  videos: SpotVideo[];
  externalPlaces?: Array<{
    id: number;
    provider: string;
    externalPlaceId: string | null;
    externalDataId: string | null;
    externalCid: string | null;
    externalUrl: string | null;
    rawName: string | null;
    lastSyncedAt: string | null;
  }>;
}


/** Lightweight approved spot used by the public map and places list */
export interface MapSpot {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount: number | null;
  coverImageUrl: string | null;
  address: string | null;
  categories: Array<{ id: number; name: string; slug: string; icon: string | null }>;
  destination: { id: number; name: string; slug: string };
  /** State or union territory */
  state: string;
  /** Curated icon (Wikipedia-sourced) — ranked first */
  featured: boolean;
  /** Internal ranking signal 0–100 */
  score: number;
}
