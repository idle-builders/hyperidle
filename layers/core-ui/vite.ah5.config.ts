/**
 * Vite config for AH5 live agent-path Playwright E2E.
 *
 * Same as vite.ah1.config.ts but targeting the AH5 API port (3097) and
 * Vite port (5182) to avoid collisions with AH1 (3099/5180) and dev (3001/5179).
 *
 * @lore AH5: Port layout:
 *   3097 — AH5 API test server (Hono, PGlite, real OpenRouter credential)
 *   5182 — AH5 Vite dev server (proxies /api → 3097, VITE_HYPERIDLE_API_KEY set)
 *
 * @lore AH5: VITE_API_PORT env var is set by playwright.ah5.config.ts webServer env
 * block (same pattern as AH1). Defaults to 3097 for standalone local runs.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = process.env.VITE_API_PORT ?? "3097";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5182,
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
