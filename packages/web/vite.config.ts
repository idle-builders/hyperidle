import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@hyperidle/server": path.resolve(__dirname, "../server/src"),
		},
	},
	server: {
		port: 5173,
		fs: {
			allow: ["../.."],
		},
		proxy: {
			"/api": {
				target: "http://localhost:3001",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
});
