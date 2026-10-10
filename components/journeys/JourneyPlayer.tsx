"use client";

import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import type { ResolvedJourney } from "./JourneyPicker";

export default function JourneyPlayer({
  journey,
  index,
  playing,
  onPrev,
  onNext,
  onToggle,
  onJump,
  onClose,
}: {
  journey: ResolvedJourney;
  index: number;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  const stop = journey.stops[index];
  return (
    <div className="gs-player" style={{ ["--accent" as string]: journey.journey.color }} role="region" aria-label={`${journey.journey.title} journey`}>
      <div className="gs-player-thumb">
        <SmartImage sources={[stop?.coverImageUrl]} alt={stop?.name || ""} width={120} />
      </div>
      <div className="gs-player-info">
        <div className="gs-player-journey">{journey.journey.title}</div>
        <div className="gs-player-stop">
          <span className="gs-player-num">{index + 1}</span>
          {stop?.name}
        </div>
        <div className="gs-player-progress">
          {journey.stops.map((s, i) => (
            <button
              key={s.id}
              className={`${i < index ? "done" : ""} ${i === index ? "current" : ""} ${i === index && playing ? "playing" : ""}`}
              onClick={() => onJump(i)}
              aria-label={`Go to stop ${i + 1}: ${s.name}`}
              title={s.name}
            />
          ))}
        </div>
      </div>
      <div className="gs-player-controls">
        <button className="gs-player-btn" onClick={onPrev} disabled={index === 0} aria-label="Previous stop">
          <SkipBack size={17} fill="currentColor" />
        </button>
        <button className="gs-player-btn main" onClick={onToggle} aria-label={playing ? "Pause journey" : "Play journey"}>
          {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </button>
        <button className="gs-player-btn" onClick={onNext} disabled={index >= journey.stops.length - 1} aria-label="Next stop">
          <SkipForward size={17} fill="currentColor" />
        </button>
      </div>
      <button className="gs-icon-btn gs-player-close" onClick={onClose} aria-label="End journey">
        <X size={16} />
      </button>
    </div>
  );
}
