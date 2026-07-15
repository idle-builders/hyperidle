#!/usr/bin/env tsx
/**
 * AU11 AC-1 + AC-2 guard: the former `app-runtime/` transitional runtime
 * shell must never reappear (no path segment, no barrel, no
 * `bootstrapAppRuntime`, no `./app-runtime` package export — AC-1), and
 * CORE routes/domain services must not import harness adapters, MCP bridge
 * registries, provisioning internals, context assembly, tool execution, or
 * agent lifecycle implementation details (AC-2).
 *
 * AC-2 mechanics mirror au10-plugin-config-ownership-guard.ts's MODULE-IMPORT
 * reachability (not au9's SYMBOL-CALL reachability) — walked from every
 * CORE-classified production file under routes/services/knowledge/
 * notifications/config, stopping at the agent-owned boundary (an edge into
 * an agent-owned file is a legitimate core→agent call, not inspected
 * further — going deeper would conflate "core depends on agent" [AC-3
 * allowed] with "core depends on harness" [AC-2 forbidden], since
 * agent-owned code legitimately imports harness/mcp/tool-registry itself).
 *
 * The agent-owned allowlist = AU9's `agentFiles` set (au9-direct-handoff-
 * guard.ts) UNION this WP's 14 agent-owned files UNION the builtin-routines
 * handler-split file UNION the two AC-2 "still-direct execution" relocations
 * (worker-ws.ts, mcp-route.ts — see their own @lore comments for why).
 *
 * Type-only imports of the agent-owned `contracts.ts` are implicitly
 * allowed (not itself a forbidden module/path).
 *
 * @lore AU16: the former hand-verified DESCRIPTOR_READ_ALLOWLIST (8 route
 * files permitted to `import type` AdapterPool/SandboxAdapter for read-only
 * capability queries) is retired. Those routes now read harness/worker
 * capability data through the agent-owned
 * `services/harness-capability-read-model.ts` boundary module — a normal
 * core→agent-owned edge, sanctioned the same way as any other AGENT_OWNED_ALLOWLIST
 * sink. No core route may import `harness/`/`mcp/` directly anymore, type-only
 * or otherwise.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const SRC = "packages/server/src";

// --- AC-1: transitional-shell reappearance ---

const BOOTSTRAP_SYMBOL = "bootstrapAppRuntime";

// --- AC-2: agent-owned allowlist (core vs agent within shared services/) ---

/**
 * AU9's agent-owned handoff set (au9-direct-handoff-guard.ts `agentFiles`).
 *
 * @lore AU19 Increment 3c: `agent-run-boundary.ts`/`agent-session-runtime.ts`/
 * `agent-layer-boot.ts` moved to `@hyperidle/run-orchestration` (out of this
 * guard's scanned `packages/server/src` tree entirely, same as
 * `agent-work-intent-worker.ts`/`agent-session-requests.ts` did in
 * Increment 3b) — the three entries below are now harmless dead allowlist
 * rows, not errors.
 *
 * @lore AU19 Increment 3i: `session-provisioning.ts` moved to
 * `@hyperidle/session-lifecycle` (out of this guard's scanned
 * `packages/server/src` tree entirely) — that entry below is now a harmless
 * dead allowlist row, not an error.
 */
const AU9_AGENT_FILES = [
	"packages/server/src/services/agent-work-handoff.ts",
	"packages/server/src/services/agent-work-intent-worker.ts",
	"packages/server/src/services/agent-session-requests.ts",
	"packages/server/src/services/agent-run-boundary.ts",
	"packages/server/src/services/agent-session-runtime.ts",
	"packages/server/src/services/session-provisioning.ts",
	"packages/server/src/services/agent-layer-boot.ts",
	"packages/server/src/services/agent-work-assistant.ts",
];

