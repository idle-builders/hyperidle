/**
 * AJ5 — vite-plugin-annotations.ts
 *
 * Thin Vite dev-only plugin that registers the annotation REST middleware.
 * Uses configureServer ONLY — no transform, no generateBundle.
 * This guarantees it can never enter a production bundle (AC9).
 *
 * The `.annotations/` directory is anchored relative to the Vite config
 * file location (import.meta.url → config file dir), NOT relative to cwd.
 * This makes the plugin cwd-independent: `npm run ds:serve` from any dir
 * always writes to the repo-root `.annotations/` directory (AJ5 §6).
 *
 * @lore AJ5 DEV-ONLY MIDDLEWARE: This plugin only exposes configureServer.
 * Vite calls configureServer only in dev mode; it is not called during
 * `vite build`. The absence of transform/generateBundle is the contract
 * that prevents this code from ever entering a production bundle.
 *
 * @lore AJ5 PATH ANCHORING: Using import.meta.url to resolve the config
 * file directory, then navigating to the repo root with '../..' (since the
 * config lives at packages/design-system/vite.config.ts). This is cwd-
 * independent. Do not change to process.cwd() — that would break if the
 * viewer is started from a subdirectory.
 *
 * @lore AJ5 CORS: The middleware is only called from the same-origin Vite
 * dev server (:8098) — no CORS headers needed. Dev-only, not exposed.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { handleAnnotationRequest } from "./request-handler.js";

// ---------------------------------------------------------------------------
// Unique id generator (crypto.randomUUID fallback to timestamp)
// ---------------------------------------------------------------------------

function makeIdgen(): () => string {
	return (): string => {
		if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
			return crypto.randomUUID();
		}
		return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	};
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface AnnotationsPluginOptions {
	/**
	 * Override the directory where annotation files are stored.
	 * Default: `.annotations/` at the repository root (anchored off config file).
	 */
	dir?: string;
}

export function annotationsPlugin(opts?: AnnotationsPluginOptions): Plugin {
	return {
		name: "vite-plugin-annotations",

		// configureServer ONLY — no transform, no generateBundle (AC9)
		configureServer(server) {
			// Resolve the annotations directory.
			// Default: repo-root/.annotations/
			// Anchored off the config file location, not cwd.
			let annotationsDir: string;
			if (opts?.dir) {
				annotationsDir = opts.dir;
			} else {
				// import.meta.url points to this compiled module. During Vite dev
				// server startup, Vite processes this file in the context of the
				// vite.config.ts location. We resolve relative to this source file's
				// directory: packages/design-system/viewer/annotations/ → ../../../../
				// takes us to the repo root.
				const thisFileDir = fileURLToPath(new URL(".", import.meta.url));
				// thisFileDir = packages/design-system/viewer/annotations/
				// ../../../../ = repo root
				annotationsDir = join(thisFileDir, "../../../../.annotations");
			}

			const annotationsFile = join(annotationsDir, "annotations.json");

			// Ensure the directory exists
			mkdirSync(annotationsDir, { recursive: true });

			const clock = (): string => new Date().toISOString();
			const idgen = makeIdgen();

			// Register middleware
			server.middlewares.use(
				"/__annotations",
				(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
					const method = req.method ?? "GET";
					const pathname = req.url ?? "/";

					// Parse body for POST requests
					if (method === "POST") {
						let body = "";
						req.on("data", (chunk: Buffer) => {
							body += chunk.toString();
						});
						req.on("end", () => {
							let parsed: unknown = null;
							try {
								if (body.length > 0) {
									parsed = JSON.parse(body) as unknown;
								}
							} catch {
								// invalid JSON → handler will 400
							}

							const result = handleAnnotationRequest(
								annotationsFile,
								method,
								// Vite passes the path relative to the middleware mount point
								// e.g. mount "/__annotations", url might be "/" or "/round"
								// Reconstruct the full pathname
								`/__annotations${pathname === "/" ? "" : pathname}`,
								parsed,
								clock,
								idgen,
							);
							res.statusCode = result.status;
							res.setHeader("Content-Type", "application/json");
							res.end(JSON.stringify(result.json));
						});
					} else {
						// GET or other non-body methods
						const result = handleAnnotationRequest(
							annotationsFile,
							method,
							`/__annotations${pathname === "/" ? "" : pathname}`,
							null,
							clock,
							idgen,
						);
						res.statusCode = result.status;
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify(result.json));
					}
				},
			);
		},
	};
}
