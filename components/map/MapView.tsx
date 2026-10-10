"use client";

// 3D globe map (MapLibre GL + MapTiler vector tiles).
// Opens on a spinning Earth, flies into India, and reveals photo-tile markers as you zoom.
// Spots are clustered by a GeoJSON source; clusters and points are rendered as HTML markers
// so they can show real photos. All data comes from the parent — the map never fetches spots.

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, Marker, Popup, MapSourceDataEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layers, LocateFixed, Maximize, Pause, Play, Globe2, Plus, Minus } from "lucide-react";
import type { MapSpot } from "@/types/spot";
import type { DestinationSummary } from "@/types/destination";
import { primaryCategory } from "@/lib/categories";
import { sizedImageUrl } from "@/lib/media/image";

/**
 * Camera moves resolve when the map comes to rest: `true` if this move finished,
 * `false` if a newer move (or the visitor) took over first.
 */
export interface MapApi {
  flyTo: (lat: number, lng: number, zoom?: number) => Promise<boolean>;
  /** Frame these points; pass `insets` when the layout is about to change (e.g. a sheet opening) */
  fitTo: (points: Array<{ latitude: number; longitude: number }>, insets?: MapInsets) => Promise<boolean>;
  /** Fly to an arbitrary place, e.g. a geocoding result with an optional [w, s, e, n] box */
  flyToPlace: (lat: number, lng: number, bbox?: [number, number, number, number]) => Promise<boolean>;
  revealSpot: (spotId: number) => Promise<boolean>;
  /** Pull back to space, spin the Earth, then dive onto a place */
  surpriseTo: (lat: number, lng: number) => Promise<boolean>;
}

/** A journey or trip drawn on the globe */
export interface MapRoute {
  points: Array<{ latitude: number; longitude: number }>;
  color: string;
}

/** Pixels of the map covered by floating UI on each side */
export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: MapInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Fly so `bounds` fills the area the floating panels leave free.
 * Computed by hand (Web Mercator maths) instead of fitBounds: on the globe, MapLibre's
 * fitBounds ignores the map's own padding, so routes ended up under the panels.
 */
function frameBounds(
  map: MLMap,
  container: HTMLElement,
  insets: MapInsets,
  bounds: maplibregl.LngLatBounds,
  options: Omit<maplibregl.FlyToOptions, "center" | "zoom" | "padding"> & { maxZoom?: number } = {}
) {
  const { maxZoom = 13, ...fly } = options;
  const base = fitPadding(insets, container);
  const freeW = container.clientWidth - base.left - base.right;
  const freeH = container.clientHeight - base.top - base.bottom;
  const margin = Math.max(0, Math.min(48, (freeW - 80) / 2, (freeH - 80) / 2));

  const mx = (lng: number) => (lng + 180) / 360;
  const my = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  const x1 = mx(bounds.getWest());
  const x2 = mx(bounds.getEast());
  const y1 = my(bounds.getNorth());
  const y2 = my(bounds.getSouth());
  const tile = 512;
  const w = Math.max(Math.abs(x2 - x1) * tile, 1e-9);
  const h = Math.max(Math.abs(y2 - y1) * tile, 1e-9);
  const zoom = Math.max(1, Math.min(maxZoom, Math.log2(Math.min((freeW - 2 * margin) / w, (freeH - 2 * margin) / h))));
  const cy = (y1 + y2) / 2;
  const centerLat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI;
  const centerLng = ((x1 + x2) / 2) * 360 - 180;

  map.flyTo({ center: [centerLng, centerLat], zoom, padding: base, essential: true, ...fly });
}

/**
 * Never let padding swallow the map: MapLibre produces NaN/garbage cameras when the
 * padded area has no room left (e.g. a tall bottom sheet on a phone). Scales the padding
 * down so at least `min` pixels remain in each direction.
 */
