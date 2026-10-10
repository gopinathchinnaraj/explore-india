// Admin theme preference, shared between the server layout (boot script) and the client shell.
// Stored in localStorage and exposed as a tiny external store for useSyncExternalStore.

export const THEME_KEY = "gs-admin-theme";
export type AdminTheme = "light" | "dark";

const listeners = new Set<() => void>();

export function subscribeTheme(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function readTheme(): AdminTheme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(theme: AdminTheme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  listeners.forEach((l) => l());
}
