/**
 * Playwright E2E config for the web package. Uses Chromium only to keep CI
 * fast. Tests run on port 5179 (not the dev default 5173) so a parallel
 * `npm run dev` from a sibling checkout/worktree cannot serve stale code to
 * the test runner. The vite-only command (`npm run dev` inside
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
	// A bounded-but-generous ceiling so a large-footprint change (one that
	// marks most specs "affected") can still finish; still finite so a
	// genuine hang is caught.
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
		// reuseExistingServer is false in CI (a stale sibling-worktree server must
		// never serve this run). In local dev it is true: with strictPort every
		// worktree uses the same port (5179), so back-to-back `npm run verify`
		// runs would otherwise fail while the previous Playwright-managed Vite
		// process still holds it — and a sibling worktree can never share this
		// port, so reusing "the existing server" always means our own.
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		cwd: ".",
		// Inject VITE_HYPERIDLE_API_KEY into the Vite dev server spawned by
		// Playwright. The e2e tests use page.route() mocking (no real API server), so
		// the value is arbitrary — "playwright-test-key" is a stable sentinel. Vite
		// inherits this from the parent process env and exposes it via import.meta.env.
		// Set via webServer.env, not a .env file, so the test is fully
		// self-contained and works in CI without env file setup.
		env: {
			...process.env,
			VITE_HYPERIDLE_API_KEY: "playwright-test-key",
		},
	},
});
