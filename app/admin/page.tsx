"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Telescope,
  Images,
  MessageSquare,
  Video,
  TriangleAlert,
  Map as MapIcon,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { api, compact, engineLabel, formatDateTime, JobBadge, Loading, StatusBadge, timeAgo } from "@/components/admin/ui";

interface Job {
  id: number;
  engine: string;
  scopeType: string;
  scopeId: number | null;
  scopeName: string | null;
  status: string;
  itemsCreated: number;
  itemsProcessed: number;
  itemsUpdated: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
}

interface Stats {
  destinations: number;
  spots: {
    total: number;
    approved: number;
    pending: number;
    discovered: number;
    rejected: number;
    archived: number;
    publicWithoutPhotos: number;
  };
  reviews: number;
  videos: number;
  photos: number;
  jobs24h: number;
  failedJobs24h: number;
  lastSuccessfulSync: Record<string, string | null>;
  recentSpots: Array<{ id: number; name: string; status: string; coverImageUrl: string | null; createdAt: string; destination: { name: string } }>;
  recentJobs: Job[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="adm-page">
        <div className="adm-alert bad">
          <TriangleAlert size={16} /> {error}
        </div>
      </div>
    );
  }
  if (!stats) return <Loading label="Loading dashboard…" />;

  const queue = stats.spots.pending + stats.spots.discovered;
  const statusRows = [
    { key: "APPROVED", value: stats.spots.approved, color: "var(--ok)" },
    { key: "PENDING_REVIEW", value: stats.spots.pending, color: "var(--warn)" },
    { key: "DISCOVERED", value: stats.spots.discovered, color: "var(--violet)" },
    { key: "REJECTED", value: stats.spots.rejected, color: "var(--bad)" },
    { key: "ARCHIVED", value: stats.spots.archived, color: "var(--faint)" },
  ];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-h1">Dashboard</h1>
          <p className="adm-sub">Everything below is read live from PostgreSQL — the same data the public map uses.</p>
        </div>
        <div className="adm-toolbar">
          <Link href="/admin/sync" className="adm-btn">
            <RefreshCw size={15} /> Data sync
          </Link>
          <Link href="/admin/discovery" className="adm-btn adm-btn-primary">
            <Telescope size={15} /> Discover places
          </Link>
        </div>
      </div>

      <div className="adm-kpis">
        <Kpi icon={<MapPin size={15} />} label="Live on site" value={stats.spots.approved} note={`of ${stats.spots.total} spots`} href="/admin/spots?status=APPROVED" />
        <Kpi icon={<Telescope size={15} />} label="Awaiting review" value={queue} note={`${stats.spots.discovered} discovered · ${stats.spots.pending} pending`} href="/admin/discovery" tone={queue > 0 ? "warn" : undefined} />
        <Kpi icon={<MapIcon size={15} />} label="Destinations" value={stats.destinations} note="active areas" />
        <Kpi icon={<Images size={15} />} label="Photos" value={stats.photos} note={`${stats.spots.publicWithoutPhotos} live spots have none`} href="/admin/sync" tone={stats.spots.publicWithoutPhotos > 0 ? "warn" : undefined} />
        <Kpi icon={<MessageSquare size={15} />} label="Reviews" value={stats.reviews} />
        <Kpi icon={<Video size={15} />} label="Videos" value={stats.videos} />
      </div>

      {(stats.failedJobs24h > 0 || stats.spots.publicWithoutPhotos > 0) && (
        <div className="adm-stack" style={{ marginBottom: 16 }}>
          {stats.spots.publicWithoutPhotos > 0 && (
            <div className="adm-alert warn">
              <TriangleAlert size={16} />
              <div style={{ flex: 1 }}>
                <strong>{stats.spots.publicWithoutPhotos} live spots have no photo gallery.</strong> Their detail pages only show the
                cover image. Run a “missing data” sync to fetch photos, reviews and videos.
              </div>
              <Link href="/admin/sync" className="adm-btn adm-btn-sm">
                Open sync
              </Link>
            </div>
          )}
          {stats.failedJobs24h > 0 && (
            <div className="adm-alert bad">
              <TriangleAlert size={16} />
              <div style={{ flex: 1 }}>
                <strong>{stats.failedJobs24h}</strong> of {stats.jobs24h} sync jobs failed in the last 24 hours.
              </div>
              <Link href="/admin/sync?status=FAILED" className="adm-btn adm-btn-sm">
                View failures
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="adm-grid-main">
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-h2">Recent sync activity</h2>
            <Link href="/admin/sync" className="adm-btn adm-btn-ghost adm-btn-sm">
              All jobs <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th className="num">Items</th>
                  <th className="adm-hide-sm">When</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentJobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <div className="adm-row-title">{engineLabel(j.engine)}</div>
                      <div className="adm-row-sub">#{j.id} · {j.scopeType}</div>
                    </td>
                    <td style={{ maxWidth: 240 }}>
                      {j.scopeType === "spot" && j.scopeId ? (
                        <Link href={`/admin/spots/${j.scopeId}`} className="adm-row-title" style={{ fontWeight: 500 }}>
                          {j.scopeName}
                        </Link>
                      ) : (
                        <span>{j.scopeName || "—"}</span>
                      )}
                      {j.error && (
                        <div className="adm-row-sub" style={{ color: "var(--bad)" }} title={j.error}>
                          {j.error.slice(0, 70)}
                        </div>
                      )}
                    </td>
                    <td>
                      <JobBadge status={j.status} />
                    </td>
                    <td className="num">{j.itemsProcessed}</td>
                    <td className="adm-hide-sm adm-muted">{formatDateTime(j.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="adm-stack">
          <div className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-h2">Spots by status</h2>
            </div>
            <div className="adm-card-body adm-stack" style={{ gap: 10 }}>
              <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--neutral-soft)" }}>
                {statusRows.map((r) =>
                  r.value > 0 ? (
                    <div key={r.key} style={{ width: `${(r.value / Math.max(1, stats.spots.total)) * 100}%`, background: r.color }} />
                  ) : null
                )}
              </div>
              {statusRows.map((r) => (
                <Link key={r.key} href={`/admin/spots?status=${r.key}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <StatusBadge status={r.key} />
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{r.value}</strong>
                </Link>
              ))}
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-h2">Newest spots</h2>
            </div>
            <div className="adm-list">
              {stats.recentSpots.map((s) => (
                <Link key={s.id} href={`/admin/spots/${s.id}`} className="adm-list-item">
                  <div className="adm-thumb">
                    <SmartImage sources={[s.coverImageUrl]} alt={s.name} width={160} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="adm-row-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div className="adm-row-sub">
                      {s.destination.name} · {timeAgo(s.createdAt)}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              ))}
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-h2">Last successful refresh</h2>
            </div>
            <div className="adm-card-body">
              <dl className="adm-kv">
                {["google_maps", "google_maps_photos", "google_maps_reviews", "youtube"].map((e) => (
                  <div key={e} style={{ display: "contents" }}>
                    <dt>{engineLabel(e)}</dt>
                    <dd>{timeAgo(stats.lastSuccessfulSync[e])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note?: string;
  href?: string;
  tone?: "warn";
}) {
  const body = (
    <>
      <div className="adm-kpi-top">
        {label}
        <span className="adm-kpi-icon" style={tone === "warn" ? { background: "var(--warn-soft)", color: "var(--warn)" } : undefined}>
          {icon}
        </span>
      </div>
      <div className="adm-kpi-value">{compact(value)}</div>
      {note && <div className="adm-kpi-note">{note}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="adm-kpi">
      {body}
    </Link>
  ) : (
    <div className="adm-kpi">{body}</div>
  );
}
