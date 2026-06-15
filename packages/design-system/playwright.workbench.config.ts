/**
 * K12 — Playwright config for the unified workbench smoke test.
 *
 * Separate from `playwright.config.ts` (which runs visual-regression at
 * `src/__tests__/visual-regression.test.ts`) so the two test suites don't
 * interfere — visual-regression sets `fullyParallel: false` and a fixed
 * 1024×900 viewport tuned for pixel-diffing, whereas the workbench smoke
 * just verifies the viewer at `:8098` renders the expected catalog and
 * toolbar interactions.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests",
	testMatch: "workbench.spec.ts",
	reporter: [["list"]],
	use: {
		viewport: { width: 1280, height: 900 },
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: {
		// Use a worktree-specific port (not 8098) so this test doesn't collide
		// with a long-running `bun run ds:serve` started from the main repo dir.
		command: "bun run serve -- --port 8197",
		url: "http://localhost:8197/",
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