/**
 * AU11's 14 agent-owned files (joined AU9's set in server/src/services/).
 *
 * @lore AU19 Increment 3f: `writeback.ts` moved to
 * `@hyperidle/capture-writeback` (out of this guard's scanned
 * `packages/server/src` tree entirely, same shape as Increment 3c's three
 * `run-orchestration` moves above) — that entry is now a harmless dead
 * allowlist row, not an error. `file-watcher.ts` below never lived in
 * `packages/server` (it was always `@hyperidle/filesystems`' own file since
 * Increment 2b) — also a pre-existing dead row, unrelated to this migration.
 *
 * @lore AU19 Increment 3 (context-assembly finalize): `context-assembly.ts`/
 * `context-assembly-prompt.ts`/`session-context.ts` moved to
 * `@hyperidle/context-assembly` (out of this guard's scanned
 * `packages/server/src` tree entirely, same shape as `writeback.ts` above)
 * — those three entries are now harmless dead allowlist rows, not errors.
 * `contracts.ts`/`routine-session-reaper.ts`/`sandbox-reaper.ts` moved to
 * `@hyperidle/session-lifecycle` (out of this guard's scanned tree entirely)
 * — those three entries below are now harmless dead allowlist rows, not
 * errors.
 */
const AU11_AGENT_FILES = [
	"packages/server/src/services/context-assembly.ts",
	"packages/server/src/services/context-assembly-prompt.ts",
	"packages/server/src/services/session-context.ts",
	"packages/server/src/services/writeback.ts",
	"packages/server/src/services/file-watcher.ts",
	"packages/server/src/services/roster.ts",
	"packages/server/src/services/contracts.ts",
	"packages/server/src/services/agent-selection.ts",
	"packages/server/src/services/task-dispatcher.ts",
	"packages/server/src/services/assistant-dispatcher.ts",
	"packages/server/src/services/cost-cap.ts",
	"packages/server/src/services/cost-sentinel.ts",
	"packages/server/src/services/routine-session-reaper.ts",
	"packages/server/src/services/sandbox-reaper.ts",
];

/**
 * The builtin-routines handler-split file (agent-owned per the AU11
 * builtin-routines split — see config/builtin-routines.ts vs this file) and
 * the two AC-2 "still-direct execution" route relocations.
 *
 * @lore AU19 Increment 3c: `worker-ws.ts` moved to
 * `@hyperidle/run-orchestration` (out of this guard's scanned
 * `packages/server/src` tree entirely) — that entry below is now a harmless
 * dead allowlist row, not an error. `mcp-route.ts` is unaffected (not part
 * of this migration).
 */
const AU11_EXTRA_AGENT_FILES = [
	"packages/server/src/services/builtin-routine-handlers.ts",
	"packages/server/src/services/worker-ws.ts",
	"packages/server/src/services/mcp-route.ts",
];

/**
 * AU16: the harness/worker capability read-model — the agent-owned boundary
 * module the former 8-file DESCRIPTOR_READ_ALLOWLIST routes now read through
 * instead of importing `harness/` directly.
 */
const AU16_AGENT_FILES = ["packages/server/src/services/harness-capability-read-model.ts"];

/**
 * AU19 Increment 3b: `session-requests-bindings.ts` — the composition-root
 * wiring file for `@hyperidle/session-requests` (same factory-curry role AU9's
 * `agent-work-intent-worker.ts` had pre-move) — re-exports
 * `executeAgentRunRequest as consumeAgentSessionRequest` from the
 * forbidden-basename `agent-run-boundary.js`, a legitimate agent-owned edge,
 * not a core→execution-internal leak.
 */
/**
 * AU19 Increment 3c: `run-orchestration-bindings.ts` — the composition-root
 * wiring file for `@hyperidle/run-orchestration` (same factory-curry role
 * `session-requests-bindings.ts` has for `@hyperidle/session-requests`,
 * `agent-run-boundary.ts`/`agent-layer-boot.ts`/`worker-ws.ts` had pre-move)
 * — wires the `sessionLifecycle`/`sessionProvisioner`/`dispatch`/
 * `harness-registry` INTERIM ports directly to their still-flat
 * `session-lifecycle.js`/`session-provisioning.js`/`agent-work-assistant.js`/
 * `harness/adapter-pool.js`/`harness/remote-harness-adapter.js` real
 * implementations — a legitimate agent-owned edge, not a
 * core→execution-internal leak.
 */
