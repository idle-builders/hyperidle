/**
 * AH6: Local smoke-lane orchestrator.
 *
 * Runs the full AH6 live-record lane LOCALLY in order:
 *   1. Assert OPENROUTER_API_KEY present (fail closed if absent).
 *   2. Run the no-mock static guard (ah6-no-mock-guard.ts).
 *   3. Run the selection unit tests as a fast pre-flight.
 *   4. Resolve the model (or honor AH6_MODEL_OVERRIDE).
 *   5. Record cassettes — run the AH6 Playwright lane with LLM_CASSETTE_MODE=record
 *      against the live test-server. Three real turns fire real OpenRouter calls;
 *      recordLlm writes packages/web/e2e/cassettes/default.json + ah6-cost.json
 *      (token-usage report — see AU21 lore below).
 *   6. Backup ah6-cost.json to /tmp before Playwright clears its report dir.
 *   7. Budget assert — fail-closed on cap.
 *   8. Emit a summary.
 *
 * Usage:
 *   npm run smoke:ah6
 *
 * The script loads .env automatically via `--env-file-if-exists=.env`.
 * If the key is not in .env, set it in your shell first:
 *   export OPENROUTER_API_KEY=<your-key> && npm run smoke:ah6
 *
 * Optional env vars:
 *   AH6_MODEL_OVERRIDE  — skip live selection; use this routedId directly
 *   AH6_MAX_TOKENS      — token cap (default 20000)
 *   RESOLVE_MODEL_FILE  — path for the selection JSON (default /tmp/ah6-model-selection.json)
 *
 * @lore AU21 (harness-telemetry narrowing): this lane used to also assert an
 * ESTIMATED $-cost cap (AH6_MAX_COST_CENTS, default 10 cents). Founder ruling
 * narrowed harness telemetry to token usage only — "very few harness can
 * actually report cost". The real-money safety guard (this lane hits a real
 * paid OpenRouter API) now gates on AH6_MAX_TOKENS instead, which already
 * existed as an established sibling threshold here — not a newly-invented one.
 * "ah6-cost.json" / AH6_COST_REPORT_PATH keep their historical names for
 * back-compat with the wiring below; the payload no longer carries a $ figure.
 *
 * @lore AH6: This lane is LOCAL ONLY — never a GitHub Actions workflow.
 * "CI" in AH6 means the project's local verification lane, not GitHub Actions.
 * Running this lane in a GitHub Actions workflow is the architecture error that
 * caused AH5 to be reverted (PR #301). The key comes from the developer's local
 * shell, never from a GitHub secret. The key-free gates (unit tests, gating
 * integration test, no-mock guard) run on every `npm run verify` without this
 * orchestrator. This orchestrator is the manually-invoked local proof for the
 * live end-to-end path — run it before shipping any AH-track workpackage.
 *
 * @lore AH6: AH6_MODEL_OVERRIDE seed-file shape (written when override is set):
 *   { "routedId": "<provider>/<model>:nitro", "ranked": ["<provider>/<model>:nitro"] }
 * The test-server only reads `routedId` from RESOLVE_MODEL_FILE, so the
 * full ranked list is not required when bypassing selection — but we write it for
 * schema-consistency so consumers don't choke on a one-key file.
 *
 * @lore AH6: The orchestrator's selection-test run (step 3) is a convenience
 * pre-flight that catches selection regressions before spending money on the
 * live record run. It is NOT the authoritative gate — the authoritative gate is
 * `npm run test` which already runs select-smoke-model.test.ts in packages/eval.
 *
 * @lore AH6: Usage report path — packages/web/playwright-report-ah6/ah6-cost.json.
 * The recorder writes it; the budget-assert reads it. The backup at /tmp/ah6-cost.json
 * survives Playwright clearing the report dir.
 *
 * @lore AH6: The record run rewrites packages/web/e2e/cassettes/default.json.
 * Review the git diff before committing — the cassette is the replay evidence.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVE_MODEL_FILE =
	process.env.RESOLVE_MODEL_FILE ?? "/tmp/ah6-model-selection.json";
const MAX_TOKENS = Number(process.env.AH6_MAX_TOKENS ?? "20000");

// ---------------------------------------------------------------------------
// Utility: run a shell command and fail on non-zero exit.
//
// @lore AH6 S-1: `safeCmd` is printed to stdout; `cmd` is the actual shell
// command. When env vars containing secrets (e.g. OPENROUTER_API_KEY) must be
// set for the child process, pass them via `opts.env` — NOT embedded in the
// command string. The `safeCmd` label must never contain secret values; it is
// only used for logging and may show masked placeholders.
// ---------------------------------------------------------------------------

function run(
	label: string,
	cmd: string,
	opts?: { cwd?: string; env?: NodeJS.ProcessEnv; safeCmd?: string },
): void {
	// Print safeCmd if provided, otherwise print cmd (which must not contain secrets).
	const displayed = opts?.safeCmd ?? cmd;
	process.stdout.write(`\n[smoke:ah6] >>> ${label}\n  $ ${displayed}\n`);
	const result = spawnSync(cmd, {
		shell: true,
		stdio: "inherit",
		cwd: opts?.cwd ?? repoRoot,
		env: { ...process.env, ...opts?.env },
	});
	if (result.status !== 0) {
		process.stderr.write(`[smoke:ah6] FAIL: ${label} exited with status ${String(result.status ?? 1)}\n`);
		process.exit(result.status ?? 1);
	}
}

// ---------------------------------------------------------------------------
// STEP 1: Assert OPENROUTER_API_KEY present — fail closed.
// ---------------------------------------------------------------------------

process.stdout.write("[smoke:ah6] AH6 local smoke lane starting.\n");
process.stdout.write("[smoke:ah6] This lane is LOCAL ONLY. Never runs in GitHub Actions.\n");
process.stdout.write(`[smoke:ah6] Budget cap: ${MAX_TOKENS} tokens\n`);

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey.trim() === "") {
	process.stderr.write(
		"[smoke:ah6] FATAL: OPENROUTER_API_KEY is not set in your shell.\n" +
			"  This lane requires a real OpenRouter API key — it is local-only and\n" +
			"  never runs in GitHub CI. Set the key in your shell:\n" +
			"    export OPENROUTER_API_KEY=<your-key>\n" +
			"  then re-run: npm run smoke:ah6\n",
	);
	process.exit(1);
}

process.stdout.write("[smoke:ah6] OPENROUTER_API_KEY is set.\n");

// ---------------------------------------------------------------------------
// STEP 2: No-mock static guard.
// ---------------------------------------------------------------------------

run(
	"No-mock static guard",
	"npx tsx scripts/ah6-no-mock-guard.ts",
);

// ---------------------------------------------------------------------------
// STEP 3: Selection unit tests as a fast pre-flight (money-saver, not the gate).
// ---------------------------------------------------------------------------

run(
	"Model-selection unit tests (pre-flight — not the authoritative gate; that is npm run test)",
	"npx vitest run --config vitest.config.ts packages/eval/src/smoke/__tests__/select-smoke-model.test.ts",
);

// ---------------------------------------------------------------------------
// STEP 4: Resolve the model — or honor AH6_MODEL_OVERRIDE.
// ---------------------------------------------------------------------------

const override = process.env.AH6_MODEL_OVERRIDE;
if (override && override.trim() !== "") {
	process.stdout.write(`[smoke:ah6] AH6_MODEL_OVERRIDE=${override} — skipping live selection.\n`);
	// Write a seed file matching the shape that the test-server reads.
	const overrideFile = {
		routedId: override.trim(),
		id: override.trim().replace(/:nitro$/, ""),
		ranked: [override.trim()],
		timestamp: new Date().toISOString(),
	};
	const outDir = path.dirname(RESOLVE_MODEL_FILE);
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	fs.writeFileSync(RESOLVE_MODEL_FILE, JSON.stringify(overrideFile, null, 2), "utf-8");
	process.stdout.write(`[smoke:ah6] Override written to ${RESOLVE_MODEL_FILE}\n`);
} else {
	run(
		"Resolve model (live OpenRouter selection)",
		`RESOLVE_MODEL_FILE=${RESOLVE_MODEL_FILE} npx tsx packages/web/scripts/ah5-resolve-model.ts`,
	);
}

// Read the resolved model id for the summary.
let resolvedModelId = override?.trim() ?? "unknown";
try {
	const parsed = JSON.parse(fs.readFileSync(RESOLVE_MODEL_FILE, "utf-8")) as { routedId?: string };
	if (parsed.routedId) resolvedModelId = parsed.routedId;
} catch {
	/* fallback to override or unknown */
}

