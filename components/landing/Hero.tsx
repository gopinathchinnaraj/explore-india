"use client";

import { Compass, Route, Dices } from "lucide-react";

export default function Hero({
  places,
  states,
  journeys,
  onExplore,
  onJourneys,
  onSurprise,
}: {
  places: number;
  states: number;
  journeys: number;
  onExplore: () => void;
  onJourneys: () => void;
  onSurprise: () => void;
}) {
  return (
    <div className="gs-hero" role="dialog" aria-label="Welcome to Explore India">
      <div className="gs-hero-inner">
        <div className="gs-hero-eyebrow">
          <span className="gs-hero-dot" /> A living atlas of India
        </div>
        <h1 className="gs-hero-title">
          Explore <span>India</span>
        </h1>
        <p className="gs-hero-sub">
          Spin the globe, fly to temples, forts, beaches and Himalayan passes, and let AI turn your favourite places into a trip.
        </p>
        <div className="gs-hero-stats">
          <div>
            <strong>{places || "—"}</strong>
            <span>places</span>
          </div>
          <div>
            <strong>{states || "—"}</strong>
            <span>states & UTs</span>
          </div>
          <div>
            <strong>{journeys}</strong>
            <span>journeys</span>
          </div>
        </div>
        <div className="gs-hero-actions">
          <button className="gs-btn gs-hero-primary" onClick={onExplore}>
            <Compass size={17} /> Start exploring
          </button>
          <button className="gs-btn gs-hero-ghost" onClick={onJourneys}>
            <Route size={17} /> Take a journey
          </button>
          <button className="gs-btn gs-hero-ghost" onClick={onSurprise}>
            <Dices size={17} /> Surprise me
          </button>
        </div>
      </div>
    </div>
  );
}
