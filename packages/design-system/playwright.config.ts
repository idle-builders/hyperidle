import { defineConfig } from "@playwright/test";

// @lore AJ1: webServer.command changed from "bun run serve" to npm because bun
// is never installed in CI (ubuntu-latest + setup-node only). The `serve` script
// is `vite --config vite.config.ts` — bun was only the launcher, vite is the
// runtime. snapshotPathTemplate omits the {platform} token so one baseline set
// (Linux/CI canonical) serves all environments; the 5% ratio absorbs cross-platform
// AA jitter. This is not a weakening — the retired HTML gate used the same 5% ceiling.

export default defineConfig({
	testDir: "src/__tests__",
	testMatch: "visual-regression.test.ts",
	fullyParallel: false,
	workers: 1,
	reporter: [["html", { open: "never" }]],
	use: {
		viewport: { width: 1024, height: 900 },
		colorScheme: "dark",
	},
	expect: {
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.05,
			threshold: 0.2,
		},
	},
	// Platform-agnostic snapshot path — no {platform} token so CI/Linux baselines
	// are used by all environments. One canonical set, no per-platform forks.
	snapshotPathTemplate: "{testDir}/{testFileDir}/__screenshots__/{arg}{ext}",
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: {
		// npm run -w @hyperidle/design-system serve boots vite without bun.
		// bun is not installed in CI — this swap is mandatory for AC4.
		command: "npm run -w @hyperidle/design-system serve",
		port: 8098,
		// Always boot a fresh server; sibling worktrees on the same port served
		// stale source to the runner.
		reuseExistingServer: false,
	},
});
