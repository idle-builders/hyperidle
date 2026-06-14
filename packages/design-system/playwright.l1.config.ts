import { defineConfig } from "@playwright/test";

// L1a — visual regression config. Sister of `playwright.config.ts` but
// scoped to the L1a tests under `tests/visual/L1/`. Runs the spec
// referenced in the implementation brief Step 2.5 Gap 3.
export default defineConfig({
	testDir: "tests/visual/L1",
	testMatch: "**/*.spec.ts",
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: {
		viewport: { width: 1024, height: 900 },
		colorScheme: "dark",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: {
		// @lore AJ1: changed from "bun run serve" to npm; bun is never in CI.
		command: "npm run -w @hyperidle/design-system serve",
		port: 8098,
		reuseExistingServer: true,
	},
});
