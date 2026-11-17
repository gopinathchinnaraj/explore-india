/**
 * Only same-site relative paths may be used as a post-auth redirect, so a crafted
 * ?redirectTo=https://evil.example link can't bounce a visitor off-site after sign-in.
 */
export function safeRedirect(value: string | string[] | undefined | null, fallback = "/"): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
