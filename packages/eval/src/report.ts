import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport } from "./types.js";

export const REPORT_FILENAME = "eval-results.json";

/**
 * Write the eval report to eval-results.json in the current working directory.
 */
export function writeReport(report: EvalReport, outputDir?: string): void {
	const dir = outputDir ?? process.cwd();
	const reportPath = path.join(dir, REPORT_FILENAME);
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
	// biome-ignore lint/suspicious/noConsole: eval runner uses console for progress output
	console.log(`\nReport written to ${reportPath}`);
}

/**
 * Read and parse the eval report from disk.
 * Returns null if the file does not exist.
 */
export function readReport(outputDir?: string): EvalReport | null {
	const dir = outputDir ?? process.cwd();
	const reportPath = path.join(dir, REPORT_FILENAME);
	if (!fs.existsSync(reportPath)) {
		return null;
	}
	const raw = fs.readFileSync(reportPath, "utf-8");
	return JSON.parse(raw) as EvalReport;
}
