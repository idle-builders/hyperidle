/**
 * Design System Display Server
 *
 * Serves the HTML component files for visual inspection and Claude Design editing.
 * Static file server on :8098 serving packages/design-system/html/.
 *
 * Usage:
 *   bun run scripts/serve.ts
 *   # Then open http://localhost:8098/
 *
 * @lore Uses Bun.file() for static serving — no build step needed.
 * The HTML files use CDN React + Babel for in-browser transpilation.
 */

import { resolve } from "node:path";

const HTML_DIR = resolve(import.meta.dirname, "../html");
const PORT = 8098;

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
};

function getMimeType(path: string): string {
	const ext = path.slice(path.lastIndexOf("."));
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		let pathname = url.pathname;

		// Root → catalog
		if (pathname === "/" || pathname === "") {
			pathname = "/_catalog.html";
		}

		const filePath = resolve(HTML_DIR, `.${pathname}`);

		// Prevent path traversal
		if (!filePath.startsWith(HTML_DIR)) {
			return new Response("Forbidden", { status: 403 });
		}

		const file = Bun.file(filePath);
		if (await file.exists()) {
			return new Response(file, {
				headers: {
					"Content-Type": getMimeType(filePath),
					"Access-Control-Allow-Origin": "*",
					"Cache-Control": "no-store",
				},
			});
		}

		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Design System server → http://localhost:${PORT}/`);
