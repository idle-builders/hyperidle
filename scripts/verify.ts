#!/usr/bin/env tsx
// Block 1a — TE-3: single global verify orchestrator.
//
// Runs check + lint:biome + lint:eslint + test in parallel-friendly order,
// captures each tool's structured output, finishes all of them (even if one
// fails), and prints one TOON summary at the end. On failure, raw stderr
// tail of the failing tool is preserved (TE-4 — silent on green, transparent
// on red).
//
// Usage:
//   npm run verify           # full: check + lint + test (TOON summary)
//   npm run verify --quick   # quick: check + lint only (no tests)
//   npm run verify --raw     # forward each tool's full stdout/stderr
//   npm run verify --only=test,lint:eslint
//
// Exit code is the count of failing tools (0 = all green).

import { spawn, execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { encode } from "../packages/shared/src/toon-codec.js";

interface Tool {
	name: string;
	cmd: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
	timeoutMs?: number;
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
	timedOut?: boolean;
}

const RAW_TAIL_LINES = 60;
const TEST_OUTPUT_FILE = "test-output.toon";

const TOOLS: Tool[] = [
	{ name: "check", cmd: "tsc", args: ["--noEmit", "-p", "tsconfig.json"], timeoutMs: 60_000 },
	{ name: "lint:biome", cmd: "npm", args: ["run", "lint:biome"], timeoutMs: 60_000 },
	{ name: "lint:eslint", cmd: "npx", args: ["eslint", ".", "--quiet"], timeoutMs: 180_000 },
	{ name: "knip", cmd: "npx", args: ["knip"], timeoutMs: 60_000 },
	{
		name: "mock-inventory",
		cmd: "npx",
		args: ["tsx", "scripts/mock-inventory.ts", "--check"],
		timeoutMs: 30_000,
	},
	{
		name: "test",
		cmd: "npm",
		args: ["run", "test:raw"],
		env: { VITEST_TOON_OUTPUT: TEST_OUTPUT_FILE },
		// @lore: Under heavy CI load (10+ parallel worktrees on 10-core machine),
		// the full test suite can take 1000s+. 1800s (30min) handles worst-case
		// multi-worktree contention while still providing a reasonable upper bound.
		timeoutMs: 1_800_000,
	},
	{ name: "build", cmd: "npm", args: ["run", "build"], timeoutMs: 60_000 },
	{
		name: "build:desktop",
		cmd: "npm",
		args: ["run", "-w", "@hyperidle/desktop", "build"],
		timeoutMs: 60_000,
	},
	{
		name: "server:load",
		cmd: "node",
		args: [
			"--import", "tsx",
			"-e", "import('./packages/server/src/server-factory.ts').then(() => { process.exit(0); })",
		],
		timeoutMs: 15_000,
	},
	// e2e disabled — needs full rebuild of Playwright fixture/server setup
	// {
	// 	name: "e2e",
	// 	cmd: "npx",
	// 	args: ["playwright", "test", "--reporter=list"],
	// 	cwd: "packages/web",
	// 	timeoutMs: 600_000,
	// },
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

		let timedOut = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (tool.timeoutMs) {
			timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
				setTimeout(() => {
					if (!child.killed) child.kill("SIGKILL");
				}, 5_000);
			}, tool.timeoutMs);
		}

		if (!raw && child.stdout && child.stderr) {
			child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString("utf-8")));
			child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString("utf-8")));
		}

		child.on("close", (code) => {
			if (timer) clearTimeout(timer);
			const stdout = stdoutChunks.join("");
			const stderr = stderrChunks.join("");
			const timeoutMsg = timedOut
				? `\n[verify] ${tool.name} killed after ${Math.round((tool.timeoutMs ?? 0) / 1000)}s timeout\n`
				: "";
			resolvePromise({
				name: tool.name,
				ok: !timedOut && code === 0,
				exitCode: code ?? -1,
				durationMs: Date.now() - startedAt,
				stdoutBytes: Buffer.byteLength(stdout, "utf-8"),
				stderrBytes: Buffer.byteLength(stderr, "utf-8"),
				stdoutTail: tail(stdout, RAW_TAIL_LINES) + timeoutMsg,
				stderrTail: tail(stderr, RAW_TAIL_LINES) + timeoutMsg,
				timedOut,
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

const ATTESTATION_FILE = ".verify-attestation.json";
const SECRET_DIR = join(homedir(), ".config", "hyperidle");
const SECRET_PATH = join(SECRET_DIR, "verify-secret");

const ALL_TOOL_NAMES = TOOLS.map((t) => t.name);

function getOrCreateSecret(): string | null {
	if (existsSync(SECRET_PATH)) {
		return readFileSync(SECRET_PATH, "utf-8").trim();
	}
	mkdirSync(SECRET_DIR, { recursive: true });
	const secret = randomBytes(32).toString("hex");
	writeFileSync(SECRET_PATH, secret + "\n", { mode: 0o600 });
	process.stderr.write(`verify: created signing key at ${SECRET_PATH}\n`);
	process.stderr.write(
		"verify: add it to GitHub → gh secret set VERIFY_SECRET < " + SECRET_PATH + "\n",
	);
	return secret;
}

function writeAttestation(summary: VerifySummary, toolNames: string[]): void {
	if (summary.status !== "passed") return;

	const secret = getOrCreateSecret();
	if (!secret) return;

	const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
	const dirty =
		execSync("git status --porcelain", { encoding: "utf-8" }).trim().length > 0;

	const payload = {
		sha,
		status: "passed" as const,
		dirty,
		tools: toolNames,
		allTools: ALL_TOOL_NAMES,
		partial: toolNames.length < ALL_TOOL_NAMES.length,
		timestamp: new Date().toISOString(),
	};

	const hmac = createHmac("sha256", secret)
		.update(JSON.stringify(payload))
		.digest("hex");

	writeFileSync(
		resolve(process.cwd(), ATTESTATION_FILE),
		JSON.stringify({ ...payload, hmac }, null, "\t") + "\n",
	);
	process.stderr.write(`verify: attestation written → ${ATTESTATION_FILE}\n`);
	if (dirty) {
		process.stderr.write("verify: WARNING — working tree is dirty, commit first for CI\n");
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
	if (!flags.raw) {
		printSummary(summary);
	} else if (summary.failed > 0) {
		const names = summary.failures.map((f) => `${f.name} (exit ${f.exitCode})`).join(", ");
		process.stderr.write(`\nverify: ${summary.failed} tool(s) failed: ${names}\n`);
	}
	writeAttestation(
		summary,
		tools.map((t) => t.name),
	);
	process.exit(summary.failed);
}

await main();
