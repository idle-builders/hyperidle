/**
 * AL5 — Runtime surface loader.
 *
 * At app boot, fetches /api/surfaces, imports each surface module via dynamic
 * import(), and registers the default export into the runtime registry.
 *
 * The runtime registry is consulted by getReviewSurface() IN ADDITION to the
 * static built-in map. Built-ins always win on name clash.
 *
 * Load failures are isolated: one bad surface never breaks others or the app.
 * Unknown/failed surfaces → family floor (getReviewCanvas(kind)).
 *
 * @lore AL5: import() works for HTTP URLs in modern browsers. The import map
 * in index.html maps "react" and "react/jsx-runtime" to the shim routes at
 * /api/surfaces/_shims/react.js and /api/surfaces/_shims/jsx-runtime.js, which
 * re-export from window.__hyperidleReact and window.__hyperidleJsxRuntime.
 * This ensures the dropped module shares the host's single React instance.
 *
 * @lore AL5: loadFolderSurfaces() is called once at boot (in main.tsx, before
 * createRoot) so getReviewSurface() remains synchronous on the render path.
 * A surface that loads after first render simply won't be available until
 * the next app restart — which is the documented model.
 */

import type { ReviewCanvasComponent } from "./review-artifact.js";

/**
 * Runtime registry: name → component.
 * Populated by loadFolderSurfaces() at boot.
 * Built-in REVIEW_SURFACE_REGISTRY always wins (checked first in getReviewSurface).
 */
export const RUNTIME_SURFACE_REGISTRY = new Map<string, ReviewCanvasComponent>();

interface SurfaceEntry {
	name: string;
	description: string;
}

interface SurfaceModule {
	default?: ReviewCanvasComponent;
}

/**
 * Fetch /api/surfaces, dynamically import each .js, register into RUNTIME_SURFACE_REGISTRY.
 * Call once at boot. Returns the names successfully loaded.
 *
 * Never throws — all errors are isolated per-surface.
 */
export async function loadFolderSurfaces(baseUrl = ""): Promise<string[]> {
	let entries: SurfaceEntry[];
	try {
		const res = await fetch(`${baseUrl}/api/surfaces`);
		if (!res.ok) return [];
		entries = (await res.json()) as SurfaceEntry[];
	} catch {
		// Server unreachable or fetch failed — not fatal
		return [];
	}

	const loaded: string[] = [];
	for (const entry of entries) {
		try {
			// Dynamic import of an HTTP URL — supported in modern browsers.
			// The import map in index.html resolves "react" inside this module
			// to the shim that re-exports from window.__hyperidleReact.
			const mod = (await import(
				/* @vite-ignore */ `${baseUrl}/api/surfaces/${entry.name}.js`
			)) as SurfaceModule;
			if (typeof mod.default === "function") {
				RUNTIME_SURFACE_REGISTRY.set(entry.name, mod.default);
				loaded.push(entry.name);
			}
		} catch {
			// Bad module — skip, don't crash
		}
	}
	return loaded;
}
