import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	root: "viewer",
	publicDir: "../html",
	server: { port: 8098 },
});
