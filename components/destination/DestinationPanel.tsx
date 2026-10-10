"use client";

import { useState, useEffect } from "react";
import {
  X,
  MapPin,
  Star,
  Share2,
  Heart,
  Navigation,
  Sparkles,
  PlayCircle,
  MessageSquare,
  Map,
  Image as ImageIcon,
  Loader2,
  Camera,
} from "lucide-react";
import type { DestinationSummary } from "@/types/destination";
import type { Video } from "@/types/video";
import type { Review } from "@/types/review";
import type { Photo, PhotoCategory } from "@/types/photo";
import type { MapSpot } from "@/types/spot";
import SmartImage from "@/components/common/SmartImage";
import { primaryCategory } from "@/lib/categories";

interface NearbyDest extends DestinationSummary {
  distanceKm: number;
}

interface DestinationPanelProps {
  destination: DestinationSummary;
  onClose: () => void;
  onNearbyClick: (dest: DestinationSummary) => void;
  onAIClick: () => void;
  /** Approved spots inside this destination */
  spots?: MapSpot[];
  onSpotClick?: (spot: MapSpot) => void;
}

type TabId = "overview" | "places" | "videos" | "reviews" | "nearby" | "photos";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Map size={14} /> },
  { id: "places", label: "Places", icon: <Camera size={14} /> },
  { id: "videos", label: "Videos", icon: <PlayCircle size={14} /> },
  { id: "reviews", label: "Reviews", icon: <MessageSquare size={14} /> },
  { id: "nearby", label: "Nearby", icon: <MapPin size={14} /> },
  { id: "photos", label: "Photos", icon: <ImageIcon size={14} /> },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  historical: { bg: "#fef3c7", text: "#b45309" },
  temples: { bg: "#ede9fe", text: "#7c3aed" },
  waterfalls: { bg: "#e0f2fe", text: "#0284c7" },
  beaches: { bg: "#cffafe", text: "#0891b2" },
  "hill-stations": { bg: "#d1fae5", text: "#059669" },
  wildlife: { bg: "#ffedd5", text: "#ea580c" },
  nature: { bg: "#dcfce7", text: "#16a34a" },
  adventure: { bg: "#fee2e2", text: "#dc2626" },
  cities: { bg: "#e0e7ff", text: "#4338ca" },
  food: { bg: "#fef9c3", text: "#d97706" },
  culture: { bg: "#fce7f3", text: "#be185d" },
  unesco: { bg: "#fef3c7", text: "#854d0e" },
  default: { bg: "#f1f5f9", text: "#475569" },
};

function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span className="rating-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(rating) ? "#f59e0b" : "none"}
          color={i <= Math.round(rating) ? "#f59e0b" : "#d1d5db"}
        />
      ))}
    </span>
  );
}

function SkeletonBlock({ height = 16, width = "100%", className = "" }: { height?: number; width?: string; className?: string }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width, borderRadius: 6, marginBottom: 8 }}
    />
  );
}

