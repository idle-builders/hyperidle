/**
 * @lore Playwright E2E config for the web package. Uses Chromium only to keep
 * CI fast.
 *
 * @lore L1 step10 (DoD gap-1): tests run on port 5179 (not the dev default
 * 5173) so a parallel `npm run dev` from a sibling checkout/worktree cannot serve
 * stale code to the test runner. The vite-only command (`npm run dev` inside
 * `packages/web`) avoids the root concurrently script that also boots the
 * server on 3001 — the e2e mocks API calls via page.route(), so no API server
 * is needed and a port collision on 3001 would hang test boot.
 */
import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 5179;

export default defineConfig({
	testDir: "./e2e",
	testIgnore: [
		"**/ah1-*.spec.ts",
		"**/ah5-*.spec.ts",
		"**/AH6-*.spec.ts",
		// release-v0.6.0: stale overlay/dialog specs. Settings is now an in-shell
		// page, Knowledge list creates via /knowledge/new, and these files assert
		// removed user-profile/dialog contracts already covered by current specs.
		"**/settings.spec.ts",
		"**/settings-redesign.spec.ts",
		"**/settings-overlay.spec.ts",
		"**/synthesis.spec.ts",
		"**/U11-hearth-validation.spec.ts",
		"**/M3-api-wiring.spec.ts",
		"**/mock-data-purge.spec.ts",
		"**/theme-persistence.spec.ts",
		"**/knowledge-q2-create.spec.ts",
		"**/knowledge-edit.spec.ts",
		"**/AI4-status-language.spec.ts",
		"**/l10-conversations-filter.spec.ts",
		"**/L11-rich-messages.spec.ts",
	],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
		// @lore release-v0.6.0: Node 26.4.0 + Vite can abort under the default
		// 5-worker local load while serving /@react-refresh. Cap local E2E workers
		// to keep the dev server stable; CI remains single-worker for determinism.
		workers: process.env.CI ? 1 : 3,
	globalTimeout: 300_000,
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
