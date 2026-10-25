import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		fs: {
			allow: ["../.."],
		},
		proxy: {
			// The server's address; the e2e run starts its own on another port.
			"/api": {
				target: process.env.HYPERIDLE_API_URL ?? "http://localhost:3001",
				changeOrigin: true,
				ws: true,
			},
		},
	},
});
