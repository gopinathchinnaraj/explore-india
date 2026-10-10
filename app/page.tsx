"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Dices, List, Map as MapIcon, Navigation, Route, TriangleAlert, X } from "lucide-react";
import Header from "@/components/layout/Header";
import MapView, { type MapApi, type MapBounds, type MapInsets, type MapRoute } from "@/components/map/MapView";
import PlacesRail, { type RailSort } from "@/components/map/PlacesRail";
import SpotPanel from "@/components/spot/SpotPanel";
import DestinationPanel from "@/components/destination/DestinationPanel";
import AIAssistant from "@/components/ai/AIAssistant";
import Hero from "@/components/landing/Hero";
import JourneyPicker, { type ResolvedJourney } from "@/components/journeys/JourneyPicker";
import JourneyPlayer from "@/components/journeys/JourneyPlayer";
import TripPanel from "@/components/trip/TripPanel";
import { CATEGORY_STYLES } from "@/lib/categories";
import { INDIA_JOURNEYS } from "@/lib/journeys";
import { tripStore } from "@/lib/tripStore";
import type { MapSpot } from "@/types/spot";
import type { DestinationSummary } from "@/types/destination";
import "./explore.css";

type Selection = { kind: "spot"; slug: string } | { kind: "destination"; slug: string } | null;

const REFRESH_MS = 5 * 60 * 1000;
/** How long a journey lingers on each place before flying on */
const JOURNEY_DWELL_MS = 7000;
const TRIP_COLOR = "#0d7a6f";

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

