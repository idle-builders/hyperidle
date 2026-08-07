/**
 * Playwright config for AH5 live agent-path E2E proof.
 *
 * Boots TWO servers:
 *   1. AH5 test API server (Hono, PGlite, real OpenRouter credential) on port 3097.
 *   2. Vite dev server on port 5182 (proxies /api to 3097).
 *
 * CRITICAL: Tests in this config MUST NOT mock the credential, session,
 * assistant/LLM, or OpenRouter paths. See the no-mock guard in scripts/ah5-no-mock-guard.ts (retired in AU28).
 *
 * The AH5 lane requires OPENROUTER_API_KEY in env. The CI workflow injects it
 * from GitHub secrets. Local runs: `OPENROUTER_API_KEY=<key> npm run -w @hyperidle/core-ui test:e2e:ah5`.
 *
 * @lore AH5: Port layout:
 *   3097 — AH5 API test server
 *   5182 — AH5 Vite dev server
 *   (AH1: 3099/5180, dev: 3001/5179 — untouched)
 *
 * @lore AH5: The UI-trigger assertion (message→turn→streamed-response) is
 * test.fixme()-gated pending AH3 landing. The encrypted-credential seed
 * test (AC1) is the primary AH5 gate. The AH6 lane (playwright.ah6.config.ts)
 * delivers the full message→turn→cassette-replay E2E proof.
 *
 * @lore AH5: The lane only runs in the ah5-smoke.yml CI workflow (scheduled +
 * dispatch + labeled-PR). It is NOT part of npm run test:e2e (the default E2E
 * run that doesn't need a live key).
 */
import { defineConfig, devices } from "@playwright/test";

const AH5_API_PORT = 3097;
const AH5_VITE_PORT = 5182;

// These must match the values in __scripts__/ah5-test-server.ts.
const AH5_API_KEY = "ah5-e2e-test-key";
const AH5_CREDENTIAL_KEY = "ah5-e2e-cred-key-32-chars!!!!!";

export default defineConfig({
	testDir: "./__e2e__",
	testMatch: "**/ah5-*.spec.ts",
	fullyParallel: false, // Serial: 1 in-memory DB + 1 real LLM call
	forbidOnly: !!process.env.CI,
	retries: 0, // No retries — a lane failure is a real signal, not a flake
	workers: 1,
	globalTimeout: 300_000, // 5 min: real LLM calls can be slow
	timeout: 120_000,
	expect: { timeout: 30_000 },
	reporter: [["html", { outputFolder: "playwright-report-ah5" }]],
	use: {
		baseURL: `http://localhost:${AH5_VITE_PORT}`,
		trace: "on",
		screenshot: "on",
		// @lore AH5 Fix5: AC1 test hits /api/credentials/* which requires X-API-Key.
		// Set it for all requests so the credential check works without per-test headers.
		extraHTTPHeaders: {
			"X-API-Key": AH5_API_KEY,
		},
	},
	projects: [
		{
			name: "ah5-live-agent-path",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			/**
			 * Boot the real Hono API server with:
			 *   - In-memory PGlite DB (migrated)
			 *   - OpenRouter key seeded ENCRYPTED into server_credentials
			 *   - Assistant agent configured for the smoke model
			 *
			 * OPENROUTER_API_KEY must be in env (from CI secret or local shell).
			 */
			command: "npx tsx __scripts__/ah5-test-server.ts",
			url: `http://localhost:${AH5_API_PORT}/api/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			cwd: ".",
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				AH5_API_PORT: String(AH5_API_PORT),
				HYPERIDLE_API_KEY: AH5_API_KEY,
				HYPERIDLE_CREDENTIAL_KEY: AH5_CREDENTIAL_KEY,
				HYPERIDLE_PROFILE: "laptop",
				// OPENROUTER_API_KEY passed through from process.env (CI secret or local)
			},
		},
		{
			/**
			 * Boot Vite with the AH5 config — proxies /api → port 3097.
			 */
			command: `npm run dev -- --config vite.ah5.config.ts --port ${AH5_VITE_PORT} --strictPort`,
			url: `http://localhost:${AH5_VITE_PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: ".",
			env: {
				...process.env,
				VITE_API_PORT: String(AH5_API_PORT),
				VITE_HYPERIDLE_API_KEY: AH5_API_KEY,
			},
		},
	],
});
