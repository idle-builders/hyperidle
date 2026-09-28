import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "agent-execution",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		// @lore vitest: root testTimeout:120_000 doesn't cascade into defineProject (Vitest v4); boot.test.ts calls createLocalAdapterPool() — see harness-registry
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
