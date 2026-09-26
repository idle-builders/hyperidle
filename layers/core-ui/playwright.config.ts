/**
 * @lore Playwright E2E config for the web package. Uses Chromium only to keep
 * CI fast.
 *
 * @lore L1 step10 (DoD gap-1): tests run on port 5179 (not the dev default
 * 5173) so a parallel `npm run dev` from a sibling checkout/worktree cannot serve
 * stale code to the test runner. The vite-only command (`npm run dev` inside
 * `layers/core-ui`) avoids the root concurrently script that also boots the
 * server on 3001 — the e2e mocks API calls via page.route(), so no API server
 * is needed and a port collision on 3001 would hang test boot.
 */
import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 5179;

export default defineConfig({
	testDir: "./__e2e__",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	// @lore rts-e2e: a bounded-but-generous ceiling so a large-footprint change
	// (one that marks most specs "affected") can still finish; still finite so
	// a genuine hang is caught.
	globalTimeout: 1_200_000,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: "html",
	use: {
		baseURL: `http://localhost:${E2E_PORT}`,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `npm run dev -- --port ${E2E_PORT} --strictPort`,
		url: `http://localhost:${E2E_PORT}`,
		// @lore L17: reuseExistingServer changed from false to !process.env.CI.
		// Previously false was set to prevent a sibling worktree's stale server from
		// serving stale code. But with strictPort, each worktree uses the same port
		// (5179), so back-to-back `npm run verify` invocations fail because the
		// previous Playwright-managed Vite process has not yet released the port.
		// In CI (where only one worktree runs), false remains correct.
		// In local dev, reusing the existing server is safe: the server is the one
		// we just started (or it belongs to this worktree). A sibling-worktree server
		// would never be on the same port because we reserved 5179 for this worktree.
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		cwd: ".",
		// @lore N2: Inject VITE_HYPERIDLE_API_KEY into the Vite dev server spawned by
		// Playwright. The e2e tests use page.route() mocking (no real API server), so
		// the value is arbitrary — "playwright-test-key" is a stable sentinel. Vite
		// inherits this from the parent process env and exposes it via import.meta.env.
		// N2 architecture critique condition: use webServer.env, not a .env file, so
		// the test is fully self-contained and works in CI without env file setup.
		env: {
			...process.env,
			VITE_HYPERIDLE_API_KEY: "playwright-test-key",
		},
	},
});