function fitPadding(p: MapInsets, container: HTMLElement | null, min = 120): MapInsets {
  const w = container?.clientWidth || 0;
  const h = container?.clientHeight || 0;
  if (!w || !h) return p;
  const vScale = p.top + p.bottom > h - min ? Math.max(0, h - min) / (p.top + p.bottom) : 1;
  const hScale = p.left + p.right > w - min ? Math.max(0, w - min) / (p.left + p.right) : 1;
  return {
    top: Math.floor(p.top * vScale),
    bottom: Math.floor(p.bottom * vScale),
    left: Math.floor(p.left * hScale),
    right: Math.floor(p.right * hScale),
  };
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapViewProps {
  spots: MapSpot[];
  destinations: DestinationSummary[];
  activeSpotId: number | null;
  hoverSpotId: number | null;
  onSelectSpot: (spot: MapSpot) => void;
  onSelectDestination: (dest: DestinationSummary) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  onReady?: (api: MapApi) => void;
  /** Area covered by floating panels right now — the globe centres in what's left */
  insets?: MapInsets;
  /** Area that will be covered once a spot's details open — flights land clear of it */
  focusInsets?: MapInsets;
  route?: MapRoute | null;
  /** Fly from space into India automatically after load (off while a landing hero is shown) */
  autoIntro?: boolean;
}

// Served from /public (see scripts/copy-maplibre-worker.mjs); the bundled worker URL doesn't load under Turbopack
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const INDIA: [number, number] = [79.4, 22.8];
// Start just east of India so the subcontinent turns into view first
const SPACE_START: [number, number] = [96, 16];
const SPIN_MAX_ZOOM = 3.5;
const SPIN_DEG_PER_SEC = 6;
const SOURCE = "spots";

type StyleKey = "map" | "satellite";

function styleUrl(key: StyleKey): string {
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!apiKey) return "https://demotiles.maplibre.org/style.json";
  return `https://api.maptiler.com/maps/${key === "map" ? "streets-v2" : "hybrid"}/style.json?key=${apiKey}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function thumb(url: string | null | undefined, w: number): string | null {
  return sizedImageUrl(url, w, w);
}

function previewHtml(spot: MapSpot): string {
  const cat = primaryCategory(spot.categories);
  const img = sizedImageUrl(spot.coverImageUrl, 460, 240);
  const rating = spot.rating
    ? `<span style="color:#f59e0b">★</span> <b style="color:#0f172a">${spot.rating.toFixed(1)}</b>${spot.reviewCount ? ` (${spot.reviewCount.toLocaleString("en-IN")})` : ""} · `
    : "";
  const dest = spot.destination.name !== spot.name ? ` · ${escapeHtml(spot.destination.name)}` : "";
  return `<div class="gs-tip">
    ${img ? `<img class="gs-tip-img" src="${escapeHtml(img)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'"/>` : ""}
    <div class="gs-tip-body">
      <div class="gs-tip-name">${escapeHtml(spot.name)}</div>
      <div class="gs-tip-meta">${rating}<span style="color:${cat.color};font-weight:600">${escapeHtml(cat.name)}</span>${dest}</div>
      <div class="gs-tip-cta">Explore details →</div>
    </div>
  </div>`;
}

/** Great-circle arc between two points, so routes curve naturally over the globe */
function greatCircle(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }, steps = 48): Array<[number, number]> {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lat1, lon1, lat2, lon2] = [toRad(a.latitude), toRad(a.longitude), toRad(b.latitude), toRad(b.longitude)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d === 0) return [[a.longitude, a.latitude]];
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return out;
}

function routeGeoJSON(route: MapRoute | null): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  if (!route || route.points.length < 2) return { type: "FeatureCollection", features: [] };
  const coords: Array<[number, number]> = [];
  for (let i = 1; i < route.points.length; i++) {
    const leg = greatCircle(route.points[i - 1], route.points[i]);
    coords.push(...(i > 1 ? leg.slice(1) : leg));
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] };
}

// Marching-ants frames for the route line (MapLibre "animate a line" technique)
const DASH_FRAMES: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

function toGeoJSON(spots: Iterable<MapSpot>): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: [...spots].map((s) => ({
      type: "Feature",
      id: s.id,
      geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id },
    })),
  };
}

export default function MapView({
  spots,
  destinations,
  activeSpotId,
  hoverSpotId,
  onSelectSpot,
  onSelectDestination,
  onBoundsChange,
  onReady,
  insets = NO_INSETS,
  focusInsets = NO_INSETS,
  route = null,
  autoIntro = true,
}: MapViewProps) {
  const autoIntroRef = useRef(autoIntro);
  useEffect(() => {
    autoIntroRef.current = autoIntro;
  }, [autoIntro]);
  const routeRef = useRef<MapRoute | null>(route);
  const stopMarkers = useRef<Marker[]>([]);
  const insetsRef = useRef(insets);
  const focusInsetsRef = useRef(focusInsets);
  useEffect(() => {
    focusInsetsRef.current = focusInsets;
  }, [focusInsets]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const spotsRef = useRef<Map<number, MapSpot>>(new Map());
  const pointMarkers = useRef<Map<number, Marker>>(new Map());
  const clusterMarkers = useRef<Map<string, Marker>>(new Map());
  const destMarkers = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  const popupSpotRef = useRef<number | null>(null);
  const popupCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationMarker = useRef<Marker | null>(null);
  const stateRef = useRef({ active: null as number | null, hover: null as number | null });
  const spinRef = useRef({ enabled: true, userBusy: false });
  const styleRef = useRef<StyleKey>("map");

  // Latest callbacks for MapLibre/DOM handlers, which are bound once
  const callbacks = useRef({ onSelectSpot, onSelectDestination, onBoundsChange, onReady });
  useEffect(() => {
    callbacks.current = { onSelectSpot, onSelectDestination, onBoundsChange, onReady };
  });

  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<StyleKey>("map");
  const [spinning, setSpinning] = useState(true);
  const [locating, setLocating] = useState(false);

  // ── Marker elements ───────────────────────────────────────────────────────

  const applyState = useCallback((id: number) => {
    const el = pointMarkers.current.get(id)?.getElement();
    if (!el) return;
    const { active, hover } = stateRef.current;
    el.classList.toggle("is-active", id === active);
    el.classList.toggle("is-hover", id === hover && id !== active);
    el.style.zIndex = id === active ? "30" : id === hover ? "20" : "";
  }, []);

  // ── Hover preview card ────────────────────────────────────────────────────
  // One card at a time, tied to its spot. It stays open while the pointer moves from the
  // pin onto the card, closes when the pin disappears into a cluster or the map moves,
  // and clicking it opens the spot.

  const closePreview = useCallback(() => {
    if (popupCloseTimer.current) clearTimeout(popupCloseTimer.current);
    popupCloseTimer.current = null;
    popupRef.current?.remove();
    popupRef.current = null;
    popupSpotRef.current = null;
  }, []);

  const schedulePreviewClose = useCallback(() => {
    if (popupCloseTimer.current) clearTimeout(popupCloseTimer.current);
    popupCloseTimer.current = setTimeout(closePreview, 160);
  }, [closePreview]);

  const openPreview = useCallback(
    (spot: MapSpot) => {
      const map = mapRef.current;
      if (!map) return;
      if (popupCloseTimer.current) clearTimeout(popupCloseTimer.current);
      if (popupSpotRef.current === spot.id) return;
      closePreview();
      // The pin is ~60px tall above its point; place the card clear of it on whichever side fits
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "gs-popup",
        maxWidth: "none",
        offset: {
          top: [0, 10],
          "top-left": [10, 10],
          "top-right": [-10, 10],
          bottom: [0, -66],
          "bottom-left": [10, -60],
          "bottom-right": [-10, -60],
          left: [30, -32],
          right: [-30, -32],
          center: [0, 0],
        },
      })
        .setLngLat([spot.longitude, spot.latitude])
        .setHTML(previewHtml(spot))
        .addTo(map);
      const card = popup.getElement();
      card.addEventListener("mouseenter", () => {
        if (popupCloseTimer.current) clearTimeout(popupCloseTimer.current);
      });
      card.addEventListener("mouseleave", schedulePreviewClose);
      card.addEventListener("click", () => {
        closePreview();
        callbacks.current.onSelectSpot(spot);
      });
      popupRef.current = popup;
      popupSpotRef.current = spot.id;
    },
    [closePreview, schedulePreviewClose]
  );

  const createPointMarker = useCallback((spot: MapSpot): Marker => {
    const cat = primaryCategory(spot.categories);
    const el = document.createElement("button");
    el.className = "gm-pin";
    el.setAttribute("aria-label", spot.name);
    el.style.setProperty("--cat", cat.color);
    const img = thumb(spot.coverImageUrl, 120);
    el.innerHTML = `<span class="gm-pin-tile">${
      img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"/>` : ""
    }<span class="gm-pin-dot"></span></span><span class="gm-pin-label">${escapeHtml(spot.name)}</span>`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closePreview();
      callbacks.current.onSelectSpot(spot);
    });

    if (window.matchMedia("(hover: hover)").matches) {
      el.addEventListener("mouseenter", () => openPreview(spot));
      el.addEventListener("mouseleave", schedulePreviewClose);
    }

    return new maplibregl.Marker({ element: el, anchor: "bottom", opacityWhenCovered: "0" }).setLngLat([spot.longitude, spot.latitude]);
  }, [closePreview, openPreview, schedulePreviewClose]);

  const createClusterMarker = useCallback((clusterId: number, count: number, lngLat: [number, number]): Marker => {
    const map = mapRef.current!;
    const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
    const el = document.createElement("button");
    el.className = "gm-cluster";
    el.setAttribute("aria-label", `${count} places, zoom in`);
    el.innerHTML = `<span class="gm-cluster-stack"></span><span class="gm-cluster-count">${count}</span>`;

    // Up to three real photos from the cluster, stacked like cards
    source
      ?.getClusterLeaves(clusterId, 8, 0)
      .then((leaves) => {
        const imgs = leaves
          .map((f) => thumb(spotsRef.current.get(Number(f.properties?.id))?.coverImageUrl, 120))
          .filter((u): u is string => Boolean(u))
          .slice(0, 3);
        const stack = el.querySelector(".gm-cluster-stack");
        if (stack) {
          stack.innerHTML = imgs
            .map((u, i) => `<span class="gm-cluster-card c${i}"><img src="${escapeHtml(u)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"/></span>`)
            .reverse()
            .join("");
        }
      })
      .catch(() => {});

    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      spinRef.current.userBusy = true;
      let zoom = map.getZoom() + 2;
      try {
        zoom = (await source!.getClusterExpansionZoom(clusterId)) + 0.5;
      } catch {}
      map.easeTo({ center: lngLat, zoom: Math.min(zoom, 16), duration: 800 });
    });

    return new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0" }).setLngLat(lngLat);
  }, []);

  // Keep HTML markers in step with what the clustered source currently shows
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE) || !map.isSourceLoaded(SOURCE)) return;

    const nextPoints = new Set<number>();
    const nextClusters = new Set<string>();

    for (const f of map.querySourceFeatures(SOURCE)) {
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = f.properties || {};
      if (props.cluster) {
        const key = String(props.cluster_id);
        if (nextClusters.has(key)) continue;
        nextClusters.add(key);
        if (!clusterMarkers.current.has(key)) {
          const m = createClusterMarker(Number(props.cluster_id), Number(props.point_count), coords).addTo(map);
          clusterMarkers.current.set(key, m);
        }
      } else {
        const id = Number(props.id);
        if (nextPoints.has(id)) continue;
        nextPoints.add(id);
        if (!pointMarkers.current.has(id)) {
          const spot = spotsRef.current.get(id);
          if (!spot) continue;
          pointMarkers.current.set(id, createPointMarker(spot).addTo(map));
          applyState(id);
        }
      }
    }

    for (const [key, m] of clusterMarkers.current) {
      if (!nextClusters.has(key)) {
        m.remove();
        clusterMarkers.current.delete(key);
      }
    }
    for (const [id, m] of pointMarkers.current) {
      if (!nextPoints.has(id)) {
        if (popupSpotRef.current === id) closePreview();
        m.remove();
        pointMarkers.current.delete(id);
      }
    }

    // Place names only when zoomed in far enough to read them
    containerRef.current?.classList.toggle("show-labels", map.getZoom() >= 10.5);
    // Area labels only at regional zoom, where they help rather than clutter
    containerRef.current?.classList.toggle("show-dests", map.getZoom() >= 6.5);
  }, [applyState, closePreview, createClusterMarker, createPointMarker]);

  // ── Globe rotation ────────────────────────────────────────────────────────

  const spin = useCallback(() => {
    const map = mapRef.current;
    if (!map || !spinRef.current.enabled || spinRef.current.userBusy) return;
    if (map.getZoom() > SPIN_MAX_ZOOM) return;
    const center = map.getCenter();
    center.lng -= SPIN_DEG_PER_SEC;
    map.easeTo({ center, duration: 1000, easing: (n) => n });
  }, []);

  // ── Globe, atmosphere and spot source (re-installed after every style switch) ─

  const installStyleExtras = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setProjection({ type: "globe" });
    map.setSky({
      "sky-color": "#0b1d3a",
      "horizon-color": "#9fd3ff",
      "fog-color": "#cfe8ff",
      "sky-horizon-blend": 0.5,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
    });
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, {
        type: "geojson",
        data: toGeoJSON(spotsRef.current.values()),
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 13,
      });
      // Invisible layer so the source's tiles load and can be queried
      map.addLayer({ id: "spots-hit", type: "circle", source: SOURCE, paint: { "circle-radius": 0, "circle-opacity": 0 } });
    }
    if (!map.getSource("route")) {
      const color = routeRef.current?.color || "#f59e0b";
      map.addSource("route", { type: "geojson", data: routeGeoJSON(routeRef.current) });
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": 12, "line-opacity": 0.22, "line-blur": 6 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": 3.5, "line-dasharray": DASH_FRAMES[0] },
      });
    }
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const points = pointMarkers.current;
    const clusters = clusterMarkers.current;

    const map = new maplibregl.Map({
      container,
      style: styleUrl("map"),
      center: SPACE_START,
      zoom: 1.3,
      minZoom: 0.8,
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("style.load", () => {
      installStyleExtras();
      syncMarkers();
    });

    let lastSync = 0;
    map.on("render", () => {
      const now = performance.now();
      if (now - lastSync < 120) return;
      lastSync = now;
      syncMarkers();
    });
    map.on("sourcedata", (e: MapSourceDataEvent) => {
      if (e.sourceId === SOURCE && e.isSourceLoaded) syncMarkers();
    });

    const emitBounds = () => {
      if (map.getZoom() < 4) {
        callbacks.current.onBoundsChange({ north: 90, south: -90, east: 180, west: -180 });
        return;
      }
      const b = map.getBounds();
      callbacks.current.onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    };
    // A moving map would leave the card behind its pin
    map.on("movestart", closePreview);
    // Follow-up camera work runs after "moveend" has fully finished: starting an animation
    // inside it (it fires synchronously when a new flight cancels the current one) crashes
    // MapLibre's easing ("_onEaseFrame is not a function").
    // (Waits briefly so a panel opening right after a flight updates the insets first.)
    const afterSettle = () =>
      setTimeout(() => {
        if (mapRef.current !== map || map.isMoving()) return;
        const want = fitPadding(insetsRef.current, container);
        const have = map.getPadding();
        if (want.top !== have.top || want.bottom !== have.bottom || want.left !== have.left || want.right !== have.right) {
          map.easeTo({ padding: want, duration: 450 });
          return;
        }
        spin();
      }, 250);
    map.on("moveend", () => {
      emitBounds();
      syncMarkers();
      afterSettle();
    });

    // Rotation pauses while the visitor drags or scrolls, and stops for good after a deliberate move
    map.on("mousedown", () => (spinRef.current.userBusy = true));
    map.on("touchstart", () => (spinRef.current.userBusy = true));
    map.on("wheel", () => (spinRef.current.userBusy = true));

    map.on("load", () => {
      setReady(true);
      emitBounds();
      // Run one camera move and resolve when the map comes to rest
      let moveSeq = 0;
      const animate = (start: () => void) =>
        new Promise<boolean>((resolve) => {
          const seq = ++moveSeq;
          spinRef.current.userBusy = true; // a deliberate move stops the rotation
          start();
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            map.off("moveend", finish);
            resolve(seq === moveSeq);
          };
          // Safety net in case no "moveend" arrives (e.g. a zero-length move)
          const timer = setTimeout(finish, 9000);
          if (!map.isMoving()) finish();
          else map.on("moveend", finish);
        });

      // Long journeys swing out over the globe before coming back down
      const travel = (lng: number, lat: number) => {
        const from = map.getCenter();
        const km = from.distanceTo(new maplibregl.LngLat(lng, lat)) / 1000;
        return km > 600 ? { speed: 0.8, curve: 1.9 } : { speed: 1.2, curve: 1.4 };
      };

      const frame = (b: maplibregl.LngLatBounds, extra: maplibregl.FitBoundsOptions = {}) => {
        const c = b.getCenter();
        frameBounds(map, container, insetsRef.current, b, { ...travel(c.lng, c.lat), ...extra });
      };

      callbacks.current.onReady?.({
        flyTo: (lat, lng, zoom = 14) =>
          animate(() => {
            map.flyTo({
              center: [lng, lat],
              zoom,
              ...travel(lng, lat),
              // Land in the part of the map the details panel/sheet will leave uncovered
              padding: fitPadding(focusInsetsRef.current, container),
              essential: true,
            });
          }),
        fitTo: (pts, insetsOverride) =>
          animate(() => {
            if (insetsOverride) insetsRef.current = insetsOverride;
            if (pts.length === 0) return;
            if (pts.length === 1) {
              map.flyTo({ center: [pts[0].longitude, pts[0].latitude], zoom: 12, ...travel(pts[0].longitude, pts[0].latitude), essential: true });
              return;
            }
            const b = new maplibregl.LngLatBounds();
            pts.forEach((p) => b.extend([p.longitude, p.latitude]));
            frame(b);
          }),
        flyToPlace: (lat, lng, bbox) =>
          animate(() => {
            if (bbox && Math.abs(bbox[2] - bbox[0]) > 0.02) {
              frame(new maplibregl.LngLatBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]), { maxZoom: 14 });
            } else {
              map.flyTo({ center: [lng, lat], zoom: 13, ...travel(lng, lat), essential: true });
            }
          }),
        revealSpot: (spotId) =>
          animate(() => {
            const s = spotsRef.current.get(spotId);
            if (s) map.flyTo({ center: [s.longitude, s.latitude], zoom: 15, ...travel(s.longitude, s.latitude), essential: true });
          }),
        surpriseTo: async (lat, lng) => {
          // Rise into space while the Earth turns beneath the camera…
          const c = map.getCenter();
          await animate(() =>
            map.easeTo({
              center: [c.lng + 140, 12],
              zoom: 1.7,
              duration: 2400,
              easing: (t) => t * (2 - t),
              essential: true,
            })
          );
          // …then dive onto the place
          return animate(() =>
            map.flyTo({ center: [lng, lat], zoom: 13.5, speed: 0.75, curve: 1.6, padding: fitPadding(focusInsetsRef.current, container), essential: true })
          );
        },
      });

      // Intro: a moment of rotating Earth, then fly down to India — unless a deep link
      // or the visitor already took over
      spin();
      setTimeout(() => {
        if (spinRef.current.userBusy || !autoIntroRef.current) return;
        spinRef.current.userBusy = true;
        map.flyTo({ center: INDIA, zoom: window.innerWidth <= 860 ? 3.4 : 4.1, speed: 0.9, curve: 1.4, essential: true });
      }, 1200);
    });

    return () => {
      points.clear();
      clusters.clear();
      closePreview();
      map.remove();
      mapRef.current = null;
    };
  }, [closePreview, installStyleExtras, spin, syncMarkers]);

  // Journey / trip route: arcs on the globe, numbered stops and marching dashes
  useEffect(() => {
    routeRef.current = route;
    const map = mapRef.current;
    stopMarkers.current.forEach((m) => m.remove());
    stopMarkers.current = [];
    if (!map || !ready) return;
    const source = map.getSource("route") as GeoJSONSource | undefined;
    source?.setData(routeGeoJSON(route));
    if (!route || route.points.length === 0) return;
    if (map.getLayer("route-line")) {
      map.setPaintProperty("route-line", "line-color", route.color);
      map.setPaintProperty("route-glow", "line-color", route.color);
    }
    stopMarkers.current = route.points.map((p, i) => {
      const el = document.createElement("div");
      el.className = "gm-stop";
      el.style.setProperty("--route", route.color);
      el.textContent = String(i + 1);
      return new maplibregl.Marker({ element: el, anchor: "center", offset: [22, -64], opacityWhenCovered: "0" })
        .setLngLat([p.longitude, p.latitude])
        .addTo(map);
    });
    let frame = 0;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 70 && map.getLayer("route-line")) {
        last = t;
        frame = (frame + 1) % DASH_FRAMES.length;
        map.setPaintProperty("route-line", "line-dasharray", DASH_FRAMES[frame]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, ready]);

  // Keep the globe centred in the uncovered part of the screen as panels open and close
  useEffect(() => {
    insetsRef.current = insets;
    const map = mapRef.current;
    if (!map || !ready) return;
    // While a flight is running, the "moveend" handler applies the new padding once it lands
    if (!map.isMoving()) map.easeTo({ padding: fitPadding(insets, containerRef.current), duration: 450 });
  }, [insets, ready]);

  // ── Data updates ──────────────────────────────────────────────────────────

  useEffect(() => {
    spotsRef.current = new Map(spots.map((s) => [s.id, s]));
    const map = mapRef.current;
    if (!map || !ready) return;
    // Spot list changed (category filter or new approvals): rebuild markers from the new data
    pointMarkers.current.forEach((m) => m.remove());
    pointMarkers.current.clear();
    clusterMarkers.current.forEach((m) => m.remove());
    clusterMarkers.current.clear();
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(toGeoJSON(spots));
  }, [spots, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    destMarkers.current.forEach((m) => m.remove());
    destMarkers.current = destinations.map((d) => {
      const el = document.createElement("button");
      el.className = "gm-dest";
      el.innerHTML = `<span class="gm-dest-dot"></span>${escapeHtml(d.name)}`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.current.onSelectDestination(d);
      });
      return new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0" }).setLngLat([d.longitude, d.latitude]).addTo(map);
    });
  }, [destinations, ready]);

  useEffect(() => {
    const prev = stateRef.current.active;
    stateRef.current.active = activeSpotId;
    if (prev !== null) applyState(prev);
    if (activeSpotId !== null) applyState(activeSpotId);
  }, [activeSpotId, applyState]);

  useEffect(() => {
    const prev = stateRef.current.hover;
    stateRef.current.hover = hoverSpotId;
    if (prev !== null) applyState(prev);
    if (hoverSpotId !== null) applyState(hoverSpotId);
  }, [hoverSpotId, applyState]);

  // ── Controls ──────────────────────────────────────────────────────────────

  function toggleLayer() {
    const map = mapRef.current;
    if (!map) return;
    const next: StyleKey = styleRef.current === "map" ? "satellite" : "map";
    styleRef.current = next;
    setLayer(next);
    map.setStyle(styleUrl(next)); // "style.load" re-installs the globe, sky and spot source
  }

  function toggleSpin() {
    const map = mapRef.current;
    const next = !spinRef.current.enabled;
    spinRef.current.enabled = next;
    spinRef.current.userBusy = false;
    setSpinning(next);
    if (!map) return;
    if (!next) {
      map.stop();
    } else if (map.getZoom() > SPIN_MAX_ZOOM) {
      map.flyTo({ center: map.getCenter(), zoom: 1.6, speed: 1.2, essential: true });
    } else {
      spin();
    }
  }

  function viewGlobe() {
    const map = mapRef.current;
    if (!map) return;
    spinRef.current.userBusy = false;
    map.flyTo({ center: map.getCenter(), zoom: 1.5, speed: 1.2, essential: true });
  }

  function locate() {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        locationMarker.current?.remove();
        const el = document.createElement("div");
        el.className = "gm-me";
        locationMarker.current = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
        spinRef.current.userBusy = true;
        map.flyTo({ center: ll, zoom: 11, essential: true });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  function showAll() {
    const map = mapRef.current;
    if (!map || spots.length === 0) return;
    spinRef.current.userBusy = true;
    const b = new maplibregl.LngLatBounds();
    spots.forEach((s) => b.extend([s.longitude, s.latitude]));
    if (containerRef.current) frameBounds(map, containerRef.current, insetsRef.current, b, { duration: 1800, maxZoom: 12 });
  }

  return (
    <>
      <div ref={containerRef} className="gm-canvas" />
      <div className="gs-map-controls">
        <div className="gs-ctrl-group">
          <button className="gs-ctrl" onClick={() => mapRef.current?.zoomIn({ duration: 300 })} title="Zoom in" aria-label="Zoom in">
            <Plus size={18} />
          </button>
          <button className="gs-ctrl" onClick={() => mapRef.current?.zoomOut({ duration: 300 })} title="Zoom out" aria-label="Zoom out">
            <Minus size={18} />
          </button>
        </div>
        <div className="gs-ctrl-group">
          <button className={`gs-ctrl ${layer === "satellite" ? "is-on" : ""}`} onClick={toggleLayer} title={layer === "map" ? "Satellite view" : "Map view"} aria-label="Toggle satellite view">
            <Layers size={18} />
          </button>
          <button className="gs-ctrl" onClick={viewGlobe} title="View the whole globe" aria-label="View the whole globe">
            <Globe2 size={18} />
          </button>
          <button className={`gs-ctrl ${spinning ? "is-on" : ""}`} onClick={toggleSpin} title={spinning ? "Stop rotating" : "Rotate the globe"} aria-label="Toggle globe rotation">
            {spinning ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button className="gs-ctrl" onClick={locate} title="Show my location" aria-label="Show my location" disabled={locating}>
            <LocateFixed size={18} className={locating ? "gs-spin" : undefined} />
          </button>
          <button className="gs-ctrl" onClick={showAll} title="Show all places" aria-label="Show all places">
            <Maximize size={17} />
          </button>
        </div>
      </div>
    </>
  );
}
