"use client";

import { useEffect } from "react";
import { X, Play, Route, MapPin } from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import type { Journey } from "@/lib/journeys";
import type { MapSpot } from "@/types/spot";

export interface ResolvedJourney {
  journey: Journey;
  stops: MapSpot[];
  km: number;
}

export default function JourneyPicker({
  journeys,
  onStart,
  onClose,
}: {
  journeys: ResolvedJourney[];
  onStart: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="gs-modal-backdrop" onClick={onClose}>
      <div className="gs-modal gs-journeys" role="dialog" aria-modal="true" aria-label="Journeys" onClick={(e) => e.stopPropagation()}>
        <div className="gs-modal-head">
          <div>
            <div className="gs-eyebrow">
              <Route size={13} /> Cinematic journeys
            </div>
            <h2 className="gs-modal-title">Fly across India</h2>
            <p className="gs-modal-sub">Sit back — the globe flies you from stop to stop and opens each place as you arrive.</p>
          </div>
          <button className="gs-icon-btn gs-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="gs-journey-grid">
          {journeys.map(({ journey, stops, km }) => (
            <button
              key={journey.id}
              className="gs-journey-card"
              style={{ ["--accent" as string]: journey.color }}
              onClick={() => onStart(journey.id)}
              disabled={stops.length < 2}
            >
              <div className="gs-journey-cover">
                {stops.slice(0, 3).map((s, i) => (
                  <div key={s.id} className={`gs-journey-photo p${i}`}>
                    <SmartImage sources={[s.coverImageUrl]} alt={s.name} width={500} />
                  </div>
                ))}
                <span className="gs-journey-play">
                  <Play size={16} fill="currentColor" />
                </span>
              </div>
              <div className="gs-journey-body">
                <div className="gs-journey-title">{journey.title}</div>
                <div className="gs-journey-tagline">{journey.tagline}</div>
                <div className="gs-journey-meta">
                  <span>
                    <MapPin size={12} /> {stops.length} stops
                  </span>
                  <span>{km.toLocaleString("en-IN")} km</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