// ---------------------------------------------------------------------------
// STEP 5: Record cassettes via the AH6 Playwright lane in record mode.
//
// LLM_CASSETTE_MODE=record causes callLlm → recordLlm which:
//   - Makes a real OpenRouter call per scenario turn.
//   - Writes packages/web/e2e/cassettes/default.json (all S1/S2/S3 entries).
//   - Accumulates token usage and writes ah6-cost.json (usage report; @lore
//     AU21 harness-telemetry narrowing — no $ figure anymore).
// ---------------------------------------------------------------------------

// S-1: OPENROUTER_API_KEY is passed via opts.env (never embedded in the command
// string that gets logged). safeCmd shows *** in place of the real key value.
run(
	"Record cassettes (real LLM calls — S1, S2, S3)",
	"npm run -w @hyperidle/web test:e2e:ah6",
	{
		env: {
			RESOLVE_MODEL_FILE,
			OPENROUTER_API_KEY: apiKey,
			LLM_CASSETTE_MODE: "record",
			AH6_MAX_TOKENS: String(MAX_TOKENS),
		},
		safeCmd: `RESOLVE_MODEL_FILE=${RESOLVE_MODEL_FILE} OPENROUTER_API_KEY=*** LLM_CASSETTE_MODE=record AH6_MAX_TOKENS=${MAX_TOKENS} npm run -w @hyperidle/web test:e2e:ah6`,
	},
);

