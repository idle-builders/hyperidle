/**
 * AH6: Budget assertion script — reads ah6-cost.json and fails closed.
 *
 * Run as a local lane step AFTER the record run (step 7 of `npm run smoke:ah6`)
 * so budget overflow fails the lane even if the recorder mis-handles the assertion.
 *
 * Fail-closed contract:
 *   - If ah6-cost.json is MISSING → exit 1 (a missing report is not "no usage").
 *   - If ah6-cost.json is unparseable → exit 1.
 *   - If totalTokens > AH6_MAX_TOKENS → exit 1.
 *   - Otherwise → exit 0.
 *
 * @lore AH6: "Fail closed on absence" is the critical invariant. If the record
 * lane crashes before writing the report file, the budget step MUST still fail.
 * A missing file is NOT evidence of zero usage.
 *
 * @lore AH6: This script is an AH6 wrapper of the AH5 budget-assert pattern.
 * The report file path points to playwright-report-ah6/ instead of playwright-report-ah5/.
 * The env cap var is AH6_MAX_TOKENS.
 *
 * @lore AU21 (harness-telemetry narrowing): This used to gate on an ESTIMATED
 * $-cost (totalCostCents via a hardcoded per-model rate table). Founder ruling:
 * "very few harness can actually report cost" — keep only token usage. The gate
 * now checks totalTokens against AH6_MAX_TOKENS (an already-established sibling
 * threshold surfaced in scripts/ah6-smoke-local.ts, not a newly-invented one).
 * The file is still named "ah6-cost.json" / AH6_COST_REPORT_PATH for back-compat
 * with the smoke orchestrator and playwright.ah6.config.ts wiring — the payload
 * no longer carries a $ figure.
 */

import * as fs from "node:fs";

// @lore AH6 CRITICAL-4: The recorder writes ah6-cost.json directly to /tmp
// (AH6_COST_REPORT_PATH=/tmp/ah6-cost.json in playwright.ah6.config.ts).
// Writing to /tmp bypasses Playwright's HTML reporter cleanup of playwright-report-ah6/.
// Previously the report was written to playwright-report-ah6/, which Playwright
// cleared during its post-run HTML report write — the file was deleted before
// the smoke orchestrator's backup step ran.
const USAGE_FILE = "/tmp/ah6-cost.json";

const MAX_TOKENS = Number(process.env.AH6_MAX_TOKENS ?? "20000");

interface UsageReport {
	readonly totalTokens: number;
	readonly model?: string;
	readonly timestamp?: string;
}

function fail(reason: string): never {
	process.stderr.write(`[ah6-assert-budget] FAIL: ${reason}\n`);
	process.exit(1);
}

function pass(msg: string): void {
	process.stdout.write(`[ah6-assert-budget] PASS: ${msg}\n`);
	process.exit(0);
}

// 1. Check file exists
if (!fs.existsSync(USAGE_FILE)) {
	fail(
		`Usage report missing: ${USAGE_FILE}\n` +
			"  This means the AH6 record lane crashed before writing the report file.\n" +
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
process.stdout.write(`[ah6-assert-budget] totalTokens=${totalTokens}, cap=${MAX_TOKENS}\n`);
if (report.model) {
	process.stdout.write(`[ah6-assert-budget] model=${report.model}\n`);
}

if (totalTokens > MAX_TOKENS) {
	fail(
		`Budget exceeded: ${totalTokens} tokens > cap ${MAX_TOKENS} tokens.\n` +
			"  Increase AH6_MAX_TOKENS or optimize the smoke prompt.",
	);
}

pass(`${totalTokens} tokens <= cap ${MAX_TOKENS} tokens.`);
