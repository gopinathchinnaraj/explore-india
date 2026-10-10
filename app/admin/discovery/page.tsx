"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Telescope,
  Star,
  MapPin,
  Check,
  X,
  TriangleAlert,
  Database,
  RefreshCw,
  Inbox,
  CloudDownload,
  Navigation,
} from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { api, compact, Empty, Loading, Spinner, StatusBadge, timeAgo, useToast } from "@/components/admin/ui";

interface Candidate {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  thumbnailUrl: string | null;
  type: string | null;
  description: string | null;
  score: number;
  flags: string[];
  likelyAttraction: boolean;
  existing: { id: number; name: string; status: string } | null;
  nearestDestination: { id: number; name: string; distanceKm: number } | null;
}

interface SearchResult {
  searchId: number;
  query: string;
  fromCache: boolean;
  fetchedAt: string;
  candidates: Candidate[];
}

interface QueueSpot {
  id: number;
  name: string;
  status: string;
  rating: number | null;
  reviewCount: number | null;
  coverImageUrl: string | null;
  discoveryScore: number | null;
  address: string | null;
  createdAt: string;
  destination: { id: number; name: string };
  categories: Array<{ id: number; name: string }>;
}

interface Destination {
  id: number;
  name: string;
}

interface LocalSpot {
  id: number;
  name: string;
  status: string;
  destination: { name: string };
  coverImageUrl: string | null;
}

const SUGGESTIONS = [
  "tourist attractions in Hampi",
  "waterfalls near Sakleshpur",
  "beaches near Gokarna",
  "temples in Udupi",
  "viewpoints in Chikmagalur",
  "hidden places near Coorg",
];

