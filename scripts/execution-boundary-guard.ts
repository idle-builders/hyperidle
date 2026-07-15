#!/usr/bin/env tsx
/**
 * AU19 Mechanism B — Execution boundary. Only `agent-execution` packages may
 * reach the LLM/harness/MCP surface. This closes the hole where a non-execution
 * package imports the raw runtime (e.g. `@modelcontextprotocol/sdk`) directly
 * rather than through an execution Service.
 *
 * Three checks (architecture §7.2):
 *  1. Source imports — a production file NOT under `packages/agent-execution/`
 *     that imports a banned execution symbol (the MCP SDK, or an execution
 *     Service package: harness-registry / mcp-provider / tool-provider) → FAIL.
 *     Applies to `core-api`/`agent-orchestration`/`agent-execution` — these
 *     Services must reach the execution surface only through Mechanism C DI
 *     ports, never a direct import.
 *  2. Capability deps — a non-execution nested `package.json` listing a banned
 *     execution dependency → FAIL. Same scope as check 1.
 *  3. Composition-root raw-runtime bypass — `packages/server` (today's
 *     composition root, later Applications) legitimately imports the
 *     execution Service *packages* themselves (`@hyperidle/harness-registry`
 *     / `@hyperidle/mcp-provider` / `@hyperidle/tool-provider` — that IS its
 *     job, wiring concrete Services into the app), but must never reach PAST
 *     them to the raw runtime: the MCP SDK directly, a raw LLM SDK package
 *     (`openai`/`@anthropic-ai/sdk` — testing.md: "the only key — never
 *     Anthropic, never OpenAI"), or a `child_process` spawn of a harness CLI
 *     binary bypassing `harness-registry`'s own `CliHarnessAdapter`. Checked
 *     against `RAW_RUNTIME_MODULES` (a narrow subset of `EXECUTION_MODULES`)
 *     plus the CLI-spawn AST check (both checks 4 below) — never the full
 *     `EXECUTION_MODULES` ban, which would false-positive on the composition
 *     root's legitimate Service-package imports.
 *  4. CLI-spawn — a `child_process` spawn-family call (`spawn`/`execFile`/
 *     `spawnSync`/`execFileSync`) whose first argument is a literal harness
 *     binary name (mirrors `harness-registry`'s own `adapter-pool.ts`
 *     `CLI_TOOL_CONFIGS` binaries) outside `agent-execution/` → FAIL. Applies
 *     to every scanned scope (checks 1-3) — no layer besides
 *     `harness-registry` has a legitimate reason to spawn a harness CLI
 *     directly.
 *
 * @lore AU19 Increment 4: closes the Increment-0-flagged gap ("CLI-spawn/
 * raw-LLM-SDK detection... resolve before Increment 4/5"). Increment 0's
 * scope note said `packages/server` was out of scope "until Increment 4/5,
 * which still houses harness/mcp" — Increment 4 (this one) physically moved
 * `harness/`, `mcp/`, and the domain-touching half of `tools/` OUT of
 * `packages/server` into `agent-execution`/`agent-orchestration` Service
 * packages, so `packages/server` no longer needs the broad exemption; only
 * the narrow raw-runtime-bypass check (3+4) applies to it now, not the full
 * Service-boundary ban (which would flag its own legitimate composition-root
 * wiring). tsc alone cannot enforce any of this (a hoisted node_modules
 * resolves any package from anywhere, and spawn() calls are runtime, not
 * type-level) — this guard is the real enforcer.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

/** Package roots whose subtrees get the FULL Service-boundary ban (checks 1+2). */
const SCAN_LAYERS = ["core-api", "agent-orchestration", "agent-execution"];
/** Only files under this prefix may import the execution surface. */
const EXECUTION_PREFIX = "packages/agent-execution/";

/** A module specifier is banned outside agent-execution if it starts with one of these. */
const EXECUTION_MODULES = [
	"@modelcontextprotocol/sdk",
	"@hyperidle/harness-registry",
	"@hyperidle/mcp-provider",
	"@hyperidle/tool-provider",
];

/**
 * The narrow subset of `EXECUTION_MODULES` banned even for the composition
 * root (`packages/server`, check 3) — the raw runtime, NOT the `@hyperidle/*`
 * execution Service packages the composition root legitimately wires. Raw
 * LLM SDK names are grounded in `testing.md`'s explicit policy ("the only
 * key — never Anthropic, never OpenAI"), not a speculative vendor list.
 */
const RAW_RUNTIME_MODULES = ["@modelcontextprotocol/sdk", "openai", "@anthropic-ai/sdk"];

