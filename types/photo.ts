// Photo types for GoSomewhere
// Maps to DestinationImage / Google Maps Photos via SerpApi

export interface Photo {
  id: number;
  destinationId: number;
  url: string;
  thumbnailUrl: string;
  alt: string | null;
  authorName: string | null;
  authorProfileUrl: string | null;
  source: string;
  category?: string | null;
  createdAt: string;
}

export interface PhotoCategory {
  id: string;
  title: string;
}

export interface PhotosResponse {
  photos: Photo[];
  totalCount: number;
  categories?: PhotoCategory[];
  cachedAt: string | null;
  fromCache?: boolean;
  error?: string;
}
