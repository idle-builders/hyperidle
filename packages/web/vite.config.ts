import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @lore L3 DoD: WEB_PORT env var lets E2E tests run a dedicated dev server
// on a non-default port (e.g. 5176) to avoid colliding with shared 5173
// servers across worktrees. Falls back to 5173 for normal development.
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
	plugins: [react()],
	server: {
		port: WEB_PORT,
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
