"use client";

import { Star, ArrowRight } from "lucide-react";
import type { DestinationSummary } from "@/types/destination";

interface PopularStripProps {
  destinations: DestinationSummary[];
  onSelect: (dest: DestinationSummary) => void;
}

export default function PopularStrip({ destinations, onSelect }: PopularStripProps) {
  if (destinations.length === 0) return null;

  return (
    <div className="popular-strip" aria-label="Popular destinations in Karnataka">
      <div className="popular-strip-header">
        <div className="popular-strip-title">✨ Popular in Karnataka</div>
        <a
          href="#"
          className="popular-strip-link"
          onClick={(e) => e.preventDefault()}
          aria-label="View all popular destinations"
        >
          View All <ArrowRight size={12} />
        </a>
      </div>

      <div className="popular-cards">
        {destinations.map((dest) => (
          <button
            key={dest.id}
            id={`popular-${dest.slug}`}
            className="popular-card"
            onClick={() => onSelect(dest)}
            aria-label={`View ${dest.name} - ${dest.rating ? `${dest.rating.toFixed(1)} stars` : "unrated"}`}
          >
            {dest.coverImageUrl ? (
              <img
                src={dest.coverImageUrl}
                alt={dest.name}
                className="popular-card-img"
                loading="lazy"
              />
            ) : (
              <div
                className="popular-card-img"
                style={{
                  background: "linear-gradient(135deg, #e2e8f0, #f1f5f9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                }}
              >
                {dest.categories[0]?.slug === "beaches"
                  ? "🏖"
                  : dest.categories[0]?.slug === "temples"
                  ? "🛕"
                  : dest.categories[0]?.slug === "historical"
                  ? "🏛"
                  : "📍"}
              </div>
            )}
            <div className="popular-card-info">
              <div className="popular-card-name">{dest.name}</div>
              {dest.rating && (
                <div className="popular-card-rating">
                  <Star size={10} fill="#f59e0b" color="#f59e0b" />
                  {dest.rating.toFixed(1)}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
