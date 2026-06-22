/**
 * Playwright config for AH6 cassette-replay E2E proof.
 *
 * Boots TWO servers:
 *   1. AH6 test API server (Hono, PGlite, NO real LLM key) on port 3098.
 *   2. Vite dev server on port 5183 (proxies /api to 3098).
 *
 * CRITICAL: LLM calls are intercepted by the cassette replay layer
 * (LLM_CASSETTE_MODE=replay). All three scenarios (S1, S2, S3) replay committed
 * cassettes from packages/web/e2e/cassettes/{S1,S2,S3}.json. No API key required.
 *
 * @lore AH6: Port layout:
 *   3098 — AH6 API test server (cassette replay, no real key)
 *   5183 — AH6 Vite dev server
 *   (AH5: 3097/5182, AH1: 3099/5180, dev: 3001/5179 — untouched)
 *
 * @lore AH6 WARNING-1: LLM_REPLAY_DELAY_MS=80 is set in webServer.env so the
 * ThinkingRow is paintable during S3 scenario (the 80ms delay keeps the thinking
 * state observable before the reply lands). Without this delay, the thinking row
 * flips invisible in one event-loop tick before Playwright can see it.
 *
 * @lore AH6 WARNING-3: LLM_CASSETTE_DIR points to the ABSOLUTE path of the
 * cassettes directory. The server's loadCassetteEntries() reads this env var;
 * a relative path fails if the server's cwd differs from packages/web.
 *
 * @lore AH6: The lane runs via `npm run test:e2e:ah6` (see package.json).
 * It does NOT require OPENROUTER_API_KEY or ANTHROPIC_API_KEY in the environment.
 * The fake ANTHROPIC_API_KEY is set by ah6-test-server.ts itself for the
 * env-based fallback path in runAssistantTurn.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const Dirname = path.dirname(fileURLToPath(import.meta.url));

const AH6_API_PORT = 3098;
const AH6_VITE_PORT = 5183;

// These must match the values in scripts/ah6-test-server.ts.
const AH6_API_KEY = "ah6-e2e-test-key";

// Absolute path to the cassettes directory — WARNING-3 compliance.
const CASSETTES_DIR = path.resolve(Dirname, "e2e/cassettes");

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/AH6-*.spec.ts",
	fullyParallel: false, // Serial: 1 in-memory DB, deterministic cassette replay
	forbidOnly: !!process.env.CI,
	retries: 0, // No retries — a lane failure is a real signal, not a flake
	workers: 1,
	globalTimeout: 120_000, // 2 min: replay is fast, no real LLM calls
	timeout: 60_000,
	expect: { timeout: 30_000 },
	reporter: [["html", { outputFolder: "playwright-report-ah6" }]],
	use: {
		baseURL: `http://localhost:${AH6_VITE_PORT}`,
		trace: "on",
		screenshot: "on",
		extraHTTPHeaders: {
			"X-API-Key": AH6_API_KEY,
		},
	},
	projects: [
		{
			name: "ah6-replay-lane",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			/**
			 * Boot the AH6 API server in cassette replay mode.
			 *
			 * LLM_CASSETTE_MODE=replay intercepts callLlm and returns responses
			 * from the committed cassette files. No API key required.
			 */
			command: "npx tsx scripts/ah6-test-server.ts",
			url: `http://localhost:${AH6_API_PORT}/api/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: ".",
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				AH6_API_PORT: String(AH6_API_PORT),
				HYPERIDLE_API_KEY: AH6_API_KEY,
				HYPERIDLE_CREDENTIAL_KEY: "ah6-e2e-cred-key-32-chars!!!!!",
				HYPERIDLE_PROFILE: "laptop",
				// Cassette replay mode — no real LLM API key needed
				LLM_CASSETTE_MODE: "replay",
				LLM_CASSETTE_DIR: CASSETTES_DIR,
				// LLM_CASSETTE_SCENARIO defaults to "default" (loads default.json which
				// contains entries for all three scenarios: S1, S2, S3).
				// The shared server serves all test describe blocks — one cassette file.
				// WARNING-1: 80ms delay keeps ThinkingRow paintable during S3
				LLM_REPLAY_DELAY_MS: "80",
				// Fake Anthropic key: never reaches the network because LLM_CASSETTE_MODE=replay
				// intercepts at callLlm. Required so runAssistantTurn's env-based else-branch
				// can build a resolvedModel without throwing MissingCredentialError.
				// @lore AH6: ah6-test-server.ts also sets this if absent; explicit here for clarity.
				ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "ah6-e2e-fake-anthropic-key",
			},
		},
		{
			/**
			 * Boot Vite with the AH6 config — proxies /api → port 3098.
			 */
			command: `npm run dev -- --config vite.ah6.config.ts --port ${AH6_VITE_PORT} --strictPort`,
			url: `http://localhost:${AH6_VITE_PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: ".",
			env: {
				...process.env,
				VITE_API_PORT: String(AH6_API_PORT),
				VITE_HYPERIDLE_API_KEY: AH6_API_KEY,
			},
		},
	],
});