function formatViews(views: number | null): string {
  if (!views) return "";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
  return `${views} views`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DestinationPanel({
  destination,
  onClose,
  onNearbyClick,
  onAIClick,
  spots = [],
  onSpotClick,
}: DestinationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(spots.length > 1 ? "places" : "overview");
  const [videos, setVideos] = useState<Video[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoCategories, setPhotoCategories] = useState<PhotoCategory[]>([]);
  const [selectedPhotoCategory, setSelectedPhotoCategory] = useState<string | undefined>(undefined);
  const [nearby, setNearby] = useState<NearbyDest[]>([]);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [videosLoading, setVideosLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [videosError, setVideosError] = useState(false);
  const [reviewsError, setReviewsError] = useState(false);
  const [photosError, setPhotosError] = useState(false);
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [saved, setSaved] = useState(false);

  const slug = destination.slug;

  // Reset when destination changes
  useEffect(() => {
    setActiveTab("overview");
    setVideos([]);
    setReviews([]);
    setPhotos([]);
    setPhotoCategories([]);
    setSelectedPhotoCategory(undefined);
    setActivePhoto(null);
    setNearby([]);
    setAiSummary("");
    setVideosError(false);
    setReviewsError(false);
    setPhotosError(false);
    setSaved(false);

    // Pre-fetch nearby and AI summary
    loadNearby();
    loadAISummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function loadVideos() {
    if (videos.length > 0) return;
    setVideosLoading(true);
    setVideosError(false);
    try {
      const res = await fetch(`/api/destinations/${slug}/videos`);
      const data = await res.json();
      setVideos(data.videos || []);
      if (data.error) setVideosError(true);
    } catch {
      setVideosError(true);
    } finally {
      setVideosLoading(false);
    }
  }

  async function loadReviews() {
    if (reviews.length > 0) return;
    setReviewsLoading(true);
    setReviewsError(false);
    try {
      const res = await fetch(`/api/destinations/${slug}/reviews`);
      const data = await res.json();
      setReviews(data.reviews || []);
      if (data.error) setReviewsError(true);
    } catch {
      setReviewsError(true);
    } finally {
      setReviewsLoading(false);
    }
  }

  async function loadPhotos(catId?: string) {
    if (photos.length > 0 && !catId && !selectedPhotoCategory) return;
    setPhotosLoading(true);
    setPhotosError(false);
    try {
      const url = catId
        ? `/api/destinations/${slug}/photos?categoryId=${encodeURIComponent(catId)}`
        : `/api/destinations/${slug}/photos`;
      const res = await fetch(url);
      const data = await res.json();
      setPhotos(data.photos || []);
      if (data.categories && data.categories.length > 0) {
        setPhotoCategories(data.categories);
      }
      if (data.error && (!data.photos || data.photos.length === 0)) {
        setPhotosError(true);
      }
    } catch {
      setPhotosError(true);
    } finally {
      setPhotosLoading(false);
    }
  }

  function handleCategorySelect(catId?: string) {
    setSelectedPhotoCategory(catId);
    loadPhotos(catId);
  }

  async function loadNearby() {
    setNearbyLoading(true);
    try {
      const res = await fetch(`/api/destinations/${slug}/nearby`);
      const data = await res.json();
      setNearby(data.nearby || []);
    } catch {
      setNearby([]);
    } finally {
      setNearbyLoading(false);
    }
  }

  async function loadAISummary() {
    try {
      const res = await fetch(`/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Give a 2-sentence travel summary for ${destination.name}`,
          destinationSlug: slug,
        }),
      });
      const data = await res.json();
      if (data.answer && !data.error) {
        setAiSummary(data.answer.slice(0, 300));
      }
    } catch {
      // AI summary is optional
    }
  }

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    if (tab === "videos") loadVideos();
    if (tab === "reviews") loadReviews();
    if (tab === "photos") loadPhotos();
  }

  const catColor =
    CATEGORY_COLORS[destination.categories[0]?.slug || "default"] ||
    CATEGORY_COLORS.default;

  return (
    <aside
      className="destination-panel animate-slide-in-right"
      aria-label={`Destination details for ${destination.name}`}
      role="complementary"
    >
      {/* Close button */}
      <button
        className="panel-close-btn"
        onClick={onClose}
        aria-label="Close destination panel"
        id="close-destination-panel"
      >
        <X size={14} />
      </button>

      {/* Hero Image — falls back to spot photos, then a neutral placeholder */}
      <div className="panel-hero" style={{ background: `linear-gradient(135deg, ${catColor.bg}, #dbeafe)` }}>
        <SmartImage
          sources={[destination.coverImageUrl, ...spots.map((sp) => sp.coverImageUrl)]}
          alt={`${destination.name} - travel destination`}
          width={900}
          loading="eager"
        />
      </div>

      <div className="panel-content">
        {/* Header */}
        <div className="panel-header">
          <h1 className="panel-title">{destination.name}</h1>

          {destination.rating && (
            <div className="panel-rating">
              <StarRating rating={destination.rating} size={14} />
              <span className="rating-value">{destination.rating.toFixed(1)}</span>
              {destination.reviewCount && (
                <span className="rating-count">
                  ({destination.reviewCount.toLocaleString()} reviews)
                </span>
              )}
            </div>
          )}

          <div className="panel-location">
            <MapPin size={12} color="var(--color-accent)" />
            <span>{destination.address || `${destination.state.name}, Karnataka`}</span>
          </div>

          <div className="panel-tags" aria-label="Category tags">
            {destination.categories.slice(0, 4).map((cat) => {
              const cc = CATEGORY_COLORS[cat.slug] || CATEGORY_COLORS.default;
              return (
                <span
                  key={cat.id}
                  className="panel-tag"
                  style={{ background: cc.bg, color: cc.text }}
                >
                  {cat.name}
                </span>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="panel-actions">
          <button
            id="panel-directions-btn"
            className="panel-action-btn"
            onClick={() =>
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`,
                "_blank"
              )
            }
            aria-label={`Get directions to ${destination.name}`}
          >
            <Navigation size={14} />
            Directions
          </button>
          <button
            id="panel-save-btn"
            className="panel-action-btn"
            onClick={() => setSaved(!saved)}
            aria-label={saved ? "Remove from saved" : "Save destination"}
            aria-pressed={saved}
            style={saved ? { borderColor: "#dc2626", color: "#dc2626" } : {}}
          >
            <Heart size={14} fill={saved ? "#dc2626" : "none"} />
            {saved ? "Saved" : "Save"}
          </button>
          <button
            id="panel-share-btn"
            className="panel-action-btn"
            onClick={() => {
              navigator.share?.({
                title: destination.name,
                text: `Discover ${destination.name} on Explore India`,
                url: window.location.href,
              }) || navigator.clipboard.writeText(window.location.href);
            }}
            aria-label={`Share ${destination.name}`}
          >
            <Share2 size={14} />
            Share
          </button>
        </div>

        {/* Tabs */}
        <div className="panel-tabs" role="tablist" aria-label="Destination information tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              className={`panel-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
            >
              {tab.icon}
              <span style={{ marginLeft: 4 }}>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="tab-content animate-fade-in"
        >
          {activeTab === "overview" && (
            <OverviewTab
              destination={destination}
              aiSummary={aiSummary}
              nearby={nearby}
              nearbyLoading={nearbyLoading}
              onNearbyClick={onNearbyClick}
              onAIClick={onAIClick}
            />
          )}
          {activeTab === "places" && <PlacesTab spots={spots} onSelect={onSpotClick} />}
          {activeTab === "videos" && (
            <VideosTab
              videos={videos}
              loading={videosLoading}
              error={videosError}
              destinationName={destination.name}
            />
          )}
          {activeTab === "reviews" && (
            <ReviewsTab
              reviews={reviews}
              loading={reviewsLoading}
              error={reviewsError}
              destination={destination}
            />
          )}
          {activeTab === "nearby" && (
            <NearbyTab
              nearby={nearby}
              loading={nearbyLoading}
              onSelect={onNearbyClick}
            />
          )}
          {activeTab === "photos" && (
            <PhotosTab
              destination={destination}
              photos={photos}
              categories={photoCategories}
              selectedCategory={selectedPhotoCategory}
              onSelectCategory={handleCategorySelect}
              loading={photosLoading}
              error={photosError}
              onPhotoClick={(photo) => setActivePhoto(photo)}
            />
          )}
        </div>
      </div>

      {activePhoto && (
        <PhotoLightboxModal
          photo={activePhoto}
          destinationName={destination.name}
          onClose={() => setActivePhoto(null)}
        />
      )}
    </aside>
  );
}

// ─── Places Tab ───────────────────────────────────────────────

function PlacesTab({ spots, onSelect }: { spots: MapSpot[]; onSelect?: (spot: MapSpot) => void }) {
  if (spots.length === 0) {
    return (
      <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        No approved places in this destination yet.
      </div>
    );
  }
  const sorted = [...spots].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {sorted.map((spot) => {
        const cat = primaryCategory(spot.categories);
        return (
          <button key={spot.id} className="gs-place" onClick={() => onSelect?.(spot)}>
            <div className="gs-place-img" style={{ width: 84, height: 64 }}>
              <SmartImage sources={[spot.coverImageUrl]} alt={spot.name} width={220} />
            </div>
            <div className="gs-place-body">
              <span className="gs-place-cat" style={{ color: cat.color }}>
                <cat.Icon size={12} /> {cat.name}
              </span>
              <div className="gs-place-name">{spot.name}</div>
              {spot.rating ? (
                <span className="gs-rating">
                  <Star size={12} fill="#f59e0b" color="#f59e0b" /> <strong>{spot.rating.toFixed(1)}</strong>
                  {spot.reviewCount ? <span className="count">({spot.reviewCount.toLocaleString("en-IN")})</span> : null}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────

function OverviewTab({
  destination,
  aiSummary,
  nearby,
  nearbyLoading,
  onNearbyClick,
  onAIClick,
}: {
  destination: DestinationSummary;
  aiSummary: string;
  nearby: NearbyDest[];
  nearbyLoading: boolean;
  onNearbyClick: (d: DestinationSummary) => void;
  onAIClick: () => void;
}) {
  return (
    <div>
      {/* AI Summary */}
      {aiSummary ? (
        <div className="ai-summary-card">
          <div className="ai-summary-header">
            <Sparkles size={14} />
            AI Travel Summary
          </div>
          <p className="ai-summary-text">{aiSummary}</p>
        </div>
      ) : (
        <div className="ai-summary-card">
          <div className="ai-summary-header">
            <Sparkles size={14} />
            AI Travel Summary
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SkeletonBlock height={12} />
            <SkeletonBlock height={12} width="80%" />
          </div>
        </div>
      )}

      {/* Ask AI Button */}
      <button
        id="overview-ask-ai-btn"
        onClick={onAIClick}
        style={{
          width: "100%",
          padding: "10px",
          background: "linear-gradient(135deg, #16a34a, #0ea5e9)",
          color: "white",
          border: "none",
          borderRadius: "10px",
          fontSize: "0.82rem",
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          marginBottom: 16,
          transition: "opacity 0.2s",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        aria-label={`Ask AI about ${destination.name}`}
      >
        <Sparkles size={14} />
        Ask Explore India AI about {destination.name}
      </button>

      {/* Nearby Places Preview */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "var(--color-primary)",
          }}
        >
          <MapPin size={14} color="var(--color-accent)" />
          Top Places Nearby
        </div>

        {nearbyLoading ? (
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ flex: "0 0 auto", width: 90 }}>
                <SkeletonBlock height={70} />
                <SkeletonBlock height={12} />
              </div>
            ))}
          </div>
        ) : nearby.length > 0 ? (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {nearby.slice(0, 4).map((n) => (
              <button
                key={n.id}
                onClick={() => onNearbyClick(n)}
                style={{
                  flex: "0 0 auto",
                  width: 100,
                  border: "1.5px solid var(--color-border)",
                  borderRadius: 10,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "white",
                  textAlign: "left",
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.transform = "none";
                }}
                aria-label={`View ${n.name} - ${n.distanceKm.toFixed(1)} km away`}
              >
                {n.coverImageUrl ? (
                  <img
                    src={n.coverImageUrl}
                    alt={n.name}
                    style={{ width: "100%", height: 65, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 65,
                      background: "#f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.4rem",
                    }}
                  >
                    📍
                  </div>
                )}
                <div style={{ padding: "6px 7px" }}>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: "var(--color-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {n.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.65rem",
                      color: "var(--color-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    {n.distanceKm.toFixed(1)} km
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            No nearby destinations found.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Videos Tab ───────────────────────────────────────────────


function VideosTab({
  videos,
  loading,
  error,
  destinationName,
}: {
  videos: Video[];
  loading: boolean;
  error: boolean;
  destinationName: string;
}) {
  if (loading) {
    return (
      <div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
          Fetching travel videos from YouTube...
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--color-border)" }}>
            <SkeletonBlock height={68} width="120px" />
            <div style={{ flex: 1 }}>
              <SkeletonBlock height={14} />
              <SkeletonBlock height={12} width="60%" />
              <SkeletonBlock height={12} width="40%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || videos.length === 0) {
    return (
      <div className="error-state">
        <PlayCircle size={36} className="error-state-icon" />
        <div className="error-state-title">Videos unavailable</div>
        <p className="error-state-text">
          Travel videos for {destinationName} could not be loaded right now.
          Check your SerpApi configuration.
        </p>
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(destinationName + " travel guide")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "8px 16px",
            background: "#dc2626",
            color: "white",
            borderRadius: 999,
            fontSize: "0.78rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Search on YouTube →
        </a>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: "0.72rem",
          color: "var(--color-text-muted)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <PlayCircle size={12} color="#dc2626" />
        Travel videos powered by SerpApi YouTube Search
      </div>

      {videos.map((video) => (
        <a
          key={video.id}
          href={video.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="video-card"
          aria-label={`Watch ${video.title} by ${video.channelName || "unknown channel"}`}
        >
          <div className="video-thumbnail">
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                referrerPolicy="no-referrer"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                loading="lazy"
              />
            ) : (
              <div className="video-thumbnail-placeholder">
                <PlayCircle size={24} />
              </div>
            )}
            {video.durationSeconds && (
              <div className="video-duration">
                {formatDuration(video.durationSeconds)}
              </div>
            )}
          </div>
          <div className="video-info">
            {video.category && (
              <span
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background:
                    video.category === "DOCUMENTARY"
                      ? "#ede9fe"
                      : video.category === "TRAVEL_GUIDE"
                      ? "#e0f2fe"
                      : video.category === "VLOG"
                      ? "#fef3c7"
                      : video.category === "HISTORY"
                      ? "#fce7f3"
                      : "#f1f5f9",
                  color:
                    video.category === "DOCUMENTARY"
                      ? "#6d28d9"
                      : video.category === "TRAVEL_GUIDE"
                      ? "#0369a1"
                      : video.category === "VLOG"
                      ? "#b45309"
                      : video.category === "HISTORY"
                      ? "#be185d"
                      : "#475569",
                  display: "inline-block",
                  marginBottom: 4,
                }}
              >
                {video.category.replace(/_/g, " ")}
              </span>
            )}
            <div className="video-title">{video.title}</div>
            <div className="video-meta">
              {video.channelName && <span>{video.channelName}</span>}
              {video.viewCount && (
                <>
                  <span>•</span>
                  <span>{formatViews(video.viewCount)}</span>
                </>
              )}
              {(video.publishedLabel || video.publishedAt) && (
                <>
                  <span>•</span>
                  <span>
                    {video.publishedLabel ||
                      (video.publishedAt && !Number.isNaN(new Date(video.publishedAt).getTime())
                        ? new Date(video.publishedAt).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })
                        : "")}
                  </span>
                </>
              )}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: "0.7rem",
                color: "#dc2626",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <PlayCircle size={10} />
              Watch on YouTube
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Reviews Tab ──────────────────────────────────────────────

function ReviewsTab({
  reviews,
  loading,
  error,
  destination,
}: {
  reviews: Review[];
  loading: boolean;
  error: boolean;
  destination: DestinationSummary;
}) {
  if (loading) {
    return (
      <div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
          Fetching reviews from Google Maps...
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <SkeletonBlock height={36} width="36px" />
              <div style={{ flex: 1 }}>
                <SkeletonBlock height={14} width="60%" />
                <SkeletonBlock height={12} width="40%" />
              </div>
            </div>
            <SkeletonBlock height={12} />
            <SkeletonBlock height={12} width="90%" />
            <SkeletonBlock height={12} width="70%" />
          </div>
        ))}
      </div>
    );
  }

  if (error || reviews.length === 0) {
    return (
      <div className="error-state">
        <MessageSquare size={36} className="error-state-icon" />
        <div className="error-state-title">Reviews unavailable</div>
        <p className="error-state-text">
          Reviews require a SerpApi key with Google Maps Reviews access.
          Check your configuration or view reviews directly.
        </p>
        <a
          href={`https://www.google.com/maps/search/${encodeURIComponent(destination.name + " Karnataka")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "8px 16px",
            background: "var(--color-accent)",
            color: "white",
            borderRadius: 999,
            fontSize: "0.78rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          View on Google Maps →
        </a>
      </div>
    );
  }

  const avgRating =
    reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.filter((r) => r.rating).length;

  return (
    <div>
      {/* Rating summary */}
      {destination.rating && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px",
            background: "var(--color-surface-hover)",
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-primary)", lineHeight: 1 }}>
              {destination.rating.toFixed(1)}
            </div>
            <div style={{ marginTop: 4 }}>
              <StarRating rating={destination.rating} size={14} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              {destination.reviewCount?.toLocaleString()} reviews
            </div>
          </div>
          <div style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            <div>Source: Google Maps via SerpApi</div>
            <div>Reviews are from real travelers</div>
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--color-text-muted)",
          marginBottom: 12,
        }}
      >
        ⚠️ Reviews provided by external sources via SerpApi. Explore India does not create or moderate reviews.
      </div>

      {reviews.map((review) => {
        return (
          <div key={review.id} className="review-card">
            <div className="review-header">
              <ReviewAvatar
                authorName={review.authorName}
                avatarUrl={review.authorAvatarUrl}
              />
              <div className="review-meta">
                <div className="review-author">{review.authorName || "Anonymous"}</div>
                {(review.publishedLabel || review.publishedAt) && (
                  <div className="review-date">
                    {review.publishedLabel ||
                      (review.publishedAt && !Number.isNaN(new Date(review.publishedAt).getTime())
                        ? new Date(review.publishedAt).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })
                        : "")}
                  </div>
                )}
              </div>
            </div>
            {review.rating && (
              <div className="review-rating">
                <StarRating rating={review.rating} size={12} />
              </div>
            )}
            {review.reviewText && (
              <p className="review-text">{review.reviewText}</p>
            )}
            {review.reviewUrl && (
              <a
                href={review.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.68rem",
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  textDecoration: "none",
                  marginTop: 6,
                  display: "inline-block",
                }}
              >
                View on Google Maps ↗
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewAvatar({
  authorName,
  avatarUrl,
}: {
  authorName: string | null;
  avatarUrl: string | null;
}) {
  const [hasError, setHasError] = useState(false);
  const initial = authorName?.[0]?.toUpperCase() || "?";

  if (!avatarUrl || hasError) {
    return (
      <div className="review-avatar" aria-hidden="true">
        {initial}
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={authorName || "Reviewer"}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        backgroundColor: "var(--color-surface-hover)",
      }}
    />
  );
}

// ─── Nearby Tab ───────────────────────────────────────────────

function NearbyTab({
  nearby,
  loading,
  onSelect,
}: {
  nearby: NearbyDest[];
  loading: boolean;
  onSelect: (d: DestinationSummary) => void;
}) {
  if (loading) {
    return (
      <div className="nearby-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
            <SkeletonBlock height={90} width="100%" />
            <div style={{ padding: 8 }}>
              <SkeletonBlock height={14} />
              <SkeletonBlock height={12} width="60%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (nearby.length === 0) {
    return (
      <div className="error-state">
        <MapPin size={36} className="error-state-icon" />
        <div className="error-state-title">No nearby places found</div>
        <p className="error-state-text">
          We couldn&apos;t find nearby destinations within 100km.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 12 }}>
        {nearby.length} places found nearby
      </p>
      <div className="nearby-grid">
        {nearby.map((dest) => (
          <button
            key={dest.id}
            id={`nearby-${dest.slug}`}
            className="nearby-card"
            onClick={() => onSelect(dest)}
            aria-label={`View ${dest.name} - ${dest.distanceKm.toFixed(1)} km away`}
          >
            {dest.coverImageUrl ? (
              <img
                src={dest.coverImageUrl}
                alt={dest.name}
                className="nearby-card-img"
                loading="lazy"
              />
            ) : (
              <div
                className="nearby-card-img"
                style={{
                  background: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.8rem",
                }}
              >
                📍
              </div>
            )}
            <div className="nearby-card-info">
              <div className="nearby-card-name">{dest.name}</div>
              <div className="nearby-card-meta">
                {dest.rating && (
                  <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Star size={9} fill="#f59e0b" color="#f59e0b" />
                    {dest.rating.toFixed(1)}
                  </span>
                )}
                <span className="nearby-distance">{dest.distanceKm.toFixed(1)} km</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Photos Tab ───────────────────────────────────────────────

function PhotosTab({
  destination,
  photos,
  categories,
  selectedCategory,
  onSelectCategory,
  loading,
  error,
  onPhotoClick,
}: {
  destination: DestinationSummary;
  photos: Photo[];
  categories: PhotoCategory[];
  selectedCategory?: string;
  onSelectCategory: (id?: string) => void;
  loading: boolean;
  error: boolean;
  onPhotoClick: (photo: Photo) => void;
}) {
  if (loading && photos.length === 0) {
    return (
      <div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
          Fetching customer photos from Google Maps...
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
          }}
        >
          <div style={{ gridColumn: "span 2" }}>
            <SkeletonBlock height={190} />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} height={125} />
          ))}
        </div>
      </div>
    );
  }

  if (error && photos.length === 0) {
    return (
      <div className="error-state">
        <ImageIcon size={36} className="error-state-icon" />
        <div className="error-state-title">Photos unavailable</div>
        <p className="error-state-text">
          Customer photos for {destination.name} could not be loaded right now.
        </p>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination.name + " Karnataka")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "8px 16px",
            background: "var(--color-primary)",
            color: "white",
            borderRadius: 999,
            fontSize: "0.78rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          View on Google Maps →
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Category Filter Pills */}
      {categories.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 10,
            marginBottom: 10,
            scrollbarWidth: "none",
          }}
        >
          <button
            onClick={() => onSelectCategory(undefined)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: "0.72rem",
              fontWeight: 600,
              border: "1px solid",
              borderColor: !selectedCategory ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: !selectedCategory ? "var(--color-primary)" : "transparent",
              color: !selectedCategory ? "white" : "var(--color-text)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            All
          </button>
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  border: "1px solid",
                  borderColor: isActive ? "var(--color-primary)" : "var(--color-border)",
                  backgroundColor: isActive ? "var(--color-primary)" : "transparent",
                  color: isActive ? "white" : "var(--color-text)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                {cat.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Header Info */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          {photos.length} community photos • Google Maps
        </span>
        {loading && (
          <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
            Updating...
          </span>
        )}
      </div>

      {/* Photo Grid */}
      {photos.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
          }}
        >
          {photos.map((photo, i) => (
            <PhotoCard
              key={photo.id || photo.url}
              photo={photo}
              destinationName={destination.name}
              isFeatured={i === 0}
              onClick={() => onPhotoClick(photo)}
            />
          ))}
        </div>
      ) : (
        <div className="error-state">
          <ImageIcon size={32} className="error-state-icon" />
          <div className="error-state-title">No photos found</div>
          <p className="error-state-text">No customer photos found for this category.</p>
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  destinationName,
  isFeatured,
  onClick,
}: {
  photo: Photo;
  destinationName: string;
  isFeatured?: boolean;
  onClick: () => void;
}) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return null;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      aria-label={`View photo of ${destinationName}${photo.authorName ? ` by ${photo.authorName}` : ""}`}
      style={{
        position: "relative",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        height: isFeatured ? 200 : 130,
        gridColumn: isFeatured ? "span 2" : undefined,
        backgroundColor: "var(--color-surface-hover)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <img
        src={photo.thumbnailUrl || photo.url}
        alt={photo.alt || `${destinationName} photo`}
        referrerPolicy="no-referrer"
        loading={isFeatured ? "eager" : "lazy"}
        onError={() => setHasError(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      {photo.authorName && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px 8px 6px",
            background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
            color: "white",
            fontSize: "0.68rem",
            display: "flex",
            alignItems: "center",
            gap: 4,
            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          }}
        >
          <Camera size={10} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {photo.authorName}
          </span>
        </div>
      )}
    </div>
  );
}

function PhotoLightboxModal({
  photo,
  destinationName,
  onClose,
}: {
  photo: Photo;
  destinationName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${destinationName}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.88)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fade-in 0.2s ease",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close photo preview"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "rgba(255, 255, 255, 0.15)",
          border: "none",
          color: "white",
          borderRadius: "50%",
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
        }}
      >
        <X size={20} />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "92vw",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <img
          src={photo.url}
          alt={photo.alt || `${destinationName} photo`}
          referrerPolicy="no-referrer"
          style={{
            maxWidth: "100%",
            maxHeight: "75vh",
            objectFit: "contain",
            borderRadius: 12,
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          }}
        />
        <div
          style={{
            marginTop: 12,
            color: "white",
            fontSize: "0.82rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: 0.9,
          }}
        >
          <Camera size={14} />
          <span>{destinationName}</span>
          {photo.authorName && (
            <span>• By {photo.authorName}</span>
          )}
          <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>
            via Google Maps
          </span>
        </div>
      </div>
    </div>
  );
}
