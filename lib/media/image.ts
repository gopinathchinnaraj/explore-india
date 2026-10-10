// Image URL helpers shared by server and client code.
// Google-hosted photos (lh*.googleusercontent.com) accept a size suffix such as
// "=w640-h480-k-no", and Wikimedia serves fixed thumbnail widths, so we request an
// appropriately sized rendition instead of the multi-megabyte original.

const GOOGLE_SIZE_SUFFIX = /=[a-z][a-z0-9-]*$/i;

function isResizableGoogleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // gps-proxy URLs are signed and break when modified
    return u.hostname.endsWith("googleusercontent.com") && !u.pathname.startsWith("/gps-proxy/");
  } catch {
    return false;
  }
}

// Wikimedia only serves thumbnails at these widths (others return HTTP 400)
const WIKIMEDIA_WIDTHS = [60, 120, 250, 330, 500, 960, 1280, 1920];
const WIKIMEDIA_THUMB = /^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/.+\/thumb\/.+\/)(\d+)px-([^/?]+)(\?.*)?$/;

/**
 * Resize a Wikimedia thumbnail URL to the smallest allowed width that covers `width`.
 * Only ever scales down from the stored size, since larger than the original fails.
 */
function sizedWikimediaUrl(url: string, width: number): string | null {
  const m = url.match(WIKIMEDIA_THUMB);
  if (!m) return null;
  const current = Number(m[2]);
  const target = WIKIMEDIA_WIDTHS.find((w) => w >= width) ?? WIKIMEDIA_WIDTHS[WIKIMEDIA_WIDTHS.length - 1];
  const chosen = Math.min(current, target);
  return `${m[1]}${chosen}px-${m[3]}`;
}

/** Return a resized rendition of a Google or Wikimedia photo URL; other URLs are returned unchanged. */
export function sizedImageUrl(url: string | null | undefined, width: number, height?: number): string | null {
  if (!url) return null;
  const wiki = sizedWikimediaUrl(url, width);
  if (wiki) return wiki;
  if (!isResizableGoogleUrl(url)) return url;
  const h = height ?? Math.round((width * 3) / 4);
  return `${url.replace(GOOGLE_SIZE_SUFFIX, "")}=w${width}-h${h}-k-no`;
}

/**
 * Ordered list of candidate image URLs for a spot or destination.
 * The client tries each in turn, so a single broken URL never leaves an empty card.
 */
export function imageCandidates(
  sources: Array<string | null | undefined>,
  width: number,
  height?: number
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of sources) {
    const sized = sizedImageUrl(src, width, height);
    if (sized && !seen.has(sized)) {
      seen.add(sized);
      out.push(sized);
    }
  }
  return out;
}

/** Size-independent identity of an image URL, to spot the same photo at different sizes */
export function imageIdentity(url: string): string {
  const wiki = url.match(WIKIMEDIA_THUMB);
  if (wiki) return `${wiki[1]}${wiki[3]}`;
  return url.split("?")[0].replace(GOOGLE_SIZE_SUFFIX, "");
}
