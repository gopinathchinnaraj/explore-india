"use client";

// "Places in view" list — mirrors what is visible on the map.

import { Star, MapPinned, ChevronDown, Sparkles } from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { primaryCategory } from "@/lib/categories";
import type { MapSpot } from "@/types/spot";

export type RailSort = "popular" | "rating" | "name";

interface PlacesRailProps {
  spots: MapSpot[];
  total: number;
  loading: boolean;
  activeSpotId: number | null;
  sort: RailSort;
  onSortChange: (s: RailSort) => void;
  onHover: (id: number | null) => void;
  onSelect: (spot: MapSpot) => void;
  title: string;
  states: Array<{ name: string; count: number }>;
  stateFilter: string;
  onStateChange: (state: string) => void;
}

export default function PlacesRail({
  spots,
  total,
  loading,
  activeSpotId,
  sort,
  onSortChange,
  onHover,
  onSelect,
  title,
  states,
  stateFilter,
  onStateChange,
}: PlacesRailProps) {
  return (
    <aside className="gs-rail" aria-label="Places in view">
      <div className="gs-rail-head">
        <div className="gs-rail-title">
          <h2>{title}</h2>
          <span>
            {spots.length} of {total}
          </span>
        </div>
        <div className="gs-rail-state">
          <MapPinned size={15} />
          <select value={stateFilter} onChange={(e) => onStateChange(e.target.value)} aria-label="Filter by state">
            <option value="all">All of India · {states.length} states & UTs</option>
            {states.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </div>
        <div className="gs-rail-sort">
          <div className="gs-seg" style={{ margin: 0 }}>
            {(
              [
                ["popular", "Popular"],
                ["rating", "Top rated"],
                ["name", "A–Z"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={sort === k ? "is-active" : ""} onClick={() => onSortChange(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gs-rail-list">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="gs-place" style={{ cursor: "default" }}>
              <div className="gs-place-img gs-skel" />
              <div className="gs-place-body" style={{ flex: 1 }}>
                <div className="gs-skel" style={{ height: 14, width: "80%" }} />
                <div className="gs-skel" style={{ height: 12, width: "50%", marginTop: 6 }} />
              </div>
            </div>
          ))
        ) : spots.length === 0 ? (
          <div className="gs-rail-empty">
            <MapPinned size={28} style={{ color: "var(--gs-faint)", marginBottom: 8 }} />
            <div style={{ fontWeight: 650, color: "var(--gs-ink)" }}>No places in this area</div>
            <div>Zoom out or move the map to see more.</div>
          </div>
        ) : (
          spots.map((spot) => {
            const cat = primaryCategory(spot.categories);
            return (
              <button
                key={spot.id}
                className={`gs-place ${activeSpotId === spot.id ? "is-active" : ""}`}
                onMouseEnter={() => onHover(spot.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(spot.id)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(spot)}
              >
                <div className="gs-place-img">
                  <SmartImage sources={[spot.coverImageUrl]} alt={spot.name} width={240} />
                </div>
                <div className="gs-place-body">
                  <span className="gs-place-cat" style={{ color: cat.color }}>
                    <cat.Icon size={12} /> {cat.name}
                    {spot.featured && (
                      <span className="gs-icon-badge" title="Iconic place">
                        <Sparkles size={10} /> Iconic
                      </span>
                    )}
                  </span>
                  <div className="gs-place-name">{spot.name}</div>
                  <div className="gs-place-sub">
                    {spot.destination.name !== spot.name ? `${spot.destination.name}, ${spot.state}` : spot.state}
                  </div>
                  {spot.rating ? (
                    <span className="gs-rating">
                      <Star size={12} fill="#f59e0b" color="#f59e0b" />
                      <strong>{spot.rating.toFixed(1)}</strong>
                      {spot.reviewCount ? <span className="count">({spot.reviewCount.toLocaleString("en-IN")})</span> : null}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
