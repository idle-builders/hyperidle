/**
 * @lore Playwright E2E config for the web package. Uses Chromium only to keep
 * CI fast. The dev server must be running on the configured port before tests
 * execute. Use `webServer` config to auto-start it, or run `bun dev` manually.
 *
 * @lore L3 DoD: WEB_PORT env var supports running a dedicated server on a
 * non-default port (e.g. 5176) to avoid colliding with shared dev servers
 * across worktrees. The dev script honors WEB_PORT via vite.config.ts.
 */
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const BASE_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `WEB_PORT=${WEB_PORT} bun run --filter @hyperidle/web dev`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		cwd: "../..",
	},
});
