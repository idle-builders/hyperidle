import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Design studio: no API proxy, no server, no design-system dependency.
// Mock data and a fresh language only — by design.
export default defineConfig({
	plugins: [react()],
	server: { port: 5180 },
});
