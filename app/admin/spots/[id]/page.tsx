"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronRight,
  MapPin,
  Star,
  ExternalLink,
  Check,
  X,
  Archive,
  RefreshCw,
  Images,
  MessageSquare,
  Video,
  Navigation,
  History,
  LayoutDashboard,
  TriangleAlert,
  Save,
  Play,
  Globe,
  Plus,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import {
  api,
  compact,
  ConfirmDialog,
  Empty,
  engineLabel,
  formatDateTime,
  JobBadge,
  Loading,
  Spinner,
  Stars,
  StatusBadge,
  syncTone,
  timeAgo,
  useToast,
} from "@/components/admin/ui";

interface SpotDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  destinationId: number;
  destination: { id: number; name: string; slug: string };
  categories: Array<{ id: number; name: string; slug: string; icon: string | null }>;
  rating: number | null;
  reviewCount: number | null;
  latitude: number;
  longitude: number;
  address: string | null;
  coverImageUrl: string | null;
  discoveryScore: number | null;
  discoverySource: string;
  status: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastDetailsSyncAt: string | null;
  lastReviewsSyncAt: string | null;
  lastVideosSyncAt: string | null;
  lastPhotosSyncAt: string | null;
  lastNearbySyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: Array<{ id: number; imageUrl: string; thumbnailUrl: string | null; caption: string | null; isPrimary: boolean }>;
  reviews: Array<{ id: number; authorName: string | null; authorAvatarUrl: string | null; rating: number | null; reviewText: string | null; publishedAt: string | null }>;
  videos: Array<{ id: number; videoId: string; title: string; channelName: string | null; thumbnailUrl: string | null; videoUrl: string; contentType: string; relevanceScore: number | null; viewCount: number | null }>;
  nearbyFrom: Array<{ distanceKm: string; relationshipType: string; spot: { id: number; name: string; rating: number | null; coverImageUrl: string | null; status: string } }>;
  externalPlaces: Array<{ provider: string; externalPlaceId: string | null; externalDataId: string | null; lastSyncedAt: string | null }>;
  _count: { images: number; reviews: number; videos: number; nearbyFrom: number };
}

