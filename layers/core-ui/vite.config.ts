import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => {
	// @lore: VITE_USER_NODE_ENV="" pre-set — blocks .env NODE_ENV=development from flipping DEV/.PROD for the production bundle; loadEnv skips pre-set vars
	if (command === "build" && mode === "production") {
		process.env.VITE_USER_NODE_ENV = "";
	}
	return {
		plugins: [tailwindcss(), react()],
		server: {
			port: 5173,
			fs: {
				allow: ["../.."],
			},
			proxy: {
				"/api": {
					target: "http://localhost:3001",
					changeOrigin: true,
				},
			},
		},
	};
});
