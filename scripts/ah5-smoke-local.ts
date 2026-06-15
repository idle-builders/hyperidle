/**
 * AH5: Local smoke-lane orchestrator.
 *
 * Runs the full AH5 live-LLM lane LOCALLY in order:
 *   1. Assert OPENROUTER_API_KEY present (fail closed if absent).
 *   2. Run the no-mock static guard.
 *   3. Run the selection unit tests as a fast pre-flight.
 *   4. Resolve the model (or honor AH5_MODEL_OVERRIDE).
 *   5. Run the real-turn probe (provisionSession → real LLM call).
 *   6. Run the Playwright UI lane (test:e2e:ah5).
 *   7. Run the budget-assert script as a redundant fail-closed step.
 *   8. Emit a summary.
 *
 * Usage:
 *   npm run smoke:ah5
 *
 * The script loads .env automatically via `--env-file-if-exists=.env` (Fix4).
 * If the key is not in .env, set it in your shell first:
 *   export OPENROUTER_API_KEY=<your-key> && npm run smoke:ah5
 *
 * Optional env vars:
 *   AH5_MODEL_OVERRIDE  — skip live selection; use this routedId directly
 *   AH5_MAX_COST_CENTS  — budget cap in cents (default 5)
 *   AH5_MAX_TOKENS      — token cap (default 20000)
 *   RESOLVE_MODEL_FILE  — path for the selection JSON (default /tmp/ah5-model-selection.json)
 *
 * @lore AH5: This lane is LOCAL ONLY — never a GitHub Actions workflow.
 * "CI" in AH5 AC4 means the project's local verification lane, not GitHub Actions.
 * Running this lane in a GitHub Actions workflow is the architecture error that
 * caused AH5 to be reverted (PR #301). The key comes from the developer's local
 * shell, never from a GitHub secret. The key-free gates (unit tests, gating
 * integration test, no-mock guard) run on every `npm run verify` without this
 * orchestrator. This orchestrator is the manually-invoked local proof for the
 * live end-to-end path — run it before shipping any AH-track workpackage.
 *
 * @lore AH5: AH5_MODEL_OVERRIDE seed-file shape (written when override is set):
 *   { "routedId": "<provider>/<model>:nitro", "ranked": ["<provider>/<model>:nitro"] }
 * The probe and test-server only read `routedId` from RESOLVE_MODEL_FILE, so the
 * full ranked list is not required when bypassing selection — but we write it for
 * schema-consistency so consumers don't choke on a one-key file.
 *
 * @lore AH5: The orchestrator's selection-test run (step 3) is a convenience
 * pre-flight that catches selection regressions before spending money on the
 * live probe. It is NOT the authoritative gate — the authoritative gate is
 * `npm run test` which already runs select-smoke-model.test.ts in packages/eval.
 * Never remove select-smoke-model.test.ts from packages/eval thinking the
 * orchestrator's pre-flight covers it.
 *
 * @lore AH5: Cost report path — packages/web/playwright-report-ah5/ah5-cost.json.
 * The probe writes it, the budget-assert reads it. All three scripts (probe,
 * budget-assert, this orchestrator) resolve to the same directory.
 */

import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVE_MODEL_FILE =
	process.env.RESOLVE_MODEL_FILE ?? "/tmp/ah5-model-selection.json";
const MAX_COST_CENTS = Number(process.env.AH5_MAX_COST_CENTS ?? "5");
const MAX_TOKENS = Number(process.env.AH5_MAX_TOKENS ?? "20000");

// ---------------------------------------------------------------------------
// Utility: run a shell command and fail on non-zero exit.
// ---------------------------------------------------------------------------

function run(label: string, cmd: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): void {
	process.stdout.write(`\n[smoke:ah5] >>> ${label}\n  $ ${cmd}\n`);
	const result = spawnSync(cmd, {
		shell: true,
		stdio: "inherit",
		cwd: opts?.cwd ?? repoRoot,
		env: { ...process.env, ...opts?.env },
	});
	if (result.status !== 0) {
		process.stderr.write(`[smoke:ah5] FAIL: ${label} exited with status ${String(result.status ?? 1)}\n`);
		process.exit(result.status ?? 1);
	}
}

// ---------------------------------------------------------------------------
// STEP 1: Assert OPENROUTER_API_KEY present — fail closed.
// ---------------------------------------------------------------------------

