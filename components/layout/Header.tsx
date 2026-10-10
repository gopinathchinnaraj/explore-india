"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Compass, Search, Sparkles, X, MapPin, Star, Navigation, Dices, Route, Backpack } from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { CATEGORY_STYLES, primaryCategory, type CategoryStyle } from "@/lib/categories";
import type { MapSpot } from "@/types/spot";
import type { DestinationSummary } from "@/types/destination";

interface HeaderProps {
  spots: MapSpot[];
  destinations: DestinationSummary[];
  onSelectSpot: (spot: MapSpot) => void;
  onSelectDestination: (dest: DestinationSummary) => void;
  onSelectCategory: (slug: string) => void;
  /** Fly the globe to any geocoded place */
  onFlyToPlace: (place: GeoPlace) => void;
  onAIClick: () => void;
  showAI: boolean;
  tripCount: number;
  tripOpen: boolean;
  onTripClick: () => void;
  onJourneysClick: () => void;
  onSurprise: () => void;
}

export interface GeoPlace {
  id: string;
  name: string;
  context: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
}

type Result =
  | { kind: "place"; place: GeoPlace }
  | { kind: "category"; cat: CategoryStyle; count: number }
  | { kind: "spot"; spot: MapSpot }
  | { kind: "destination"; dest: DestinationSummary; count: number };

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "");
}

