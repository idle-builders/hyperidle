import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss(), react()],
	server: {
		port: 5173,
		fs: {
			allow: ["../.."],
		},
		proxy: {
			"/api": {
				// @lore N2: rewrite removed — the Hono server mounts all routes under
				// app.route("/api", api) so it expects the full /api/* path. The old
				// rewrite stripped the /api prefix, causing 404s on every proxied call.
				// apiFetch sets X-API-Key on the client side before the proxy sees the
				// request; Vite's http-proxy forwards all incoming headers by default.
				target: "http://localhost:3001",
				changeOrigin: true,
			},
		},
	},
});
