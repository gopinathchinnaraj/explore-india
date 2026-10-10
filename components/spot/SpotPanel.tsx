"use client";

// Detail panel for one approved spot. Everything shown here is read from the database
// through the public /api/spots/* endpoints — no external API calls.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  MapPin,
  Navigation,
  Share2,
  Sparkles,
  Star,
  Images,
  MessageSquare,
  PlayCircle,
  Compass,
  ChevronLeft,
  ChevronRight,
  ChevronRight as Chevron,
  ExternalLink,
  Info,
  Play,
  Check,
  Plus,
} from "lucide-react";
import SmartImage from "@/components/common/SmartImage";
import { imageIdentity } from "@/lib/media/image";
import { primaryCategory, categoryStyle } from "@/lib/categories";
import type { MapSpot, SpotPhoto, SpotReview, SpotVideo, NearbySpot, ReviewSortOrder } from "@/types/spot";

type Tab = "overview" | "photos" | "reviews" | "videos" | "nearby";

interface SpotPanelProps {
  spot: MapSpot;
  onClose: () => void;
  onSelectSpot: (slug: string) => void;
  onSelectDestination: (slug: string) => void;
  onAskAI: () => void;
  inTrip: boolean;
  onToggleTrip: () => void;
}

interface SpotDetail {
  description: string | null;
  address: string | null;
  discoverySource: string;
  isVerified: boolean;
}

function formatCount(n: number | null | undefined) {
  if (!n) return "";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function formatDuration(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="gs-stars" aria-label={`${rating} out of 5`}>
      {"★".repeat(full)}
      <span className="off">{"★".repeat(5 - full)}</span>
    </span>
  );
}

