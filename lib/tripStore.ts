// The visitor's trip (saved spot ids), kept in localStorage and exposed as an external
// store for useSyncExternalStore. Per-browser convenience only — nothing is sent anywhere
// until the visitor asks for an AI plan.

const KEY = "explore-india-trip";
const listeners = new Set<() => void>();
let cache: number[] | null = null;
const EMPTY: number[] = [];

function read(): number[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    cache = Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(ids: number[]) {
  cache = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
  listeners.forEach((l) => l());
}

export const tripStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        cache = null;
        cb();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  },
  get: read,
  getServer: () => EMPTY,
  toggle(id: number) {
    const ids = read();
    write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 14));
  },
  remove(id: number) {
    write(read().filter((x) => x !== id));
  },
  set(ids: number[]) {
    write(ids);
  },
  clear() {
    write([]);
  },
};