/**
 * Harness CLI binaries a spawn-family call must never target outside
 * `agent-execution/harness-registry` — mirrors `adapter-pool.ts`'s own
 * `CLI_TOOL_CONFIGS` binary names (a structural mirror kept in sync by hand,
 * same idiom `tool-handlers`'s `ports.ts` uses for cross-package type
 * mirrors — a guard script does not import runtime code from the packages
 * it audits).
 */
const HARNESS_BINARIES = ["claude", "codex", "opencode", "cursor-agent"];
const SPAWN_FUNCTIONS = ["spawn", "execFile", "spawnSync", "execFileSync"];

function isBanned(spec: string): boolean {
	return EXECUTION_MODULES.some((m) => spec === m || spec.startsWith(`${m}/`));
}

function isRawRuntimeBanned(spec: string): boolean {
	return RAW_RUNTIME_MODULES.some((m) => spec === m || spec.startsWith(`${m}/`));
}

export interface Finding {
	readonly file: string;
	readonly reason: string;
}

function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			out.push(...collectSourceFiles(abs));
		} else if (/\.tsx?$/.test(entry.name)) {
			out.push(abs);
		}
	}
	return out;
}

function underExecution(rel: string): boolean {
	return rel.startsWith(EXECUTION_PREFIX);
}

/** Walk every import specifier (static or dynamic) in a source file, calling `onSpec` for each. */
function forEachImportSpec(ast: ts.SourceFile, onSpec: (spec: string, node: ts.Node) => void): void {
	const visit = (node: ts.Node): void => {
		let spec: string | undefined;
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			spec = node.moduleSpecifier.text;
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteral(node.arguments[0])
		) {
			spec = node.arguments[0].text;
		}
		if (spec) onSpec(spec, node);
		ts.forEachChild(node, visit);
	};
	visit(ast);
}

