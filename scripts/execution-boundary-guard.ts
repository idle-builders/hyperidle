#!/usr/bin/env tsx
/**
 * AU19 Mechanism B — Execution boundary. Only `agent-execution` packages may
 * reach the LLM/harness/MCP surface. This closes the hole where a non-execution
 * package imports the raw runtime (e.g. `@modelcontextprotocol/sdk`) directly
 * rather than through an execution Service.
 *
 * Two checks (architecture §7.2):
 *  1. Source imports — a production file NOT under `packages/agent-execution/`
 *     that imports a banned execution symbol (the MCP SDK, or an execution
 *     Service package: harness-registry / mcp-provider / tool-provider) → FAIL.
 *  2. Capability deps — a non-execution nested `package.json` listing a banned
 *     execution dependency → FAIL.
 *
 * @lore AU19 Increment 0 scope: scans the NEW Layer/Service packages under
 * `packages/{core-api,agent-orchestration,agent-execution}` — `packages/server`
 * (which still houses harness/mcp today) is out of scope until Increment 4/5. The
 * `--fixtures` self-test proves the negative case (MCP SDK imported outside
 * agent-execution). tsc alone cannot enforce this (a hoisted node_modules resolves
 * the SDK from anywhere) — this guard is the real enforcer.
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

/** Package roots whose subtrees are scanned. */
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

function isBanned(spec: string): boolean {
	return EXECUTION_MODULES.some((m) => spec === m || spec.startsWith(`${m}/`));
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

function checkSource(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	if (underExecution(rel)) return []; // execution may import the surface
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
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
		if (spec && isBanned(spec)) {
			findings.push({
				file: rel,
				reason: `imports execution-only module "${spec}" outside agent-execution (Mechanism B)`,
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
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

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];
	for (const layer of SCAN_LAYERS) {
		const layerDir = join(root, "packages", layer);
		for (const abs of collectSourceFiles(layerDir)) {
			if (abs.endsWith("package.json")) continue;
			findings.push(...checkSource(root, abs));
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
		const findings = inspect(root);
		const files = findings.map((f) => f.file).sort();
		if (
			findings.length !== 2 ||
			!files.includes("packages/agent-orchestration/context-assembly/src/leak.ts") ||
			!files.includes("packages/core-api/knowledge/package.json")
		) {
			throw new Error(
				`execution-boundary-guard: expected exactly the leak.ts + knowledge/package.json findings, got ${JSON.stringify(findings)}`,
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
