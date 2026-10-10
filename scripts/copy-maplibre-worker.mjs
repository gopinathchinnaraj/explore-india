// Copies MapLibre's web-worker files to /public so the browser can load them directly.
// Next.js (Turbopack) does not serve MapLibre 6's bundled worker URL, so the map calls
// maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs") instead. Runs on postinstall.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "maplibre-gl", "dist");
const out = join(root, "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(src, file), join(out, file));
}
console.log("Copied MapLibre worker to public/maplibre");