export default function Header({
  spots,
  destinations,
  onSelectSpot,
  onSelectDestination,
  onSelectCategory,
  onFlyToPlace,
  onAIClick,
  showAI,
  tripCount,
  tripOpen,
  onTripClick,
  onJourneysClick,
  onSurprise,
}: HeaderProps) {
  const [query, setQuery] = useState("");
  const [geo, setGeo] = useState<{ q: string; places: GeoPlace[] }>({ q: "", places: [] });
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Any place on Earth (MapTiler geocoding, biased towards Karnataka) so the globe can fly there
  const trimmed = query.trim();
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key || trimmed.length < 3) return;
    let ignore = false;
    const t = setTimeout(() => {
      fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json?key=${key}&limit=4&language=en&proximity=78.9,22.6`)
        .then((r) => r.json())
        .then((d: { features?: Array<{ id: string; text?: string; place_name?: string; center: [number, number]; bbox?: [number, number, number, number] }> }) => {
          if (ignore) return;
          const places = (d.features || []).map((f) => ({
            id: f.id,
            name: f.text || f.place_name || trimmed,
            context: (f.place_name || "").split(", ").slice(1).join(", "),
            lng: f.center[0],
            lat: f.center[1],
            bbox: f.bbox,
          }));
          setGeo({ q: trimmed, places });
        })
        .catch(() => {});
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(t);
    };
  }, [trimmed]);
  const geoPlaces = useMemo(() => (geo.q === trimmed ? geo.places : []), [geo, trimmed]);

  // Instant search over the approved data already loaded for the map
  const results = useMemo<Result[]>(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    const matches = (text: string) => {
      const t = norm(text);
      return words.every((w) => t.includes(w));
    };

    const cats: Result[] = CATEGORY_STYLES.filter((c) => norm(c.name).includes(q) || norm(c.slug).includes(q))
      .map((cat) => ({ kind: "category" as const, cat, count: spots.filter((s) => s.categories.some((x) => x.slug === cat.slug)).length }))
      .filter((r) => r.count > 0)
      .slice(0, 2);

    const spotHits: Result[] = spots
      .map((spot) => {
        const nameHit = matches(spot.name);
        const otherHit = matches(`${spot.name} ${spot.destination.name} ${spot.address || ""} ${spot.categories.map((c) => c.name).join(" ")}`);
        return { spot, score: nameHit ? (norm(spot.name).startsWith(q) ? 3 : 2) : otherHit ? 1 : 0 };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.spot.reviewCount || 0) - (a.spot.reviewCount || 0))
      .slice(0, 7)
      .map((x) => ({ kind: "spot" as const, spot: x.spot }));

    const destHits: Result[] = destinations
      .filter((d) => matches(`${d.name} ${d.address || ""}`))
      .map((dest) => ({ kind: "destination" as const, dest, count: spots.filter((s) => s.destination.id === dest.id).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const placeHits: Result[] = geoPlaces.slice(0, spotHits.length + destHits.length > 0 ? 2 : 4).map((place) => ({ kind: "place" as const, place }));
    return [...cats, ...spotHits, ...destHits, ...placeHits];
  }, [query, spots, destinations, geoPlaces]);

  function choose(r: Result) {
    setOpen(false);
    inputRef.current?.blur();
    if (r.kind === "spot") {
      setQuery(r.spot.name);
      onSelectSpot(r.spot);
    } else if (r.kind === "destination") {
      setQuery(r.dest.name);
      onSelectDestination(r.dest);
    } else if (r.kind === "place") {
      setQuery(r.place.name);
      onFlyToPlace(r.place);
    } else {
      setQuery("");
      onSelectCategory(r.cat.slug);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[cursor]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  let index = -1;
  const section = (kind: Result["kind"], label: string) => {
    const items = results.filter((r) => r.kind === kind);
    if (items.length === 0) return null;
    return (
      <>
        <div className="gs-results-label">{label}</div>
        {items.map((r) => {
          index++;
          const i = index;
          return (
            <button
              key={r.kind === "spot" ? `s${r.spot.id}` : r.kind === "destination" ? `d${r.dest.id}` : r.kind === "place" ? `p${r.place.id}` : `c${r.cat.slug}`}
              className={`gs-result ${cursor === i ? "is-active" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(r)}
            >
              {r.kind === "spot" && <SpotRow spot={r.spot} />}
              {r.kind === "destination" && (
                <>
                  <div className="gs-result-thumb">
                    <SmartImage sources={[r.dest.coverImageUrl]} alt={r.dest.name} width={120} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="gs-result-name">{r.dest.name}</div>
                    <div className="gs-result-sub">
                      Destination{r.count ? ` · ${r.count} place${r.count === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                </>
              )}
              {r.kind === "place" && (
                <>
                  <div className="gs-result-thumb" style={{ display: "grid", placeItems: "center", background: "#e0f2fe", color: "#0369a1" }}>
                    <Navigation size={19} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="gs-result-name">{r.place.name}</div>
                    <div className="gs-result-sub">Fly to {r.place.context || "this place"}</div>
                  </div>
                </>
              )}
              {r.kind === "category" && (
                <>
                  <div className="gs-result-thumb" style={{ display: "grid", placeItems: "center", background: r.cat.soft, color: r.cat.color }}>
                    <r.cat.Icon size={20} />
                  </div>
                  <div>
                    <div className="gs-result-name">Show all {r.cat.name.toLowerCase()}</div>
                    <div className="gs-result-sub">{r.count} places on the map</div>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </>
    );
  };

  return (
    <header className="gs-header">
      <Link href="/" className="gs-logo" aria-label="Explore India home">
        <div className="gs-logo-mark">
          <Compass size={19} strokeWidth={2.4} />
        </div>
        <div className="gs-logo-text">
          <div className="gs-logo-name">
            Explore <span>India</span>
          </div>
          <div className="gs-logo-sub">A living atlas of incredible places</div>
        </div>
      </Link>

      <div className="gs-search" ref={boxRef}>
        <div className="gs-search-box">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search places, destinations or anywhere on Earth…"
            aria-label="Search destinations or tourist spots"
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {query ? (
            <button className="gs-icon-btn" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={15} />
            </button>
          ) : (
            <kbd className="gs-kbd" title="Press / to search">
              /
            </kbd>
          )}
        </div>
        {open && query.trim().length >= 2 && (
          <div className="gs-results" role="listbox">
            {results.length === 0 ? (
              <div className="gs-results-empty">No places match “{query.trim()}”.</div>
            ) : (
              <>
                {section("category", "Categories")}
                {section("spot", "Places")}
                {section("destination", "Destinations")}
                {section("place", "Go to place on the globe")}
              </>
            )}
          </div>
        )}
      </div>

      <div className="gs-header-actions">
        <button className="gs-btn gs-btn-ghost gs-hide-sm" onClick={onSurprise} title="Spin the globe and land somewhere new">
          <Dices size={16} />
          <span className="label">Surprise me</span>
        </button>
        <button className="gs-btn gs-btn-ghost gs-hide-sm" onClick={onJourneysClick} title="Cinematic journeys across India">
          <Route size={16} />
          <span className="label">Journeys</span>
        </button>
        <button className={`gs-btn gs-btn-ghost ${tripOpen ? "is-on" : ""}`} onClick={onTripClick} title="Your trip">
          <Backpack size={16} />
          <span className="label">Trip</span>
          {tripCount > 0 && <span className="gs-count">{tripCount}</span>}
        </button>
        <button className={`gs-btn ${showAI ? "is-on" : "gs-btn-primary"}`} onClick={onAIClick}>
          <Sparkles size={16} />
          <span className="label">Ask AI</span>
        </button>
      </div>
    </header>
  );
}

function SpotRow({ spot }: { spot: MapSpot }) {
  const cat = primaryCategory(spot.categories);
  return (
    <>
      <div className="gs-result-thumb">
        <SmartImage sources={[spot.coverImageUrl]} alt={spot.name} width={120} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="gs-result-name">{spot.name}</div>
        <div className="gs-result-sub" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: cat.color, fontWeight: 600 }}>{cat.name}</span>
          <span>·</span>
          <MapPin size={11} /> {spot.destination.name}
          {spot.rating ? (
            <>
              <span>·</span>
              <Star size={11} fill="#f59e0b" color="#f59e0b" /> {spot.rating.toFixed(1)}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
