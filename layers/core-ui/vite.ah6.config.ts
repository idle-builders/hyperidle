/**
 * Vite config for AH6 cassette-replay Playwright E2E.
 *
 * Same as vite.ah5.config.ts but targeting the AH6 API port (3098) and
 * Vite port (5183) to avoid collisions with AH5 (3097/5182), AH1 (3099/5180),
 * and dev (3001/5179).
 *
 * @lore AH6: Port layout:
 *   3098 — AH6 API test server (Hono, PGlite, cassette replay — no real LLM key)
 *   5183 — AH6 Vite dev server (proxies /api → 3098, VITE_HYPERIDLE_API_KEY set)
 *
 * @lore AH6: VITE_API_PORT env var is set by playwright.ah6.config.ts webServer env
 * block (same pattern as AH1/AH5). Defaults to 3098 for standalone local runs.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = process.env.VITE_API_PORT ?? "3098";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5183,
		strictPort: true,
		fs: {
			allow: ["../.."],
		},
		proxy: {
			"/api": {
				target: `http://localhost:${API_PORT}`,
				changeOrigin: true,
			},
		},
	},
});