async function fetchMapData(): Promise<{ spots: MapSpot[]; destinations: DestinationSummary[] } | { error: string }> {
  try {
    const res = await fetch("/api/map", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to load map" };
    return { spots: data.spots || [], destinations: data.destinations || [] };
  } catch {
    return { error: "Could not reach the server" };
  }
}

// Viewport size as an external store (no setState-in-effect, SSR-safe)
function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
const getViewport = () => `${window.innerWidth}x${window.innerHeight}`;
const getServerViewport = () => "1280x800";

// Geometry of the floating UI (keep in sync with explore.css)
const EDGE = 14;
const HEADER_H = 60;
const RAIL_W = 372;
const PANEL_W = 420;
const CONTROLS_W = 44;
const PLAYER_H = 84;

function computeInsets(
  vw: number,
  vh: number,
  opts: { rail: boolean; panel: boolean; player?: boolean; hero?: boolean; trip?: boolean }
): MapInsets {
  // Landing: lift the globe above the hero text
  if (opts.hero) return { top: 70, right: 0, left: 0, bottom: Math.round(vh * (vw <= 860 ? 0.5 : 0.42)) };
  if (vw <= 860) {
    // Phone: floating header + chips on top, list button / player / details sheet at the bottom
    const sheet = opts.panel ? 0.7 : opts.trip ? 0.62 : 0;
    return { top: 118, right: 0, left: 0, bottom: sheet ? Math.round(vh * sheet) : opts.player ? 170 : 84 };
  }
  const top = EDGE + HEADER_H + EDGE + 44;
  const left = opts.rail ? EDGE + RAIL_W + EDGE : EDGE;
  const right = (opts.panel ? EDGE + PANEL_W + EDGE : EDGE) + CONTROLS_W + EDGE;
  return { top, right, bottom: EDGE + (opts.player ? PLAYER_H + EDGE : 0), left };
}

export default function HomePage() {
  const [spots, setSpots] = useState<MapSpot[]>([]);
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [selection, setSelection] = useState<Selection>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [sort, setSort] = useState<RailSort>("popular");
  const [listOpen, setListOpen] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showHero, setShowHero] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [journey, setJourney] = useState<{ id: string; index: number; playing: boolean } | null>(null);
  const mapApi = useRef<MapApi | null>(null);
  const pendingDeepLink = useRef<Selection>(null);
  const flightToken = useRef(0);
  // Resolves once the map has loaded, so a place picked early still gets its flight
  const [mapReady] = useState(() => {
    let resolve!: (api: MapApi) => void;
    const promise = new Promise<MapApi>((r) => (resolve = r));
    return { promise, resolve };
  });
  const [flyingTo, setFlyingTo] = useState<{ id?: number; name: string } | null>(null);
  const tripIds = useSyncExternalStore(tripStore.subscribe, tripStore.get, tripStore.getServer);

  // ── Data: approved spots + destinations, straight from the database ─────
  const apply = useCallback((result: Awaited<ReturnType<typeof fetchMapData>>, silent: boolean) => {
    if ("error" in result) {
      if (!silent) setError(result.error);
    } else {
      setSpots(result.spots);
      setDestinations(result.destinations);
      setError(null);
    }
    setLoading(false);
  }, []);

  const reload = useCallback(
    (silent: boolean) => {
      if (!silent) setLoading(true);
      fetchMapData().then((r) => apply(r, silent));
    },
    [apply]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("spot");
    const d = params.get("dest");
    if (s) pendingDeepLink.current = { kind: "spot", slug: s };
    else if (d) pendingDeepLink.current = { kind: "destination", slug: d };
    fetchMapData().then((r) => apply(r, false));

    // Pick up newly approved spots when the visitor comes back to the tab
    const onFocus = () => document.visibilityState === "visible" && reload(true);
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(() => reload(true), REFRESH_MS);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(t);
    };
  }, [apply, reload]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const filteredSpots = useMemo(
    () =>
      spots.filter(
        (s) => (category === "all" || s.categories.some((c) => c.slug === category)) && (stateFilter === "all" || s.state === stateFilter)
      ),
    [spots, category, stateFilter]
  );

  // Many destinations have a spot at the same location; show the destination label
  // only where it adds information (no spot within 300 m).
  const mapDestinations = useMemo(() => {
    const list = category === "all" ? destinations : destinations.filter((d) => d.categories.some((c) => c.slug === category));
    return list.filter((d) => (stateFilter === "all" || d.state.name === stateFilter) && !spots.some((s) => haversineKm(s, d) < 0.3));
  }, [destinations, spots, category, stateFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of spots) {
      if (stateFilter !== "all" && s.state !== stateFilter) continue;
      for (const c of s.categories) counts[c.slug] = (counts[c.slug] || 0) + 1;
    }
    return counts;
  }, [spots, stateFilter]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of spots) counts.set(s.state, (counts.get(s.state) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
  }, [spots]);

  const visibleSpots = useMemo(() => {
    const inView = bounds
      ? filteredSpots.filter(
          (s) => s.latitude <= bounds.north && s.latitude >= bounds.south && s.longitude <= bounds.east && s.longitude >= bounds.west
        )
      : filteredSpots;
    const sorted = [...inView];
    if (sort === "rating") sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0));
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    // Popular: curated icons first, then by Google review volume
    else
      sorted.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          b.score - a.score ||
          (b.reviewCount || 0) * (b.rating || 0) - (a.reviewCount || 0) * (a.rating || 0)
      );
    return sorted.slice(0, 200);
  }, [filteredSpots, bounds, sort]);

  // Journeys resolved to spots that exist in the database
  const journeys: ResolvedJourney[] = useMemo(() => {
    const byName = new Map(spots.map((s) => [norm(s.name), s]));
    return INDIA_JOURNEYS.map((j) => {
      const stops = j.stops.map((n) => byName.get(norm(n))).filter((s): s is MapSpot => Boolean(s));
      const km = Math.round(stops.reduce((sum, s, i) => (i ? sum + haversineKm(stops[i - 1], s) : 0), 0));
      return { journey: j, stops, km };
    }).filter((j) => j.stops.length >= 2);
  }, [spots]);
  const activeJourney = journey ? journeys.find((j) => j.journey.id === journey.id) || null : null;

  const tripStops = useMemo(() => {
    const byId = new Map(spots.map((s) => [s.id, s]));
    return tripIds.map((id) => byId.get(id)).filter((s): s is MapSpot => Boolean(s));
  }, [spots, tripIds]);

  const route: MapRoute | null = useMemo(() => {
    if (activeJourney) return { points: activeJourney.stops, color: activeJourney.journey.color };
    if (tripOpen && tripStops.length >= 2) return { points: tripStops, color: TRIP_COLOR };
    return null;
  }, [activeJourney, tripOpen, tripStops]);

  const selectedSpot = selection?.kind === "spot" ? spots.find((s) => s.slug === selection.slug) || null : null;
  const selectedDestination = selection?.kind === "destination" ? destinations.find((d) => d.slug === selection.slug) || null : null;

  // ── Selection ────────────────────────────────────────────────────────────
  const updateUrl = (sel: Selection) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("spot");
    url.searchParams.delete("dest");
    if (sel?.kind === "spot") url.searchParams.set("spot", sel.slug);
    if (sel?.kind === "destination") url.searchParams.set("dest", sel.slug);
    window.history.replaceState(null, "", url);
  };

  // Fly first, open the panel once the map arrives. A newer selection (or closing)
  // bumps the token so a stale flight never opens a panel.
  const openAfterFlight = useCallback(
    async (sel: Selection, label: { id?: number; name: string }, fly: (api: MapApi) => Promise<boolean>) => {
      const token = ++flightToken.current;
      setShowHero(false);
      setSelection(null);
      setListOpen(false);
      setFlyingTo(label);
      updateUrl(sel);
      const api = await mapReady.promise;
      if (token !== flightToken.current) return;
      await fly(api);
      if (token !== flightToken.current) return;
      setFlyingTo(null);
      setSelection(sel);
    },
    [mapReady]
  );

  const flyToSpot = useCallback(
    (spot: MapSpot) =>
      openAfterFlight({ kind: "spot", slug: spot.slug }, { id: spot.id, name: spot.name }, (api) => api.flyTo(spot.latitude, spot.longitude, 14)),
    [openAfterFlight]
  );

  // Picking a place by hand pauses a running journey
  const selectSpot = useCallback(
    (spot: MapSpot) => {
      setJourney((j) => (j && activeJourney?.stops[j.index]?.id !== spot.id ? { ...j, playing: false } : j));
      flyToSpot(spot);
    },
    [flyToSpot, activeJourney]
  );

  const selectDestination = useCallback(
    (dest: DestinationSummary) => {
      const its = spots.filter((s) => s.destination.id === dest.id);
      openAfterFlight({ kind: "destination", slug: dest.slug }, { name: dest.name }, (api) =>
        its.length > 1 ? api.fitTo(its) : api.flyTo(dest.latitude, dest.longitude, 12)
      );
    },
    [spots, openAfterFlight]
  );

  const selectSpotBySlug = useCallback(
    (slug: string) => {
      const s = spots.find((x) => x.slug === slug);
      if (s) selectSpot(s);
    },
    [spots, selectSpot]
  );

  const selectDestinationBySlug = useCallback(
    (slug: string) => {
      const d = destinations.find((x) => x.slug === slug);
      if (d) selectDestination(d);
    },
    [destinations, selectDestination]
  );

  const closePanel = useCallback(() => {
    flightToken.current++;
    setFlyingTo(null);
    setSelection(null);
    updateUrl(null);
  }, []);

  // Resolve a ?spot= / ?dest= deep link once data and the map are ready
  useEffect(() => {
    const link = pendingDeepLink.current;
    if (!link || loading) return;
    pendingDeepLink.current = null;
    if (link.kind === "spot") selectSpotBySlug(link.slug);
    else selectDestinationBySlug(link.slug);
  }, [loading, selectSpotBySlug, selectDestinationBySlug]);

  // ── Surprise me: spin the Earth and land somewhere new ──────────────────
  const surprise = useCallback(() => {
    const pool = spots.filter((s) => s.featured && s.id !== selectedSpot?.id);
    const list = pool.length ? pool : spots;
    if (list.length === 0) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    setJourney(null);
    openAfterFlight({ kind: "spot", slug: pick.slug }, { id: pick.id, name: pick.name }, (api) => api.surpriseTo(pick.latitude, pick.longitude));
  }, [spots, selectedSpot, openAfterFlight]);

  // ── Journeys ─────────────────────────────────────────────────────────────
  const goToStop = useCallback(
    (index: number, playing: boolean) => {
      if (!activeJourney && !journey) return;
      const j = activeJourney;
      if (!j) return;
      const stop = j.stops[index];
      if (!stop) return;
      setJourney({ id: j.journey.id, index, playing });
      flyToSpot(stop);
    },
    [activeJourney, journey, flyToSpot]
  );

  const startJourney = useCallback(
    (id: string) => {
      const j = journeys.find((x) => x.journey.id === id);
      if (!j) return;
      setPickerOpen(false);
      setShowHero(false);
      setTripOpen(false);
      setJourney({ id, index: 0, playing: true });
      const first = j.stops[0];
      openAfterFlight({ kind: "spot", slug: first.slug }, { id: first.id, name: first.name }, (api) => api.surpriseTo(first.latitude, first.longitude));
    },
    [journeys, openAfterFlight]
  );

  // Auto-advance: once the current stop's panel is open, linger, then fly on.
  // Depends only on primitives, and remembers when we arrived, so re-renders (e.g. a
  // background data refresh) never restart the countdown.
  const currentStopId = activeJourney && journey ? activeJourney.stops[journey.index]?.id : undefined;
  const stopCount = activeJourney?.stops.length ?? 0;
  const arrivedAt = useRef<{ stopId: number; at: number } | null>(null);
  const advanceRef = useRef<(i: number) => void>(() => {});
  useEffect(() => {
    advanceRef.current = (i: number) => goToStop(i, true);
  });
  const atStop = Boolean(journey?.playing && currentStopId && selectedSpot?.id === currentStopId);
  const journeyIndex = journey?.index ?? -1;
  useEffect(() => {
    if (!atStop || currentStopId === undefined) return;
    if (arrivedAt.current?.stopId !== currentStopId) arrivedAt.current = { stopId: currentStopId, at: Date.now() };
    const remaining = Math.max(0, JOURNEY_DWELL_MS - (Date.now() - arrivedAt.current.at));
    const t = setTimeout(() => {
      if (journeyIndex < stopCount - 1) advanceRef.current(journeyIndex + 1);
      else setJourney((j) => (j ? { ...j, playing: false } : j));
    }, remaining);
    return () => clearTimeout(t);
  }, [atStop, currentStopId, journeyIndex, stopCount]);

  const endJourney = useCallback(() => {
    setJourney(null);
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────────
  const handleCategory = (slug: string) => {
    setCategory(slug);
    setShowHero(false);
    const list = spots.filter((s) => (slug === "all" || s.categories.some((c) => c.slug === slug)) && (stateFilter === "all" || s.state === stateFilter));
    if (list.length > 0 && (slug !== "all" || stateFilter !== "all")) mapApi.current?.fitTo(list);
  };

  const handleState = (state: string) => {
    setStateFilter(state);
    setShowHero(false);
    const list = spots.filter((s) => (state === "all" || s.state === state) && (category === "all" || s.categories.some((c) => c.slug === category)));
    if (list.length > 0) mapApi.current?.fitTo(list);
  };

  // What the floating panels cover, so the map can centre in the visible area
  const viewport = useSyncExternalStore(subscribeResize, getViewport, getServerViewport);
  const [vw, vh] = viewport.split("x").map(Number);
  const panelOpen = Boolean(selection);
  const playerOn = Boolean(activeJourney);
  // On narrower desktops the list hides while a panel is open (see explore.css)
  const insets = useMemo(
    () =>
      computeInsets(vw, vh, {
        rail: (!showHero || tripOpen) && !(panelOpen && vw <= 1180),
        panel: panelOpen,
        player: playerOn,
        hero: showHero,
        trip: tripOpen,
      }),
    [vw, vh, panelOpen, playerOn, showHero, tripOpen]
  );
  const focusInsets = useMemo(() => computeInsets(vw, vh, { rail: vw > 1180, panel: true, player: playerOn }), [vw, vh, playerOn]);

  const chips = [{ slug: "all", name: "All places" }, ...CATEGORY_STYLES.filter((c) => categoryCounts[c.slug])];
  const hasPanel = Boolean(selectedSpot || selectedDestination);
  const scope = stateFilter === "all" ? "in view" : `in ${stateFilter}`;
  const railTitle = category === "all" ? `Places ${scope}` : `${CATEGORY_STYLES.find((c) => c.slug === category)?.name || "Places"} ${scope}`;

  return (
    <div className={`gs-app ${showHero ? "hero-open" : ""}`}>
      <Header
        spots={spots}
        destinations={destinations}
        onSelectSpot={selectSpot}
        onSelectDestination={selectDestination}
        onSelectCategory={handleCategory}
        onFlyToPlace={(p) => {
          setListOpen(false);
          setShowHero(false);
          mapApi.current?.flyToPlace(p.lat, p.lng, p.bbox);
        }}
        onAIClick={() => setShowAI((v) => !v)}
        showAI={showAI}
        tripCount={tripStops.length}
        tripOpen={tripOpen}
        onTripClick={() => {
          setShowHero(false);
          const opening = !tripOpen;
          setTripOpen(opening);
          // Frame the whole route when the trip opens
          if (opening && tripStops.length) {
            const tripInsets = computeInsets(vw, vh, { rail: true, panel: false, trip: true });
            mapReady.promise.then((api) => api.fitTo(tripStops, tripInsets));
          }
        }}
        onJourneysClick={() => setPickerOpen(true)}
        onSurprise={surprise}
      />

      <div className={`gs-body ${hasPanel ? "has-panel" : ""} ${listOpen ? "list-open" : ""} ${tripOpen ? "trip-open" : ""} ${playerOn ? "player-on" : ""}`}>
        {tripOpen ? (
          <TripPanel
            stops={tripStops}
            onSelect={selectSpot}
            onRemove={tripStore.remove}
            onReorder={tripStore.set}
            onClear={tripStore.clear}
            onClose={() => setTripOpen(false)}
          />
        ) : (
          <PlacesRail
            title={railTitle}
            spots={visibleSpots}
            total={filteredSpots.length}
            loading={loading}
            activeSpotId={selectedSpot?.id ?? flyingTo?.id ?? null}
            sort={sort}
            onSortChange={setSort}
            onHover={setHoverId}
            onSelect={selectSpot}
            states={stateCounts}
            stateFilter={stateFilter}
            onStateChange={handleState}
          />
        )}

        <div className="gs-map">
          <MapView
            spots={filteredSpots}
            destinations={mapDestinations}
            activeSpotId={selectedSpot?.id ?? flyingTo?.id ?? null}
            hoverSpotId={hoverId}
            onSelectSpot={selectSpot}
            onSelectDestination={selectDestination}
            onBoundsChange={setBounds}
            insets={insets}
            focusInsets={focusInsets}
            route={route}
            autoIntro={false}
            onReady={(api) => {
              mapApi.current = api;
              mapReady.resolve(api);
            }}
          />

          <div className="gs-chips" role="toolbar" aria-label="Filter by category">
            {/* On phones the header is compact, so journeys & surprise live here */}
            <button className="gs-chip gs-chip-action" onClick={() => setPickerOpen(true)}>
              <Route size={15} /> Journeys
            </button>
            <button className="gs-chip gs-chip-action" onClick={surprise}>
              <Dices size={15} /> Surprise me
            </button>
            {chips.map((c) => {
              const style = CATEGORY_STYLES.find((s) => s.slug === c.slug);
              const active = category === c.slug;
              return (
                <button key={c.slug} className={`gs-chip ${active ? "is-active" : ""}`} onClick={() => handleCategory(c.slug)} aria-pressed={active}>
                  {style ? <style.Icon size={15} color={active ? "#fff" : style.color} /> : <MapIcon size={15} />}
                  {c.name}
                  <span className="gs-chip-count">{c.slug === "all" ? filteredSpots.length : categoryCounts[c.slug]}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="gs-map-status" style={{ color: "#fecaca" }}>
              <TriangleAlert size={15} /> {error}
              <button className="gs-link-btn" style={{ margin: 0, color: "#fff" }} onClick={() => reload(false)}>
                Retry
              </button>
            </div>
          )}
          {!error && !loading && flyingTo && (
            <div className="gs-map-status gs-flying" role="status">
              <Navigation size={15} className="gs-flying-icon" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Flying to {flyingTo.name}…</span>
              <button className="gs-icon-btn" onClick={closePanel} aria-label="Cancel">
                <X size={14} />
              </button>
            </div>
          )}
          {!error && loading && !showHero && (
            <div className="gs-map-status">
              <span className="gs-spin" style={{ display: "inline-flex" }}>
                <MapIcon size={15} />
              </span>
              Loading places…
            </div>
          )}

          {!activeJourney && (
            <button className="gs-btn gs-btn-primary gs-list-toggle" onClick={() => setListOpen((v) => !v)}>
              {listOpen ? <MapIcon size={16} /> : <List size={16} />}
              {listOpen ? "Show map" : `List · ${visibleSpots.length} ${visibleSpots.length === 1 ? "place" : "places"}`}
            </button>
          )}

          {activeJourney && journey && (
            <JourneyPlayer
              journey={activeJourney}
              index={journey.index}
              playing={journey.playing}
              onPrev={() => goToStop(Math.max(0, journey.index - 1), journey.playing)}
              onNext={() => goToStop(Math.min(activeJourney.stops.length - 1, journey.index + 1), journey.playing)}
              onToggle={() => {
                const playing = !journey.playing;
                setJourney({ ...journey, playing });
                // Resuming away from the current stop: fly back to it first
                if (playing && selectedSpot?.id !== currentStopId) goToStop(journey.index, true);
              }}
              onJump={(i) => goToStop(i, journey.playing)}
              onClose={endJourney}
            />
          )}
        </div>

        {selectedSpot && (
          <SpotPanel
            key={selectedSpot.slug}
            spot={selectedSpot}
            onClose={closePanel}
            onSelectSpot={selectSpotBySlug}
            onSelectDestination={selectDestinationBySlug}
            onAskAI={() => setShowAI(true)}
            inTrip={tripIds.includes(selectedSpot.id)}
            onToggleTrip={() => tripStore.toggle(selectedSpot.id)}
          />
        )}

        {selectedDestination && (
          <DestinationPanel
            destination={selectedDestination}
            spots={spots.filter((s) => s.destination.id === selectedDestination.id)}
            onSpotClick={selectSpot}
            onClose={closePanel}
            onNearbyClick={selectDestination}
            onAIClick={() => setShowAI(true)}
          />
        )}
      </div>

      {showHero && (
        <Hero
          places={spots.length}
          states={stateCounts.length}
          journeys={journeys.length || INDIA_JOURNEYS.length}
          onExplore={() => {
            setShowHero(false);
            // Dive from space into India, framing every place
            mapReady.promise.then((api) => api.fitTo(spots.length ? spots : [{ latitude: 8, longitude: 68 }, { latitude: 34, longitude: 97 }]));
          }}
          onJourneys={() => {
            setShowHero(false);
            setPickerOpen(true);
          }}
          onSurprise={surprise}
        />
      )}

      {pickerOpen && <JourneyPicker journeys={journeys} onStart={startJourney} onClose={() => setPickerOpen(false)} />}

      {showAI && (
        <AIAssistant
          onClose={() => setShowAI(false)}
          destinationSlug={selectedSpot?.destination.slug ?? selectedDestination?.slug}
          destinationName={selectedSpot?.name ?? selectedDestination?.name}
        />
      )}
    </div>
  );
}
