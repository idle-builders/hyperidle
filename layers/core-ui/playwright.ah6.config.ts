/**
 * Playwright config for AH6 cassette-replay E2E proof.
 *
 * Boots TWO servers:
 *   1. AH6 test API server (Hono, PGlite, NO real LLM key) on port 3098.
 *   2. Vite dev server on port 5183 (proxies /api to 3098).
 *
 * CRITICAL: LLM calls are intercepted by the cassette replay layer
 * (LLM_CASSETTE_MODE=replay). All three scenarios (S1, S2, S3) replay committed
 * cassettes from layers/core-ui/__e2e__/cassettes/{S1,S2,S3}.json. No API key required.
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
 * a relative path fails if the server's cwd differs from layers/core-ui.
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

// These must match the values in __scripts__/ah6-test-server.ts.
const AH6_API_KEY = "ah6-e2e-test-key";

// Absolute path to the cassettes directory — WARNING-3 compliance.
const CASSETTES_DIR = path.resolve(Dirname, "__e2e__/cassettes");

// Usage report written by recordLlm in record mode.
// @lore AU21 (harness-telemetry narrowing): this used to be a $-cost report;
// the payload is now token usage only ("very few harness can actually report
// cost"). Path/env var name kept as "cost" for back-compat with the wiring
// below and the smoke orchestrator.
// @lore AH6 CRITICAL-2: This path is passed to the test-server as AH6_COST_REPORT_PATH
// so recordLlm knows where to write the report on flush.
// @lore AH6 CRITICAL-4: Must be OUTSIDE playwright-report-ah6/ because Playwright's
// HTML reporter clears that directory AFTER the server process exits. If the report
// is written to playwright-report-ah6/ by the exit handler, Playwright's reporter then
// clears and overwrites that directory, deleting the report before the smoke script's
// backup step runs. Writing to /tmp/ah6-cost.json survives reporter cleanup.
const COST_REPORT_PATH = "/tmp/ah6-cost.json";

export default defineConfig({
	testDir: "./__e2e__",
	testMatch: "**/AH6-*.spec.ts",
	fullyParallel: false, // Serial: 1 DB (tmp-dir PGlite), deterministic cassette replay
	forbidOnly: !!process.env.CI,
	retries: 0, // No retries — a lane failure is a real signal, not a flake
	workers: 1,
	// In record mode (real LLM calls), S2 alone can take 45s across multiple API turns.
	// Use 300s in record mode to give all 4 scenarios room to complete.
	globalTimeout: process.env.LLM_CASSETTE_MODE === "record" ? 300_000 : 120_000,
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
			 * Boot the AH6 API server.
			 *
			 * In replay mode: LLM_CASSETTE_MODE=replay intercepts callLlm and returns
			 * responses from the committed cassette files. No API key required.
			 * In record mode: LLM_CASSETTE_MODE=record makes real OpenRouter calls.
			 *
			 * @lore AH6 CRITICAL-1: reuseExistingServer is DISABLED in record mode.
			 * If a previous replay-mode server is running on port 3098, reusing it would
			 * silently replay committed cassettes instead of making real OpenRouter calls.
			 * Record mode MUST always start a fresh server with the correct env.
			 */
			command: "npx tsx __scripts__/ah6-test-server.ts",
			url: `http://localhost:${AH6_API_PORT}/api/health`,
			reuseExistingServer: process.env.LLM_CASSETTE_MODE === "record" ? false : !process.env.CI,
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
				// CRITICAL-1: Pass LLM_CASSETTE_MODE from the parent env (not hardcoded
				// to "replay") so `npm run smoke:ah6` (which sets LLM_CASSETTE_MODE=record)
				// boots the test-server in record mode. Defaults to "replay" when unset
				// (everyday key-free lane). Hardcoding "replay" here prevented the live
				// record run from ever making a real call.
				// @lore AH6 CRITICAL-1: process.env.LLM_CASSETTE_MODE is set by the
				// smoke orchestrator before spawning Playwright. Without this fix, even
				// `LLM_CASSETTE_MODE=record npm run test:e2e:ah6` boots the server in
				// replay mode, silently ignoring the parent env override.
				LLM_CASSETTE_MODE: process.env.LLM_CASSETTE_MODE ?? "replay",
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
				// CRITICAL-2: Cost report path — recordLlm writes here on flush (record mode).
				// ah6-assert-budget.ts reads this path. Harmless in replay mode (never written).
				AH6_COST_REPORT_PATH: COST_REPORT_PATH,
				// CRITICAL-3: Pass RESOLVE_MODEL_FILE so ah6-test-server.ts can seed the
				// assistant agent with the dynamically-resolved OpenRouter model id.
				// In replay mode this env may be absent (ah6-test-server falls back to a
				// default model). In record mode smoke orchestrator sets this before launch.
				RESOLVE_MODEL_FILE: process.env.RESOLVE_MODEL_FILE ?? "",
				// Pass OPENROUTER_API_KEY for record mode (smoke orchestrator sets it).
				// In replay mode this is absent; ah6-test-server.ts tolerates absence.
				OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
			},
		},
		{
			/**
			 * Boot Vite with the AH6 config — proxies /api → port 3098.
			 *
			 * @lore AH6 CRITICAL-1: Also force a fresh Vite in record mode so there is no
			 * risk of stale config from a previous replay run.
			 */
			command: `npm run dev -- --config vite.ah6.config.ts --port ${AH6_VITE_PORT} --strictPort`,
			url: `http://localhost:${AH6_VITE_PORT}`,
			reuseExistingServer: process.env.LLM_CASSETTE_MODE === "record" ? false : !process.env.CI,
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
