import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "harness-registry",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		// @lore root vitest.config.ts's `testTimeout: 120_000` does NOT cascade into
		// `defineProject` packages (Vitest v4 `projects` scoping) — it only applies
		// to tests matched directly at the workspace root, so a nested project
		// silently falls back to vitest's 5000ms default. `createLocalAdapterPool()`
		// no longer probes real CLI binaries in this lane — its discovery and
		// availability checks are stubbed (see adapter-pool.test.ts's
		// `fakeLocalAdapterPool` helper) so the unit lane never spawns a `which` or
		// a real `--version`. The generous timeout stays as a safety margin against
		// vitest's tight default, not because anything here is slow by design.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
