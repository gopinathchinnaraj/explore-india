"use client";

// Small shared building blocks for admin pages.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CircleCheck, CircleX, LoaderCircle, Inbox } from "lucide-react";

// ─── Formatting ───────────────────────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Freshness tone for a last-sync timestamp */
export function syncTone(iso: string | null | undefined): "ok" | "warn" | "bad" | "" {
  if (!iso) return "";
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  return days < 7 ? "ok" : days < 30 ? "warn" : "bad";
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const SPOT_STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "Approved", tone: "ok" },
  PENDING_REVIEW: { label: "Pending review", tone: "warn" },
  DISCOVERED: { label: "Discovered", tone: "violet" },
  REJECTED: { label: "Rejected", tone: "bad" },
  ARCHIVED: { label: "Archived", tone: "" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = SPOT_STATUS[status] || { label: status, tone: "" };
  return <span className={`adm-badge dot ${s.tone}`}>{s.label}</span>;
}

const JOB_STATUS: Record<string, string> = {
  COMPLETED: "ok",
  RUNNING: "info",
  PENDING: "",
  FAILED: "bad",
  CANCELLED: "",
};

export function JobBadge({ status }: { status: string }) {
  const icon =
    status === "COMPLETED" ? <CircleCheck size={12} /> : status === "FAILED" ? <CircleX size={12} /> : status === "RUNNING" ? <LoaderCircle size={12} className="adm-spin" /> : null;
  return (
    <span className={`adm-badge ${JOB_STATUS[status] ?? ""}`}>
      {icon}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

const ENGINE_LABEL: Record<string, string> = {
  google_maps: "Maps search",
  google_maps_photos: "Photos",
  google_maps_reviews: "Reviews",
  youtube: "Videos",
};

export function engineLabel(engine: string): string {
  if (engine.startsWith("bulk:")) return `Bulk · ${engine.slice(5).replace(/\+/g, ", ")}`;
  return ENGINE_LABEL[engine] || engine;
}

export function Stars({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null;
  const full = Math.round(rating);
  return (
    <span className="adm-stars" aria-label={`${rating} out of 5`}>
      {"★".repeat(full)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="adm-spin" />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="adm-loading">
      <Spinner /> {label}
    </div>
  );
}

export function Empty({
  title,
  children,
  icon,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="adm-empty">
      <div className="adm-empty-icon">{icon ?? <Inbox size={20} />}</div>
      <div className="adm-empty-title">{title}</div>
      {children && <div style={{ fontSize: 13 }}>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  tone = "primary",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "bad";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="adm-modal-backdrop" onClick={onCancel}>
      <div className="adm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="adm-modal-title">{title}</h3>
        <div className="adm-modal-body">{children}</div>
        <div className="adm-modal-actions">
          <button className="adm-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={`adm-btn ${tone === "bad" ? "adm-btn-bad" : "adm-btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner size={14} />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toasts ───────────────────────────────────────────────────────────────────

type Toast = { id: number; message: string; tone: "ok" | "bad" };
const ToastContext = createContext<(message: string, tone?: "ok" | "bad") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="adm-toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`adm-toast ${t.tone === "bad" ? "bad" : ""}`}>
            {t.tone === "bad" ? <CircleX size={16} /> : <CircleCheck size={16} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ─── Data helper ──────────────────────────────────────────────────────────────

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}
