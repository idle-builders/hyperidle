/**
 * X7: Tests for the report writer/reader.
 *
 * Verifies that writeReport serializes a valid EvalReport to disk
 * and readReport deserializes it correctly.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPORT_FILENAME, readReport, writeReport } from "../report.js";
import type { EvalReport } from "../types.js";

const MOCK_REPORT: EvalReport = {
	timestamp: "2026-06-04T12:00:00.000Z",
	mode: "mock",
	scenarios: [
		{
			scenarioId: "knowledge-task",
			scenarioName: "Knowledge Task",
			passed: true,
			durationMs: 234,
			costCents: 0,
			mode: "mock",
		},
		{
			scenarioId: "coordination-task",
			scenarioName: "Coordination Task",
			passed: false,
			durationMs: 189,
			costCents: 0,
			mode: "mock",
			failure: {
				message: "Expected 2 subtasks, got 0",
			},
		},
	],
	summary: {
		total: 2,
		passed: 1,
		failed: 1,
		totalDurationMs: 423,
		totalCostCents: 0,
	},
};

describe("writeReport / readReport", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-report-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes and reads back the full report", () => {
		writeReport(MOCK_REPORT, tmpDir);

		const reportPath = path.join(tmpDir, REPORT_FILENAME);
		expect(fs.existsSync(reportPath)).toBe(true);

		const parsed = readReport(tmpDir);
		expect(parsed).not.toBeNull();
		expect(parsed?.timestamp).toBe("2026-06-04T12:00:00.000Z");
		expect(parsed?.mode).toBe("mock");
		expect(parsed?.scenarios).toHaveLength(2);
		expect(parsed?.summary.total).toBe(2);
		expect(parsed?.summary.passed).toBe(1);
		expect(parsed?.summary.failed).toBe(1);
	});

	it("preserves failure details", () => {
		writeReport(MOCK_REPORT, tmpDir);
		const parsed = readReport(tmpDir);

		const failedScenario = parsed?.scenarios.find((s) => s.scenarioId === "coordination-task");
		expect(failedScenario?.passed).toBe(false);
		expect(failedScenario?.failure?.message).toBe("Expected 2 subtasks, got 0");
	});

	it("writes valid JSON", () => {
		writeReport(MOCK_REPORT, tmpDir);
		const reportPath = path.join(tmpDir, REPORT_FILENAME);
		const raw = fs.readFileSync(reportPath, "utf-8");

		expect(() => JSON.parse(raw)).not.toThrow();
		const parsed = JSON.parse(raw) as EvalReport;
		expect(parsed.timestamp).toBe(MOCK_REPORT.timestamp);
	});

	it("readReport returns null if file does not exist", () => {
		const result = readReport(tmpDir);
		expect(result).toBeNull();
	});
});
