import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { annotationsPlugin } from "./viewer/annotations/vite-plugin-annotations.js";

// @lore AJ1: publicDir removed — html/ tree was deleted (TSX is now the single
// design source of truth). The viewer serves only live TSX stories via Vite.
//
// @lore AJ5: annotationsPlugin added — configureServer-only dev middleware that
// serves /__annotations REST endpoints. It is never included in production builds
// (no transform/generateBundle). Writes to repo-root/.annotations/ (gitignored).
export default defineConfig({
	plugins: [tailwindcss(), react(), annotationsPlugin()],
	root: "viewer",
	server: { port: 8098 },
});
