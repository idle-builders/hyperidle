/**
 * @lore Playwright E2E config for the web package. Uses Chromium only to keep
 * CI fast. The dev server must be running on the configured port before tests
 * execute. Use `webServer` config to auto-start it, or run `bun dev` manually.
 *
 * @lore L6 DoD: per-worktree port discovery. When multiple git worktrees run
 * dev servers in parallel, the default 5173 collides. Set `WEB_PORT` (and
 * optionally `API_PORT`) to a unique port per worktree, e.g.:
 *
 *   WEB_PORT=5175 npx playwright test e2e/request-changes.spec.ts
 *
 * The vite dev server reads `WEB_PORT` via `--port` from the workspace `dev`
 * script when present; otherwise it falls back to 5173. The webServer block
 * here just points playwright at the same port.
 */
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number.parseInt(process.env.WEB_PORT ?? "5173", 10);
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
		command: "bun run dev",
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		cwd: "../..",
		env: {
			WEB_PORT: String(WEB_PORT),
		},
	},
});
