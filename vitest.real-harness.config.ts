/**
 * Vitest config for the LOCAL-ONLY live real-binary harness lane.
 *
 * This config runs tests that spawn REAL harness binaries (claude, codex, opencode)
 * and make REAL LLM calls. They are intentionally excluded from test:all / test:integration
 * / CI (attestation covers only test:all).
 *
 * Per project rule: "e2e/expensive/live-LLM tests run locally only; never a GitHub
 * Actions job." These tests are auth-gated (binary must be installed + authed) and
 * skip gracefully when binaries are absent.
 *
 * Run: npm run test:real-harness
 *
 * Files matched: packages/**\/*.real-harness.test.ts
 * Currently:
 *   packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts
 *
 * @lore AL6 lane-split: Created in AL6 v4 (test-lane hygiene pass). The .real-harness.test.ts
 * suffix is excluded from server vitest.config.ts (unit lane) and from vitest.integration.config.ts
 * (integration lane, which only includes *.integration.test.{ts,tsx}). This config explicitly
 * includes them for on-demand local runs.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Long timeouts: real LLM calls can take 30–90s per test.
		hookTimeout: 120_000,
		testTimeout: 120_000,
		// Serial execution: avoid parallel real LLM calls (rate limits, auth contention).
		maxWorkers: 1,
		minWorkers: 1,
		include: ["packages/**/*.real-harness.test.ts"],
		exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.worktrees/**"],
		reporters: ["verbose"],
		pool: "threads",
		isolate: true,
		// No DB setup file needed — real-harness tests do not use PGlite.
	},
});
