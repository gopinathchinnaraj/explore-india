"use client";

// Image with an ordered list of fallbacks. If a URL fails (expired Google link, hotlink
// block, 404) the next candidate is tried, and finally a neutral placeholder is shown,
// so a card never renders as an empty box.

import { useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { imageCandidates } from "@/lib/media/image";

interface SmartImageProps {
  sources: Array<string | null | undefined>;
  alt: string;
  /** Requested rendition width for resizable (Google) photos */
  width?: number;
  height?: number;
  className?: string;
  fallback?: ReactNode;
  loading?: "lazy" | "eager";
}

export default function SmartImage({
  sources,
  alt,
  width = 640,
  height,
  className = "gs-img",
  fallback,
  loading = "lazy",
}: SmartImageProps) {
  const candidates = imageCandidates(sources, width, height);
  const key = candidates.join("|");
  // Failed-attempt counter is tied to the candidate list, so new sources start fresh
  const [attempt, setAttempt] = useState({ key, index: 0 });
  const index = attempt.key === key ? attempt.index : 0;

  if (index >= candidates.length) {
    return (
      <div className="gs-img-fallback" role="img" aria-label={alt}>
        {fallback ?? <ImageOff size={22} strokeWidth={1.6} />}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={candidates[index]}
      src={candidates[index]}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt({ key, index: index + 1 })}
    />
  );
}
