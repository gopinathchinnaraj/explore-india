// Review types for GoSomewhere
// Maps to future Java ReviewDto / DestinationReview entity

export interface Review {
  id: number;
  source: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  rating: number | null;
  reviewText: string | null;
  publishedAt: string | null;
  publishedLabel?: string | null;
  reviewUrl: string | null;
  fetchedAt: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  totalCount: number;
  averageRating: number | null;
  source: string;
  cachedAt: string | null;
  fromCache?: boolean;
  aiSummary?: string | null;
  topics?: string[];
}
