import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		name: "web",
		environment: "jsdom",
		environmentOptions: {
			jsdom: {
				url: "http://localhost:5173",
			},
		},
		setupFiles: ["./src/test-setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		testTimeout: 15_000,
	},
});