/**
 * AU19 Increment 3h: `dispatch-bindings.ts` — the composition-root wiring
 * file for `@hyperidle/dispatch` (same factory-curry role
 * `session-requests-bindings.ts`/`run-orchestration-bindings.ts` have) —
 * wires the `toolHandlers`/`workspaceFactory` INTERIM ports directly to
 * their still-flat `tools/assistant-draft-registry.js`/
 * `harness/local-sandbox-adapter.js` real implementations, and calls
 * `run-orchestration-bindings.ts`'s `executeAgentRunRequest` (forbidden
 * basename `agent-run-boundary`) for `dispatch`'s own `runOrchestration`
 * port — a legitimate agent-owned edge, not a core→execution-internal leak.
 * `routes/routines-routes.ts`/`routes/teams-routes.ts` (and other core
 * routes) reach this file to call `provisionTeamRoutines`/`runBuiltinRoutine`/
 * `checkAndFireRoutine`/etc — the sink stops recursion here exactly like the
 * two entries above.
 *
 * @lore AU19 Increment 3i: `session-lifecycle-bindings.ts` — the
 * composition-root wiring file for `@hyperidle/session-lifecycle` (same
 * factory-curry role the three entries above have) — wires the
 * `harnessRuntime`/`mcpProvider`/`toolProvider` INTERIM ports directly to
 * their still-flat `harness/*`/`mcp/*`/`tools/tool-registry.ts` real
 * implementations, and its `contextAssembly` port to
 * `context-assembly-bindings.ts`'s real bound ops — a legitimate agent-owned
 * edge, not a core→execution-internal leak. `routes/sessions-routes.ts`
 * (and other core routes) reach this file to call `admitSession`/`runSession`/
 * `provisionSession`/`requestAgentTermination`/etc — the sink stops
 * recursion here exactly like the entries above.
 *
 * @lore AU19 Increment 3 (context-assembly finalize): `context-assembly-bindings.ts`
 * — the composition-root wiring file for `@hyperidle/context-assembly` (same
 * factory-curry role the four entries above have) — imports `@hyperidle/context-assembly`
 * directly (module basename `context-assembly`, one of `FORBIDDEN_MODULE_BASENAMES`
 * above), so it must be agent-owned-allowlisted itself, same as every other
 * `*-bindings.ts` composition-root file. `session-lifecycle-bindings.ts`
 * (already agent-owned) and `__tests__/R7-knowledge-e2e.integration.test.ts`
 * (test file, out of this guard's scan entirely) are its only real
 * consumers today.
 */
const AU19_AGENT_FILES = [
	"packages/server/src/services/session-requests-bindings.ts",
	"packages/server/src/services/run-orchestration-bindings.ts",
	"packages/server/src/services/dispatch-bindings.ts",
	"packages/server/src/services/session-lifecycle-bindings.ts",
	"packages/server/src/services/context-assembly-bindings.ts",
];

const AGENT_OWNED_ALLOWLIST = new Set([
	...AU9_AGENT_FILES,
	...AU11_AGENT_FILES,
	...AU11_EXTRA_AGENT_FILES,
	...AU16_AGENT_FILES,
	...AU19_AGENT_FILES,
]);

/** Agent lifecycle internals, provisioning internals, tool execution, context assembly. */
const FORBIDDEN_MODULE_BASENAMES = new Set([
	"session-provisioning",
	"agent-session-runtime",
	"agent-run-boundary",
	"agent-session-requests",
	"connection-provisioning",
	"agent-layer-boot",
	"agent-work-handoff",
	"agent-work-intent-worker",
	"trigger-resolution",
	"agent-work-assistant",
	"tool-registry",
	"context-assembly",
	"context-assembly-prompt",
	"session-context",
]);

/** Harness adapters + MCP bridge registries. */
const FORBIDDEN_PATH_PREFIXES = ["harness/", "mcp/"];

/** CORE production roots scanned for AC-2 (agent-owned files excluded). */
const CORE_SCAN_ROOTS = ["routes", "services", "knowledge", "notifications", "config"];

interface Finding {
	readonly file: string;
	readonly reason: string;
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full));
		} else if ([".ts", ".tsx"].includes(extname(entry.name))) {
			out.push(full);
		}
	}
	return out;
}

function productionFile(rel: string): boolean {
	return (
		!rel.includes("/__tests__/") &&
		!/\.(?:test|spec)\.tsx?$/.test(rel) &&
		!rel.includes(".integration.test.")
	);
}

function localModule(from: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const base = resolve(dirname(from), specifier.replace(/\.js$/, ""));
	for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
		if (existsSync(base + suffix)) return base + suffix;
	}
	return undefined;
}

interface ImportEdge {
	readonly specifier: string;
	readonly resolvedFile?: string;
	readonly isTypeOnly: boolean;
}

