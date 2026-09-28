// @lore: E2E port layout — API 3098, Vite 5183; must differ from other suites (3097/5182, 3099/5180) and dev (3001/5179) to avoid bind conflicts
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