/** Walk every spawn-family call expression, calling `onCall` with the callee name + first-arg literal (if any). */
function forEachSpawnCall(
	ast: ts.SourceFile,
	onCall: (calleeName: string, firstArgLiteral: string | undefined) => void,
): void {
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			let calleeName: string | undefined;
			if (ts.isIdentifier(node.expression)) {
				calleeName = node.expression.text;
			} else if (
				ts.isPropertyAccessExpression(node.expression) &&
				ts.isIdentifier(node.expression.name)
			) {
				calleeName = node.expression.name.text;
			}
			if (calleeName && SPAWN_FUNCTIONS.includes(calleeName)) {
				const firstArg = node.arguments[0];
				const literal =
					firstArg && ts.isStringLiteral(firstArg) ? firstArg.text : undefined;
				onCall(calleeName, literal);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
}

function checkSource(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	if (underExecution(rel)) return []; // execution may import the surface
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	forEachImportSpec(ast, (spec) => {
		if (isBanned(spec)) {
			findings.push({
				file: rel,
				reason: `imports execution-only module "${spec}" outside agent-execution (Mechanism B)`,
			});
		}
	});
	return findings;
}

/** Check 3: the narrow raw-runtime-bypass ban for `packages/server` (the composition root). */
function checkCompositionRootSource(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	forEachImportSpec(ast, (spec) => {
		if (isRawRuntimeBanned(spec)) {
			findings.push({
				file: rel,
				reason: `composition root imports raw-runtime module "${spec}" directly — go through the execution Service packages instead (Mechanism B)`,
			});
		}
	});
	return findings;
}

/** Check 4: no spawn-family call outside `agent-execution/` may target a harness CLI binary directly. */
function checkCliSpawn(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	if (underExecution(rel)) return []; // harness-registry's own CliHarnessAdapter legitimately spawns these
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	forEachSpawnCall(ast, (calleeName, literal) => {
		if (literal && HARNESS_BINARIES.includes(literal)) {
			findings.push({
				file: rel,
				reason: `spawns harness CLI binary "${literal}" via ${calleeName}() outside agent-execution/harness-registry (Mechanism B)`,
			});
		}
	});
	return findings;
}

function checkPackageJson(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	if (underExecution(rel)) return [];
	const pkg = JSON.parse(readFileSync(abs, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	const deps = Object.keys(pkg.dependencies ?? {});
	return deps
		.filter((d) => isBanned(d))
		.map((d) => ({
			file: rel,
			reason: `non-execution package depends on execution-only "${d}" (Mechanism B)`,
		}));
}

/** Check 3's package.json half: `packages/server`'s own `package.json` may not depend on a raw-runtime module. */
function checkCompositionRootPackageJson(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	const pkg = JSON.parse(readFileSync(abs, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	const deps = Object.keys(pkg.dependencies ?? {});
	return deps
		.filter((d) => isRawRuntimeBanned(d))
		.map((d) => ({
			file: rel,
			reason: `composition root depends on raw-runtime module "${d}" directly (Mechanism B)`,
		}));
}

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];
	for (const layer of SCAN_LAYERS) {
		const layerDir = join(root, "packages", layer);
		for (const abs of collectSourceFiles(layerDir)) {
			if (abs.endsWith("package.json")) continue;
			findings.push(...checkSource(root, abs));
			findings.push(...checkCliSpawn(root, abs));
		}
		// package.json files (Layer + nested Services)
		const pkgJsons: string[] = [];
		const walkPkg = (dir: string): void => {
			if (!existsSync(dir)) return;
			for (const e of readdirSync(dir, { withFileTypes: true })) {
				const a = join(dir, e.name);
				if (e.isDirectory()) {
					if (e.name === "node_modules" || e.name === "dist" || e.name === "src") continue;
					walkPkg(a);
				} else if (e.name === "package.json") {
					pkgJsons.push(a);
				}
			}
		};
		walkPkg(layerDir);
		for (const abs of pkgJsons) findings.push(...checkPackageJson(root, abs));
	}

	// Check 3+4: composition root (`packages/server`) — narrow raw-runtime ban, not the full Service ban.
	const serverDir = join(root, "packages", "server");
	for (const abs of collectSourceFiles(serverDir)) {
		if (abs.endsWith("package.json")) continue;
		findings.push(...checkCompositionRootSource(root, abs));
		findings.push(...checkCliSpawn(root, abs));
	}
	const serverPkgJson = join(serverDir, "package.json");
	if (existsSync(serverPkgJson)) {
		findings.push(...checkCompositionRootPackageJson(root, serverPkgJson));
	}

	return findings;
}

// -- fixtures --

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au19-exec-guard-"));
	try {
		// Negative: orchestration Service imports the MCP SDK → finding.
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { Client } from "@modelcontextprotocol/sdk"; export const c = Client;',
		);
		// Positive: agent-execution Service imports the same SDK → NO finding.
		writeFixture(
			root,
			"packages/agent-execution/harness-registry/src/adapter.ts",
			'import { Client } from "@modelcontextprotocol/sdk"; export const c = Client;',
		);
		// Negative: non-execution package.json depends on the SDK → finding.
		writeFixture(
			root,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge", "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" } }',
		);
		// Negative: a core-api Service spawns the `claude` CLI directly → finding (check 4).
		writeFixture(
			root,
			"packages/core-api/knowledge/src/spawn-leak.ts",
			'import { spawn } from "node:child_process"; export const p = spawn("claude", ["-p"]);',
		);
		// Positive: git-export spawning `git` (not a harness binary) → NO finding.
		writeFixture(
			root,
			"packages/core-api/git-export/src/git-export-runner.ts",
			'import { spawn } from "node:child_process"; export const p = spawn("git", ["status"]);',
		);
		// Positive: the composition root legitimately imports an execution Service package → NO finding.
		writeFixture(
			root,
			"packages/server/src/services/harness-capability-read-model.ts",
			'import type { AdapterPool } from "@hyperidle/harness-registry"; export type R = AdapterPool;',
		);
		// Negative: the composition root imports the raw MCP SDK directly, bypassing mcp-provider → finding (check 3).
		writeFixture(
			root,
			"packages/server/src/leak.ts",
			'import { Client } from "@modelcontextprotocol/sdk"; export const c = Client;',
		);
		// Negative: the composition root spawns `codex` directly, bypassing harness-registry → finding (check 4).
		writeFixture(
			root,
			"packages/server/src/spawn-leak.ts",
			'import { spawn } from "node:child_process"; export const p = spawn("codex", ["exec"]);',
		);
		// Negative: the composition root's own package.json depends on the raw MCP SDK → finding (check 3).
		writeFixture(
			root,
			"packages/server/package.json",
			'{ "name": "@hyperidle/server", "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" } }',
		);
		const findings = inspect(root);
		const files = findings.map((f) => f.file).sort();
		const expectedFindingFiles = [
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			"packages/core-api/knowledge/package.json",
			"packages/core-api/knowledge/src/spawn-leak.ts",
			"packages/server/package.json",
			"packages/server/src/leak.ts",
			"packages/server/src/spawn-leak.ts",
		].sort();
		const sameSet =
			files.length === expectedFindingFiles.length &&
			files.every((f, i) => f === expectedFindingFiles[i]);
		if (!sameSet) {
			throw new Error(
				`execution-boundary-guard: expected findings exactly in ${JSON.stringify(expectedFindingFiles)}, got ${JSON.stringify(files)}`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	process.stdout.write("execution-boundary-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const f of findings) process.stderr.write(`${f.file}: ${f.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`execution-boundary-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("execution-boundary-guard: PASS\n");
}
