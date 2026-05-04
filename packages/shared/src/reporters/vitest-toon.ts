import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Reporter, TestCase, TestModule } from "vitest/node";
import { encode } from "../toon-codec.js";

// @lore TE-2/TE-4 (block 1a plumbing): vitest's default/dot reporters either
// drown the agent in noise or hide failure detail. This reporter writes a
// compact TOON file (test-output.toon) that downstream tools (verify
// orchestrator, agent prompts) can read instead of stdout walls. On red the
// raw error message + stack tail is preserved so debugging context survives
// the compression. On green only a count is emitted.

const OUTPUT_FILE_ENV = "VITEST_TOON_OUTPUT";
const DEFAULT_OUTPUT_FILE = "test-output.toon";
const RAW_TAIL_ENV = "VITEST_TOON_RAW_TAIL";
const DEFAULT_RAW_TAIL_LINES = 200;

interface ToonFailure {
	file: string;
	test: string;
	assertion: string;
	line: number | null;
	codeAround: string;
	rawTail: string;
}

interface ToonSummary {
	tool: "vitest";
	status: "passed" | "failed";
	passed: number;
	failed: number;
	skipped: number;
	durationMs: number;
	failures: ToonFailure[];
}

export default class VitestToonReporter implements Reporter {
	private startedAt = 0;

	onTestRunStart(): void {
		this.startedAt = Date.now();
	}

	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		const summary = this.buildSummary(testModules);
		this.writeSummary(summary);
		this.printSummary(summary);
	}

	private buildSummary(testModules: ReadonlyArray<TestModule>): ToonSummary {
		let passed = 0;
		let failed = 0;
		let skipped = 0;
		const failures: ToonFailure[] = [];

		for (const mod of testModules) {
			for (const test of mod.children.allTests()) {
				const result = test.result();
				if (result.state === "passed") {
					passed++;
				} else if (result.state === "skipped") {
					skipped++;
				} else if (result.state === "failed") {
					failed++;
					failures.push(this.buildFailure(test));
				}
			}
		}

		return {
			tool: "vitest",
			status: failed === 0 ? "passed" : "failed",
			passed,
			failed,
			skipped,
			durationMs: Date.now() - this.startedAt,
			failures,
		};
	}

	private buildFailure(test: TestCase): ToonFailure {
		const error = test.result().errors?.[0];
		const stack = error?.stacks?.[0];
		const file = stack?.file ?? test.module.moduleId;
		const line = stack?.line ?? null;
		const relFile = relative(process.cwd(), file);
		const codeAround = readContext(file, line);
		const rawTail = renderRawTail(error);

		return {
			file: relFile,
			test: test.fullName,
			assertion: error?.message ?? "(no assertion message)",
			line,
			codeAround,
			rawTail,
		};
	}

	private writeSummary(summary: ToonSummary): void {
		const outPath = resolve(process.cwd(), process.env[OUTPUT_FILE_ENV] ?? DEFAULT_OUTPUT_FILE);
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, encode(summary as unknown as Record<string, unknown>));
	}

	private printSummary(summary: ToonSummary): void {
		if (summary.status === "passed") {
			process.stdout.write(
				`vitest: ${summary.passed} passed, ${summary.skipped} skipped (${summary.durationMs}ms)\n`,
			);
			return;
		}

		process.stderr.write(
			`vitest: ${summary.failed} failed, ${summary.passed} passed, ${summary.skipped} skipped (${summary.durationMs}ms)\n`,
		);
		for (const failure of summary.failures) {
			process.stderr.write(`\n--- ${failure.file}:${failure.line ?? "?"} — ${failure.test}\n`);
			process.stderr.write(`${failure.assertion}\n`);
			if (failure.codeAround) {
				process.stderr.write(`${failure.codeAround}\n`);
			}
			if (failure.rawTail) {
				process.stderr.write(`${failure.rawTail}\n`);
			}
		}
	}
}

function readContext(file: string, line: number | null): string {
	if (!(line && file && existsSync(file))) return "";
	const source = readFileSync(file, "utf-8").split("\n");
	const start = Math.max(0, line - 4);
	const end = Math.min(source.length, line + 3);
	const out: string[] = [];
	for (let i = start; i < end; i++) {
		const marker = i + 1 === line ? ">" : " ";
		out.push(`${marker} ${i + 1} | ${source[i]}`);
	}
	return out.join("\n");
}

function renderRawTail(error: { stack?: string; diff?: string } | undefined): string {
	if (!error) return "";
	const tailLines = Number(process.env[RAW_TAIL_ENV] ?? DEFAULT_RAW_TAIL_LINES);
	const parts: string[] = [];
	if (error.diff) parts.push(error.diff);
	if (error.stack) parts.push(error.stack);
	if (parts.length === 0) return "";
	const joined = parts.join("\n");
	const lines = joined.split("\n");
	if (lines.length <= tailLines) return joined;
	return lines.slice(-tailLines).join("\n");
}
