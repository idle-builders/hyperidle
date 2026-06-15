import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @lore AJ1: publicDir removed — html/ tree was deleted (TSX is now the single
// design source of truth). The viewer serves only live TSX stories via Vite.
export default defineConfig({
	plugins: [react()],
	root: "viewer",
	server: { port: 8098 },
});
