/**
 * AL5 — Drop-in surface routes.
 *
 * GET /api/surfaces           → [{name, description}] from ~/.hyperidle/surfaces/*.js
 * GET /api/surfaces/:name.js  → file bytes (Content-Type: text/javascript)
 * GET /api/surfaces/_shims/react.js          → ESM shim re-exporting React from window global
 * GET /api/surfaces/_shims/jsx-runtime.js    → ESM shim re-exporting jsx/jsxs/Fragment
 *
 * The folder is created on first access if missing. A malformed/unreadable file
 * is skipped, never crashes the server.
 *
 * @lore AL5: The renderer cannot import file:// URLs or touch fs directly
 * (contextIsolation + sandbox=true). Instead, the Hono server serves the .js
 * files over HTTP. The import map in index.html points "react" and
 * "react/jsx-runtime" to the shim routes so the dropped module shares the host's
 * single React instance (no duplicate hooks).
 *
 * @lore AL5: "description" is extracted from an optional named export
 * `export const description = "..."` at the TOP of the file via a lightweight
 * regex scan. We never execute the surface module server-side — it is browser
 * code. The regex looks for the first `export const description = "..."` or
 * `export const description = '...'` line (single-line only). If absent, the
 * description defaults to an empty string. This is intentionally simple and
 * cannot handle multiline or template literals — authors who need a description
 * should write it as a plain string on one line.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

/** Resolve the surfaces folder path. Exported for tests. */
export function resolveSurfacesDir(): string {
	return path.join(os.homedir(), ".hyperidle", "surfaces");
}

/** Ensure the surfaces folder exists. */
function ensureSurfacesDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

/**
 * Extract an optional description string from a .js surface file.
 * Never throws — returns "" on any failure.
 *
 * Matches:
 *   export const description = "..."   (source form)
 *   var description = "..."            (esbuild output form — esbuild hoists named exports)
 *   const description = "..."
 *
 * Single-line only. Template literals and multiline strings are not supported —
 * authors should use a plain string literal on one line.
 *
 * @lore AL5: esbuild converts `export const description = "..."` to
 * `var description = "...";` with `description` appearing in the trailing
 * `export { ... }` block. We match any single-line assignment so both the
 * source form and esbuild output form are handled.
 */
export function extractDescription(filePath: string): string {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		// Match: export const | const | var + description = "..." or '...'
		const match = content.match(
			/(?:export\s+)?(?:const|var|let)\s+description\s*=\s*["']([^"'\n]*)["']/,
		);
		return match?.[1] ?? "";
	} catch {
		return "";
	}
}

export interface SurfaceEntry {
	readonly name: string;
	readonly description: string;
}

/**
 * Read all surface entries from the surfaces folder.
 * Malformed or unreadable files are skipped.
 */
export function readSurfaceEntries(dir: string): SurfaceEntry[] {
	try {
		ensureSurfacesDir(dir);
		const entries = fs.readdirSync(dir);
		const surfaces: SurfaceEntry[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(".js")) continue;
			const filePath = path.join(dir, entry);
			try {
				const stat = fs.statSync(filePath);
				if (!stat.isFile()) continue;
			} catch {
				continue;
			}
			const name = entry.slice(0, -3); // strip .js
			const description = extractDescription(filePath);
			surfaces.push({ name, description });
		}
		return surfaces;
	} catch {
		return [];
	}
}

/**
 * ESM shim that re-exports all React hooks + default from window.__hyperidleReact.
 * The host sets window.__hyperidleReact = React in main.tsx so the dropped
 * module shares the host's single React instance.
 *
 * @lore AL5: We cannot do `export * from "react"` (that's a static import).
 * Instead we re-export from the window global. The import map in index.html
 * maps "react" → this shim, so `import { useState } from "react"` in the
 * dropped module resolves here at runtime.
 */
const REACT_SHIM = `
// AL5 shim: re-export React from the host's window global.
// The host sets window.__hyperidleReact = React in main.tsx.
const R = globalThis.__hyperidleReact;
export const useState = R.useState;
export const useEffect = R.useEffect;
export const useMemo = R.useMemo;
export const useRef = R.useRef;
export const useCallback = R.useCallback;
export const useContext = R.useContext;
export const useReducer = R.useReducer;
export const useLayoutEffect = R.useLayoutEffect;
export const useId = R.useId;
export const createContext = R.createContext;
export const forwardRef = R.forwardRef;
export const memo = R.memo;
export const Fragment = R.Fragment;
export const createElement = R.createElement;
export const cloneElement = R.cloneElement;
export const Children = R.Children;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const lazy = R.lazy;
export default R;
`.trimStart();

/**
 * ESM shim for react/jsx-runtime.
 * The host sets window.__hyperidleJsxRuntime = jsxRuntime in main.tsx.
 */
const JSX_RUNTIME_SHIM = `
// AL5 shim: re-export jsx-runtime from the host's window global.
const RT = globalThis.__hyperidleJsxRuntime;
export const jsx = RT.jsx;
export const jsxs = RT.jsxs;
export const Fragment = RT.Fragment;
`.trimStart();

/** Create the surfaces Hono sub-router. */
export function createSurfacesRoutes(): Hono {
	const router = new Hono();

	// GET /api/surfaces/_shims/react.js — must be before :name.js wildcard
	router.get("/_shims/react.js", requireBoundary({ kind: "public-data" }), (_c) => {
		return new Response(REACT_SHIM, {
			headers: { "Content-Type": "text/javascript; charset=utf-8" },
		});
	});

	// GET /api/surfaces/_shims/jsx-runtime.js
	router.get("/_shims/jsx-runtime.js", requireBoundary({ kind: "public-data" }), (_c) => {
		return new Response(JSX_RUNTIME_SHIM, {
			headers: { "Content-Type": "text/javascript; charset=utf-8" },
		});
	});

	// GET /api/surfaces — list all folder surfaces
	router.get("/", requireBoundary({ kind: "public-data" }), (c) => {
		const dir = resolveSurfacesDir();
		const entries = readSurfaceEntries(dir);
		return c.json(entries);
	});

	// GET /api/surfaces/:name.js — serve one surface file
	router.get("/:nameJs", requireBoundary({ kind: "public-data" }), (c) => {
		const nameJs = c.req.param("nameJs");
		if (!(nameJs && nameJs.endsWith(".js"))) {
			return c.json({ error: "Not found" }, 404);
		}
		// Prevent path traversal
		const safe = path.basename(nameJs);
		if (safe !== nameJs) {
			return c.json({ error: "Not found" }, 404);
		}
		const dir = resolveSurfacesDir();
		const filePath = path.join(dir, safe);
		try {
			const bytes = fs.readFileSync(filePath);
			return new Response(bytes, {
				headers: { "Content-Type": "text/javascript; charset=utf-8" },
			});
		} catch {
			return c.json({ error: "Not found" }, 404);
		}
	});

	return router;
}