function parseImports(abs: string): ImportEdge[] {
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const edges: ImportEdge[] = [];
	for (const stmt of ast.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		if (!stmt.moduleSpecifier || !ts.isStringLiteralLike(stmt.moduleSpecifier)) continue;
		const specifier = stmt.moduleSpecifier.text;
		const resolvedFile = localModule(abs, specifier);
		const wholeTypeOnly = stmt.importClause?.isTypeOnly ?? false;
		const clause = stmt.importClause;
		// A declaration is treated as type-only for our purposes only when EVERY
		// binding it introduces is type-only (whole-decl `import type` OR every
		// named specifier individually marked `type`) — a mixed import still
		// carries a real value dependency.
		let allSpecifiersTypeOnly = true;
		if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			for (const el of clause.namedBindings.elements) {
				if (!el.isTypeOnly) allSpecifiersTypeOnly = false;
			}
		} else if (clause?.name || (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings))) {
			// default or namespace import — cannot be individually type-marked.
			allSpecifiersTypeOnly = false;
		}
		const isTypeOnly = wholeTypeOnly || (clause !== undefined && allSpecifiersTypeOnly);
		edges.push({ specifier, resolvedFile, isTypeOnly });
	}
	return edges;
}

function moduleBase(specifier: string): string {
	return specifier.replace(/\.js$/, "").split("/").at(-1) ?? specifier;
}

