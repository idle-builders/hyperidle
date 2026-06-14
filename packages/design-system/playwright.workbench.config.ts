/**
 * K12 — Playwright config for the unified workbench smoke test.
 *
 * Separate from `playwright.config.ts` (which runs visual-regression at
 * `src/__tests__/visual-regression.test.ts`) so the two test suites don't
 * interfere — visual-regression sets `fullyParallel: false` and a fixed
 * 1024×900 viewport tuned for pixel-diffing, whereas the workbench smoke
 * just verifies the viewer at `:8098` renders the expected catalog and
 * toolbar interactions.
 *
 * @lore AJ1 (W4 fix): The prior config attempted to start a separate viewer on
 * port 8197 via `-- -- --port 8197`, but npm argument forwarding through
 * `npm run -w <pkg> <script> -- -- <flag>` does NOT pass --port to vite
 * (the extra `--` goes as a literal argument, not a vite flag). The viewer
 * always started on its default port. Fixed: use port 8098 + reuseExistingServer:true
 * so this config shares the viewer already booted by verify's ds:sync step.
 * `npm run ds:workbench` runs this config standalone — it boots a fresh viewer
 * if none is running, or reuses an existing one.
 *
 * @lore AJ1 (W2 fix): Previously orphaned — not wired into verify or CI.
 * Now wired into verify as `npm run ds:workbench` (root package.json) after
 * ds:sync, and added as a CI step "Workbench smoke" after Visual regression.
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
		// Reuse the viewer booted by ds:sync (visual regression step in verify).
		// If running standalone, boots a fresh viewer on 8098.
		// @lore AJ1: bun run serve → npm run -w @hyperidle/design-system serve (bun not in CI).
		command: "npm run -w @hyperidle/design-system serve",
		port: 8098,
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
