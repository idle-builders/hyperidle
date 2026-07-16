#!/usr/bin/env tsx
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const forbiddenModules = new Set(["trigger-resolution", "agent-session-requests", "agent-session-runtime", "agent-run-boundary"]);
const forbiddenSymbols = new Set([
	"createTriggeredAgentSessionRequest", "createAgentSessionRequest", "claimNextAgentSessionRequest",
	"claimAgentSessionRequestById", "consumeAgentSessionRequest", "executeAgentRunRequest", "provisionSession",
]);
const agentFiles = new Set([
	"packages/server/src/services/agent-work-handoff.ts", "packages/server/src/services/agent-work-intent-worker.ts",
	"packages/server/src/services/agent-session-requests.ts",
	// @lore AU19 Increment 3i: `session-provisioning.ts` moved to
	// `@hyperidle/session-lifecycle` (out of this guard's scanned
	// `packages/server/src` tree entirely) — the entry below is now a
	// harmless dead allowlist row, not an error. `session-lifecycle-bindings.ts`
	// (the new composition-root wiring file) never literally calls the
	// forbidden `provisionSession` symbol (it calls `provisionSessionInternal`,
	// the aliased import), so it needs no allowlist entry here.
	"packages/server/src/services/session-provisioning.ts",
	"packages/server/src/services/agent-work-assistant.ts",
	// @lore AU19 Increment 3b: `agent-work-intent-worker.ts`/`agent-session-requests.ts`
	// moved to `@hyperidle/session-requests` (out of this guard's scanned
	// `packages/server/src` tree entirely — still-relevant entries above are
	// harmless dead allowlist rows, not errors). `session-requests-bindings.ts`
	// is the new composition-root wiring file that legitimately calls
	// `createTriggeredAgentSessionRequest` (building `TriggerResolutionDeps`)
	// — same legitimate-wiring role as `agent-work-intent-worker.ts` had
	// pre-move, added here so it is not flagged as a bypass.
	"packages/server/src/services/session-requests-bindings.ts",
	// @lore AU19 Increment 3c: `agent-run-boundary.ts`/`agent-session-runtime.ts`/
	// `agent-layer-boot.ts` moved to `@hyperidle/run-orchestration` (same
	// out-of-scanned-tree situation as 3b's entries above — harmless dead
	// allowlist rows, not errors). `run-orchestration-bindings.ts` is the new
	// composition-root wiring file (same legitimate-wiring role
	// `session-requests-bindings.ts` has) — it never literally calls a
	// forbidden symbol (every internal export is imported under an
	// `...Internal` alias), so it does not need its own allowlist entry here.
	"packages/server/src/services/agent-run-boundary.ts",
	"packages/server/src/services/agent-session-runtime.ts",
	"packages/server/src/services/agent-layer-boot.ts",
	// @lore AU19 Increment 3h: `agent-work-assistant.ts` moved to
	// `@hyperidle/dispatch` (out-of-scanned-tree, same shape as 3b/3c above —
	// the entry above is now a harmless dead allowlist row, not an error).
	// `dispatch-bindings.ts` is the new composition-root wiring file (same
	// legitimate-wiring role `session-requests-bindings.ts`/
	// `run-orchestration-bindings.ts` have) — it calls `executeAgentRunRequest`
	// directly (no `...Internal` alias, unlike `run-orchestration-bindings.ts`)
	// to implement `dispatch`'s own `runOrchestration` port, so it needs this
	// allowlist entry.
	"packages/server/src/services/dispatch-bindings.ts",
]);

type Finding = { file: string; reason: string };
type ImportRef = { file?: string; imported: string; module: string };
type Unit = { ast: ts.SourceFile; imports: Map<string, ImportRef>; namespaces: Map<string, ImportRef>; exports: Map<string, ts.Node> };

function files(root: string): string[] {
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const path = join(root, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : files(path);
		return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
	});
}
function productionFile(file: string): boolean { return !file.includes("/__tests__/") && !/\.(?:test|spec)\.tsx?$/.test(file); }
function moduleBase(specifier: string): string { return specifier.replace(/\.js$/, "").split("/").at(-1) ?? specifier; }
function localModule(from: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const base = resolve(dirname(from), specifier.replace(/\.js$/, ""));
	for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + suffix)) return base + suffix;
	return undefined;
}
function exported(node: ts.Node): boolean { return !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword); }

