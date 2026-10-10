"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Images, MessageSquare, Video, Navigation, Info, MapPin, Inbox, RefreshCw, Play, Square, TriangleAlert, History } from "lucide-react";
import {
  api,
  ConfirmDialog,
  Empty,
  engineLabel,
  formatDateTime,
  JobBadge,
  Loading,
  Spinner,
  useToast,
} from "@/components/admin/ui";

type Resource = "details" | "photos" | "reviews" | "videos" | "nearby";

interface Job {
  id: number;
  engine: string;
  scopeType: string;
  scopeId: number | null;
  scopeName: string | null;
  status: string;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface SyncData {
  jobs: Job[];
  running: Job | null;
  statusCounts: Record<string, number>;
  pagination: { page: number; total: number; totalPages: number };
  coverage: { publicSpots: number; noPhotos: number; noReviews: number; noVideos: number; noNearby: number; noDetails: number; awaitingReview: number };
}

const RESOURCE_OPTIONS: Array<{ key: Resource; label: string; cost: string }> = [
  { key: "photos", label: "Photos", cost: "1 credit / spot" },
  { key: "reviews", label: "Reviews", cost: "1 credit / spot" },
  { key: "videos", label: "Videos", cost: "~3 credits / spot" },
  { key: "details", label: "Details (rating, address)", cost: "1 credit / spot" },
  { key: "nearby", label: "Nearby spots", cost: "free" },
];

const STATUS_FILTERS = ["", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];

export default function SyncPageWrapper() {
  return (
    <Suspense fallback={<Loading />}>
      <SyncPage />
    </Suspense>
  );
}

function SyncPage() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") || "";
  const scope = params.get("scope") || "";
  const page = parseInt(params.get("page") || "1");

