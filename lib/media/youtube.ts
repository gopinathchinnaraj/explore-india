// Free YouTube links: a search for the place, built from its name. No API key, no
// SerpApi credits, nothing stored, and it never goes stale like a single video link can.

/** YouTube search results for a place, e.g. "Halebidu, Hassan, Karnataka". Repeated words are skipped. */
export function youtubeSearchUrl(...parts: Array<string | null | undefined>): string {
  const kept: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part) continue;
    const lower = part.toLowerCase();
    // Skip a part already contained in what we have ("Hampi" after "Hampi Bazaar")
    if (kept.some((k) => k.toLowerCase().includes(lower))) continue;
    kept.push(part);
  }
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(kept.join(", "))}`;
}
