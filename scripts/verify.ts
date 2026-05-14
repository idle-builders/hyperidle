#!/usr/bin/env bun
// Block 1a — TE-3: single global verify orchestrator.
//
// Runs check + lint:biome + lint:eslint + test in parallel-friendly order,
// captures each tool's structured output, finishes all of them (even if one
// fails), and prints one TOON summary at the end. On failure, raw stderr
// tail of the failing tool is preserved (TE-4 — silent on green, transparent
// on red).
//
// Usage:
//   bun run verify           # full: check + lint + test (TOON summary)
//   bun run verify --quick   # quick: check + lint only (no tests)
//   bun run verify --raw     # forward each tool's full stdout/stderr
//   bun run verify --only=test,lint:eslint
//
// Exit code is the count of failing tools (0 = all green).

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { encode } from "../packages/shared/src/toon-codec.js";

interface Tool {
	name: string;
	cmd: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
}

interface ToolResult {
	name: string;
	ok: boolean;
	durationMs: number;
	exitCode: number;
	stdoutTail: string;
	stderrTail: string;
	stdoutBytes: number;
	stderrBytes: number;
}

const RAW_TAIL_LINES = 60;
const TEST_OUTPUT_FILE = "test-output.toon";

const TOOLS: Tool[] = [
	{ name: "check", cmd: "tsc", args: ["--noEmit", "-p", "tsconfig.json"] },
	{ name: "lint:biome", cmd: "bun", args: ["run", "lint:biome"] },
	{ name: "lint:eslint", cmd: "bunx", args: ["--bun", "eslint", ".", "--quiet"] },
	{ name: "knip", cmd: "bunx", args: ["--bun", "knip"] },
	// M1 — inventory drift check. Fails if inventory.json is stale.
	// Excluded from --quick (QUICK_TOOLS set). Architecture ref: M1 § Decision 6.
	{
		name: "mock-inventory",
		cmd: "bun",
		args: ["run", "scripts/mock-inventory.ts", "--check"],
	},
	{
		name: "test",
		cmd: "bun",
		args: ["run", "test:raw"],
		env: { VITEST_TOON_OUTPUT: TEST_OUTPUT_FILE },
	},
	{ name: "build", cmd: "bun", args: ["run", "build"] },
	{
		name: "e2e",
		cmd: "bunx",
		args: ["--bun", "playwright", "test", "--reporter=list"],
		cwd: "packages/web",
	},
];

interface CliFlags {
	raw: boolean;
	quick: boolean;
	only: Set<string> | null;
}

function parseFlags(argv: readonly string[]): CliFlags {
	let raw = false;
	let quick = false;
	let only: Set<string> | null = null;
	for (const arg of argv) {
		if (arg === "--raw") raw = true;
		else if (arg === "--quick") quick = true;
		else if (arg.startsWith("--only=")) {
			only = new Set(arg.slice("--only=".length).split(",").filter(Boolean));
		}
	}
	return { raw, quick, only };
}

function runTool(tool: Tool, raw: boolean): Promise<ToolResult> {
	const startedAt = Date.now();
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];

	return new Promise<ToolResult>((resolvePromise) => {
		const child = spawn(tool.cmd, tool.args, {
			env: { ...process.env, ...tool.env },
			cwd: tool.cwd ? resolve(process.cwd(), tool.cwd) : undefined,
			stdio: raw ? "inherit" : ["ignore", "pipe", "pipe"],
		});

		if (!raw && child.stdout && child.stderr) {
			child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString("utf-8")));
			child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString("utf-8")));
		}

		child.on("close", (code) => {
			const stdout = stdoutChunks.join("");
			const stderr = stderrChunks.join("");
			resolvePromise({
				name: tool.name,
				ok: code === 0,
				exitCode: code ?? -1,
				durationMs: Date.now() - startedAt,
				stdoutBytes: Buffer.byteLength(stdout, "utf-8"),
				stderrBytes: Buffer.byteLength(stderr, "utf-8"),
				stdoutTail: tail(stdout, RAW_TAIL_LINES),
				stderrTail: tail(stderr, RAW_TAIL_LINES),
			});
		});
	});
}

