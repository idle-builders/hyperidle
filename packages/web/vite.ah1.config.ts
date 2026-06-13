/**
 * Vite config for AH1 real-backend Playwright E2E.
 *
 * Same as vite.config.ts but the /api proxy target is configurable via
 * VITE_API_PORT env var so the AH1 Playwright project can point to the
 * dedicated test Hono server (port 3099) instead of the dev default (3001).
 *
 * @lore AH1: The main playwright.config.ts boots Vite only (port 5179, no
 * API server) and mocks all /api/* routes. For the AH1 proof, we need the
 * credential routes to reach a real Hono server. A separate vite config is
 * used so the AH1 Playwright project can proxy /api to a test API server
 * without affecting other E2E specs. The VITE_API_PORT env var is set by
 * playwright.ah1.config.ts's webServer env block.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = process.env.VITE_API_PORT ?? "3099";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5180,
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
