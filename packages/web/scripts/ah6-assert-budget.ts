/**
 * AH6: Budget assertion script — reads ah6-cost.json and fails closed.
 *
 * Run as a local lane step AFTER the record run (step 7 of `npm run smoke:ah6`)
 * so budget overflow fails the lane even if the recorder mis-handles the assertion.
 *
 * Fail-closed contract:
 *   - If ah6-cost.json is MISSING → exit 1 (a missing report is not "no cost").
 *   - If ah6-cost.json is unparseable → exit 1.
 *   - If totalCostCents > AH6_MAX_COST_CENTS → exit 1.
 *   - Otherwise → exit 0.
 *
 * @lore AH6: "Fail closed on absence" is the critical invariant. If the record
 * lane crashes before writing the cost file, the budget step MUST still fail.
 * A missing file is NOT evidence of zero cost.
 *
 * @lore AH6: This script is an AH6 wrapper of the AH5 budget-assert pattern.
 * The cost file path points to playwright-report-ah6/ instead of playwright-report-ah5/.
 * The env cap var is AH6_MAX_COST_CENTS (default 10 cents — 3 real turns).
 */

import * as fs from "node:fs";

// @lore AH6 CRITICAL-4: The recorder writes ah6-cost.json directly to /tmp
// (AH6_COST_REPORT_PATH=/tmp/ah6-cost.json in playwright.ah6.config.ts).
// Writing to /tmp bypasses Playwright's HTML reporter cleanup of playwright-report-ah6/.
// Previously the cost file was written to playwright-report-ah6/, which Playwright
// cleared during its post-run HTML report write — the cost file was deleted before
// the smoke orchestrator's backup step ran.
const COST_FILE = "/tmp/ah6-cost.json";

const MAX_COST_CENTS = Number(process.env.AH6_MAX_COST_CENTS ?? "10");

interface CostReport {
	readonly totalCostCents: number;
	readonly totalTokens?: number;
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
if (!fs.existsSync(COST_FILE)) {
	fail(
		`Cost report missing: ${COST_FILE}\n` +
			"  This means the AH6 record lane crashed before writing the cost file.\n" +
			"  Fail-closed: a missing report is NOT evidence of zero cost.",
	);
}

// 2. Parse
let report: CostReport;
try {
	const raw = fs.readFileSync(COST_FILE, "utf-8");
	report = JSON.parse(raw) as CostReport;
} catch (err) {
	fail(`Cost report unparseable: ${COST_FILE}\n  ${String(err)}`);
}

// 3. Validate shape
if (typeof report.totalCostCents !== "number") {
	fail(`Cost report missing 'totalCostCents' number field: ${JSON.stringify(report)}`);
}

// 4. Budget check
const { totalCostCents } = report;
process.stdout.write(
	`[ah6-assert-budget] totalCostCents=${totalCostCents}, cap=${MAX_COST_CENTS}\n`,
);
if (report.model) {
	process.stdout.write(`[ah6-assert-budget] model=${report.model}\n`);
}
if (report.totalTokens !== undefined) {
	process.stdout.write(`[ah6-assert-budget] totalTokens=${report.totalTokens}\n`);
}

if (totalCostCents > MAX_COST_CENTS) {
	fail(
		`Budget exceeded: ${totalCostCents} cents > cap ${MAX_COST_CENTS} cents.\n` +
			"  Increase AH6_MAX_COST_CENTS or optimize the smoke prompt.",
	);
}

pass(`${totalCostCents} cents <= cap ${MAX_COST_CENTS} cents.`);
