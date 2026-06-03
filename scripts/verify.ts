#!/usr/bin/env tsx
// Verify orchestrator. Runs tools in parallel phases, prints pass/fail summary,
// writes attestation on success. No output processing — tools are silenced.
// Run individual commands (npm run check, npm run lint, npm run test) for details.
//
// Usage:
//   npm run verify           # smart: package-aware gating (default)
//   npm run verify --full    # all tools, no smart gating
//   npm run verify --quick   # phase 1 only (static analysis)
//   npm run verify --only=test,check

import { spawn, execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	analyzeImpact,
	formatSkipMessage,
	getImpactedVitestProjects,
	shouldRunTool,
	type ImpactAnalysis,
} from "./lib/package-impact.js";

interface Tool {
	name: string;
	cmd: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
	timeoutMs?: number;
	phase: 1 | 2;
}

interface ToolResult {
	name: string;
	ok: boolean;
	durationMs: number;
	exitCode: number;
	timedOut?: boolean;
}

const TOOLS: Tool[] = [
	{
		name: "check",
		cmd: "tsc",
		args: ["--noEmit", "-p", "tsconfig.json"],
		timeoutMs: 120_000,
		phase: 1,
	},
	{ name: "lint:biome", cmd: "npm", args: ["run", "lint:biome"], timeoutMs: 120_000, phase: 1 },
	{
		name: "lint:eslint",
		cmd: "npx",
		args: ["eslint", ".", "--quiet"],
		timeoutMs: 300_000,
		phase: 1,
	},
	{ name: "knip", cmd: "npx", args: ["knip"], timeoutMs: 120_000, phase: 1 },
	{
		name: "test-coverage",
		cmd: "npx",
		args: ["tsx", "scripts/test-coverage-check.ts"],
		timeoutMs: 30_000,
		phase: 1,
	},
	{
		name: "mock-inventory",
		cmd: "npx",
		args: ["tsx", "scripts/mock-inventory.ts", "--check"],
		timeoutMs: 60_000,
		phase: 1,
	},
	{
		name: "test",
		cmd: "vitest",
		args: ["run"],
		timeoutMs: 1_800_000,
		phase: 2,
	},
	{ name: "build", cmd: "npm", args: ["run", "build"], timeoutMs: 120_000, phase: 2 },
	{
		name: "build:desktop",
		cmd: "npm",
		args: ["run", "-w", "@hyperidle/desktop", "build"],
		timeoutMs: 120_000,
		phase: 2,
	},
	{
		name: "server:load",
		cmd: "node",
		args: [
			"--import",
			"tsx",
			"-e",
			"import('./packages/server/src/server-factory.ts').then(() => { process.exit(0); })",
		],
		timeoutMs: 120_000,
		phase: 2,
	},
];

// ---------------------------------------------------------------------------
// Process cleanup
// ---------------------------------------------------------------------------

const activeChildren = new Set<number>();

function killActiveChildren(): void {
	for (const pid of activeChildren) {
		try {
			process.kill(-pid, "SIGTERM");
		} catch {}
	}
	activeChildren.clear();
}

process.on("SIGTERM", () => {
	killActiveChildren();
	process.exit(1);
});
process.on("SIGINT", () => {
	killActiveChildren();
	process.exit(1);
});
process.on("exit", killActiveChildren);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliFlags {
	quick: boolean;
	full: boolean;
	only: Set<string> | null;
}

function parseFlags(argv: readonly string[]): CliFlags {
	let quick = false;
	let full = false;
	let only: Set<string> | null = null;
	for (const arg of argv) {
		if (arg === "--quick") quick = true;
		else if (arg === "--full") full = true;
		else if (arg.startsWith("--only=")) {
			only = new Set(arg.slice("--only=".length).split(",").filter(Boolean));
		}
	}
	return { quick, full, only };
}

// ---------------------------------------------------------------------------
// Tool runner
// ---------------------------------------------------------------------------