process.stdout.write("[smoke:ah5] AH5 local smoke lane starting.\n");
process.stdout.write("[smoke:ah5] This lane is LOCAL ONLY. Never runs in GitHub Actions.\n");
process.stdout.write(`[smoke:ah5] Budget cap: ${MAX_COST_CENTS} cents / ${MAX_TOKENS} tokens\n`);

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey.trim() === "") {
	process.stderr.write(
		"[smoke:ah5] FATAL: OPENROUTER_API_KEY is not set in your shell.\n" +
			"  This lane requires a real OpenRouter API key — it is local-only and\n" +
			"  never runs in GitHub CI. Set the key in your shell:\n" +
			"    export OPENROUTER_API_KEY=<your-key>\n" +
			"  then re-run: npm run smoke:ah5\n",
	);
	process.exit(1);
}

process.stdout.write("[smoke:ah5] OPENROUTER_API_KEY is set.\n");

// ---------------------------------------------------------------------------
// STEP 2: No-mock static guard.
// ---------------------------------------------------------------------------

run(
	"No-mock static guard",
	"npx tsx scripts/ah5-no-mock-guard.ts",
);

// ---------------------------------------------------------------------------
// STEP 3: Selection unit tests as a fast pre-flight (money-saver, not the gate).
// ---------------------------------------------------------------------------

run(
	"Model-selection unit tests (pre-flight — not the authoritative gate; that is npm run test)",
	"npx vitest run --config vitest.config.ts packages/eval/src/smoke/__tests__/select-smoke-model.test.ts",
);

// ---------------------------------------------------------------------------
// STEP 4: Resolve the model — or honor AH5_MODEL_OVERRIDE.
// ---------------------------------------------------------------------------

const override = process.env.AH5_MODEL_OVERRIDE;
if (override && override.trim() !== "") {
	process.stdout.write(`[smoke:ah5] AH5_MODEL_OVERRIDE=${override} — skipping live selection.\n`);
	// Write a seed file matching the shape that probe/test-server read.
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
	process.stdout.write(`[smoke:ah5] Override written to ${RESOLVE_MODEL_FILE}\n`);
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
// STEP 5: Real-turn probe (provisionSession → real LLM call → tool-call assert).
// ---------------------------------------------------------------------------

run(
	"Real-turn probe (provisionSession + write_session_notes assertion)",
	`RESOLVE_MODEL_FILE=${RESOLVE_MODEL_FILE} AH5_MAX_COST_CENTS=${MAX_COST_CENTS} npx tsx packages/web/scripts/ah5-real-turn-probe.ts`,
);

// ---------------------------------------------------------------------------
// STEP 6: Playwright UI lane.
// ---------------------------------------------------------------------------

run(
	"Playwright UI lane (test:e2e:ah5)",
	`RESOLVE_MODEL_FILE=${RESOLVE_MODEL_FILE} OPENROUTER_API_KEY=${apiKey} npm run -w @hyperidle/web test:e2e:ah5`,
);

// ---------------------------------------------------------------------------
// STEP 7: Budget assert (redundant fail-closed step — runs even if step 5/6 failed
// via the always-run contract; here it is a post-lane redundancy check).
// ---------------------------------------------------------------------------

run(
	"Budget assert (redundant fail-closed step)",
	`AH5_MAX_COST_CENTS=${MAX_COST_CENTS} npx tsx packages/web/scripts/ah5-assert-budget.ts`,
);

// ---------------------------------------------------------------------------
// STEP 8: Summary.
// ---------------------------------------------------------------------------

const costReportPath = path.join(repoRoot, "packages/web/playwright-report-ah5/ah5-cost.json");
let totalCostCents: number | undefined;
try {
	const report = JSON.parse(fs.readFileSync(costReportPath, "utf-8")) as {
		totalCostCents?: number;
	};
	totalCostCents = report.totalCostCents;
} catch {
	/* cost file may be absent if an early step failed */
}

const reportDir = path.join(repoRoot, "packages/web/playwright-report-ah5");
process.stdout.write("\n[smoke:ah5] ==================== SUMMARY ====================\n");
process.stdout.write(`[smoke:ah5] Model:         ${resolvedModelId}\n`);
process.stdout.write(
	`[smoke:ah5] Cost:          ${totalCostCents !== undefined ? `${totalCostCents} cents` : "unknown (check cost report)"}\n`,
);
process.stdout.write(`[smoke:ah5] Budget cap:    ${MAX_COST_CENTS} cents\n`);
process.stdout.write(`[smoke:ah5] Report dir:    ${reportDir}\n`);
process.stdout.write(`[smoke:ah5] Cost report:   ${costReportPath}\n`);
process.stdout.write("[smoke:ah5] PASS: AH5 local smoke lane completed successfully.\n");
process.stdout.write("[smoke:ah5] =====================================================\n");
