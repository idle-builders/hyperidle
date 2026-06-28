import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		hookTimeout: 120_000,
		testTimeout: 120_000,
		maxWorkers: 4,
		minWorkers: 4,
		include: ["packages/**/*.integration.test.{ts,tsx}"],
		exclude: [
			"**/node_modules/**",
			"**/.git/**",
			"**/dist/**",
			"**/.worktrees/**",
			// Real-harness tests: call real CLIs (claude, codex, opencode) — local-only lane.
			// Naming convention is *.real-harness.test.ts but AN1 used .integration.test.ts
			// by mistake. Excluded here to match the intended local-only lane semantics.
			// @lore AN1: AN1-real-harness-inherited.integration.test.ts is a real-harness
			// test mis-named as .integration.test.ts. Adding the explicit exclude here keeps
			// it out of test:all without renaming (which would break the cross-branch
			// attestation source-hash). The test can still run via:
			//   npx vitest run --config vitest.integration.config.ts <file>
			"**/harness/__tests__/*real-harness*.integration.test.{ts,tsx}",
		],
		reporters: ["dot"],
		pool: "threads",
		// @lore AD8a: isolate:true required to fix ES-module mock leakage in the
		// threads pool. With isolate:false, vi.mock("./llm-client") in
		// X6-provisioning-integration.test.ts was non-deterministically bypassed
		// because builtin-harness-adapter (which imports callLlm) was pre-loaded
		// in the worker by other test files before X6's vi.mock hoisting could
		// intercept it. The PGlite pool stores state on globalThis so it survives
		// per-file module reloads — isolate:true is safe here.
		isolate: true,
		setupFiles: ["packages/db/src/vitest-integration-setup.ts"],
	},
});