export function inspect(root: string): Finding[] {
	const candidates = files(join(root, "packages/server/src")).filter(productionFile);
	const units = new Map<string, Unit>();
	for (const abs of candidates) {
		const ast = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
		const unit: Unit = { ast, imports: new Map(), namespaces: new Map(), exports: new Map() };
		for (const statement of ast.statements) {
			if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
				const module = statement.moduleSpecifier.text;
				const target = localModule(abs, module);
				const clause = statement.importClause;
				if (clause?.name) unit.imports.set(clause.name.text, { file: target, imported: "default", module });
				if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements)
					unit.imports.set(item.name.text, { file: target, imported: item.propertyName?.text ?? item.name.text, module });
				if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) unit.namespaces.set(clause.namedBindings.name.text, { file: target, imported: "*", module });
			}
			if (ts.isFunctionDeclaration(statement) && statement.name && exported(statement)) unit.exports.set(statement.name.text, statement);
			if (ts.isVariableStatement(statement) && exported(statement)) for (const declaration of statement.declarationList.declarations)
				if (ts.isIdentifier(declaration.name)) unit.exports.set(declaration.name.text, declaration.initializer ?? declaration);
			if (ts.isExportAssignment(statement)) unit.exports.set("default", statement.expression);
		}
		units.set(abs, unit);
	}

	const memo = new Map<string, boolean>();
	const reaches = (file: string, node: ts.Node, stack: Set<string>): boolean => {
		const unit = units.get(file); if (!unit) return false;
		const isCompositionBoot = (ref: ImportRef) =>
			relative(root, file) === "packages/server/src/server-factory.ts" &&
			ref.imported === "bootAgentLayer" && moduleBase(ref.module) === "agent-layer-boot";
		let hit = false;
		const visit = (child: ts.Node): void => {
			if (hit) return;
			if (ts.isCallExpression(child)) {
				if (ts.isIdentifier(child.expression)) {
					const name = child.expression.text;
					if (forbiddenSymbols.has(name)) { hit = true; return; }
					const ref = unit.imports.get(name);
					if (ref && forbiddenModules.has(moduleBase(ref.module)) && forbiddenSymbols.has(ref.imported)) { hit = true; return; }
					if (ref?.file && !isCompositionBoot(ref) && symbolReaches(ref.file, ref.imported, stack)) { hit = true; return; }
				}
				if (ts.isPropertyAccessExpression(child.expression)) {
					const owner = child.expression.expression;
					const name = child.expression.name.text;
					if (forbiddenSymbols.has(name)) { hit = true; return; }
					if (ts.isIdentifier(owner)) { const ref = unit.namespaces.get(owner.text); if (ref?.file && symbolReaches(ref.file, name, stack)) { hit = true; return; } }
				}
			}
			ts.forEachChild(child, visit);
		};
		visit(node); return hit;
	};
	const symbolReaches = (file: string, symbol: string, stack: Set<string>): boolean => {
		const key = `${file}#${symbol}`; const known = memo.get(key); if (known !== undefined) return known;
		if (stack.has(key)) return false;
		const unit = units.get(file); const node = unit?.exports.get(symbol); if (!unit || !node) return false;
		const next = new Set(stack).add(key); const result = reaches(file, node, next); memo.set(key, result); return result;
	};

	return candidates.flatMap((abs) => {
		const rel = relative(root, abs); if (agentFiles.has(rel)) return [];
		const unit = units.get(abs)!;
		if (!reaches(abs, unit.ast, new Set())) return [];
		return [{ file: rel, reason: "calls or transitively imports a forbidden agent handoff flow" }];
	});
}

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au9-guard-"));
	const sources: Record<string, string> = {
		"packages/server/src/services/trigger-resolution.ts": "export const createTriggeredAgentSessionRequest = () => 1;",
		"packages/server/src/services/agent-run-boundary.ts": "export const executeAgentRunRequest = () => 1;",
		"packages/server/src/services/session-provisioning.ts": "export const provisionSession = () => 1;",
		"packages/server/src/services/agent-work-handoff.ts": 'import { createTriggeredAgentSessionRequest } from "./trigger-resolution.js"; export const handoff = () => createTriggeredAgentSessionRequest();',
		"packages/server/src/services/wrapper.ts": 'import { handoff } from "./agent-work-handoff.js"; export const renamed = () => handoff();',
		"packages/server/src/routes/wrapped.ts": 'import { renamed } from "../services/wrapper.js"; renamed();',
		"packages/server/src/routes/bad.ts": 'import { createTriggeredAgentSessionRequest as start } from "../services/trigger-resolution.js"; start();',
		"packages/server/src/app-runtime/services/bad.ts": 'import * as run from "../../services/agent-run-boundary.js"; run.executeAgentRunRequest();',
		"packages/server/src/services/agent-work-intent-worker.ts": 'import { handoff } from "./agent-work-handoff.js"; export const drain = () => handoff();',
		"packages/server/src/services/agent-layer-boot.ts": 'import { drain } from "./agent-work-intent-worker.js"; export const bootAgentLayer = () => drain(); export const readStatus = () => "ready";',
		"packages/server/src/server-factory.ts": 'import { bootAgentLayer } from "./services/agent-layer-boot.js"; bootAgentLayer();',
		"packages/server/src/routes/boot-abuse.ts": 'import { bootAgentLayer } from "../services/agent-layer-boot.js"; bootAgentLayer();',
		"packages/server/src/routes/read.ts": 'import { readStatus } from "../services/agent-layer-boot.js"; readStatus();',
		"packages/server/src/routes/good.ts": 'import { recordAgentWorkIntent } from "../services/agent-work-intents.js"; recordAgentWorkIntent();',
		"packages/server/src/services/agent-work-intents.ts": "export const recordAgentWorkIntent = () => 1;",
	};
	try {
		for (const [path, source] of Object.entries(sources)) { const abs = join(root, path); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, source); }
		const findings = inspect(root).map((finding) => finding.file);
		for (const expected of ["packages/server/src/routes/bad.ts", "packages/server/src/app-runtime/services/bad.ts", "packages/server/src/services/wrapper.ts", "packages/server/src/routes/wrapped.ts", "packages/server/src/routes/boot-abuse.ts"])
			if (!findings.includes(expected)) throw new Error(`fixture guard missed ${expected}`);
		for (const allowed of ["packages/server/src/services/agent-work-handoff.ts", "packages/server/src/services/agent-work-intent-worker.ts", "packages/server/src/server-factory.ts", "packages/server/src/routes/read.ts", "packages/server/src/routes/good.ts"])
			if (findings.includes(allowed)) throw new Error(`fixture guard rejected allowed ${allowed}`);
		process.stdout.write("au9-direct-handoff-guard fixtures: PASS\n");
	} finally { rmSync(root, { recursive: true, force: true }); }
}

if (process.argv.includes("--fixtures")) fixtureCheck();
else { const findings = inspect(process.cwd()); for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`); if (findings.length) { process.stderr.write(`au9-direct-handoff-guard: ${findings.length} finding(s)\n`); process.exit(1); } process.stdout.write("au9-direct-handoff-guard: PASS\n"); }
