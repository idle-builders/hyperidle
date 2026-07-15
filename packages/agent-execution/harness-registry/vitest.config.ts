import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "harness-registry",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		// @lore AU19 Increment 5 item 6: root vitest.config.ts's `testTimeout: 120_000` does
		// NOT cascade into `defineProject` packages (Vitest v4 `projects` scoping) — it only
		// applies to tests matched directly at the workspace root, so every scaffolded nested
		// Service package silently falls back to vitest's 5000ms default. That's fine for pure
		// unit tests, but `createLocalAdapterPool()` (AC-8/X3/X5/AQ1 tests below) genuinely
		// probes real CLI binaries + does a live model-list fetch (harness-discovery.ts's
		// `discoverLocalHarnesses`) — by design, no stub (same no-stub-harness-detection
		// philosophy as Track AR's integration lane) — which reproducibly takes ~10-14s on a
		// real dev machine. Before AU19 dissolved `packages/server`, this same test ran
		// directly against the root config's 120_000 timeout (no intermediate project scope)
		// so this never surfaced. Restoring the same effective timeout here, not stubbing the
		// probe, keeps behavior identical to pre-migration.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
