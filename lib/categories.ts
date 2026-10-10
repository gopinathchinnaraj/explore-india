// Visual identity for tourism categories — shared by map markers, chips and panels.

import {
  Landmark,
  Church,
  Droplets,
  Waves,
  Mountain,
  PawPrint,
  TreePine,
  Zap,
  Building2,
  Utensils,
  Palette,
  Star,
  MapPin,
  type LucideIcon,
} from "lucide-react";

export interface CategoryStyle {
  slug: string;
  name: string;
  color: string;
  soft: string;
  Icon: LucideIcon;
}

export const CATEGORY_STYLES: CategoryStyle[] = [
  { slug: "historical", name: "Historical", color: "#b45309", soft: "#fef3c7", Icon: Landmark },
  { slug: "temples", name: "Temples", color: "#7c3aed", soft: "#ede9fe", Icon: Church },
  { slug: "waterfalls", name: "Waterfalls", color: "#0284c7", soft: "#e0f2fe", Icon: Droplets },
  { slug: "beaches", name: "Beaches", color: "#0891b2", soft: "#cffafe", Icon: Waves },
  { slug: "hill-stations", name: "Hill Stations", color: "#059669", soft: "#d1fae5", Icon: Mountain },
  { slug: "nature", name: "Nature", color: "#16a34a", soft: "#dcfce7", Icon: TreePine },
  { slug: "wildlife", name: "Wildlife", color: "#ea580c", soft: "#ffedd5", Icon: PawPrint },
  { slug: "adventure", name: "Adventure", color: "#dc2626", soft: "#fee2e2", Icon: Zap },
  { slug: "culture", name: "Culture", color: "#be185d", soft: "#fce7f3", Icon: Palette },
  { slug: "unesco", name: "UNESCO", color: "#854d0e", soft: "#fef9c3", Icon: Star },
  { slug: "cities", name: "Cities", color: "#4338ca", soft: "#e0e7ff", Icon: Building2 },
  { slug: "food", name: "Food", color: "#d97706", soft: "#fef3c7", Icon: Utensils },
];

export const DEFAULT_CATEGORY: CategoryStyle = {
  slug: "other",
  name: "Attraction",
  color: "#0f766e",
  soft: "#ccfbf1",
  Icon: MapPin,
};

const BY_SLUG = new Map(CATEGORY_STYLES.map((c) => [c.slug, c]));

export function categoryStyle(slug: string | null | undefined): CategoryStyle {
  return (slug && BY_SLUG.get(slug)) || DEFAULT_CATEGORY;
}

/** Primary style for an item with a list of categories (first known one wins). */
export function primaryCategory(categories: Array<{ slug: string }> | undefined): CategoryStyle {
  for (const c of categories || []) {
    const s = BY_SLUG.get(c.slug);
    if (s) return s;
  }
  return DEFAULT_CATEGORY;
}
