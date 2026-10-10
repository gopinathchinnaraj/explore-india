"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Telescope, Images, MessageSquare, Video, Check, X, Archive, RefreshCw, Star, MapPin, TriangleAlert } from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { api, compact, Empty, Loading, StatusBadge, syncTone, timeAgo, useToast } from "@/components/admin/ui";

interface AdminSpot {
  id: number;
  name: string;
  slug: string;
  destination: { id: number; name: string; slug: string };
  categories: Array<{ id: number; name: string; icon: string | null }>;
  rating: number | null;
  reviewCount: number | null;
  coverImageUrl: string | null;
  fallbackImageUrl: string | null;
  discoveryScore: number | null;
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
  _count: { images: number; reviews: number; videos: number; nearbyFrom: number };
}

interface Destination {
  id: number;
  name: string;
  _count: { spots: number };
}

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "APPROVED", label: "Live" },
  { key: "PENDING_REVIEW", label: "Pending" },
  { key: "DISCOVERED", label: "Discovered" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ARCHIVED", label: "Archived" },
];

export default function AdminSpotsPageWrapper() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminSpotsPage />
    </Suspense>
  );
}

function AdminSpotsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const status = params.get("status") || "";
  const destinationId = params.get("destinationId") || "";
  const missing = params.get("missing") || "";
  const sort = params.get("sort") || "score";
  const page = parseInt(params.get("page") || "1");
  const [search, setSearch] = useState(params.get("search") || "");

  const [result, setResult] = useState<{
    key: string;
    spots: AdminSpot[];
    counts: Record<string, number>;
    total: number;
    totalPages: number;
    error: string | null;
  } | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in updates)) next.delete("page");
      router.replace(`/admin/spots?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  // Debounce the search box into the URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("search") || "") !== search.trim()) setParam({ search: search.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [search, params, setParam]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), limit: "25", sort });
    if (status) q.set("status", status);
    if (destinationId) q.set("destinationId", destinationId);
    if (missing) q.set("missing", missing);
    const s = params.get("search");
    if (s) q.set("search", s);
    return q.toString();
  }, [page, sort, status, destinationId, missing, params]);
  const requestKey = `${query}#${version}`;

  useEffect(() => {
    let ignore = false;
    api<{
      spots: AdminSpot[];
      statusCounts: Record<string, number>;
      pagination: { total: number; totalPages: number };
    }>(`/api/admin/spots?${query}`)
      .then((data) => {
        if (ignore) return;
        setResult({
          key: requestKey,
          spots: data.spots,
          counts: data.statusCounts,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages,
          error: null,
        });
        setSelected(new Set());
      })
      .catch((e) => {
        if (ignore) return;
        setResult((prev) => ({
          key: requestKey,
          spots: prev?.spots || [],
          counts: prev?.counts || {},
          total: prev?.total || 0,
          totalPages: prev?.totalPages || 1,
          error: e instanceof Error ? e.message : "Failed to load spots",
        }));
      });
    return () => {
      ignore = true;
    };
  }, [query, requestKey]);

  const reload = () => setVersion((v) => v + 1);
  const loading = result?.key !== requestKey;
  const spots = result?.spots || [];
  const counts = useMemo(() => result?.counts || {}, [result]);
  const total = result?.total || 0;
  const totalPages = result?.totalPages || 1;
  const error = result?.error || null;

  useEffect(() => {
    api<{ destinations: Destination[] }>("/api/admin/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch(() => {});
  }, []);

  const allCount = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  async function bulk(newStatus: string, ids: number[] = [...selected]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const r = await api<{ enrichmentQueued: number }>("/api/admin/spots", {
        method: "PATCH",
        json: { spotIds: ids, status: newStatus },
      });
      toast(
        newStatus === "APPROVED"
          ? `${ids.length} spot${ids.length > 1 ? "s" : ""} now live${r.enrichmentQueued ? " — fetching photos & reviews in the background" : ""}`
          : `${ids.length} spot${ids.length > 1 ? "s" : ""} moved to ${newStatus.toLowerCase().replace("_", " ")}`
      );
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "bad");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-h1">Spots</h1>
          <p className="adm-sub">Every attraction in the database. Only “Live” spots appear on the public map.</p>
        </div>
        <Link href="/admin/discovery" className="adm-btn adm-btn-primary">
          <Telescope size={15} /> Discover places
        </Link>
      </div>

      <div className="adm-card">
        <div className="adm-tabs" style={{ padding: "0 10px" }}>
          {STATUS_TABS.map((t) => (
            <button key={t.key} className={`adm-tab ${status === t.key ? "is-active" : ""}`} onClick={() => setParam({ status: t.key })}>
              {t.label}
              <span className="adm-tab-count">{t.key ? counts[t.key] || 0 : allCount}</span>
            </button>
          ))}
        </div>

        <div className="adm-toolbar" style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <div className="adm-input-icon grow">
            <Search size={15} />
            <input className="adm-input" placeholder="Search name, address or destination…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={destinationId} onChange={(e) => setParam({ destinationId: e.target.value })} style={{ maxWidth: 220 }}>
            <option value="">All destinations</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d._count.spots})
              </option>
            ))}
          </select>
          <select className="adm-select" value={missing} onChange={(e) => setParam({ missing: e.target.value })}>
            <option value="">Any media</option>
            <option value="photos">Missing photos</option>
            <option value="reviews">Missing reviews</option>
            <option value="videos">Missing videos</option>
          </select>
          <select className="adm-select" value={sort} onChange={(e) => setParam({ sort: e.target.value })}>
            <option value="score">Sort: score</option>
            <option value="newest">Sort: newest</option>
            <option value="rating">Sort: rating</option>
            <option value="name">Sort: name</option>
            <option value="synced">Sort: least recently synced</option>
          </select>
          <button className="adm-btn adm-icon-btn" onClick={reload} title="Reload">
            <RefreshCw size={15} />
          </button>
        </div>

        {error && (
          <div className="adm-alert bad" style={{ margin: 12 }}>
            <TriangleAlert size={16} /> {error}
          </div>
        )}

        {loading && spots.length === 0 ? (
          <Loading label="Loading spots…" />
        ) : spots.length === 0 ? (
          <Empty title="No spots match these filters" icon={<MapPin size={20} />}>
            Try clearing filters, or <Link href="/admin/discovery" style={{ color: "var(--brand-text)" }}>discover new places</Link>.
          </Empty>
        ) : (
          <div className="adm-table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th className="shrink">
                    <label className="adm-check">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={selected.size > 0 && selected.size === spots.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(spots.map((s) => s.id)) : new Set())}
                      />
                    </label>
                  </th>
                  <th>Spot</th>
                  <th className="adm-hide-sm">Rating</th>
                  <th className="adm-hide-sm">Content</th>
                  <th className="adm-hide-sm">Last sync</th>
                  <th>Status</th>
                  <th className="shrink" />
                </tr>
              </thead>
              <tbody>
                {spots.map((s) => (
                  <tr key={s.id} className={selected.has(s.id) ? "is-selected" : ""}>
                    <td>
                      <label className="adm-check">
                        <input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      </label>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 240 }}>
                        <div className="adm-thumb adm-thumb-lg">
                          <SmartImage sources={[s.coverImageUrl, s.fallbackImageUrl]} alt={s.name} width={200} />
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
                          <Star size={13} fill="#f59e0b" color="#f59e0b" />
                          <strong>{s.rating.toFixed(1)}</strong>
                          <span className="adm-muted">({compact(s.reviewCount)})</span>
                        </span>
                      ) : (
                        <span className="adm-muted">—</span>
                      )}
                    </td>
                    <td className="adm-hide-sm">
                      <div className="adm-media-counts">
                        <span className={s._count.images ? "" : "zero"} title="Photos">
                          <Images size={13} /> {s._count.images}
                        </span>
                        <span className={s._count.reviews ? "" : "zero"} title="Reviews">
                          <MessageSquare size={13} /> {s._count.reviews}
                        </span>
                        <span className={s._count.videos ? "" : "zero"} title="Videos">
                          <Video size={13} /> {s._count.videos}
                        </span>
                      </div>
                    </td>
                    <td className="adm-hide-sm">
                      <span className={`adm-badge ${syncTone(s.lastSyncedAt)}`}>{timeAgo(s.lastSyncedAt)}</span>
                    </td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {s.status !== "APPROVED" ? (
                          <button className="adm-btn adm-btn-sm adm-btn-ok" disabled={busy} onClick={() => bulk("APPROVED", [s.id])} title="Approve — publish on the map">
                            <Check size={14} />
                          </button>
                        ) : (
                          <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => bulk("ARCHIVED", [s.id])} title="Archive — hide from the map">
                            <Archive size={14} />
                          </button>
                        )}
                        <Link href={`/admin/spots/${s.id}`} className="adm-btn adm-btn-sm">
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="adm-pager">
          <span>
            {total.toLocaleString()} spot{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Previous
            </button>
            <button className="adm-btn adm-btn-sm" disabled={page >= totalPages} onClick={() => setParam({ page: String(page + 1) })}>
              Next
            </button>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="adm-bulkbar">
          <strong style={{ marginRight: "auto" }}>{selected.size} selected</strong>
          <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => bulk("APPROVED")}>
            <Check size={14} /> Approve & publish
          </button>
          <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => bulk("REJECTED")}>
            <X size={14} /> Reject
          </button>
          <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => bulk("ARCHIVED")}>
            <Archive size={14} /> Archive
          </button>
          <button className="adm-btn adm-btn-sm" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
