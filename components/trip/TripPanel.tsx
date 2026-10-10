"use client";

import { useState } from "react";
import { X, Sparkles, ArrowUp, ArrowDown, Trash2, Wand2, Backpack, Route, LoaderCircle, Lightbulb, RotateCcw } from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { primaryCategory } from "@/lib/categories";
import type { MapSpot } from "@/types/spot";

interface TripPlan {
  title: string;
  summary: string;
  days: Array<{ day: number; title: string; stops: Array<{ id: number; name: string; note: string }>; travelKm: number }>;
  tips: string[];
  totalKm: number;
  source: "ai" | "route";
}

function km(a: MapSpot, b: MapSpot) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Nearest-neighbour route from the first stop */
function optimise(stops: MapSpot[]): MapSpot[] {
  if (stops.length <= 2) return stops;
  const rest = [...stops];
  const out = [rest.shift()!];
  while (rest.length) {
    const last = out[out.length - 1];
    rest.sort((a, b) => km(last, a) - km(last, b));
    out.push(rest.shift()!);
  }
  return out;
}

const DAY_OPTIONS = [0, 2, 3, 5, 7, 10];
const STYLES = ["Relaxed", "Balanced", "Action-packed"];

export default function TripPanel({
  stops,
  onSelect,
  onRemove,
  onReorder,
  onClear,
  onClose,
}: {
  stops: MapSpot[];
  onSelect: (spot: MapSpot) => void;
  onRemove: (id: number) => void;
  onReorder: (ids: number[]) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState(0);
  const [style, setStyle] = useState("Balanced");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = stops.reduce((sum, s, i) => (i ? sum + km(stops[i - 1], s) : 0), 0);
  const byId = new Map(stops.map((s) => [s.id, s]));

  function move(i: number, dir: -1 | 1) {
    const ids = stops.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onReorder(ids);
    setPlan(null);
  }

  async function planWithAI() {
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotIds: stops.map((s) => s.id), days: days || undefined, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not plan this trip");
      setPlan(data.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not plan this trip");
    } finally {
      setPlanning(false);
    }
  }

  return (
    <aside className="gs-trip" aria-label="Your trip">
      <div className="gs-trip-head">
        <div>
          <div className="gs-eyebrow">
            <Backpack size={13} /> Trip builder
          </div>
          <h2 className="gs-trip-title">Your India trip</h2>
          <div className="gs-trip-stats">
            <span>
              <strong>{stops.length}</strong> {stops.length === 1 ? "place" : "places"}
            </span>
            <span>
              <strong>{Math.round(total).toLocaleString("en-IN")}</strong> km route
            </span>
          </div>
        </div>
        <button className="gs-icon-btn" onClick={onClose} aria-label="Close trip">
          <X size={18} />
        </button>
      </div>

      <div className="gs-trip-scroll">
        {stops.length === 0 ? (
          <div className="gs-trip-empty">
            <div className="gs-trip-empty-icon">
              <Route size={26} />
            </div>
            <div className="gs-trip-empty-title">Start building your route</div>
            <p>Open any place and tap <strong>Add to trip</strong>. Your stops connect on the globe, and AI turns them into a day-by-day plan.</p>
          </div>
        ) : plan ? (
          <div className="gs-plan">
            <div className="gs-plan-head">
              <span className="gs-plan-badge">
                <Sparkles size={12} /> {plan.source === "ai" ? "AI itinerary" : "Route plan"}
              </span>
              <h3>{plan.title}</h3>
              <p>{plan.summary}</p>
              <div className="gs-trip-stats">
                <span>
                  <strong>{plan.days.length}</strong> days
                </span>
                <span>
                  <strong>{plan.totalKm.toLocaleString("en-IN")}</strong> km
                </span>
              </div>
            </div>
            <ol className="gs-timeline">
              {plan.days.map((d) => (
                <li key={d.day}>
                  <div className="gs-timeline-day">
                    Day {d.day}
                    {d.travelKm > 0 && <span>{d.travelKm.toLocaleString("en-IN")} km</span>}
                  </div>
                  <div className="gs-timeline-title">{d.title}</div>
                  {d.stops.map((st) => {
                    const spot = byId.get(st.id);
                    return (
                      <button key={st.id} className="gs-timeline-stop" onClick={() => spot && onSelect(spot)}>
                        <div className="gs-timeline-thumb">
                          <SmartImage sources={[spot?.coverImageUrl]} alt={st.name} width={120} />
                        </div>
                        <div>
                          <div className="gs-timeline-name">{st.name}</div>
                          {st.note && <div className="gs-timeline-note">{st.note}</div>}
                        </div>
                      </button>
                    );
                  })}
                </li>
              ))}
            </ol>
            {plan.tips.length > 0 && (
              <div className="gs-plan-tips">
                <div className="gs-plan-tips-title">
                  <Lightbulb size={14} /> Good to know
                </div>
                <ul>
                  {plan.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="gs-btn" style={{ width: "100%" }} onClick={() => setPlan(null)}>
              <RotateCcw size={15} /> Edit stops
            </button>
          </div>
        ) : (
          <>
            <ol className="gs-trip-list">
              {stops.map((s, i) => {
                const cat = primaryCategory(s.categories);
                const leg = i ? km(stops[i - 1], s) : 0;
                return (
                  <li key={s.id}>
                    {i > 0 && <div className="gs-trip-leg">{Math.round(leg).toLocaleString("en-IN")} km</div>}
                    <div className="gs-trip-stop">
                      <span className="gs-trip-num">{i + 1}</span>
                      <button className="gs-trip-main" onClick={() => onSelect(s)}>
                        <div className="gs-trip-thumb">
                          <SmartImage sources={[s.coverImageUrl]} alt={s.name} width={120} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="gs-trip-name">{s.name}</div>
                          <div className="gs-trip-sub">
                            <span style={{ color: cat.color }}>{cat.name}</span> · {s.state}
                          </div>
                        </div>
                      </button>
                      <div className="gs-trip-actions">
                        <button className="gs-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp size={14} />
                        </button>
                        <button className="gs-icon-btn" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Move down">
                          <ArrowDown size={14} />
                        </button>
                        <button className="gs-icon-btn" onClick={() => onRemove(s.id)} aria-label={`Remove ${s.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="gs-trip-row">
              <button className="gs-btn" onClick={() => onReorder(optimise(stops).map((s) => s.id))} disabled={stops.length < 3}>
                <Wand2 size={15} /> Shortest route
              </button>
              <button className="gs-link-btn" onClick={onClear}>
                Clear trip
              </button>
            </div>
            <div className="gs-trip-options">
              <div className="gs-trip-label">How many days?</div>
              <div className="gs-seg">
                {DAY_OPTIONS.map((d) => (
                  <button key={d} className={days === d ? "is-active" : ""} onClick={() => setDays(d)}>
                    {d === 0 ? "Auto" : d}
                  </button>
                ))}
              </div>
              <div className="gs-trip-label">Pace</div>
              <div className="gs-seg">
                {STYLES.map((st) => (
                  <button key={st} className={style === st ? "is-active" : ""} onClick={() => setStyle(st)}>
                    {st}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="gs-trip-error">{error}</div>}
          </>
        )}
      </div>

      {stops.length > 0 && !plan && (
        <div className="gs-trip-foot">
          <button className="gs-btn gs-btn-ai" onClick={planWithAI} disabled={planning}>
            {planning ? <LoaderCircle size={16} className="gs-spin" /> : <Sparkles size={16} />}
            {planning ? "Planning your trip…" : "Plan my trip with AI"}
          </button>
        </div>
      )}
    </aside>
  );
}