function tail(text: string, lines: number): string {
	if (!text) return "";
	const split = text.split("\n");
	if (split.length <= lines) return text;
	return split.slice(-lines).join("\n");
}

function readVitestToon(): unknown | null {
	const path = resolve(process.cwd(), TEST_OUTPUT_FILE);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf-8");
}

interface VerifySummary {
	status: "passed" | "failed";
	totalTools: number;
	passed: number;
	failed: number;
	durationMs: number;
	tools: Array<{
		name: string;
		ok: boolean;
		durationMs: number;
		exitCode: number;
	}>;
	failures: Array<{
		name: string;
		exitCode: number;
		stderrTail: string;
		stdoutTail: string;
	}>;
	vitestToon?: string;
}

function buildSummary(results: ToolResult[], totalDurationMs: number): VerifySummary {
	const failures = results
		.filter((r) => !r.ok)
		.map((r) => ({
			name: r.name,
			exitCode: r.exitCode,
			stderrTail: r.stderrTail,
			stdoutTail: r.stdoutTail,
		}));
	const summary: VerifySummary = {
		status: failures.length === 0 ? "passed" : "failed",
		totalTools: results.length,
		passed: results.filter((r) => r.ok).length,
		failed: failures.length,
		durationMs: totalDurationMs,
		tools: results.map((r) => ({
			name: r.name,
			ok: r.ok,
			durationMs: r.durationMs,
			exitCode: r.exitCode,
		})),
		failures,
	};

	const vitestFailed = results.find((r) => r.name === "test" && !r.ok);
	if (vitestFailed) {
		const toon = readVitestToon();
		if (typeof toon === "string") summary.vitestToon = toon;
	}

	return summary;
}

function printSummary(summary: VerifySummary): void {
	const out = encode(summary as unknown as Record<string, unknown>);
	if (summary.status === "passed") {
		process.stdout.write(`${out}\n`);
		return;
	}
	// TE-4 — failure path: TOON summary first, then raw tail per failing tool.
	process.stderr.write(`${out}\n\n`);
	for (const f of summary.failures) {
		process.stderr.write(`=== ${f.name} (exit ${f.exitCode}) ===\n`);
		if (f.stderrTail) process.stderr.write(`${f.stderrTail}\n`);
		if (f.stdoutTail) process.stderr.write(`${f.stdoutTail}\n`);
	}
	if (summary.vitestToon) {
		process.stderr.write(`\n=== ${TEST_OUTPUT_FILE} ===\n`);
		process.stderr.write(`${summary.vitestToon}\n`);
	}
}

async function main(): Promise<void> {
	const flags = parseFlags(process.argv.slice(2));
	const QUICK_TOOLS = new Set(["check", "lint:biome", "lint:eslint", "knip"]);
	let tools: Tool[];
	if (flags.only) {
		tools = TOOLS.filter((t) => flags.only?.has(t.name));
	} else if (flags.quick) {
		tools = TOOLS.filter((t) => QUICK_TOOLS.has(t.name));
	} else {
		tools = TOOLS;
	}
	if (tools.length === 0) {
		process.stderr.write("verify: no tools matched --only filter\n");
		process.exit(2);
	}

	const startedAt = Date.now();
	// Run sequentially to keep CPU contention predictable and stdout
	// interleaving deterministic. Sub-tools (vitest, eslint) already use
	// their own internal parallelism.
	const results: ToolResult[] = [];
	for (const tool of tools) {
		const result = await runTool(tool, flags.raw);
		results.push(result);
	}
	const totalDurationMs = Date.now() - startedAt;
	const summary = buildSummary(results, totalDurationMs);
	if (!flags.raw) printSummary(summary);
	process.exit(summary.failed);
}

await main();
