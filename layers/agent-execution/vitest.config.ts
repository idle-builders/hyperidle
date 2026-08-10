import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "agent-execution",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		// @lore AU31 §6/AC #4: `bootAgentExecution`'s "local" topology calls
		// `createLocalAdapterPool()` (same real, no-stub CLI-binary + live
		// model-list probe as `harness-registry`'s own tests — see that
		// package's `vitest.config.ts` for the full explanation). This
		// sibling package now makes the same call from `boot.test.ts`, so it
		// needs the same timeout extension for the same reason — vitest v4's
		// root `testTimeout: 120_000` does not cascade into `defineProject`
		// packages.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