export function inspect(root: string): Finding[] {
	/**
	 * No allowlist branch here anymore (AU16) — a `harness/`/`mcp/` edge is
	 * forbidden from ANY scanned core file, type-only or not. The only
	 * sanctioned way for a core file to reach harness/mcp is transitively,
	 * through an AGENT_OWNED_ALLOWLIST sink (checked by the caller before
	 * `forbiddenEdge` is even consulted — see `reaches()`).
	 */
	function forbiddenEdge(edge: ImportEdge): boolean {
		if (FORBIDDEN_MODULE_BASENAMES.has(moduleBase(edge.specifier))) return true;
		return (
			FORBIDDEN_PATH_PREFIXES.some((prefix) => edge.specifier.includes(prefix)) ||
			(edge.resolvedFile !== undefined &&
				FORBIDDEN_PATH_PREFIXES.some((prefix) =>
					relative(root, edge.resolvedFile as string).split("\\").join("/").includes(prefix),
				))
		);
	}

	const findings: Finding[] = [];
	const importCache = new Map<string, ImportEdge[]>();
	function importsOf(abs: string): ImportEdge[] {
		let edges = importCache.get(abs);
		if (!edges) {
			edges = parseImports(abs);
			importCache.set(abs, edges);
		}
		return edges;
	}

	// --- AC-1: no app-runtime path / barrel / bootstrapAppRuntime / package export ---

	const allProdFiles = walk(join(root, "packages")).filter((abs) =>
		productionFile(relative(root, abs)),
	);
	const uniqueFiles = [...new Set(allProdFiles)];

	for (const abs of uniqueFiles) {
		const rel = relative(root, abs).split("\\").join("/");
		if (rel.includes("app-runtime/")) {
			findings.push({ file: rel, reason: "app-runtime path segment must not exist (AC-1)" });
			continue;
		}
		const text = readFileSync(abs, "utf8");
		// AST identifier scan (not a raw text regex) so a @lore comment
		// documenting the historical split (e.g. "formerly bootstrapAppRuntime")
		// doesn't false-positive — only real CODE use of the symbol counts.
		if (new RegExp(`\\b${BOOTSTRAP_SYMBOL}\\b`).test(text)) {
			const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
			let usesSymbol = false;
			const visit = (node: ts.Node): void => {
				if (usesSymbol) return;
				if (ts.isIdentifier(node) && node.text === BOOTSTRAP_SYMBOL) {
					usesSymbol = true;
					return;
				}
				ts.forEachChild(node, visit);
			};
			visit(ast);
			if (usesSymbol) {
				findings.push({
					file: rel,
					reason:
						"bootstrapAppRuntime must not exist — split into registerCoreDomainServices/registerAgentLayerServices (AC-1)",
				});
			}
		}
	}

	const packageJsonPath = join(root, "packages/server/package.json");
	if (existsSync(packageJsonPath)) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { exports?: Record<string, string> };
		if (pkg.exports && "./app-runtime" in pkg.exports) {
			findings.push({ file: "packages/server/package.json", reason: "./app-runtime export must not exist (AC-1)" });
		}
	}

	// The curated `src/routines.ts` cross-package export is allowlisted — it
	// must re-export EXACTLY the three routine functions, never regrowing
	// into a grouping barrel (AC-1/AC-4).
	const routinesTsPath = join(root, "packages/server/src/routines.ts");
	if (existsSync(routinesTsPath)) {
		const text = readFileSync(routinesTsPath, "utf8");
		const ast = ts.createSourceFile(routinesTsPath, text, ts.ScriptTarget.Latest, true);
		const exported = new Set<string>();
		for (const stmt of ast.statements) {
			if (!ts.isExportDeclaration(stmt)) continue;
			if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;
			for (const el of stmt.exportClause.elements) exported.add(el.name.text);
		}
		const allowed = new Set(["checkAndFireRoutine", "provisionTeamRoutines", "runBuiltinRoutine"]);
		const extra = [...exported].filter((name) => !allowed.has(name));
		const missing = [...allowed].filter((name) => !exported.has(name));
		if (extra.length > 0 || missing.length > 0) {
			findings.push({
				file: "packages/server/src/routines.ts",
				reason: `must re-export exactly {checkAndFireRoutine, provisionTeamRoutines, runBuiltinRoutine} — found extra:[${extra.join(",")}] missing:[${missing.join(",")}] (AC-1/AC-4: not a grouping barrel)`,
			});
		}
	}

	// --- AC-2: core routes/domain services must not reach execution internals ---

	const coreSourceFiles: string[] = [];
	for (const dir of CORE_SCAN_ROOTS) {
		for (const abs of walk(join(root, SRC, dir))) {
			const rel = relative(root, abs).split("\\").join("/");
			if (!productionFile(rel)) continue;
			if (AGENT_OWNED_ALLOWLIST.has(rel)) continue;
			coreSourceFiles.push(abs);
		}
	}

	function reaches(abs: string, visited: Set<string>): boolean {
		if (visited.has(abs)) return false;
		visited.add(abs);
		for (const edge of importsOf(abs)) {
			const edgeRel = edge.resolvedFile ? relative(root, edge.resolvedFile).split("\\").join("/") : undefined;
			// Agent-owned sink: importing it is the AC-3-sanctioned core→agent
			// call. Skip BOTH the forbidden-basename check and recursion — an
			// agent-owned file legitimately imports harness/mcp/tool-registry
			// itself; that must never leak back onto the calling core file.
			if (edgeRel && AGENT_OWNED_ALLOWLIST.has(edgeRel)) continue;
			if (forbiddenEdge(edge)) return true;
			// A type-only edge is erased at compile time — it carries zero
			// runtime import-graph presence, so its own imports are never
			// "reached" by the original file. Recursing into it would wrongly
			// attribute a type-only dependency's VALUE imports (e.g. a
			// descriptor-read file's `import type { AdapterPool }` reaching
			// into adapter-pool.ts's own internal value imports) back onto the
			// core file that only ever touched the type.
			if (edge.isTypeOnly) continue;
			if (!edge.resolvedFile) continue;
			if (reaches(edge.resolvedFile, visited)) return true;
		}
		return false;
	}

	for (const abs of coreSourceFiles) {
		const rel = relative(root, abs).split("\\").join("/");
		if (reaches(abs, new Set())) {
			findings.push({
				file: rel,
				reason: "core route/domain service imports (directly or transitively) a forbidden execution-internal module (AC-2)",
			});
		}
	}

	return findings;
}