// ---------------------------------------------------------------------------
// STEP 6: Verify usage report exists at /tmp/ah6-cost.json.
//
// @lore AH6 CRITICAL-4: The recorder writes ah6-cost.json directly to /tmp
// (via AH6_COST_REPORT_PATH=/tmp/ah6-cost.json in playwright.ah6.config.ts).
// Writing to /tmp survives Playwright's HTML reporter clearing playwright-report-ah6/.
// Previously the report was written to playwright-report-ah6/ and then deleted by
// the reporter's pre-write cleanup — causing the budget assert to always fail.
// ---------------------------------------------------------------------------

const usageReportPath = "/tmp/ah6-cost.json";
process.stdout.write(`[smoke:ah6] Usage report at: ${usageReportPath}\n`);

// ---------------------------------------------------------------------------
// STEP 7: Budget assert (fail-closed).
// ---------------------------------------------------------------------------

run(
	"Budget assert (fail-closed — redundant safety step)",
	`AH6_MAX_TOKENS=${MAX_TOKENS} npx tsx packages/web/scripts/ah6-assert-budget.ts`,
);

// ---------------------------------------------------------------------------
// STEP 8: Summary.
// ---------------------------------------------------------------------------

let totalTokens: number | undefined;
try {
	const report = JSON.parse(fs.readFileSync(usageReportPath, "utf-8")) as {
		totalTokens?: number;
	};
	totalTokens = report.totalTokens;
} catch {
	/* usage report may be absent if an early step failed */
}

const reportDir = path.join(repoRoot, "packages/web/playwright-report-ah6");
process.stdout.write("\n[smoke:ah6] ==================== SUMMARY ====================\n");
process.stdout.write(`[smoke:ah6] Model:         ${resolvedModelId}\n`);
process.stdout.write(
	`[smoke:ah6] Tokens:        ${totalTokens !== undefined ? `${totalTokens} tokens` : "unknown (check usage report)"}\n`,
);
process.stdout.write(`[smoke:ah6] Budget cap:    ${MAX_TOKENS} tokens\n`);
process.stdout.write(`[smoke:ah6] Report dir:    ${reportDir}\n`);
process.stdout.write(`[smoke:ah6] Usage report:  ${usageReportPath}\n`);
process.stdout.write("[smoke:ah6] PASS: AH6 local smoke lane completed successfully.\n");
process.stdout.write("[smoke:ah6] =====================================================\n");
