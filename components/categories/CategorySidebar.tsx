"use client";

import { useState, useEffect } from "react";
import {
  Landmark,
  Building2,
  Droplets,
  Waves,
  Mountain,
  PawPrint,
  TreePine,
  Zap,
  Building,
  Utensils,
  Palette,
  Star,
  LayoutGrid,
} from "lucide-react";
import type { DestinationSummary } from "@/types/destination";

interface CategorySidebarProps {
  activeCategory: string;
  onCategoryChange: (slug: string) => void;
  destinations: DestinationSummary[];
}

interface CategoryConfig {
  slug: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    slug: "all",
    name: "All Places",
    icon: <LayoutGrid size={15} />,
    color: "#0f172a",
    bgColor: "#f1f5f9",
  },
  {
    slug: "historical",
    name: "Historical",
    icon: <Landmark size={15} />,
    color: "#b45309",
    bgColor: "#fef3c7",
  },
  {
    slug: "temples",
    name: "Temples",
    icon: <Building2 size={15} />,
    color: "#7c3aed",
    bgColor: "#ede9fe",
  },
  {
    slug: "waterfalls",
    name: "Waterfalls",
    icon: <Droplets size={15} />,
    color: "#0284c7",
    bgColor: "#e0f2fe",
  },
  {
    slug: "beaches",
    name: "Beaches",
    icon: <Waves size={15} />,
    color: "#0891b2",
    bgColor: "#cffafe",
  },
  {
    slug: "hill-stations",
    name: "Hill Stations",
    icon: <Mountain size={15} />,
    color: "#059669",
    bgColor: "#d1fae5",
  },
  {
    slug: "wildlife",
    name: "Wildlife",
    icon: <PawPrint size={15} />,
    color: "#ea580c",
    bgColor: "#ffedd5",
  },
  {
    slug: "nature",
    name: "Nature",
    icon: <TreePine size={15} />,
    color: "#16a34a",
    bgColor: "#dcfce7",
  },
  {
    slug: "adventure",
    name: "Adventure",
    icon: <Zap size={15} />,
    color: "#dc2626",
    bgColor: "#fee2e2",
  },
  {
    slug: "cities",
    name: "Cities",
    icon: <Building size={15} />,
    color: "#4338ca",
    bgColor: "#e0e7ff",
  },
  {
    slug: "food",
    name: "Food",
    icon: <Utensils size={15} />,
    color: "#d97706",
    bgColor: "#fef9c3",
  },
  {
    slug: "culture",
    name: "Culture",
    icon: <Palette size={15} />,
    color: "#be185d",
    bgColor: "#fce7f3",
  },
  {
    slug: "unesco",
    name: "UNESCO",
    icon: <Star size={15} />,
    color: "#854d0e",
    bgColor: "#fef3c7",
  },
];

export default function CategorySidebar({
  activeCategory,
  onCategoryChange,
  destinations,
}: CategorySidebarProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const countMap: Record<string, number> = { all: destinations.length };
    destinations.forEach((dest) => {
      dest.categories.forEach((cat) => {
        countMap[cat.slug] = (countMap[cat.slug] || 0) + 1;
      });
    });
    setCounts(countMap);
  }, [destinations]);

  return (
    <aside
      className="sidebar"
      aria-label="Category filters"
      role="navigation"
    >
      <div className="sidebar-section">
        <div className="sidebar-title">Explore Karnataka</div>
        {CATEGORIES.map((cat) => {
          const count = counts[cat.slug] || 0;
          const isActive = activeCategory === cat.slug;

          return (
            <button
              key={cat.slug}
              id={`category-${cat.slug}`}
              className={`category-btn ${isActive ? "active" : ""}`}
              onClick={() => onCategoryChange(cat.slug)}
              aria-pressed={isActive}
              aria-label={`Filter by ${cat.name} (${count} places)`}
            >
              <span
                className="category-icon"
                style={{
                  background: isActive ? `${cat.color}20` : cat.bgColor,
                  color: isActive ? cat.color : cat.color,
                }}
                aria-hidden="true"
              >
                {cat.icon}
              </span>
              <span>{cat.name}</span>
              {count > 0 && (
                <span className="category-count" aria-hidden="true">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="sidebar-section" style={{ marginTop: "auto" }}>
        <div className="sidebar-title">Karnataka</div>
        <div
          style={{
            padding: "10px",
            background: "linear-gradient(135deg, #f0fdf4, #eff6ff)",
            borderRadius: "10px",
            fontSize: "0.75rem",
            color: "var(--color-text-secondary)",
            lineHeight: 1.8,
          }}
        >
          <div>📍 <strong>{destinations.length}</strong> destinations</div>
          <div>🌟 Verified places</div>
          <div>🗺️ Real map data</div>
          <div>🤖 AI-powered guide</div>
        </div>
      </div>
    </aside>
  );
}
