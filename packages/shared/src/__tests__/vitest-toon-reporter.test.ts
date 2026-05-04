import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import VitestToonReporter from "../reporters/vitest-toon.js";

interface FakeError {
	message: string;
	stacks?: Array<{ method: string; file: string; line: number; column: number }>;
	stack?: string;
	diff?: string;
}

interface FakeTest {
	fullName: string;
	module: { moduleId: string };
	result(): { state: "passed" | "failed" | "skipped"; errors?: ReadonlyArray<FakeError> };
}

function makeModule(tests: FakeTest[]): {
	children: { allTests(): IterableIterator<FakeTest> };
} {
	return {
		children: {
			allTests(): IterableIterator<FakeTest> {
				return tests[Symbol.iterator]();
			},
		},
	};
}

let tmpRoot: string;
let originalCwd: string;
let originalOutEnv: string | undefined;

beforeEach(() => {
	originalCwd = process.cwd();
	tmpRoot = mkdtempSync(join(tmpdir(), "vitest-toon-"));
	process.chdir(tmpRoot);
	originalOutEnv = process.env.VITEST_TOON_OUTPUT;
	process.env.VITEST_TOON_OUTPUT = "test-output.toon";
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(tmpRoot, { recursive: true, force: true });
	if (originalOutEnv === undefined) {
		delete process.env.VITEST_TOON_OUTPUT;
	} else {
		process.env.VITEST_TOON_OUTPUT = originalOutEnv;
	}
});

describe("VitestToonReporter", () => {
	it("writes a passing-only TOON summary with counts", () => {
		const reporter = new VitestToonReporter();
		reporter.onTestRunStart();
		const tests: FakeTest[] = [
			{
				fullName: "a > one",
				module: { moduleId: "/x.ts" },
				result: () => ({ state: "passed" }),
			},
			{
				fullName: "a > two",
				module: { moduleId: "/x.ts" },
				result: () => ({ state: "skipped", errors: undefined }),
			},
		];
		// biome-ignore lint/suspicious/noExplicitAny: shaped for the duck-typed reporter
		reporter.onTestRunEnd([makeModule(tests) as any]);

		const out = readFileSync(join(tmpRoot, "test-output.toon"), "utf-8");
		expect(out).toContain("status: passed");
		expect(out).toContain("passed: 1");
		expect(out).toContain("skipped: 1");
		expect(out).toContain("failed: 0");
	});

	it("captures failure assertion, file, line, and code context", () => {
		const sourceFile = join(tmpRoot, "fail.ts");
		writeFileSync(
			sourceFile,
			["// L1", "// L2", "// L3", "expect(actual).toBe(expected)", "// L5", "// L6"].join("\n"),
		);

		const reporter = new VitestToonReporter();
		reporter.onTestRunStart();
		const tests: FakeTest[] = [
			{
				fullName: "suite > breaks",
				module: { moduleId: sourceFile },
				result: () => ({
					state: "failed",
					errors: [
						{
							message: "expected 1 to be 2",
							stacks: [{ method: "it", file: sourceFile, line: 4, column: 1 }],
							stack: "Error: expected 1 to be 2\n    at it (fail.ts:4:1)",
							diff: "- 1\n+ 2",
						},
					],
				}),
			},
		];
		// biome-ignore lint/suspicious/noExplicitAny: shaped for the duck-typed reporter
		reporter.onTestRunEnd([makeModule(tests) as any]);

		const out = readFileSync(join(tmpRoot, "test-output.toon"), "utf-8");
		expect(out).toContain("status: failed");
		expect(out).toContain("failed: 1");
		expect(out).toContain("expected 1 to be 2");
		expect(out).toContain("fail.ts");
		expect(out).toContain("line: 4");
		// Code context preserved (TE-4 transparency on red).
		expect(out).toContain("expect(actual).toBe(expected)");
	});

	it("preserves Playwright-style locator + selector context in the raw tail (TE-4)", () => {
		const reporter = new VitestToonReporter();
		reporter.onTestRunStart();
		const playwrightStack = [
			"TimeoutError: locator.click: Timeout 5000ms exceeded.",
			'Call log: waiting for locator("button.submit-btn[data-testid=\\"checkout\\"]")',
			'  - selector resolved to <button class="submit-btn" disabled>…</button>',
			"  - element is not enabled",
			"    at /tests/checkout.spec.ts:42:14",
		].join("\n");
		const tests: FakeTest[] = [
			{
				fullName: "checkout > submits the cart",
				module: { moduleId: "/tests/checkout.spec.ts" },
				result: () => ({
					state: "failed",
					errors: [
						{
							message: "locator.click: Timeout 5000ms exceeded.",
							stacks: [
								{
									method: "click",
									file: "/tests/checkout.spec.ts",
									line: 42,
									column: 14,
								},
							],
							stack: playwrightStack,
						},
					],
				}),
			},
		];
		// biome-ignore lint/suspicious/noExplicitAny: shaped for the duck-typed reporter
		reporter.onTestRunEnd([makeModule(tests) as any]);

		const out = readFileSync(join(tmpRoot, "test-output.toon"), "utf-8");
		expect(out).toContain("submit-btn");
		expect(out).toContain('data-testid=\\"checkout\\"');
		expect(out).toContain("element is not enabled");
	});
});