interface Job {
  id: number;
  engine: string;
  status: string;
  itemsProcessed: number;
  itemsCreated: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

type Resource = "details" | "photos" | "reviews" | "videos" | "nearby";
type Tab = "overview" | "photos" | "reviews" | "videos" | "nearby" | "history";

const RESOURCES: Array<{ key: Resource; label: string; field: keyof SpotDetail; paid: boolean; hint: string }> = [
  { key: "details", label: "Details", field: "lastDetailsSyncAt", paid: true, hint: "Rating, review count, address" },
  { key: "photos", label: "Photos", field: "lastPhotosSyncAt", paid: true, hint: "Google Maps photos · repairs main photo" },
  { key: "reviews", label: "Reviews", field: "lastReviewsSyncAt", paid: true, hint: "Latest Google reviews" },
  { key: "videos", label: "Videos", field: "lastVideosSyncAt", paid: true, hint: "YouTube guides & vlogs (~3 searches)" },
  { key: "nearby", label: "Nearby", field: "lastNearbySyncAt", paid: false, hint: "Recalculated from coordinates — free" },
];

export default function AdminSpotDetail() {
  const params = useParams();
  const spotId = params?.id as string;
  const toast = useToast();

  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [refreshing, setRefreshing] = useState<Resource | "all" | null>(null);
  const [confirm, setConfirm] = useState<Resource | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let ignore = false;
    api<{ spot: SpotDetail; jobs: Job[] }>(`/api/admin/spots/${spotId}`)
      .then((data) => {
        if (ignore) return;
        setSpot(data.spot);
        setJobs(data.jobs);
      })
      .catch((e) => !ignore && setError(e instanceof Error ? e.message : "Failed to load spot"));
    return () => {
      ignore = true;
    };
  }, [spotId, version]);

  async function refresh(resource: Resource | "all") {
    setConfirm(null);
    setRefreshing(resource);
    try {
      const data = await api<{ results: Record<string, { success: boolean; error?: string; message?: string; skipped?: boolean }> }>(
        `/api/admin/spots/${spotId}/refresh`,
        { method: "POST", json: { resource } }
      );
      const entries = Object.entries(data.results);
      const failed = entries.filter(([, r]) => !r.success);
      if (failed.length === 0) {
        toast(entries.map(([k, r]) => `${k}: ${r.message || "done"}`).join(" · "));
      } else {
        toast(failed.map(([k, r]) => `${k}: ${r.error}`).join(" · "), "bad");
      }
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "bad");
    } finally {
      setRefreshing(null);
    }
  }

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await api(`/api/admin/spots/${spotId}`, { method: "PATCH", json: body });
      toast(success);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "bad");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="adm-page">
        <div className="adm-alert bad">
          <TriangleAlert size={16} /> {error}
        </div>
        <Link href="/admin/spots" className="adm-btn" style={{ marginTop: 14 }}>
          Back to spots
        </Link>
      </div>
    );
  }
  if (!spot) return <Loading label="Loading spot…" />;

  const ext = spot.externalPlaces.find((e) => e.provider === "google_maps");
  const mapsUrl = ext?.externalPlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}&query_place_id=${ext.externalPlaceId}`
    : `https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`;
  const coverSources = [spot.coverImageUrl, ...spot.images.map((i) => i.imageUrl)];
  const confirmInfo = confirm === "all" ? null : RESOURCES.find((r) => r.key === confirm);

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { key: "photos", label: "Photos", icon: <Images size={15} />, count: spot._count.images },
    { key: "reviews", label: "Reviews", icon: <MessageSquare size={15} />, count: spot._count.reviews },
    { key: "videos", label: "Videos", icon: <Video size={15} />, count: spot._count.videos },
    { key: "nearby", label: "Nearby", icon: <Navigation size={15} />, count: spot._count.nearbyFrom },
    { key: "history", label: "Sync history", icon: <History size={15} />, count: jobs.length },
  ];

  return (
    <div className="adm-page">
      <div className="adm-crumbs">
        <Link href="/admin/spots">Spots</Link>
        <ChevronRight size={14} />
        <span>{spot.destination.name}</span>
        <ChevronRight size={14} />
        <span style={{ color: "var(--text)" }}>{spot.name}</span>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-hero">
          <div className="adm-hero-img">
            <SmartImage sources={coverSources} alt={spot.name} width={800} loading="eager" />
            <span className="adm-badge">Main photo</span>
          </div>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <StatusBadge status={spot.status} />
              {spot.status === "APPROVED" && <span className="adm-badge brand">Visible on public map</span>}
              {spot.discoveryScore !== null && <span className="adm-badge">Score {spot.discoveryScore}</span>}
            </div>
            <h1 className="adm-hero-title">{spot.name}</h1>
            <div className="adm-hero-meta">
              <span>
                <MapPin size={14} /> {spot.destination.name}
              </span>
              {spot.rating && (
                <span>
                  <Star size={14} fill="#f59e0b" color="#f59e0b" /> {spot.rating.toFixed(1)} · {compact(spot.reviewCount)} reviews
                </span>
              )}
              <span>Added {timeAgo(spot.createdAt)}</span>
            </div>
            {spot.categories.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {spot.categories.map((c) => (
                  <span key={c.id} className="adm-tag">
                    {c.name}
                  </span>
                ))}
              </div>
            )}
            {spot.description && (
              <p style={{ color: "var(--text-2)", margin: "0 0 12px", maxWidth: 720, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {spot.description}
              </p>
            )}
            <div className="adm-toolbar" style={{ marginTop: "auto" }}>
              {spot.status !== "APPROVED" && (
                <button className="adm-btn adm-btn-primary" disabled={busy} onClick={() => patch({ status: "APPROVED" }, "Approved — now live on the map")}>
                  <Check size={15} /> Approve & publish
                </button>
              )}
              {spot.status !== "REJECTED" && (
                <button className="adm-btn adm-btn-bad" disabled={busy} onClick={() => patch({ status: "REJECTED" }, "Spot rejected")}>
                  <X size={15} /> Reject
                </button>
              )}
              {spot.status !== "ARCHIVED" && (
                <button className="adm-btn" disabled={busy} onClick={() => patch({ status: "ARCHIVED" }, "Spot archived")}>
                  <Archive size={15} /> Archive
                </button>
              )}
              <a className="adm-btn adm-btn-ghost" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} /> Google Maps
              </a>
              {spot.status === "APPROVED" && (
                <a className="adm-btn adm-btn-ghost" href={`/?spot=${spot.slug}`} target="_blank" rel="noopener">
                  <Globe size={15} /> View on site
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="adm-tabs" style={{ padding: "0 10px" }}>
          {tabs.map((t) => (
            <button key={t.key} className={`adm-tab ${tab === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)}>
              {t.icon}
              {t.label}
              {t.count !== undefined && <span className="adm-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="adm-grid-main">
          <EditPanel key={spot.updatedAt} spot={spot} busy={busy} onSave={(body) => patch(body, "Changes saved")} />
          <div className="adm-stack">
            <div className="adm-card">
              <div className="adm-card-head">
                <h2 className="adm-h2">Data sync</h2>
                <button className="adm-btn adm-btn-sm" disabled={refreshing !== null} onClick={() => setConfirm("all")}>
                  {refreshing === "all" ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh all
                </button>
              </div>
              {RESOURCES.map((r) => {
                const last = spot[r.field] as string | null;
                return (
                  <div key={r.key} className="adm-sync-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.label}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <span className={`adm-badge ${syncTone(last)}`}>{last ? timeAgo(last) : "Never synced"}</span>
                      <div className="adm-row-sub">{r.hint}</div>
                    </div>
                    <button
                      className="adm-btn adm-btn-sm"
                      disabled={refreshing !== null}
                      onClick={() => (r.paid ? setConfirm(r.key) : refresh(r.key))}
                    >
                      {refreshing === r.key ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="adm-card">
              <div className="adm-card-head">
                <h2 className="adm-h2">Source</h2>
              </div>
              <div className="adm-card-body">
                <dl className="adm-kv">
                  <dt>Discovered via</dt>
                  <dd>{spot.discoverySource.replace("_", " ").toLowerCase()}</dd>
                  <dt>Coordinates</dt>
                  <dd className="adm-mono">
                    {spot.latitude.toFixed(5)}, {spot.longitude.toFixed(5)}
                  </dd>
                  <dt>Place ID</dt>
                  <dd className="adm-mono">{ext?.externalPlaceId || "—"}</dd>
                  <dt>Data ID</dt>
                  <dd className="adm-mono">{ext?.externalDataId || "—"}</dd>
                  <dt>Public URL</dt>
                  <dd className="adm-mono">/?spot={spot.slug}</dd>
                </dl>
                {!ext && (
                  <div className="adm-alert warn" style={{ marginTop: 12 }}>
                    <TriangleAlert size={15} /> No Google Maps id stored. A photo refresh will look one up by name; details and reviews need it first.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "photos" && (
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2 className="adm-h2">Photos</h2>
              <div className="adm-row-sub">Hover a photo and choose “Make main photo” to set the cover used on the map and spot page.</div>
            </div>
            <button className="adm-btn adm-btn-sm" disabled={refreshing !== null} onClick={() => setConfirm("photos")}>
              {refreshing === "photos" ? <Spinner size={13} /> : <RefreshCw size={13} />} Fetch photos
            </button>
          </div>
          <div className="adm-card-body">
            {spot.images.length === 0 ? (
              <Empty title="No photos stored yet" icon={<Images size={20} />}>
                The map is showing the discovery thumbnail. Fetch photos to build a gallery.
              </Empty>
            ) : (
              <div className="adm-photo-grid">
                {spot.images.map((img) => {
                  const isCover = img.isPrimary;
                  return (
                    <div key={img.id} className={`adm-photo ${isCover ? "is-cover" : ""}`}>
                      <SmartImage sources={[img.thumbnailUrl, img.imageUrl]} alt={img.caption || spot.name} width={400} />
                      <div className="adm-photo-actions">
                        {isCover ? (
                          <span className="adm-badge brand">Main photo</span>
                        ) : (
                          <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => patch({ coverImageId: img.id }, "Main photo updated")}>
                            Make main photo
                          </button>
                        )}
                        <a className="adm-btn adm-btn-sm adm-icon-btn" href={img.imageUrl} target="_blank" rel="noopener noreferrer" title="Open original">
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "reviews" && (
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-h2">Reviews</h2>
            <button className="adm-btn adm-btn-sm" disabled={refreshing !== null} onClick={() => setConfirm("reviews")}>
              {refreshing === "reviews" ? <Spinner size={13} /> : <RefreshCw size={13} />} Fetch reviews
            </button>
          </div>
          {spot.reviews.length === 0 ? (
            <Empty title="No reviews stored yet" icon={<MessageSquare size={20} />} />
          ) : (
            spot.reviews.map((r) => (
              <div key={r.id} className="adm-review">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div className="adm-avatar">{(r.authorName || "?")[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.authorName || "Anonymous"}</div>
                    <div className="adm-row-sub">
                      <Stars rating={r.rating} /> {r.publishedAt ? `· ${timeAgo(r.publishedAt)}` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ color: "var(--text-2)" }}>{r.reviewText || <em className="adm-muted">No text</em>}</div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "videos" && (
        <VideosManager
          spotId={spot.id}
          videos={spot.videos}
          fetching={refreshing === "videos"}
          fetchDisabled={refreshing !== null}
          onFetch={() => setConfirm("videos")}
          onChanged={reload}
        />
      )}

      {tab === "nearby" && (
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2 className="adm-h2">Nearby spots</h2>
              <div className="adm-row-sub">Only live spots within 30 km are linked. Recalculating is free.</div>
            </div>
            <button className="adm-btn adm-btn-sm" disabled={refreshing !== null} onClick={() => refresh("nearby")}>
              {refreshing === "nearby" ? <Spinner size={13} /> : <RefreshCw size={13} />} Recalculate
            </button>
          </div>
          {spot.nearbyFrom.length === 0 ? (
            <Empty title="No nearby spots linked" icon={<Navigation size={20} />} />
          ) : (
            <div className="adm-list">
              {spot.nearbyFrom.map((n) => (
                <Link key={n.spot.id} href={`/admin/spots/${n.spot.id}`} className="adm-list-item">
                  <div className="adm-thumb">
                    <SmartImage sources={[n.spot.coverImageUrl]} alt={n.spot.name} width={160} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="adm-row-title">{n.spot.name}</div>
                    <div className="adm-row-sub">
                      {n.distanceKm} km · {n.relationshipType === "WITHIN_DESTINATION" ? "same destination" : "nearby area"}
                    </div>
                  </div>
                  <StatusBadge status={n.spot.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-h2">Sync history</h2>
          </div>
          {jobs.length === 0 ? (
            <Empty title="No provider calls recorded for this spot" icon={<History size={20} />} />
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Status</th>
                    <th className="num">Fetched</th>
                    <th className="num">New</th>
                    <th>When</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{engineLabel(j.engine)}</td>
                      <td>
                        <JobBadge status={j.status} />
                      </td>
                      <td className="num">{j.itemsProcessed}</td>
                      <td className="num">{j.itemsCreated}</td>
                      <td className="adm-muted">{formatDateTime(j.createdAt)}</td>
                      <td style={{ color: "var(--bad)", maxWidth: 320 }}>{j.error || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "all" ? "Refresh everything for this spot?" : `Refresh ${confirmInfo?.label.toLowerCase()}?`}
        confirmLabel="Refresh"
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && refresh(confirm)}
      >
        {confirm === "all"
          ? "This calls SerpApi for details, photos, reviews and videos (about 6 credits) and recalculates nearby spots."
          : `${confirmInfo?.hint}. This uses SerpApi credits.`}
      </ConfirmDialog>
    </div>
  );
}

// ─── Videos ───────────────────────────────────────────────────────────────────

const VIDEO_TYPES = [
  ["TRAVEL_GUIDE", "Travel guide"],
  ["DOCUMENTARY", "Documentary"],
  ["HISTORY", "History"],
  ["VLOG", "Vlog"],
  ["WALKING_TOUR", "Walking tour"],
  ["SHORT", "Short"],
  ["OTHER", "Other"],
] as const;

function VideosManager({
  spotId,
  videos,
  fetching,
  fetchDisabled,
  onFetch,
  onChanged,
}: {
  spotId: number;
  videos: SpotDetail["videos"];
  fetching: boolean;
  fetchDisabled: boolean;
  onFetch: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [links, setLinks] = useState("");
  const [type, setType] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<SpotDetail["videos"][number] | null>(null);

  async function add() {
    if (!links.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/spots/${spotId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: [links], contentType: type || undefined }),
      });
      const data = (await res.json()) as { added?: unknown[]; failed?: Array<{ link: string; error: string }>; error?: string };
      if (data.error) throw new Error(data.error);
      const added = data.added?.length || 0;
      const failed = data.failed || [];
      if (added) toast(`${added} video${added === 1 ? "" : "s"} added — now showing on the spot page`);
      if (failed.length) {
        toast(failed.map((f) => f.error).join(" · "), "bad");
        setLinks(failed.map((f) => f.link).join("\n"));
      } else {
        setLinks("");
      }
      if (added) onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add videos", "bad");
    } finally {
      setAdding(false);
    }
  }

  async function update(rowId: number, body: Record<string, unknown>, message: string) {
    setBusyId(rowId);
    try {
      await api(`/api/admin/spots/${spotId}/videos`, { method: "PATCH", json: { videoRowId: rowId, ...body } });
      toast(message);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "bad");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rowId: number) {
    setBusyId(rowId);
    try {
      await api(`/api/admin/spots/${spotId}/videos?videoRowId=${rowId}`, { method: "DELETE" });
      toast("Video removed");
      setRemoving(null);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Remove failed", "bad");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="adm-stack">
      <div className="adm-card">
        <div className="adm-card-head">
          <div>
            <h2 className="adm-h2">Add YouTube videos</h2>
            <div className="adm-row-sub">Paste one or more links (watch, youtu.be or Shorts). Added videos are pinned to the top. Free — no SerpApi credits.</div>
          </div>
        </div>
        <div className="adm-card-body adm-stack" style={{ gap: 10 }}>
          <textarea
            className="adm-textarea"
            rows={3}
            placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
            }}
          />
          <div className="adm-toolbar">
            <select className="adm-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Category: detect automatically</option>
              {VIDEO_TYPES.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button className="adm-btn adm-btn-primary" disabled={adding || !links.trim()} onClick={add}>
              {adding ? <Spinner size={14} /> : <Plus size={15} />} Add videos
            </button>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-head">
          <div>
            <h2 className="adm-h2">Videos on this spot ({videos.length})</h2>
            <div className="adm-row-sub">Pinned videos are shown first on the public spot page.</div>
          </div>
          <button className="adm-btn adm-btn-sm" disabled={fetchDisabled} onClick={onFetch}>
            {fetching ? <Spinner size={13} /> : <RefreshCw size={13} />} Find more automatically
          </button>
        </div>
        <div className="adm-card-body">
          {videos.length === 0 ? (
            <Empty title="No videos yet" icon={<Video size={20} />}>
              Paste a YouTube link above, or let the sync find some.
            </Empty>
          ) : (
            <div className="adm-video-grid">
              {videos.map((v) => {
                const pinned = v.relevanceScore === 100;
                return (
                  <div key={v.id} className="adm-video" style={pinned ? { borderColor: "var(--brand)" } : undefined}>
                    <a className="adm-video-thumb" href={v.videoUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", position: "relative" }}>
                      <SmartImage sources={[v.thumbnailUrl, `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`]} alt={v.title} fallback={<Play size={22} />} />
                      {pinned && (
                        <span className="adm-badge brand" style={{ position: "absolute", top: 8, left: 8 }}>
                          <Pin size={11} /> Pinned
                        </span>
                      )}
                    </a>
                    <div className="adm-video-body adm-stack" style={{ gap: 8 }}>
                      <div>
                        <div className="adm-video-title">{v.title}</div>
                        <div className="adm-row-sub" style={{ marginTop: 3 }}>
                          {v.channelName} {v.viewCount ? `· ${compact(v.viewCount)} views` : ""}
                        </div>
                      </div>
                      <select
                        className="adm-select"
                        style={{ height: 30, fontSize: 12.5 }}
                        value={v.contentType}
                        disabled={busyId === v.id}
                        onChange={(e) => update(v.id, { contentType: e.target.value }, "Category updated")}
                        aria-label="Video category"
                      >
                        {VIDEO_TYPES.map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="adm-btn adm-btn-sm"
                          style={{ flex: 1 }}
                          disabled={busyId === v.id}
                          onClick={() => update(v.id, { pinned: !pinned }, pinned ? "Unpinned" : "Pinned to top")}
                        >
                          {pinned ? <PinOff size={13} /> : <Pin size={13} />} {pinned ? "Unpin" : "Pin"}
                        </button>
                        <button className="adm-btn adm-btn-sm adm-btn-bad" disabled={busyId === v.id} onClick={() => setRemoving(v)} title="Remove from this spot">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this video?"
        confirmLabel="Remove"
        tone="bad"
        busy={busyId !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing.id)}
      >
        “{removing?.title}” will no longer show on this spot. You can add it again with its link.
      </ConfirmDialog>
    </div>
  );
}

// ─── Edit panel ───────────────────────────────────────────────────────────────

function EditPanel({ spot, busy, onSave }: { spot: SpotDetail; busy: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const [form, setForm] = useState(() => toForm(spot));
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [destinations, setDestinations] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
    api<{ destinations: Array<{ id: number; name: string }> }>("/api/admin/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch(() => {});
  }, []);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toForm(spot)), [form, spot]);
  const set = (k: keyof ReturnType<typeof toForm>, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="adm-card">
      <div className="adm-card-head">
        <h2 className="adm-h2">Details</h2>
        <button className="adm-btn adm-btn-primary adm-btn-sm" disabled={!dirty || busy} onClick={() => onSave(form)}>
          <Save size={13} /> Save changes
        </button>
      </div>
      <div className="adm-card-body adm-stack" style={{ gap: 14 }}>
        <div className="adm-field">
          <label className="adm-label">Name</label>
          <input className="adm-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="adm-field">
          <label className="adm-label">Description</label>
          <textarea className="adm-textarea" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this place worth visiting?" />
        </div>
        <div className="adm-grid-2">
          <div className="adm-field">
            <label className="adm-label">Destination</label>
            <select className="adm-select" value={form.destinationId} onChange={(e) => set("destinationId", Number(e.target.value))}>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label">Address</label>
            <input className="adm-input" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="adm-field">
            <label className="adm-label">Latitude</label>
            <input className="adm-input adm-mono" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} />
          </div>
          <div className="adm-field">
            <label className="adm-label">Longitude</label>
            <input className="adm-input adm-mono" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} />
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Categories</label>
          <div className="adm-chips">
            {categories.map((c) => {
              const on = form.categoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`adm-chip ${on ? "is-active" : ""}`}
                  onClick={() => set("categoryIds", on ? form.categoryIds.filter((x) => x !== c.id) : [...form.categoryIds, c.id].sort((a, b) => a - b))}
                >
                  {on && <Check size={12} />} {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function toForm(s: SpotDetail) {
  return {
    name: s.name,
    description: s.description || "",
    address: s.address || "",
    latitude: String(s.latitude),
    longitude: String(s.longitude),
    destinationId: s.destinationId,
    categoryIds: s.categories.map((c) => c.id).sort((a, b) => a - b),
  };
}