function runTool(tool: Tool): Promise<ToolResult> {
	const startedAt = Date.now();

	return new Promise<ToolResult>((resolvePromise) => {
		const child = spawn(tool.cmd, tool.args, {
			env: { ...process.env, ...tool.env },
			cwd: tool.cwd ? resolve(process.cwd(), tool.cwd) : undefined,
			stdio: ["ignore", "ignore", "ignore"],
			detached: true,
		});

		if (child.pid) activeChildren.add(child.pid);

		let timedOut = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (tool.timeoutMs) {
			timer = setTimeout(() => {
				timedOut = true;
				try {
					process.kill(-child.pid!, "SIGTERM");
				} catch {
					child.kill("SIGTERM");
				}
				setTimeout(() => {
					try {
						process.kill(-child.pid!, "SIGKILL");
					} catch {}
				}, 5_000);
			}, tool.timeoutMs);
		}

		child.on("close", (code) => {
			if (child.pid) activeChildren.delete(child.pid);
			if (timer) clearTimeout(timer);
			resolvePromise({
				name: tool.name,
				ok: !timedOut && code === 0,
				exitCode: code ?? -1,
				durationMs: Date.now() - startedAt,
				timedOut,
			});
		});
	});
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(results: ToolResult[], totalMs: number): void {
	const failed = results.filter((r) => !r.ok);
	const stream = failed.length > 0 ? process.stderr : process.stdout;

	stream.write("\n");
	for (const r of results) {
		const status = r.ok ? "✓" : "✗";
		const duration = `${(r.durationMs / 1000).toFixed(1)}s`;
		const timeout = r.timedOut ? " (timeout)" : "";
		stream.write(`  ${status} ${r.name.padEnd(16)} ${duration}${timeout}\n`);
	}
	stream.write("\n");

	if (failed.length === 0) {
		stream.write(`verify: all ${results.length} tools passed (${(totalMs / 1000).toFixed(1)}s)\n`);
	} else {
		stream.write(
			`verify: ${failed.length}/${results.length} failed — run failed tools individually for details\n`,
		);
	}
}

// ---------------------------------------------------------------------------
// Attestation
// ---------------------------------------------------------------------------

const ATTESTATION_DIR = ".verify-attestations";
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

function writeAttestation(
	passed: boolean,
	toolNames: string[],
	smartSkipped: string[],
	partial: boolean,
): void {
	if (!passed) return;

	const secret = getOrCreateSecret();
	if (!secret) return;

	const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
	const dirty = execSync("git status --porcelain", { encoding: "utf-8" }).trim().length > 0;

	const payload = {
		sha,
		status: "passed" as const,
		dirty,
		tools: toolNames,
		allTools: ALL_TOOL_NAMES,
		partial,
		smartSkipped,
		timestamp: new Date().toISOString(),
	};

	const hmac = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

	const dir = resolve(process.cwd(), ATTESTATION_DIR);
	mkdirSync(dir, { recursive: true });

	for (const file of readdirSync(dir)) {
		if (file.endsWith(".json") && file !== `${sha}.json`) {
			try {
				unlinkSync(join(dir, file));
			} catch {}
		}
	}

	const filePath = join(dir, `${sha}.json`);
	writeFileSync(filePath, JSON.stringify({ ...payload, hmac }, null, "\t") + "\n");
	process.stderr.write(`verify: attestation → ${ATTESTATION_DIR}/${sha}.json\n`);
	if (dirty) {
		process.stderr.write("verify: WARNING — working tree is dirty, commit first for CI\n");
	}
}

// ---------------------------------------------------------------------------
// Smart gating
// ---------------------------------------------------------------------------

function applySmartGating(
	tools: Tool[],
	impact: ImpactAnalysis,
): { tools: Tool[]; skipped: string[] } {
	const kept: Tool[] = [];
	const skipped: string[] = [];

	for (const tool of tools) {
		if (!shouldRunTool(tool.name, impact)) {
			skipped.push(formatSkipMessage(tool.name, impact));
			continue;
		}

		if (tool.name === "test") {
			const projects = getImpactedVitestProjects(impact);
			if (projects) {
				const projectArgs = projects.flatMap((p) => ["--project", p]);
				kept.push({
					...tool,
					cmd: "vitest",
					args: ["run", ...projectArgs],
				});
				continue;
			}
		}

		kept.push(tool);
	}

	return { tools: kept, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const flags = parseFlags(process.argv.slice(2));
	let tools: Tool[];
	let isPartial = false;

	if (flags.only) {
		tools = TOOLS.filter((t) => flags.only?.has(t.name));
		isPartial = true;
	} else if (flags.quick) {
		tools = TOOLS.filter((t) => t.phase === 1);
		isPartial = true;
	} else {
		tools = TOOLS;
	}

	if (tools.length === 0) {
		process.stderr.write("verify: no tools matched filter\n");
		process.exit(2);
	}

	const useSmart = !flags.full && !flags.only && !flags.quick;
	let smartSkippedTools: string[] = [];

	if (useSmart) {
		const impact = analyzeImpact(process.cwd(), "origin/main");
		const gated = applySmartGating(tools, impact);
		smartSkippedTools = gated.tools.length < tools.length
			? tools.filter((t) => !gated.tools.some((k) => k.name === t.name)).map((t) => t.name)
			: [];
		tools = gated.tools;

		if (impact.forceFull) {
			process.stderr.write(
				`[smart] force-full: config/scripts changed (${impact.forceFullFiles.join(", ")})\n`,
			);
		} else {
			const changed = [...impact.changedPackages];
			const impacted = [...impact.impactedPackages];
			if (changed.length > 0) {
				process.stderr.write(
					`[smart] changed: ${changed.join(", ")} → impacted: ${impacted.join(", ")}\n`,
				);
			} else {
				process.stderr.write("[smart] no package changes detected\n");
			}
		}

		for (const msg of gated.skipped) {
			process.stderr.write(`${msg}\n`);
		}
	}

	const startedAt = Date.now();
	const results: ToolResult[] = [];

	for (const phase of [1, 2] as const) {
		const phaseTools = tools.filter((t) => t.phase === phase);
		if (phaseTools.length === 0) continue;
		const phaseResults = await Promise.all(phaseTools.map((t) => runTool(t)));
		results.push(...phaseResults);
	}

	const totalMs = Date.now() - startedAt;
	const failed = results.filter((r) => !r.ok).length;

	printSummary(results, totalMs);
	writeAttestation(
		failed === 0,
		tools.map((t) => t.name),
		smartSkippedTools,
		isPartial,
	);
	process.exit(failed);
}

await main();
