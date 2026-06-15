/**
 * Design System Display Server
 *
 * Serves the HTML component files for visual inspection and Claude Design editing.
 * Static file server on :8098 serving packages/design-system/html/.
 *
 * Usage:
 *   npm run ds:serve
 *   # Then open http://localhost:8098/
 */

import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const Dirname = dirname(fileURLToPath(import.meta.url));
const HTML_DIR = resolve(Dirname, "../html");
const SCRIPTS_DIR = resolve(Dirname);
const PORT = Number(process.env.PORT) || 8098;

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

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
	let pathname = url.pathname;

	// Feedback bookmarklet endpoint
	if (pathname === "/feedback.js") {
		const feedbackPath = resolve(SCRIPTS_DIR, "feedback-overlay.js");
		if (existsSync(feedbackPath)) {
			res.writeHead(200, {
				"Content-Type": "application/javascript",
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "no-store",
			});
			createReadStream(feedbackPath).pipe(res);
			return;
		}
		res.writeHead(404);
		res.end("Not Found");
		return;
	}

	// Root → catalog
	if (pathname === "/" || pathname === "") {
		pathname = "/_catalog.html";
	}

	const filePath = resolve(HTML_DIR, `.${pathname}`);

	// Prevent path traversal
	if (!filePath.startsWith(HTML_DIR)) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

	if (existsSync(filePath)) {
		res.writeHead(200, {
			"Content-Type": getMimeType(filePath),
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "no-store",
		});
		createReadStream(filePath).pipe(res);
		return;
	}

	res.writeHead(404);
	res.end("Not Found");
});

server.listen(PORT, () => {
	console.log(`Design System server → http://localhost:${PORT}/`);
});
