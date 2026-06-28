/**
 * Two-project integration config (AR1 lane collapse).
 *
 * project "integration-service" — parallel, deterministic service integration tests.
 *   Includes all *.integration.test.{ts,tsx} EXCEPT harness/__tests__/ (and the one
 *   session-provisioning file, which is harness-facing).
 *
 * project "integration-harness" — SERIAL, real-LLM/CLI files.
 *   maxWorkers:1 + fileParallelism:false serializes across files (rate-limit guard).
 *   Includes all harness/__tests__/*.integration.test.{ts,tsx} PLUS the one
 *   harness-facing file outside harness/__tests__/.
 *
 * @lore AR1 two-project: The harness project uses maxWorkers:1 for cross-file
 * serialization. describe.sequential would only serialize within one file — wrong
 * primitive. Per the architecture: "one worker = one file at a time" is what
 * "real-LLM files run serially to respect rate limits" requires.
 *
 * @lore AR1 lane-collapse: The AN1 exclude (old line 23: *real-harness*.integration)
 * is removed. AN1-real-harness-inherited.integration.test.ts now runs as harness
 * integration (selected by its path under harness/__tests__/).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Shared settings — inherited by all projects.
		hookTimeout: 120_000,
		testTimeout: 120_000,
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
		projects: [
			{
				// Service integration — parallel, fast, deterministic.
				test: {
					name: "integration-service",
					include: ["packages/**/*.integration.test.{ts,tsx}"],
					exclude: [
						"**/node_modules/**",
						"**/.git/**",
						"**/dist/**",
						"**/.worktrees/**",
						// Harness-facing files go in the serial project below.
						"**/harness/__tests__/**",
						"packages/server/src/__tests__/session-provisioning.integration.test.ts",
					],
					maxWorkers: 4,
					minWorkers: 4,
				},
			},
			{
				// Harness integration — SERIAL across files (real LLM/CLI, rate-limited).
				// maxWorkers:1 = one file at a time across the whole lane.
				// fileParallelism:false = belt-and-braces: never parallelize files in this project.
				test: {
					name: "integration-harness",
					include: [
						"packages/**/harness/__tests__/*.integration.test.{ts,tsx}",
						"packages/server/src/__tests__/session-provisioning.integration.test.ts",
					],
					exclude: [
						"**/node_modules/**",
						"**/.git/**",
						"**/dist/**",
						"**/.worktrees/**",
					],
					maxWorkers: 1,
					minWorkers: 1,
					fileParallelism: false,
				},
			},
		],
	},
});
