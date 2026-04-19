import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: "http://localhost:3001",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
	build: {
		rollupOptions: {
			// @hyperidle/shared re-exports a server-only SSRF module that
			// uses node:dns, node:net, node:util. The web app never imports
			// those exports — only types and constants. Externalize the Node
			// built-ins so Rollup doesn't fail trying to bundle them.
			external: ["node:dns", "node:net", "node:util"],
		},
	},
});
