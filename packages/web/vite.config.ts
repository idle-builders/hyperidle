/**
 * @lore L6 DoD: per-worktree port discovery. Honor `WEB_PORT` (and optional
 * `API_PORT`) so multiple git worktrees can run dev servers in parallel
 * without colliding on 5173/3001. Default to 5173/3001 when unset.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const WEB_PORT = Number.parseInt(process.env.WEB_PORT ?? "5173", 10);
const API_PORT = Number.parseInt(process.env.API_PORT ?? "3001", 10);

export default defineConfig({
	plugins: [react()],
	server: {
		port: WEB_PORT,
		strictPort: true,
		fs: {
			allow: ["../.."],
		},
		proxy: {
			"/api": {
				target: `http://localhost:${API_PORT}`,
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
});