// --- fixtures self-test ---

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au11-guard-"));
	const sources: Record<string, string> = {
		// (a) direct forbidden path-prefix import (harness) in a non-allowlisted core route → finding.
		// AU16: agent-profile.ts (formerly the DESCRIPTOR_READ_ALLOWLIST example) now
		// proves the OPPOSITE — a route importing harness/ directly, type-only or not,
		// is a finding post-allowlist-deletion. bad-route.ts keeps the same assertion.
		"packages/server/src/routes/bad-route.ts":
			'import type { AdapterPool } from "../harness/adapter-pool.js"; export function f(pool: AdapterPool) { return pool; }',
		"packages/server/src/harness/adapter-pool.ts": "export interface AdapterPool { size: number; }",
		"packages/server/src/routes/agent-profile.ts":
			'import type { AdapterPool } from "../harness/adapter-pool.js"; export function g(pool: AdapterPool) { return pool.size; }',
		// (b) AU16: the sanctioned pattern — a route reads harness data through the
		// agent-owned read-model sink instead of importing harness/ itself. The
		// read-model file legitimately imports harness/ internally (agent-owned sink);
		// that must not leak back onto the calling route.
		"packages/server/src/services/harness-capability-read-model.ts":
			'import type { AdapterPool } from "../harness/adapter-pool.js"; export function readSize(pool: AdapterPool) { return pool.size; }',
		"packages/server/src/routes/good-read-model-route.ts":
			'import { readSize } from "../services/harness-capability-read-model.js"; export function h(pool: { size: number }) { return readSize(pool as never); }',
		// (c) direct forbidden module-basename value import → finding. tool-registry
		// is NOT agent-owned-allowlisted (real tools/tool-registry.ts stays core-
		// adjacent but forbidden as a core-route/domain dependency — AC-2 tool
		// execution), unlike session-provisioning which IS agent-owned (AU9).
		"packages/server/src/services/bad-service.ts":
			'import { ALL_TOOLS } from "./tool-registry.js"; export const x = () => ALL_TOOLS;',
		"packages/server/src/services/tool-registry.ts": "export const ALL_TOOLS = [];",
		// (d) transitive forbidden leak via ANOTHER core file (not agent-owned) → finding on the originating file.
		"packages/server/src/services/wrapper-core.ts":
			'import { ALL_TOOLS } from "./tool-registry.js"; export const wrapped = () => ALL_TOOLS;',
		"packages/server/src/routes/transitive-bad.ts":
			'import { wrapped } from "../services/wrapper-core.js"; wrapped();',
		// (e) core → agent-owned (context-assembly.ts) call — legitimate, must NOT flag, even though
		// context-assembly.ts itself imports harness-shaped things internally (not inspected further).
		"packages/server/src/services/context-assembly.ts":
			'import type { AdapterPool } from "../harness/adapter-pool.js"; export function assembleContext(pool: AdapterPool) { return pool; }',
		"packages/server/src/services/good-core-caller.ts":
			'import { assembleContext } from "./context-assembly.js"; export const call = (p: unknown) => assembleContext(p as never);',
		// (f) AC-1: app-runtime path resurrected → finding.
		"packages/server/src/app-runtime/index.ts": "export const x = 1;",
		// (g) AC-1: bootstrapAppRuntime symbol resurrected → finding.
		"packages/server/src/server-factory.ts": "export function bootstrapAppRuntime() { return []; }",
	};
	try {
		for (const [path, source] of Object.entries(sources)) {
			const abs = join(root, path);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, source);
		}
		writeFileSync(
			join(root, "packages/server/package.json"),
			JSON.stringify({ exports: { "./app-runtime": "./src/app-runtime/index.ts" } }),
		);
		const findings = inspect(root).map((f) => f.file);
		for (const expected of [
			"packages/server/src/routes/bad-route.ts",
			// AU16: post-allowlist-deletion, a route's own type-only harness/ import
			// is a finding — even the file that used to be the allowlist example.
			"packages/server/src/routes/agent-profile.ts",
			"packages/server/src/services/bad-service.ts",
			"packages/server/src/routes/transitive-bad.ts",
			"packages/server/src/app-runtime/index.ts",
			"packages/server/src/server-factory.ts",
			"packages/server/package.json",
		])
			if (!findings.includes(expected)) throw new Error(`fixture guard missed ${expected}`);
		for (const allowed of [
			"packages/server/src/services/context-assembly.ts",
			"packages/server/src/services/good-core-caller.ts",
			// AU16: route→read-model (agent-owned sink) is the sanctioned pattern —
			// must NOT be flagged even though the read-model imports harness/ itself.
			"packages/server/src/routes/good-read-model-route.ts",
		])
			if (findings.includes(allowed)) throw new Error(`fixture guard rejected allowed ${allowed}`);
		process.stdout.write("au11-runtime-ownership-guard fixtures: PASS\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`au11-runtime-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au11-runtime-ownership-guard: PASS\n");
}