  const [data, setData] = useState<SyncData | null>(null);
  const [resources, setResources] = useState<Set<Resource>>(new Set(["photos", "reviews", "videos", "nearby"]));
  const [mode, setMode] = useState<"missing" | "stale" | "all">("missing");
  const [includeQueue, setIncludeQueue] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ key: string; spots: number; estimatedCredits: number } | null>(null);
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    router.replace(`/admin/sync?${next}`, { scroll: false });
  };

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let ignore = false;
    const q = new URLSearchParams({ page: String(page) });
    if (status) q.set("status", status);
    if (scope) q.set("scope", scope);
    api<SyncData>(`/api/admin/sync?${q}`)
      .then((d) => !ignore && setData(d))
      .catch((e) => !ignore && toast(e instanceof Error ? e.message : "Failed to load sync data", "bad"));
    return () => {
      ignore = true;
    };
  }, [page, status, scope, toast, version]);

  // Poll while a bulk job is running
  const runningId = data?.running?.id;
  useEffect(() => {
    if (!runningId) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [runningId, reload]);

  const body = useMemo(
    () => ({
      resources: [...resources].sort(),
      scope: mode,
      statuses: includeQueue ? ["APPROVED", "PENDING_REVIEW", "DISCOVERED"] : ["APPROVED"],
    }),
    [resources, mode, includeQueue]
  );
  // Re-estimate when the selection changes or a job finishes
  const previewKey = `${JSON.stringify(body)}#${runningId ?? ""}#${data?.coverage.noPhotos ?? ""}`;

  // Live estimate of what the job would do
  useEffect(() => {
    if (body.resources.length === 0) return;
    let ignore = false;
    const t = setTimeout(() => {
      api<{ spots: number; estimatedCredits: number }>("/api/admin/sync", { method: "POST", json: { ...body, dryRun: true } })
        .then((r) => !ignore && setPreviewResult({ key: previewKey, ...r }))
        .catch(() => {});
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(t);
    };
  }, [body, previewKey]);

  const preview = body.resources.length > 0 && previewResult ? previewResult : null;
  const previewing = body.resources.length > 0 && previewResult?.key !== previewKey;

  async function start() {
    setStarting(true);
    try {
      const r = await api<{ jobId: number; spots: number }>("/api/admin/sync", { method: "POST", json: body });
      toast(`Sync #${r.jobId} started for ${r.spots} spots`);
      setConfirming(false);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start sync", "bad");
    } finally {
      setStarting(false);
    }
  }

  async function cancel(id: number) {
    try {
      await api(`/api/admin/sync/${id}`, { method: "DELETE" });
      toast("Cancelling — the job stops after the current spot");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cancel failed", "bad");
    }
  }

  if (!data) return <Loading label="Loading sync data…" />;

  const c = data.coverage;
  const running = data.running;
  const paidSelected = [...resources].some((r) => r !== "nearby");

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-h1">Data sync</h1>
          <p className="adm-sub">
            Fill gaps and refresh stored content. The public site only ever reads the database — nothing here runs on visitor traffic.
          </p>
        </div>
      </div>

      <div className="adm-kpis">
        <Coverage icon={<MapPin size={15} />} label="Live spots" value={c.publicSpots} />
        <Coverage icon={<Images size={15} />} label="Missing photos" value={c.noPhotos} total={c.publicSpots} href="/admin/spots?status=APPROVED&missing=photos" />
        <Coverage icon={<MessageSquare size={15} />} label="Missing reviews" value={c.noReviews} total={c.publicSpots} href="/admin/spots?status=APPROVED&missing=reviews" />
        <Coverage icon={<Video size={15} />} label="Missing videos" value={c.noVideos} total={c.publicSpots} href="/admin/spots?status=APPROVED&missing=videos" />
        <Coverage icon={<Navigation size={15} />} label="No nearby links" value={c.noNearby} total={c.publicSpots} />
        <Coverage icon={<Inbox size={15} />} label="Awaiting review" value={c.awaitingReview} href="/admin/discovery" />
      </div>

      <div className="adm-grid-main" style={{ marginBottom: 16 }}>
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2 className="adm-h2">Sync all data</h2>
              <div className="adm-row-sub">Runs in the background, one spot at a time, and stops on SerpApi rate limits so it can be resumed.</div>
            </div>
          </div>
          <div className="adm-card-body adm-stack" style={{ gap: 16 }}>
            <div>
              <div className="adm-label">What to fetch</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
                {RESOURCE_OPTIONS.map((r) => (
                  <label key={r.key} className="adm-check" style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: resources.has(r.key) ? "var(--brand-soft)" : undefined }}>
                    <input
                      type="checkbox"
                      checked={resources.has(r.key)}
                      onChange={() =>
                        setResources((prev) => {
                          const n = new Set(prev);
                          if (n.has(r.key)) n.delete(r.key);
                          else n.add(r.key);
                          return n;
                        })
                      }
                    />
                    <span style={{ flex: 1 }}>{r.label}</span>
                    <span className="adm-muted" style={{ fontSize: 11.5 }}>
                      {r.cost}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="adm-label">Which spots</div>
              <div className="adm-chips">
                {(
                  [
                    ["missing", "Only what’s missing"],
                    ["stale", "Older than 30 days"],
                    ["all", "Everything (full refresh)"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} className={`adm-chip ${mode === k ? "is-active" : ""}`} onClick={() => setMode(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="adm-check" style={{ marginTop: 10, fontSize: 13 }}>
                <input type="checkbox" checked={includeQueue} onChange={(e) => setIncludeQueue(e.target.checked)} />
                Also include spots awaiting review (helps judge them before approving)
              </label>
            </div>

            <div className="adm-alert info">
              <Info size={16} />
              <div>
                {previewing ? (
                  "Calculating…"
                ) : preview ? (
                  <>
                    <strong>{preview.spots}</strong> spots to process · about <strong>{preview.estimatedCredits}</strong> SerpApi credits
                    {preview.estimatedCredits > 0 && " · a few seconds per spot"}
                  </>
                ) : (
                  "Choose at least one resource."
                )}
              </div>
            </div>

            <div>
              <button
                className="adm-btn adm-btn-primary adm-btn-lg"
                disabled={Boolean(running) || !preview || preview.spots === 0 || starting}
                onClick={() => (paidSelected ? setConfirming(true) : start())}
              >
                {starting ? <Spinner size={15} /> : <Play size={15} />}
                {running ? "A sync is already running" : "Start sync"}
              </button>
            </div>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-h2">Current job</h2>
            <button className="adm-btn adm-icon-btn adm-btn-sm" onClick={reload} title="Reload">
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="adm-card-body">
            {running ? (
              <div className="adm-stack" style={{ gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>#{running.id}</strong>
                  <JobBadge status={running.status} />
                </div>
                <div className="adm-row-sub">{running.scopeName}</div>
                <div className="adm-progress">
                  <div style={{ width: `${(running.itemsProcessed / Math.max(1, running.itemsCreated)) * 100}%` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }} className="adm-muted">
                  <span>
                    {running.itemsProcessed} / {running.itemsCreated} spots
                  </span>
                  <span>started {formatDateTime(running.startedAt)}</span>
                </div>
                {running.error && (
                  <pre className="adm-mono" style={{ whiteSpace: "pre-wrap", color: "var(--bad)", margin: 0, fontSize: 11.5 }}>
                    {running.error}
                  </pre>
                )}
                <button className="adm-btn adm-btn-bad adm-btn-sm" onClick={() => cancel(running.id)} style={{ alignSelf: "flex-start" }}>
                  <Square size={12} /> Cancel
                </button>
              </div>
            ) : (
              <Empty title="No bulk sync running" icon={<History size={20} />}>
                Start one from the left. Progress appears here.
              </Empty>
            )}
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-head" style={{ flexWrap: "wrap" }}>
          <h2 className="adm-h2">Job log</h2>
          <div className="adm-toolbar">
            <div className="adm-chips">
              {STATUS_FILTERS.map((s) => (
                <button key={s || "all"} className={`adm-chip ${status === s ? "is-active" : ""}`} onClick={() => setParam("status", s)}>
                  {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
                  {s && data.statusCounts[s] ? ` (${data.statusCounts[s]})` : ""}
                </button>
              ))}
            </div>
            <select className="adm-select" value={scope} onChange={(e) => setParam("scope", e.target.value)}>
              <option value="">All scopes</option>
              <option value="bulk">Bulk syncs</option>
              <option value="spot">Single spot</option>
              <option value="discovery">Discovery searches</option>
              <option value="destination">Destination</option>
            </select>
          </div>
        </div>
        {data.jobs.length === 0 ? (
          <Empty title="No jobs match" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Job</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th className="num">Processed</th>
                  <th className="adm-hide-sm">Started</th>
                  <th className="adm-hide-sm">Finished</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="adm-muted adm-mono">{j.id}</td>
                    <td>{engineLabel(j.engine)}</td>
                    <td style={{ maxWidth: 320 }}>
                      {j.scopeType === "spot" && j.scopeId ? (
                        <Link href={`/admin/spots/${j.scopeId}`} className="adm-row-title" style={{ fontWeight: 500 }}>
                          {j.scopeName}
                        </Link>
                      ) : (
                        <span>{j.scopeName || "—"}</span>
                      )}
                      {j.error && (
                        <div className="adm-row-sub" style={{ color: "var(--bad)", whiteSpace: "pre-wrap" }}>
                          <TriangleAlert size={11} style={{ verticalAlign: -1 }} /> {j.error.slice(0, 160)}
                        </div>
                      )}
                    </td>
                    <td>
                      <JobBadge status={j.status} />
                    </td>
                    <td className="num">
                      {j.scopeType === "bulk" ? `${j.itemsProcessed}/${j.itemsCreated}` : j.itemsProcessed}
                    </td>
                    <td className="adm-hide-sm adm-muted">{formatDateTime(j.startedAt || j.createdAt)}</td>
                    <td className="adm-hide-sm adm-muted">{formatDateTime(j.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="adm-pager">
          <span>
            {data.pagination.total} jobs · page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
              Previous
            </button>
            <button className="adm-btn adm-btn-sm" disabled={page >= data.pagination.totalPages} onClick={() => setParam("page", String(page + 1))}>
              Next
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Start background sync?"
        confirmLabel="Start sync"
        busy={starting}
        onCancel={() => setConfirming(false)}
        onConfirm={start}
      >
        This will process <strong>{preview?.spots}</strong> spots and use about <strong>{preview?.estimatedCredits}</strong> SerpApi credits. If
        your plan’s rate limit is reached the job stops cleanly; run “Only what’s missing” again later to continue.
      </ConfirmDialog>
    </div>
  );
}

function Coverage({ icon, label, value, total, href }: { icon: React.ReactNode; label: string; value: number; total?: number; href?: string }) {
  const tone = total !== undefined && value > 0 ? "warn" : undefined;
  const inner = (
    <>
      <div className="adm-kpi-top">
        {label}
        <span className="adm-kpi-icon" style={tone ? { background: "var(--warn-soft)", color: "var(--warn)" } : undefined}>
          {icon}
        </span>
      </div>
      <div className="adm-kpi-value">{value.toLocaleString()}</div>
      {total !== undefined && (
        <div className="adm-progress" style={{ height: 5 }}>
          <div style={{ width: `${total ? ((total - value) / total) * 100 : 100}%`, background: value ? "var(--warn)" : "var(--ok)" }} />
        </div>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="adm-kpi">
      {inner}
    </Link>
  ) : (
    <div className="adm-kpi">{inner}</div>
  );
}