export default function SpotPanel({ spot, onClose, onSelectSpot, onSelectDestination, onAskAI, inTrip, onToggleTrip }: SpotPanelProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<SpotDetail | null>(null);
  const [photos, setPhotos] = useState<SpotPhoto[] | null>(null);
  const [reviews, setReviews] = useState<SpotReview[] | null>(null);
  const [reviewSort, setReviewSort] = useState<ReviewSortOrder>("relevant");
  const [reviewStats, setReviewStats] = useState<{ total: number; avg: number | null }>({ total: 0, avg: null });
  const [videos, setVideos] = useState<SpotVideo[] | null>(null);
  const [nearby, setNearby] = useState<NearbySpot[] | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Load everything for this spot in parallel (all database reads).
  // The parent keys this panel by spot slug, so state starts fresh for each spot.
  useEffect(() => {
    let cancelled = false;
    const get = (path: string) => fetch(`/api/spots/${spot.slug}${path}`).then((r) => r.json());
    get("").then((d) => !cancelled && setDetail(d.spot || null)).catch(() => {});
    get("/photos?limit=40").then((d) => !cancelled && setPhotos(d.photos || [])).catch(() => !cancelled && setPhotos([]));
    get("/videos?limit=12").then((d) => !cancelled && setVideos(d.videos || [])).catch(() => !cancelled && setVideos([]));
    get("/nearby?radius=25&limit=10").then((d) => !cancelled && setNearby(d.nearby || [])).catch(() => !cancelled && setNearby([]));
    return () => {
      cancelled = true;
    };
  }, [spot.slug]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spots/${spot.slug}/reviews?sort=${reviewSort}&limit=30`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setReviews(d.reviews || []);
        setReviewStats({ total: d.totalCount || 0, avg: d.averageRating ?? null });
      })
      .catch(() => !cancelled && setReviews([]));
    return () => {
      cancelled = true;
    };
  }, [spot.slug, reviewSort]);

  const cat = primaryCategory(spot.categories);
  // Many destinations were created as 1:1 copies of a spot; don't repeat the same name
  const sameAsDestination = spot.destination.name === spot.name;
  const gallery = useMemo(() => {
    const urls: Array<{ src: string; full: string }> = [];
    const seen = new Set<string>();
    const add = (src: string | null | undefined, full?: string | null) => {
      if (!src || seen.has(imageIdentity(src))) return;
      seen.add(imageIdentity(src));
      urls.push({ src, full: full || src });
    };
    add(spot.coverImageUrl);
    for (const p of photos || []) add(p.thumbnailUrl || p.imageUrl, p.imageUrl);
    return urls;
  }, [spot.coverImageUrl, photos]);

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`;

  async function share() {
    const url = `${window.location.origin}/?spot=${spot.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: spot.name, text: `${spot.name} on Explore India`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  const tabs: Array<{ key: Tab; label: string; count?: number | null }> = [
    { key: "overview", label: "Overview" },
    { key: "photos", label: "Photos", count: photos?.length },
    { key: "reviews", label: "Reviews", count: reviewStats.total || null },
    { key: "videos", label: "Videos", count: videos?.length },
    { key: "nearby", label: "Nearby", count: nearby?.length },
  ];

  return (
    <aside className="gs-panel" aria-label={`${spot.name} details`}>
      <span className="gs-sheet-handle" aria-hidden />
      <button className="gs-panel-close" onClick={onClose} aria-label="Close">
        <X size={17} />
      </button>

      <div className="gs-panel-scroll">
        <Gallery items={gallery} name={spot.name} onOpen={setLightbox} loading={photos === null} />

        <div className="gs-panel-head">
          {!sameAsDestination && (
            <div className="gs-panel-crumb">
              <Compass size={12} />
              <button onClick={() => onSelectDestination(spot.destination.slug)}>{spot.destination.name}</button>
            </div>
          )}
          <h1 className="gs-panel-title">{spot.name}</h1>
          <div className="gs-panel-meta">
            {spot.rating ? (
              <span className="gs-rating">
                <Star size={14} fill="#f59e0b" color="#f59e0b" />
                <strong>{spot.rating.toFixed(1)}</strong>
                {spot.reviewCount ? <span className="count">({spot.reviewCount.toLocaleString("en-IN")} Google reviews)</span> : null}
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {(spot.categories.length ? spot.categories : [{ id: 0, slug: "other", name: cat.name, icon: null }]).map((c) => {
              const s = categoryStyle(c.slug);
              return (
                <span key={c.id} className="gs-cat-tag" style={{ background: s.soft, color: s.color }}>
                  <s.Icon /> {c.name}
                </span>
              );
            })}
          </div>
        </div>

        <div className="gs-panel-actions">
          <button className={`gs-action primary ${inTrip ? "is-added" : ""}`} onClick={onToggleTrip} aria-pressed={inTrip}>
            {inTrip ? <Check size={17} /> : <Plus size={17} />} {inTrip ? "In your trip" : "Add to trip"}
          </button>
          <a className="gs-action" href={directionsUrl} target="_blank" rel="noopener noreferrer" title="Directions">
            <Navigation size={17} /> <span className="gs-action-label">Directions</span>
          </a>
          <button className="gs-action" onClick={share} title="Share">
            <Share2 size={17} /> <span className="gs-action-label">{copied ? "Copied" : "Share"}</span>
          </button>
          <button className="gs-action" onClick={onAskAI} title="Ask AI">
            <Sparkles size={17} /> <span className="gs-action-label">Ask AI</span>
          </button>
        </div>

        <div className="gs-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`gs-tab ${tab === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.count ? <span className="gs-tab-count">{t.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="gs-section">
              {detail === null ? (
                <>
                  <div className="gs-skel" style={{ height: 14, marginBottom: 8 }} />
                  <div className="gs-skel" style={{ height: 14, width: "80%" }} />
                </>
              ) : detail.description ? (
                <p className="gs-desc">{detail.description}</p>
              ) : (
                <p className="gs-desc" style={{ color: "var(--gs-muted)" }}>
                  {sameAsDestination ? `A ${cat.name.toLowerCase()} spot in Karnataka.` : `A ${cat.name.toLowerCase()} spot in ${spot.destination.name}.`} Check the photos and visitor reviews below to see what it’s like.
                </p>
              )}
            </div>

            <div className="gs-section">
              <div className="gs-facts">
                {(detail?.address || spot.address) && (
                  <div className="gs-fact">
                    <MapPin size={16} />
                    <span>{detail?.address || spot.address}</span>
                  </div>
                )}
                {!sameAsDestination && (
                  <div className="gs-fact">
                    <Compass size={16} />
                    <span>
                      Part of{" "}
                      <button className="gs-link-btn" style={{ margin: 0 }} onClick={() => onSelectDestination(spot.destination.slug)}>
                        {spot.destination.name}
                      </button>
                    </span>
                  </div>
                )}
                <div className="gs-fact">
                  <ExternalLink size={16} />
                  <a
                    className="gs-link-btn"
                    style={{ margin: 0, textDecoration: "none" }}
                    href={`https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>
            </div>

            {photos && photos.length > 0 && (
              <div className="gs-section">
                <h3 className="gs-section-title">
                  Photos <button onClick={() => setTab("photos")}>See all {photos.length}</button>
                </h3>
                <div className="gs-photo-grid">
                  {photos.slice(0, 5).map((p) => (
                    <button key={p.id} onClick={() => setLightbox(Math.max(0, gallery.findIndex((g) => g.full === p.imageUrl)))}>
                      <SmartImage sources={[p.thumbnailUrl, p.imageUrl]} alt={p.caption || spot.name} width={400} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {reviews && reviews.length > 0 && (
              <div className="gs-section">
                <h3 className="gs-section-title">
                  What visitors say <button onClick={() => setTab("reviews")}>All reviews</button>
                </h3>
                {reviews.slice(0, 2).map((r) => (
                  <ReviewItem key={r.id} r={r} />
                ))}
              </div>
            )}

            {nearby && nearby.length > 0 && (
              <div className="gs-section">
                <h3 className="gs-section-title">
                  Nearby <button onClick={() => setTab("nearby")}>See all</button>
                </h3>
                <NearbyList items={nearby.slice(0, 3)} onSelect={onSelectSpot} />
              </div>
            )}
          </>
        )}

        {tab === "photos" && (
          <div className="gs-section">
            {photos === null ? (
              <div className="gs-photo-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="gs-skel" style={{ aspectRatio: "1" }} />
                ))}
              </div>
            ) : photos.length === 0 ? (
              <Empty icon={<Images size={26} />} text="No photos yet for this place." />
            ) : (
              <div className="gs-photo-grid">
                {photos.map((p) => (
                  <button key={p.id} onClick={() => setLightbox(Math.max(0, gallery.findIndex((g) => g.full === p.imageUrl)))}>
                    <SmartImage sources={[p.thumbnailUrl, p.imageUrl]} alt={p.caption || spot.name} width={400} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="gs-section">
            {(spot.rating || reviewStats.avg) && (
              <div className="gs-rating-summary">
                <div className="gs-rating-big">{(spot.rating ?? reviewStats.avg ?? 0).toFixed(1)}</div>
                <div>
                  <Stars rating={spot.rating ?? reviewStats.avg ?? 0} />
                  <div style={{ fontSize: 12.5, color: "var(--gs-muted)", marginTop: 2 }}>
                    {spot.reviewCount ? `${spot.reviewCount.toLocaleString("en-IN")} reviews on Google` : `${reviewStats.total} reviews`}
                  </div>
                </div>
              </div>
            )}
            <div className="gs-seg">
              {(
                [
                  ["relevant", "Most relevant"],
                  ["newest", "Newest"],
                  ["highest", "Highest"],
                  ["lowest", "Lowest"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={reviewSort === k ? "is-active" : ""} onClick={() => setReviewSort(k)}>
                  {label}
                </button>
              ))}
            </div>
            {reviews === null ? (
              <div className="gs-skel" style={{ height: 80, marginTop: 12 }} />
            ) : reviews.length === 0 ? (
              <Empty icon={<MessageSquare size={26} />} text="No reviews stored for this place yet." />
            ) : (
              reviews.map((r) => <ReviewItem key={r.id} r={r} />)
            )}
          </div>
        )}

        {tab === "videos" && (
          <div className="gs-section">
            {videos === null ? (
              <div className="gs-skel" style={{ height: 90 }} />
            ) : videos.length === 0 ? (
              <Empty icon={<PlayCircle size={26} />} text="No travel videos linked yet." />
            ) : (
              <VideoList videos={videos} />
            )}
          </div>
        )}

        {tab === "nearby" && (
          <div className="gs-section">
            {nearby === null ? (
              <div className="gs-skel" style={{ height: 90 }} />
            ) : nearby.length === 0 ? (
              <Empty icon={<MapPin size={26} />} text="No other places within 25 km yet." />
            ) : (
              <NearbyList items={nearby} onSelect={onSelectSpot} />
            )}
          </div>
        )}

        <div className="gs-section gs-source-note">
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {spot.featured ? (
            <span>
              Description and photo from{" "}
              <a href={photos?.find((p) => p.provider === "wikimedia")?.sourceUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(spot.name)}`} target="_blank" rel="noopener noreferrer">
                Wikipedia
              </a>{" "}
              (CC BY-SA). Information may change — check before you travel.
            </span>
          ) : (
            <span>Ratings, photos and reviews come from Google Maps; videos from YouTube. Information may change — check before you travel.</span>
          )}
        </div>
      </div>

      {lightbox !== null && lightbox >= 0 && gallery.length > 0 && (
        <Lightbox items={gallery} index={lightbox} name={spot.name} onChange={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </aside>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Gallery({ items, name, onOpen, loading }: { items: Array<{ src: string }>; name: string; onOpen: (i: number) => void; loading: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  if (items.length === 0) {
    return (
      <div className="gs-gallery">
        {loading ? <div className="gs-skel" style={{ height: "100%", borderRadius: 0 }} /> : <SmartImage sources={[]} alt={name} />}
      </div>
    );
  }

  return (
    <div className="gs-gallery">
      <div
        className="gs-gallery-track"
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {items.map((it, i) => (
          <div key={it.src} className="gs-gallery-slide" onClick={() => onOpen(i)}>
            <SmartImage sources={[it.src]} alt={`${name} photo ${i + 1}`} width={900} loading={i === 0 ? "eager" : "lazy"} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <button className="gs-gallery-nav prev" onClick={() => go(-1)} aria-label="Previous photo">
            <ChevronLeft size={18} />
          </button>
          <button className="gs-gallery-nav next" onClick={() => go(1)} aria-label="Next photo">
            <ChevronRight size={18} />
          </button>
        </>
      )}
      <span className="gs-gallery-count">
        <Images size={13} /> {Math.min(index + 1, items.length)} / {items.length}
      </span>
    </div>
  );
}

function ReviewItem({ r }: { r: SpotReview }) {
  const [open, setOpen] = useState(false);
  const long = (r.reviewText?.length || 0) > 240;
  return (
    <div className="gs-review">
      <div className="gs-review-head">
        <div className="gs-avatar">
          {r.authorAvatarUrl ? (
            <SmartImage sources={[r.authorAvatarUrl]} alt="" width={68} fallback={(r.authorName || "?")[0]} />
          ) : (
            (r.authorName || "?")[0]
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 13.5 }}>{r.authorName || "Google user"}</div>
          <div style={{ fontSize: 12, color: "var(--gs-muted)", display: "flex", gap: 6, alignItems: "center" }}>
            {r.rating ? <Stars rating={r.rating} /> : null}
            {r.publishedAt ? <span>{timeAgo(r.publishedAt)}</span> : null}
          </div>
        </div>
      </div>
      {r.reviewText && (
        <>
          <p className={`gs-review-text ${long && !open ? "clamp" : ""}`}>{r.reviewText}</p>
          {long && (
            <button className="gs-link-btn" onClick={() => setOpen(!open)}>
              {open ? "Show less" : "Read more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function VideoList({ videos }: { videos: SpotVideo[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <>
      {playing && (
        <div className="gs-video-embed">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${playing}?autoplay=1&rel=0`}
            title="Video player"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {videos.map((v) => (
        <a
          key={v.id}
          className="gs-video"
          href={v.videoUrl}
          onClick={(e) => {
            e.preventDefault();
            setPlaying(v.videoId);
          }}
        >
          <div className="gs-video-thumb">
            <SmartImage sources={[v.thumbnailUrl, `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`]} alt={v.title} width={300} />
            <div className="play">
              <Play size={22} fill="#fff" />
            </div>
            {v.durationSeconds ? <span className="gs-video-dur">{formatDuration(v.durationSeconds)}</span> : null}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="gs-video-title">{v.title}</div>
            <div className="gs-video-meta">
              {v.channelName}
              {v.viewCount ? ` · ${formatCount(v.viewCount)} views` : ""}
            </div>
            {v.contentType && v.contentType !== "OTHER" && <span className="gs-video-type">{v.contentType.replace("_", " ").toLowerCase()}</span>}
          </div>
        </a>
      ))}
    </>
  );
}

function NearbyList({ items, onSelect }: { items: NearbySpot[]; onSelect: (slug: string) => void }) {
  return (
    <div>
      {items.map((n) => {
        const c = primaryCategory(n.categories);
        return (
          <button key={n.id} className="gs-place" onClick={() => onSelect(n.slug)}>
            <div className="gs-place-img" style={{ width: 72, height: 56 }}>
              <SmartImage sources={[n.coverImageUrl]} alt={n.name} width={200} />
            </div>
            <div className="gs-place-body">
              <div className="gs-place-name">{n.name}</div>
              <div className="gs-place-sub">
                <span style={{ color: c.color, fontWeight: 600 }}>{c.name}</span> · {n.distanceKm < 1 ? `${Math.round(n.distanceKm * 1000)} m` : `${n.distanceKm.toFixed(1)} km`} away
              </div>
              {n.rating ? (
                <span className="gs-rating">
                  <Star size={12} fill="#f59e0b" color="#f59e0b" /> <strong>{n.rating.toFixed(1)}</strong>
                </span>
              ) : null}
            </div>
            <Chevron size={16} style={{ marginLeft: "auto", alignSelf: "center", color: "var(--gs-faint)", flexShrink: 0 }} />
          </button>
        );
      })}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="gs-empty">
      {icon}
      <div>{text}</div>
    </div>
  );
}

function Lightbox({
  items,
  index,
  name,
  onChange,
  onClose,
}: {
  items: Array<{ full: string; src: string }>;
  index: number;
  name: string;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onChange((index + 1) % items.length);
      if (e.key === "ArrowLeft") onChange((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onChange, onClose]);

  const item = items[index];
  return (
    <div className="gs-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
        <SmartImage key={item.full} sources={[item.full, item.src]} alt={`${name} photo ${index + 1}`} width={1600} className="" loading="eager" />
      </div>
      <button className="gs-ctrl" style={{ top: 20, right: 20 }} onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>
      {items.length > 1 && (
        <>
          <button
            className="gs-ctrl"
            style={{ left: 20, top: "50%" }}
            onClick={(e) => {
              e.stopPropagation();
              onChange((index - 1 + items.length) % items.length);
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            className="gs-ctrl"
            style={{ right: 20, top: "50%" }}
            onClick={(e) => {
              e.stopPropagation();
              onChange((index + 1) % items.length);
            }}
            aria-label="Next"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}
      <div className="gs-lightbox-count">
        {index + 1} / {items.length}
      </div>
    </div>
  );
}
