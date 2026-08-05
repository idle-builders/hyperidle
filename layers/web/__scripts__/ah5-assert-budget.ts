/**
 * AH5: Budget assertion script — reads ah5-cost.json and fails closed.
 *
 * Run as a local lane step AFTER the probe (step 7 of `npm run smoke:ah5`) so
 * budget overflow fails the lane even if the probe mis-handles the assertion.
 *
 * Fail-closed contract:
 *   - If ah5-cost.json is MISSING → exit 1 (a missing report is not "no usage").
 *   - If ah5-cost.json is unparseable → exit 1.
 *   - If totalTokens > AH5_MAX_TOKENS → exit 1.
 *   - Otherwise → exit 0.
 *
 * @lore AH5: "Fail closed on absence" is the critical invariant. If the lane
 * crashes before writing the report file (e.g. model selection returned empty
 * ranked[], or the test server failed to start), the budget step MUST still
 * fail the local lane. A missing file is NOT evidence of zero usage.
 *
 * @lore AU21 (harness-telemetry narrowing): This used to gate on an ESTIMATED
 * $-cost (totalCostCents). Founder ruling: "very few harness can actually
 * report cost" — keep only token usage. The gate now checks totalTokens
 * against AH5_MAX_TOKENS, mirroring AH6's fix (same established default —
 * not a newly-invented threshold; AH5 and AH6 are declared sibling lanes).
 *
 * @lore AU21: this script has no current invoker (`npm run smoke:ah5` was
 * retired when AH5 was reworked to the local-only lane superseded by AH6 —
 * see .pipeline/progress/AH5.json) and no writer currently produces
 * ah5-cost.json. Left in place (orphaned, not deleted) — out of scope for
 * this change to restore the AH5 orchestrator.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// @lore AH5 W2: Must match the path the recorder writes and the local lane report dir.
// recorder writes → ../playwright-report-ah5/ah5-cost.json
// local lane report: layers/web/playwright-report-ah5/
// Both resolve to the same directory: layers/web/playwright-report-ah5/
//
// @lore AH5 Fix: Playwright's HTML reporter clears playwright-report-ah5/ before
// writing, which deletes ah5-cost.json. The orchestrator backs it up to /tmp/ah5-cost.json
// before launching Playwright. This script checks the primary path first, then the backup.
const USAGE_FILE_PRIMARY = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../playwright-report-ah5/ah5-cost.json",
);
const USAGE_FILE_BACKUP = "/tmp/ah5-cost.json";
const USAGE_FILE = fs.existsSync(USAGE_FILE_PRIMARY) ? USAGE_FILE_PRIMARY : USAGE_FILE_BACKUP;

const MAX_TOKENS = Number(process.env.AH5_MAX_TOKENS ?? "20000");

interface UsageReport {
	readonly totalTokens: number;
	readonly model?: string;
	readonly timestamp?: string;
}

function fail(reason: string): never {
	process.stderr.write(`[ah5-assert-budget] FAIL: ${reason}\n`);
	process.exit(1);
}

function pass(msg: string): void {
	process.stdout.write(`[ah5-assert-budget] PASS: ${msg}\n`);
	process.exit(0);
}

// 1. Check file exists
if (!fs.existsSync(USAGE_FILE)) {
	fail(
		`Usage report missing: ${USAGE_FILE}\n` +
			"  This means the AH5 lane crashed before writing the report file.\n" +
			"  Fail-closed: a missing report is NOT evidence of zero usage.",
	);
}

// 2. Parse
let report: UsageReport;
try {
	const raw = fs.readFileSync(USAGE_FILE, "utf-8");
	report = JSON.parse(raw) as UsageReport;
} catch (err) {
	fail(`Usage report unparseable: ${USAGE_FILE}\n  ${String(err)}`);
}

// 3. Validate shape
if (typeof report.totalTokens !== "number") {
	fail(`Usage report missing 'totalTokens' number field: ${JSON.stringify(report)}`);
}

// 4. Budget check
const { totalTokens } = report;
process.stdout.write(`[ah5-assert-budget] totalTokens=${totalTokens}, cap=${MAX_TOKENS}\n`);
if (report.model) {
	process.stdout.write(`[ah5-assert-budget] model=${report.model}\n`);
}

if (totalTokens > MAX_TOKENS) {
	fail(
		`Budget exceeded: ${totalTokens} tokens > cap ${MAX_TOKENS} tokens.\n` +
			"  Increase AH5_MAX_TOKENS or optimize the smoke prompt.",
	);
}

pass(`${totalTokens} tokens <= cap ${MAX_TOKENS} tokens.`);
