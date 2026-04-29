/**
 * @lore Playwright E2E config for the web package. Uses Chromium only to keep
 * CI fast.
 *
 * @lore L1 step10 (DoD gap-1): tests run on port 5179 (not the dev default
 * 5173) so a parallel `bun dev` from a sibling checkout/worktree cannot serve
 * stale code to the test runner. The vite-only command (`bun run dev` inside
 * `packages/web`) avoids the root concurrently script that also boots the
 * server on 3001 — the e2e mocks API calls via page.route(), so no API server
 * is needed and a port collision on 3001 would hang test boot.
 */
import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 5179;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
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
		command: `bun run dev -- --port ${E2E_PORT} --strictPort`,
		url: `http://localhost:${E2E_PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		cwd: ".",
	},
});
