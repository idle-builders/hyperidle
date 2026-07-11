#!/usr/bin/env tsx
/**
 * AU10 AC1/AC6 guard: the plugin/default configuration surface
 * (`plugin-configuration.ts`, `config/builtin-tool-catalog.ts`,
 * `agent-behavior-config.ts`) must not import — directly or transitively —
 * any runtime execution module (tool registry, harness adapters, MCP bridge,
 * provisioning services, agent execution internals).
 *
 * @lore AU10 N1 (architecture-critique): this walks MODULE-IMPORT reachability
 * ("does config-source file X transitively import module Y") — not au9's
 * SYMBOL-CALL reachability ("does exported symbol A transitively call symbol
 * B"). Deliberately simpler than au9-direct-handoff-guard.ts's `reaches`/
 * `symbolReaches` call-graph walk: only import edges matter here, so no
 * exports/symbol tracking is needed. Mirrors au9's parsing/`localModule`/
 * `moduleBase` scaffolding, not its call-graph `visit` logic.
 *
 * Narrow, plugin-surface-scoped seam — the first tile AU8's global should-graph
 * guard generalizes, not superseded by it (see architecture.md §5).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const CONFIG_SOURCE_FILES = [
	"packages/server/src/services/plugin-configuration.ts",
	"packages/server/src/config/builtin-tool-catalog.ts",
	"packages/server/src/services/agent-behavior-config.ts",
] as const;

const FORBIDDEN_MODULE_BASENAMES = new Set([
	"tool-registry",
	"session-provisioning",
	"agent-session-runtime",
	"agent-run-boundary",
	"agent-session-requests",
	"connection-provisioning",
]);

const FORBIDDEN_PATH_PREFIXES = ["harness/", "mcp/", "app-runtime/services/"];

interface Finding {
	readonly file: string;
	readonly reason: string;
}
interface ImportEdge {
	readonly specifier: string;
	readonly resolvedFile?: string;
}

function moduleBase(specifier: string): string {
	return specifier.replace(/\.js$/, "").split("/").at(-1) ?? specifier;
}

function localModule(from: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const base = resolve(dirname(from), specifier.replace(/\.js$/, ""));
	for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"])
		if (existsSync(base + suffix)) return base + suffix;
	return undefined;
}

function parseImports(abs: string): ImportEdge[] {
	const ast = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
	const edges: ImportEdge[] = [];
	for (const statement of ast.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			const specifier = statement.moduleSpecifier.text;
			edges.push({ specifier, resolvedFile: localModule(abs, specifier) });
		}
	}
	return edges;
}

function matchesForbidden(edge: ImportEdge, root: string): boolean {
	if (FORBIDDEN_MODULE_BASENAMES.has(moduleBase(edge.specifier))) return true;
	if (FORBIDDEN_PATH_PREFIXES.some((prefix) => edge.specifier.includes(prefix))) return true;
	if (edge.resolvedFile) {
		const rel = relative(root, edge.resolvedFile).split("\\").join("/");
		if (FORBIDDEN_PATH_PREFIXES.some((prefix) => rel.includes(prefix))) return true;
	}
	return false;
}

export function inspect(root: string): Finding[] {
	const importCache = new Map<string, ImportEdge[]>();
	function importsOf(abs: string): ImportEdge[] {
		let edges = importCache.get(abs);
		if (!edges) {
			edges = parseImports(abs);
			importCache.set(abs, edges);
		}
		return edges;
	}

	function reaches(abs: string, visited: Set<string>): boolean {
		if (visited.has(abs)) return false;
		visited.add(abs);
		for (const edge of importsOf(abs)) {
			if (matchesForbidden(edge, root)) return true;
			if (edge.resolvedFile && reaches(edge.resolvedFile, visited)) return true;
		}
		return false;
	}

	return CONFIG_SOURCE_FILES.flatMap((rel) => {
		const abs = join(root, rel);
		if (!existsSync(abs)) return [];
		if (!reaches(abs, new Set())) return [];
		return [
			{
				file: rel,
				reason: "plugin/default configuration source transitively imports a forbidden runtime module",
			},
		];
	});
}

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au10-guard-"));
	const sources: Record<string, string> = {
		// (a) direct forbidden import — expect a finding.
		"packages/server/src/services/plugin-configuration.ts":
			'import { ALL_TOOL_DEFINITIONS } from "../tools/tool-registry.js"; export const seeds = ALL_TOOL_DEFINITIONS;',
		// (b) clean local import — expect no finding.
		"packages/server/src/config/builtin-tool-catalog.ts":
			'import { CLEAN_LABEL } from "./clean-data.js"; export const BUILTIN_TOOL_CATALOG = [CLEAN_LABEL];',
		"packages/server/src/config/clean-data.ts": 'export const CLEAN_LABEL = "ok";',
		// (c) transitive forbidden import via a wrapper — expect a finding.
		"packages/server/src/services/agent-behavior-config.ts":
			'import { readWrapped } from "./config-wrapper.js"; export const wrapped = readWrapped();',
		"packages/server/src/services/config-wrapper.ts":
			'import { provisionSession } from "./session-provisioning.js"; export const readWrapped = () => provisionSession();',
		"packages/server/src/services/session-provisioning.ts": "export const provisionSession = () => 1;",
		// unrelated runtime file (untouched — the tool registry the leak fixture references).
		"packages/server/src/tools/tool-registry.ts": "export const ALL_TOOL_DEFINITIONS = [];",
	};
	try {
		for (const [path, source] of Object.entries(sources)) {
			const abs = join(root, path);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, source);
		}
		const findings = inspect(root).map((finding) => finding.file);
		for (const expected of [
			"packages/server/src/services/plugin-configuration.ts",
			"packages/server/src/services/agent-behavior-config.ts",
		])
			if (!findings.includes(expected)) throw new Error(`fixture guard missed ${expected}`);
		for (const allowed of ["packages/server/src/config/builtin-tool-catalog.ts"])
			if (findings.includes(allowed)) throw new Error(`fixture guard rejected allowed ${allowed}`);
		process.stdout.write("au10-plugin-config-ownership-guard fixtures: PASS\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (process.argv.includes("--fixtures")) fixtureCheck();
else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length) {
		process.stderr.write(`au10-plugin-config-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au10-plugin-config-ownership-guard: PASS\n");
}
