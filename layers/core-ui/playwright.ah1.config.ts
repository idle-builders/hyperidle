/**
 * Playwright config for AH1 real-backend E2E proof.
 *
 * Separate from the main playwright.config.ts (Vite-only, mocked API).
 * This config boots TWO servers:
 *   1. AH1 test API server (Hono) on port 3099 — real credential routes.
 *   2. Vite dev server on port 5180 — proxies /api to port 3099.
 *
 * Tests in this config MUST NOT use page.route() mocks on credential/session
 * paths. The AH track HARD rule: credential routes reach the real backend.
 *
 * testMatch targets only ah1-*.spec.ts files so the rest of the e2e suite
 * is unaffected (it continues to run via the main playwright.config.ts).
 *
 * @lore AH1: Port layout:
 *   3099 — AH1 API test server (Hono, PGlite in a per-boot tmp dir, credential key set)
 *   5180 — AH1 Vite dev server (proxies /api → 3099, VITE_HYPERIDLE_API_KEY set)
 *   (3001/5179 are the main dev and test ports — left untouched)
 *
 * @lore AH1: The API server is started with __scripts__/ah1-test-server.ts which:
 *   - mkdtemp's a fresh PGlite data dir (AU32 D4 — removed on shutdown)
 *   - Applies Drizzle migrations against it
 *   - Boots createServer(3099, { db })
 * Passing deps.db to createServer bypasses file-path DB resolution and ensures
 * the server uses the migrated tmp-dir instance.
 *
 * @lore AH1: VITE_HYPERIDLE_API_KEY must match HYPERIDLE_API_KEY in the API
 * server env. apiFetch injects it as X-API-Key on every /api/* request; the
 * Hono auth middleware validates it. Mismatch → 401 on every API call.
 */
import { defineConfig, devices } from "@playwright/test";

const AH1_API_PORT = 3099;
const AH1_VITE_PORT = 5180;

// These must match the values in __scripts__/ah1-test-server.ts.
const AH1_API_KEY = "ah1-e2e-test-key";
const AH1_CREDENTIAL_KEY = "ah1-e2e-cred-key-32-chars!!!!!";

export default defineConfig({
	testDir: "./__e2e__",
	// Only run AH1 specs in this config.
	testMatch: "**/ah1-*.spec.ts",
	fullyParallel: false, // Serial: only 1 DB (tmp-dir PGlite), no state isolation between tests.
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	globalTimeout: 120_000,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [["html", { outputFolder: "playwright-report-ah1" }]],
	use: {
		baseURL: `http://localhost:${AH1_VITE_PORT}`,
		trace: "on",
		screenshot: "on",
	},
	projects: [
		{
			name: "ah1-real-backend",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			/**
			 * Boot the real Hono API server with a migrated PGlite DB in a per-boot tmp dir.
			 * readyPattern matches the stdout line from ah1-test-server.ts.
			 */
			command: `npx tsx __scripts__/ah1-test-server.ts`,
			url: `http://localhost:${AH1_API_PORT}/api/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: ".",
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				AH1_API_PORT: String(AH1_API_PORT),
				HYPERIDLE_API_KEY: AH1_API_KEY,
				HYPERIDLE_CREDENTIAL_KEY: AH1_CREDENTIAL_KEY,
				HYPERIDLE_PROFILE: "laptop",
			},
		},
		{
			/**
			 * Boot Vite with the AH1 config — proxies /api → port 3099.
			 * VITE_HYPERIDLE_API_KEY is injected so apiFetch sends the correct X-API-Key.
			 */
			command: `npm run dev -- --config vite.ah1.config.ts --port ${AH1_VITE_PORT} --strictPort`,
			url: `http://localhost:${AH1_VITE_PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: ".",
			env: {
				...process.env,
				VITE_API_PORT: String(AH1_API_PORT),
				VITE_HYPERIDLE_API_KEY: AH1_API_KEY,
			},
		},
	],
});