export default function DiscoveryPage() {
  const toast = useToast();
  const [destinations, setDestinations] = useState<Destination[]>([]);

  // Search
  const [query, setQuery] = useState("");
  const [near, setNear] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [view, setView] = useState<"all" | "new" | "clean">("new");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [importing, setImporting] = useState<"queue" | "approve" | null>(null);

  // Local "already in database" lookup while typing
  const [localResult, setLocalResult] = useState<{ q: string; spots: LocalSpot[] }>({ q: "", spots: [] });
  const [showLocal, setShowLocal] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Review queue
  const [queue, setQueue] = useState<QueueSpot[] | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const [queueFilter, setQueueFilter] = useState("");
  const [queueSelected, setQueueSelected] = useState<Set<number>>(new Set());
  const [queueBusy, setQueueBusy] = useState(false);

  useEffect(() => {
    api<{ destinations: Destination[] }>("/api/admin/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch(() => {});
  }, []);

  const loadQueue = useCallback(() => setQueueVersion((v) => v + 1), []);

  useEffect(() => {
    let ignore = false;
    api<{ candidates: QueueSpot[] }>("/api/admin/discovery")
      .then((d) => {
        if (ignore) return;
        setQueue(d.candidates);
        setQueueSelected(new Set());
      })
      .catch((e) => !ignore && toast(e instanceof Error ? e.message : "Failed to load review queue", "bad"));
    return () => {
      ignore = true;
    };
  }, [toast, queueVersion]);

  // Debounced database lookup — avoids paying for a search we already have
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (trimmedQuery.length < 2) return;
    let ignore = false;
    const t = setTimeout(() => {
      api<{ spots: LocalSpot[] }>(`/api/admin/spots?search=${encodeURIComponent(trimmedQuery)}&limit=6&sort=rating`)
        .then((d) => !ignore && setLocalResult({ q: trimmedQuery, spots: d.spots }))
        .catch(() => {});
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(t);
    };
  }, [trimmedQuery]);
  const localMatches = trimmedQuery.length >= 2 && localResult.q === trimmedQuery ? localResult.spots : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setShowLocal(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function runSearch(q = query, fresh = false) {
    const text = q.trim();
    if (text.length < 2) return;
    setQuery(text);
    setShowLocal(false);
    setSearching(true);
    setSearchError(null);
    setSelected(new Set());
    try {
      const data = await api<SearchResult>("/api/admin/discovery", {
        method: "POST",
        json: { query: text, destinationId: near || undefined, fresh },
      });
      setResult(data);
      // Pre-select the obvious picks: new, attraction-like places
      setSelected(new Set(data.candidates.filter((c) => !c.existing && c.likelyAttraction).map((c) => c.key)));
      setView(data.candidates.some((c) => !c.existing) ? "new" : "all");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function importSelected(approve: boolean) {
    if (!result || selected.size === 0) return;
    setImporting(approve ? "approve" : "queue");
    try {
      const r = await api<{ created: Array<{ id: number; name: string }>; skipped: Array<{ name: string; reason: string }> }>(
        "/api/admin/discovery/import",
        {
          method: "POST",
          json: { searchId: result.searchId, keys: [...selected], destinationId: assignTo || undefined, approve },
        }
      );
      const msg = approve
        ? `${r.created.length} spot${r.created.length === 1 ? "" : "s"} published — photos, reviews & videos are being fetched`
        : `${r.created.length} spot${r.created.length === 1 ? "" : "s"} added to the review queue`;
      toast(r.skipped.length ? `${msg} · ${r.skipped.length} skipped` : msg);
      // Re-run the (cached, free) search so imported places show as "in database"
      await runSearch(result.query);
      loadQueue();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "bad");
    } finally {
      setImporting(null);
    }
  }

  async function decide(ids: number[], status: "APPROVED" | "REJECTED") {
    if (ids.length === 0) return;
    setQueueBusy(true);
    try {
      await api("/api/admin/spots", { method: "PATCH", json: { spotIds: ids, status } });
      toast(
        status === "APPROVED"
          ? `${ids.length} published to the map — fetching photos & reviews in the background`
          : `${ids.length} rejected`
      );
      loadQueue();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "bad");
    } finally {
      setQueueBusy(false);
    }
  }

  const shown = useMemo(() => {
    if (!result) return [];
    if (view === "new") return result.candidates.filter((c) => !c.existing);
    if (view === "clean") return result.candidates.filter((c) => !c.existing && c.likelyAttraction);
    return result.candidates;
  }, [result, view]);

  const newCount = result?.candidates.filter((c) => !c.existing).length ?? 0;
  const queueLoading = queue === null;
  const filteredQueue = (queue || []).filter((s) => {
    const f = queueFilter.trim().toLowerCase();
    return !f || s.name.toLowerCase().includes(f) || s.destination.name.toLowerCase().includes(f);
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-h1">Discovery</h1>
          <p className="adm-sub">
            Search Google Maps for any place or area. Each search costs one SerpApi credit and is cached for 7 days — repeat searches are free.
          </p>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-search-hero">
          <form
            className="adm-search-row"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <div className="adm-input-icon" ref={searchBoxRef} style={{ position: "relative" }}>
              <Search size={17} />
              <input
                className="adm-input"
                placeholder="Search places, e.g. “waterfalls near Sakleshpur” or “Murudeshwar temple”"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowLocal(true);
                }}
                onFocus={() => setShowLocal(true)}
                autoFocus
              />
              {showLocal && localMatches.length > 0 && (
                <div className="adm-dropdown">
                  <div className="adm-dropdown-label">Already in your database</div>
                  {localMatches.map((s) => (
                    <Link key={s.id} href={`/admin/spots/${s.id}`} className="adm-dropdown-item">
                      <div className="adm-thumb" style={{ width: 40, height: 30 }}>
                        <SmartImage sources={[s.coverImageUrl]} alt={s.name} width={120} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div className="adm-row-sub">{s.destination.name}</div>
                      </div>
                      <StatusBadge status={s.status} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <select className="adm-select" value={near} onChange={(e) => setNear(e.target.value)} title="Bias results around a destination" style={{ maxWidth: 220 }}>
              <option value="">Near: anywhere</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  Near {d.name}
                </option>
              ))}
            </select>
            <button type="submit" className="adm-btn adm-btn-primary adm-btn-lg" disabled={searching || query.trim().length < 2}>
              {searching ? <Spinner size={15} /> : <Telescope size={16} />} Search Google Maps
            </button>
          </form>
          <div className="adm-suggest">
            Try:
            {SUGGESTIONS.map((s) => (
              <button key={s} className="adm-chip" onClick={() => runSearch(s)} disabled={searching}>
                {s}
              </button>
            ))}
          </div>
          {searchError && (
            <div className="adm-alert bad">
              <TriangleAlert size={16} />
              <div>
                {searchError}
                {/rate limit/i.test(searchError) && " — your SerpApi plan's hourly limit was reached. Cached searches still work."}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {searching && !result && <Loading label="Searching Google Maps…" />}
      {result && (
        <div className="adm-card" style={{ marginBottom: 16 }}>
          <div className="adm-card-head" style={{ flexWrap: "wrap" }}>
            <div>
              <h2 className="adm-h2">
                {result.candidates.length} places for “{result.query}”
              </h2>
              <div className="adm-row-sub">
                {newCount} new · {result.candidates.length - newCount} already in database ·{" "}
                {result.fromCache ? `cached result from ${timeAgo(result.fetchedAt)} (free)` : "fresh from Google Maps"}
              </div>
            </div>
            <div className="adm-toolbar">
              <div className="adm-chips">
                {(
                  [
                    ["new", `New (${newCount})`],
                    ["clean", "Likely attractions"],
                    ["all", "All"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} className={`adm-chip ${view === k ? "is-active" : ""}`} onClick={() => setView(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="adm-btn adm-btn-sm" onClick={() => runSearch(result.query, true)} disabled={searching} title="Ignore cache (uses 1 credit)">
                <RefreshCw size={13} /> Fresh search
              </button>
            </div>
          </div>
          <div className="adm-card-body">
            {shown.length === 0 ? (
              <Empty title="Nothing new here" icon={<Database size={20} />}>
                Every place from this search is already in your database. Switch to “All” to see them.
              </Empty>
            ) : (
              <>
                <div className="adm-toolbar" style={{ marginBottom: 12 }}>
                  <button
                    className="adm-btn adm-btn-sm"
                    onClick={() => setSelected(new Set(shown.filter((c) => !c.existing).map((c) => c.key)))}
                  >
                    Select all new
                  </button>
                  <button className="adm-btn adm-btn-sm adm-btn-ghost" onClick={() => setSelected(new Set())}>
                    Clear selection
                  </button>
                </div>
                <div className="adm-cand-grid">
                  {shown.map((c) => (
                    <CandidateCard key={c.key} c={c} selected={selected.has(c.key)} onToggle={() => !c.existing && toggle(c.key)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selected.size > 0 && result && (
        <div className="adm-bulkbar">
          <strong>{selected.size} selected</strong>
          <span style={{ opacity: 0.7, fontSize: 12.5 }}>Assign to</span>
          <select
            className="adm-select"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            style={{ height: 30, maxWidth: 230, background: "transparent", color: "inherit", borderColor: "rgba(127,127,127,0.4)" }}
          >
            <option value="">Nearest destination (auto)</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="adm-btn adm-btn-sm" disabled={importing !== null} onClick={() => importSelected(false)}>
              {importing === "queue" ? <Spinner size={13} /> : <Inbox size={14} />} Add to review queue
            </button>
            <button
              className="adm-btn adm-btn-sm"
              style={{ background: "var(--brand)", color: "var(--on-brand)", borderColor: "var(--brand)" }}
              disabled={importing !== null}
              onClick={() => importSelected(true)}
            >
              {importing === "approve" ? <Spinner size={13} /> : <CloudDownload size={14} />} Approve & publish
            </button>
          </div>
        </div>
      )}

      {/* ── Review queue ── */}
      <div className="adm-card">
        <div className="adm-card-head" style={{ flexWrap: "wrap" }}>
          <div>
            <h2 className="adm-h2">Review queue</h2>
            <div className="adm-row-sub">Discovered and pending spots. Hidden from the public map until approved.</div>
          </div>
          <div className="adm-toolbar">
            <div className="adm-input-icon">
              <Search size={14} />
              <input className="adm-input" placeholder="Filter queue…" value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)} />
            </div>
            <button className="adm-btn adm-icon-btn" onClick={loadQueue} title="Reload">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {queueSelected.size > 0 && (
          <div className="adm-toolbar" style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <strong style={{ marginRight: "auto" }}>{queueSelected.size} selected</strong>
            <button className="adm-btn adm-btn-sm adm-btn-ok" disabled={queueBusy} onClick={() => decide([...queueSelected], "APPROVED")}>
              <Check size={14} /> Approve & publish
            </button>
            <button className="adm-btn adm-btn-sm adm-btn-bad" disabled={queueBusy} onClick={() => decide([...queueSelected], "REJECTED")}>
              <X size={14} /> Reject
            </button>
          </div>
        )}

        {queueLoading ? (
          <Loading />
        ) : filteredQueue.length === 0 ? (
          <Empty title="The review queue is empty" icon={<Inbox size={20} />}>
            Search above and add places to the queue, or publish them directly.
          </Empty>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th className="shrink">
                    <label className="adm-check">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={queueSelected.size === filteredQueue.length}
                        onChange={(e) => setQueueSelected(e.target.checked ? new Set(filteredQueue.map((s) => s.id)) : new Set())}
                      />
                    </label>
                  </th>
                  <th>Place</th>
                  <th className="adm-hide-sm">Rating</th>
                  <th className="adm-hide-sm">Score</th>
                  <th className="adm-hide-sm">Found</th>
                  <th>Status</th>
                  <th className="shrink" />
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((s) => (
                  <tr key={s.id} className={queueSelected.has(s.id) ? "is-selected" : ""}>
                    <td>
                      <label className="adm-check">
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.name}`}
                          checked={queueSelected.has(s.id)}
                          onChange={() =>
                            setQueueSelected((prev) => {
                              const n = new Set(prev);
                              if (n.has(s.id)) n.delete(s.id);
                              else n.add(s.id);
                              return n;
                            })
                          }
                        />
                      </label>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 220 }}>
                        <div className="adm-thumb adm-thumb-lg">
                          <SmartImage sources={[s.coverImageUrl]} alt={s.name} width={200} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/admin/spots/${s.id}`} className="adm-row-title">
                            {s.name}
                          </Link>
                          <div className="adm-row-sub">
                            {s.destination.name}
                            {s.categories.length > 0 && <> · {s.categories.map((c) => c.name).join(", ")}</>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="adm-hide-sm">
                      {s.rating ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Star size={13} fill="#f59e0b" color="#f59e0b" /> {s.rating.toFixed(1)}
                          <span className="adm-muted">({compact(s.reviewCount)})</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="adm-hide-sm">{s.discoveryScore ?? "—"}</td>
                    <td className="adm-hide-sm adm-muted">{timeAgo(s.createdAt)}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="adm-btn adm-btn-sm adm-btn-ok" disabled={queueBusy} onClick={() => decide([s.id], "APPROVED")} title="Approve & publish">
                          <Check size={14} />
                        </button>
                        <button className="adm-btn adm-btn-sm adm-btn-bad" disabled={queueBusy} onClick={() => decide([s.id], "REJECTED")} title="Reject">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({ c, selected, onToggle }: { c: Candidate; selected: boolean; onToggle: () => void }) {
  return (
    <div
      className={`adm-cand ${selected ? "is-selected" : ""} ${c.existing ? "is-existing" : ""}`}
      onClick={onToggle}
      role={c.existing ? undefined : "checkbox"}
      aria-checked={c.existing ? undefined : selected}
      tabIndex={c.existing ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="adm-cand-img">
        <SmartImage sources={[c.thumbnailUrl]} alt={c.name} width={480} />
        {!c.existing && (
          <div className="adm-cand-check">
            <Check size={15} strokeWidth={3} />
          </div>
        )}
        <span className={`adm-badge adm-cand-score ${c.score >= 60 ? "ok" : c.score >= 40 ? "warn" : ""}`} style={{ background: "rgba(255,255,255,0.92)" }}>
          Score {c.score}
        </span>
      </div>
      <div className="adm-cand-body">
        <div className="adm-cand-name">{c.name}</div>
        <div className="adm-cand-meta">
          {c.rating && (
            <span>
              <Star size={12} fill="#f59e0b" color="#f59e0b" /> {c.rating.toFixed(1)} ({compact(c.reviewCount)})
            </span>
          )}
          {c.type && <span>{c.type}</span>}
        </div>
        {c.address && (
          <div className="adm-cand-meta">
            <span style={{ alignItems: "flex-start" }}>
              <MapPin size={12} style={{ marginTop: 2, flexShrink: 0 }} /> {c.address}
            </span>
          </div>
        )}
        {c.nearestDestination && (
          <div className="adm-cand-meta">
            <span>
              <Navigation size={12} /> {c.nearestDestination.distanceKm} km from {c.nearestDestination.name}
            </span>
          </div>
        )}
        {c.flags.length > 0 && (
          <div className="adm-cand-flags">
            {c.flags.map((f) => (
              <span key={f}>
                <TriangleAlert size={12} /> {f}
              </span>
            ))}
          </div>
        )}
        {c.existing && (
          <Link href={`/admin/spots/${c.existing.id}`} onClick={(e) => e.stopPropagation()} style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <Database size={13} className="adm-muted" />
            <span className="adm-muted" style={{ fontSize: 12 }}>In database as</span>
            <StatusBadge status={c.existing.status} />
          </Link>
        )}
      </div>
    </div>
  );
}
