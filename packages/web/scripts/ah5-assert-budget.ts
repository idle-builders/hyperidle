/**
 * AH5: Budget assertion script — reads ah5-cost.json and fails closed.
 *
 * Run as a CI step AFTER the lane (if: always()) so budget overflow fails CI
 * even if the test harness mis-handles the assertion.
 *
 * Fail-closed contract:
 *   - If ah5-cost.json is MISSING → exit 1 (a missing report is not "no cost").
 *   - If ah5-cost.json is unparseable → exit 1.
 *   - If totalCostCents > AH5_MAX_COST_CENTS → exit 1.
 *   - Otherwise → exit 0.
 *
 * @lore AH5: "Fail closed on absence" is the critical invariant. If the lane
 * crashes before writing the cost file (e.g. model selection returned empty
 * ranked[], or the test server failed to start), the budget step MUST still
 * redden CI. A missing file is NOT evidence of zero cost.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// @lore AH5 W2: Must match the path the probe writes and the CI upload path.
// probe: packages/web/scripts/ah5-real-turn-probe.ts → ../playwright-report-ah5/
// CI upload: packages/web/playwright-report-ah5/
// All three resolve to the same directory: packages/web/playwright-report-ah5/
const COST_FILE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../playwright-report-ah5/ah5-cost.json",
);

const MAX_COST_CENTS = Number(process.env.AH5_MAX_COST_CENTS ?? "5");

interface CostReport {
	readonly totalCostCents: number;
	readonly totalTokens?: number;
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
if (!fs.existsSync(COST_FILE)) {
	fail(
		`Cost report missing: ${COST_FILE}\n` +
			"  This means the AH5 lane crashed before writing the cost file.\n" +
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
	`[ah5-assert-budget] totalCostCents=${totalCostCents}, cap=${MAX_COST_CENTS}\n`,
);
if (report.model) {
	process.stdout.write(`[ah5-assert-budget] model=${report.model}\n`);
}
if (report.totalTokens !== undefined) {
	process.stdout.write(`[ah5-assert-budget] totalTokens=${report.totalTokens}\n`);
}

if (totalCostCents > MAX_COST_CENTS) {
	fail(
		`Budget exceeded: ${totalCostCents} cents > cap ${MAX_COST_CENTS} cents.\n` +
			"  Increase AH5_MAX_COST_CENTS or optimize the smoke prompt.",
	);
}

pass(`${totalCostCents} cents <= cap ${MAX_COST_CENTS} cents.`);
