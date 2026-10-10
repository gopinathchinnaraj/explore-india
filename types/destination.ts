// Core destination types for GoSomewhere
// These map cleanly to future Java @Entity classes

export interface Destination {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  coverImageUrl: string | null;
  isActive: boolean;
  country: {
    id: number;
    name: string;
    code: string;
  };
  state: {
    id: number;
    name: string;
  };
  district?: {
    id: number;
    name: string;
  } | null;
  categories: Category[];
}

export interface DestinationSummary {
  id: number;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount: number | null;
  coverImageUrl: string | null;
  address: string | null;
  categories: Category[];
  state: {
    name: string;
  };
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
}

export interface NearbyDestination extends DestinationSummary {
  distanceKm: number;
}
