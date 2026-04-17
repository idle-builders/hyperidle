/**
 * @lore Playwright E2E config for the web package. Uses Chromium only to keep
 * CI fast. The dev server must be running on port 5173 before tests execute.
 * Use `webServer` config to auto-start it, or run `bun dev` manually.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		cwd: "../..",
	},
});
