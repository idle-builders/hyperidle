import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "eval",
		include: ["src/__tests__/**/*.test.{ts,tsx}"],
		setupFiles: ["src/vitest-setup.ts"],
		hookTimeout: 120_000,
		testTimeout: 120_000,
	},
});
