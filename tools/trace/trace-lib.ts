import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

export const EVENTS_FILE = "framework/domain-model/src/events.ts";
export const SCHEMA_FILE = "framework/db/src/schema.ts";

export function schemaTableSymbols(): Set<string> {
	const sf = parse(SCHEMA_FILE);
	const out = new Set<string>();
	for (const stmt of sf.statements) {
		if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations) {
				if (
					ts.isIdentifier(d.name) &&
					d.initializer &&
					ts.isCallExpression(d.initializer) &&
					ts.isIdentifier(d.initializer.expression) &&
					/pgTable/.test(d.initializer.expression.text)
				) {
					out.add(d.name.text);
				}
			}
		}
	}
	return out;
}

export function toSnake(name: string): string {
	return name.replace(/([A-Z])/g, "_$1").toLowerCase();
}

export function knownEventTypes(): Set<string> {
	const src = readFileSync(EVENTS_FILE, "utf8");
	const out = new Set<string>();
	for (const m of src.matchAll(/type:\s*"([a-z_]+)"/g)) out.add(m[1]);
	return out;
}

export function isDevelopment(path: string): boolean {
	if (/\.(test|spec|stories)\.tsx?$/.test(path)) return true;
	if (path.split("/").some((s) => s.startsWith("__"))) return true;
	if (/\/(vitest|playwright)[^/]*\.config\./.test(path)) return true;
	return false;
}

export function productionFiles(): string[] {
	const raw = execFileSync("git", ["ls-files", "layers", "framework", "applications"], {
		encoding: "utf8",
	});
	return raw
		.split("\n")
		.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
		.filter((f) => !isDevelopment(f));
}

const sfCache = new Map<string, ts.SourceFile>();
export function parse(file: string): ts.SourceFile {
	let sf = sfCache.get(file);
	if (!sf) {
		sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
		sfCache.set(file, sf);
	}
	return sf;
}

export function lineOf(sf: ts.SourceFile, pos: number): number {
	return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

export function enclosingName(node: ts.Node): string {
	let cur: ts.Node | undefined = node.parent;
	while (cur) {
		if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
		if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
		if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
		if (ts.isPropertyAssignment(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
		cur = cur.parent;
	}
	return "(top-level)";
}

export function unwrap(expr: ts.Expression): ts.Expression {
	let e = expr;
	while (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e))
		e = e.expression;
	return e;
}

export function literalTypeOfObject(obj: ts.Expression): string | null {
	const o = unwrap(obj);
	if (!ts.isObjectLiteralExpression(o)) return null;
	const typeProp = o.properties
		.filter((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p))
		.find((p) => ts.isIdentifier(p.name) && p.name.text === "type");
	const init = typeProp?.initializer;
	return init && ts.isStringLiteralLike(init) ? init.text : null;
}

export function localVarTypes(sf: ts.SourceFile): Map<string, string> {
	const map = new Map<string, string>();
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			const t = literalTypeOfObject(node.initializer);
			if (t) map.set(node.name.text, t);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return map;
}

const assignedTypesCache = new Map<string, Map<string, string[]>>();
export function assignedEventTypes(sf: ts.SourceFile): Map<string, string[]> {
	const cached = assignedTypesCache.get(sf.fileName);
	if (cached) return cached;
	const map = new Map<string, string[]>();
	const visit = (node: ts.Node): void => {
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(node.left)
		) {
			const t = literalTypeOfObject(node.right);
			if (t) {
				const list = map.get(node.left.text) ?? [];
				list.push(t);
				map.set(node.left.text, list);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	assignedTypesCache.set(sf.fileName, map);
	return map;
}

export type EventLabel =
	| { kind: "literal"; text: string; inferred: boolean }
	| { kind: "dynamic"; expr: string };

export function eventTypeLabel(
	arg: ts.Expression | undefined,
	sf: ts.SourceFile,
	locals: Map<string, string>,
): EventLabel | null {
	if (!arg) return null;
	if (ts.isStringLiteralLike(arg)) return { kind: "literal", text: arg.text, inferred: false };
	const unwrapped = unwrap(arg);
	if (ts.isObjectLiteralExpression(unwrapped)) {
		const t = literalTypeOfObject(unwrapped);
		if (t) return { kind: "literal", text: t, inferred: false };
		return { kind: "dynamic", expr: arg.getText(sf) };
	}
	if (ts.isIdentifier(unwrapped)) {
		const resolved = locals.get(unwrapped.text);
		if (resolved) return { kind: "literal", text: resolved, inferred: true };
		return { kind: "dynamic", expr: unwrapped.text };
	}
	return { kind: "dynamic", expr: arg.getText(sf) };
}

// ── doors ────────────────────────────────────────────────────────────────────

export interface Door {
	kind: "ui" | "agent" | "scheduler";
	label: string;
	file: string;
	line: number;
	detail: string;
	anchor: ts.Node | null;
}

export const rel = (p: string): string =>
	p.startsWith(process.cwd() + "/") ? p.slice(process.cwd().length + 1) : p;

const HTTP_METHODS = new Set(["get", "post", "patch", "delete", "put", "all", "head", "options"]);

function importMap(sf: ts.SourceFile): Map<string, string> {
	const imports = new Map<string, string>();
	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const spec = stmt.moduleSpecifier.text;
			const bindings = stmt.importClause?.namedBindings;
			if (bindings && ts.isNamedImports(bindings)) {
				for (const el of bindings.elements) imports.set(el.name.text, spec);
			}
		}
	}
	return imports;
}

function resolveSpec(fromFile: string, spec: string): string | null {
	if (!spec.startsWith(".")) return null;
	const base = resolve(dirname(fromFile), spec.replace(/\.js$/, ""));
	for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
		if (existsSync(cand)) return cand;
	}
	return null;
}

function findFunction(sf: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
	const matches = sf.statements.filter(
		(s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name,
	);
	return matches.find((m) => m.body !== undefined) ?? matches[0];
}

function findInstanceVar(sf: ts.SourceFile, name: string): boolean {
	return sf.statements.some(
		(s) =>
			ts.isVariableStatement(s) &&
			s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name),
	);
}

export function joinPath(prefix: string, path: string): string {
	const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
	const s = path.startsWith("/") ? path : `/${path}`;
	return `${p}${s}`;
}

export function collectDoors(): Door[] {
	const doors: Door[] = [];
	const visited = new Set<string>();

	const extractScope = (
		file: string,
		scope: ts.Node,
		prefix: string,
		baseOnly: string | null,
	): void => {
		const sf = parse(file);
		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const name = node.expression.name.text;
				const base = node.expression.expression;
				const baseOk = ts.isIdentifier(base) && (baseOnly === null || base.text === baseOnly);
				if (baseOk && name === "route") {
					const [prefixArg, targetArg] = node.arguments;
					if (prefixArg && ts.isStringLiteralLike(prefixArg) && targetArg) {
						const target = ts.isCallExpression(targetArg) ? targetArg.expression : targetArg;
						if (ts.isIdentifier(target)) {
							const sub = joinPath(prefix, prefixArg.text);
							const key = `${file}:${target.text}:${sub}`;
							if (!visited.has(key)) {
								visited.add(key);
								followMount(file, target.text, sub);
							}
						}
					}
				} else if (baseOk && HTTP_METHODS.has(name)) {
					const pathArg = node.arguments[0];
					if (pathArg && ts.isStringLiteralLike(pathArg) && pathArg.text.startsWith("/")) {
						doors.push({
							kind: "ui",
							label: `${name.toUpperCase().padEnd(6)} ${joinPath(prefix, pathArg.text)}`,
							file,
							line: lineOf(sf, node.getStart(sf)),
							detail: "route",
							anchor: node,
						});
					}
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(scope);
	};

	const followMount = (fromFile: string, name: string, prefix: string): void => {
		const sf = parse(fromFile);
		const spec = importMap(sf).get(name);
		const targetFile = spec
			? resolveSpec(fromFile, spec)
			: findFunction(sf, name)
				? fromFile
				: null;
		if (!targetFile) {
			doors.push({
				kind: "ui",
				label: `MOUNT  ${prefix}/*`,
				file: fromFile,
				line: 0,
				detail: `${name} (unresolved)`,
				anchor: null,
			});
			return;
		}
		const tsf = parse(targetFile);
		const fn = findFunction(tsf, name);
		if (fn) {
			extractScope(targetFile, fn, prefix, null);
			return;
		}
		if (findInstanceVar(tsf, name)) {
			extractScope(targetFile, tsf, prefix, name);
			return;
		}
		doors.push({
			kind: "ui",
			label: `MOUNT  ${prefix}/*`,
			file: targetFile,
			line: 0,
			detail: `${name} (no definition found)`,
			anchor: null,
		});
	};

	for (const appFile of ["layers/core-api/src/app.ts", "layers/agent-orchestration/src/app.ts"]) {
		extractScope(appFile, parse(appFile), "/api", null);
	}

	const toolFile = "layers/agent-orchestration/tool-handlers/src/tool-definitions.ts";
	const tsf = parse(toolFile);
	const tvisit = (node: ts.Node): void => {
		if (
			ts.isPropertyAssignment(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "name" &&
			ts.isStringLiteralLike(node.initializer)
		) {
			const name = node.initializer.text;
			if (/^[a-z][a-z_]*$/.test(name)) {
				let fn = "(top-level)";
				let cur: ts.Node | undefined = node.parent;
				while (cur) {
					if (ts.isFunctionDeclaration(cur) && cur.name) {
						fn = cur.name.text;
						break;
					}
					cur = cur.parent;
				}
				doors.push({
					kind: "agent",
					label: `TOOL   ${name}`,
					file: toolFile,
					line: lineOf(tsf, node.getStart(tsf)),
					detail: fn,
					anchor: ts.isObjectLiteralExpression(node.parent) ? node.parent : node,
				});
			}
		}
		ts.forEachChild(node, tvisit);
	};
	tvisit(tsf);

	const workerFile = "layers/agent-orchestration/run-orchestration/src/worker-ingress.ts";
	const wsf = parse(workerFile);
	const wvisit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === "literal" &&
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === "z"
		) {
			const arg = node.arguments[0];
			if (arg && ts.isStringLiteralLike(arg)) {
				let schema = "(top-level)";
				let cur: ts.Node | undefined = node.parent;
				while (cur) {
					if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name)) {
						schema = cur.name.text;
						break;
					}
					cur = cur.parent;
				}
				doors.push({
					kind: "agent",
					label: `WORKER ${arg.text}`,
					file: workerFile,
					line: lineOf(wsf, node.getStart(wsf)),
					detail: schema,
					anchor: null,
				});
			}
		}
		ts.forEachChild(node, wvisit);
	};
	wvisit(wsf);

	for (const target of [
		{ file: "layers/agent-execution/harness-registry/src/mcp/mcp-route.ts", note: "mcp-router" },
		{ file: workerFile, note: "worker-ws" },
	]) {
		const sf = parse(target.file);
		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const name = node.expression.name.text;
				const base = node.expression.expression;
				if (HTTP_METHODS.has(name) && ts.isIdentifier(base)) {
					const pathArg = node.arguments[0];
					if (pathArg && ts.isStringLiteralLike(pathArg) && pathArg.text.startsWith("/")) {
						doors.push({
							kind: "agent",
							label: `HTTP   ${name.toUpperCase().padEnd(5)} /api${pathArg.text}`,
							file: target.file,
							line: lineOf(sf, node.getStart(sf)),
							detail: target.note,
							anchor: node,
						});
					}
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}

	for (const file of productionFiles()) {
		const sf = parse(file);
		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === "setInterval"
			) {
				const msArg = node.arguments[1];
				const ms = msArg ? msArg.getText(sf) : "?";
				doors.push({
					kind: "scheduler",
					label: `TICK   every ${ms}`,
					file,
					line: lineOf(sf, node.getStart(sf)),
					detail: enclosingName(node),
					anchor: node,
				});
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}

	return doors;
}

// ── symbol index (whole-program model) ───────────────────────────────────────

interface ResolvedSymbol {
	file: string;
	name: string;
}

let packageDirsCache: Map<string, string> | null = null;
function packageDirs(): Map<string, string> {
	if (packageDirsCache) return packageDirsCache;
	const map = new Map<string, string>();
	const raw = execFileSync("git", ["ls-files", "layers", "framework", "applications", "tools"], {
		encoding: "utf8",
	});
	for (const f of raw.split("\n")) {
		if (!f.endsWith("package.json")) continue;
		try {
			const json = JSON.parse(readFileSync(f, "utf8")) as { name?: string };
			if (json.name) map.set(json.name, dirname(f));
		} catch {
			// not JSON — ignore
		}
	}
	packageDirsCache = map;
	return map;
}

function packageEntry(pkg: string): string | null {
	const dir = packageDirs().get(pkg);
	if (!dir) return null;
	for (const cand of [`${dir}/src/index.ts`, `${dir}/src/index.tsx`]) {
		if (existsSync(cand)) return cand;
	}
	return null;
}

const resolvedSymbolCache = new Map<string, ResolvedSymbol | null>();
function resolveExport(file: string, symbol: string, depth = 0): ResolvedSymbol | null {
	const key = `${file}:${symbol}`;
	if (resolvedSymbolCache.has(key)) return resolvedSymbolCache.get(key) ?? null;
	if (depth > 5) return null;
	const sf = parse(file);
	let result: ResolvedSymbol | null = null;
	for (const stmt of sf.statements) {
		if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === symbol && stmt.body) {
			result = { file, name: symbol };
			break;
		}
		if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations) {
				if (ts.isIdentifier(d.name) && d.name.text === symbol) result = { file, name: symbol };
			}
			if (result) break;
		}
		if (
			ts.isExportDeclaration(stmt) &&
			stmt.exportClause &&
			ts.isNamedExports(stmt.exportClause) &&
			stmt.moduleSpecifier &&
			ts.isStringLiteral(stmt.moduleSpecifier)
		) {
			for (const el of stmt.exportClause.elements) {
				if (el.name.text === symbol) {
					const localName = el.propertyName ? el.propertyName.text : symbol;
					const target = resolveSpec(file, stmt.moduleSpecifier.text);
					if (target) result = resolveExport(target, localName, depth + 1);
					break;
				}
			}
			if (result) break;
		}
	}
	resolvedSymbolCache.set(key, result);
	return result;
}

interface ImportInfo {
	named: Map<string, { spec: string; origName: string }>;
	namespaces: Map<string, string>;
}
const importInfoCache = new Map<string, ImportInfo>();
function importInfo(file: string): ImportInfo {
	const cached = importInfoCache.get(file);
	if (cached) return cached;
	const info: ImportInfo = { named: new Map(), namespaces: new Map() };
	const sf = parse(file);
	for (const stmt of sf.statements) {
		if (!(ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier))) continue;
		const spec = stmt.moduleSpecifier.text;
		const bindings = stmt.importClause?.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings)) info.namespaces.set(bindings.name.text, spec);
		if (bindings && ts.isNamedImports(bindings)) {
			for (const el of bindings.elements) {
				info.named.set(el.name.text, {
					spec,
					origName: el.propertyName ? el.propertyName.text : el.name.text,
				});
			}
		}
	}
	importInfoCache.set(file, info);
	return info;
}

function resolveImportedSymbol(
	fromFile: string,
	symbol: string,
	namespace: string | null,
): ResolvedSymbol | null {
	const info = importInfo(fromFile);
	let spec: string | null = null;
	let lookupName = symbol;
	if (namespace) {
		spec = info.namespaces.get(namespace) ?? null;
	} else {
		const entry = info.named.get(symbol);
		if (entry) {
			spec = entry.spec;
			lookupName = entry.origName;
		}
	}
	if (!spec) return null;
	if (spec.startsWith(".")) {
		const target = resolveSpec(fromFile, spec);
		return target ? resolveExport(target, lookupName) : null;
	}
	const entry = packageEntry(spec);
	return entry ? resolveExport(entry, lookupName) : null;
}

// ── event wiring (emit/subscribe across the repo) ───────────────────────────

export interface EventWiring {
	emits: { event: string; file: string; line: number; enclosing: string; inferred: boolean }[];
	subs: {
		event: string;
		file: string;
		line: number;
		enclosing: string;
		handler: string | null;
		anchor?: ts.Node;
		anchorFile?: string;
	}[];
	wildcards: { file: string; line: number; enclosing: string }[];
	dynamic: { file: string; line: number; enclosing: string; expr: string }[];
}

const allScopeFnsCache = new Map<string, Map<string, ts.Node>>();
function allScopeFns(file: string): Map<string, ts.Node> {
	const cached = allScopeFnsCache.get(file);
	if (cached) return cached;
	const sf = parse(file);
	const fns = new Map<string, ts.Node>();
	const visit = (n: ts.Node): void => {
		if (ts.isFunctionDeclaration(n) && n.name && n.body) fns.set(n.name.text, n.body);
		if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
			if (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) {
				fns.set(n.name.text, n.initializer.body);
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	allScopeFnsCache.set(file, fns);
	return fns;
}

function resolveHandlerAnchor(
	handlerArg: ts.Expression | undefined,
	file: string,
): { node: ts.Node; file: string } | null {
	if (!handlerArg) return null;
	if (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg))
		return { node: handlerArg.body, file };
	if (ts.isIdentifier(handlerArg)) {
		const name = handlerArg.text;
		const local = topLevelFns(file).get(name) ?? allScopeFns(file).get(name);
		if (local) return { node: local, file };
		const factory = factoryCallees(file).get(name);
		if (factory && factory !== name) {
			const resFactory = resolveImportedSymbol(file, factory, null);
			const target = resFactory
				? { file: resFactory.file, name: resFactory.name }
				: topLevelFns(file).has(factory)
					? { file, name: factory }
					: null;
			if (target) {
				const body = topLevelFns(target.file).get(target.name);
				if (body) return { node: body, file: target.file };
			}
		}
		const res = resolveImportedSymbol(file, name, null);
		if (res) {
			const body = topLevelFns(res.file).get(res.name);
			if (body) return { node: body, file: res.file };
		}
	}
	return null;
}

export function collectEventWiring(): EventWiring {
	const known = knownEventTypes();
	const out: EventWiring = { emits: [], subs: [], wildcards: [], dynamic: [] };
	for (const file of productionFiles()) {
		const sf = parse(file);
		const locals = localsFor(file);
		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const name = node.expression.name.text;
				if (name === "emit" || name === "on" || name === "once") {
					const label = eventTypeLabel(node.arguments[0], sf, locals);
					if (!label) return;
					const line = lineOf(sf, node.getStart(sf));
					if (label.kind === "dynamic") {
						out.dynamic.push({ file, line, enclosing: enclosingName(node), expr: `${name}(${label.expr})` });
					} else if (label.text === "*") {
						out.wildcards.push({ file, line, enclosing: enclosingName(node) });
					} else if (known.has(label.text)) {
						if (name === "emit") {
							out.emits.push({
								event: label.text,
								file,
								line,
								enclosing: enclosingName(node),
								inferred: label.inferred,
							});
						} else {
							const h = node.arguments[1];
							const anchor = resolveHandlerAnchor(h, file);
							out.subs.push({
								event: label.text,
								file,
								line,
								enclosing: enclosingName(node),
								handler: h && ts.isIdentifier(h) ? h.text : h ? "(inline)" : null,
								anchor: anchor?.node,
								anchorFile: anchor?.file,
							});
						}
					}
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	return out;
}

// ── seam map (port method → backing route) ───────────────────────────────────

export interface SeamEntry {
	portMethod: string;
	httpMethod: string;
	path: string;
	portFile: string;
	line: number;
}

const SEAM_FILES = [
	"layers/agent-orchestration/src/services/core-api-port-composition.ts",
	"layers/core-api/src/services/agent-orchestration-port-composition.ts",
];

function hcMethod(name: string): string | null {
	switch (name) {
		case "$get":
			return "GET";
		case "$post":
			return "POST";
		case "$patch":
			return "PATCH";
		case "$delete":
			return "DELETE";
		case "$put":
			return "PUT";
		default:
			return null;
	}
}

let seamCache: SeamEntry[] | null = null;
export function collectSeamMap(): SeamEntry[] {
	if (seamCache) return seamCache;
	const entries: SeamEntry[] = [];
	for (const file of SEAM_FILES) {
		if (!existsSync(file)) continue;
		const sf = parse(file);
		const visit = (node: ts.Node, portMethod: string | null): void => {
			if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.body) {
				portMethod = node.name.text;
			}
			const http =
				portMethod && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
					? hcMethod(node.expression.name.text)
					: null;
			if (http && portMethod && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const segments: string[] = [];
				let cur: ts.Expression = node.expression.expression;
				while (cur) {
					if (ts.isPropertyAccessExpression(cur)) {
						segments.unshift(cur.name.text);
						cur = cur.expression;
					} else if (ts.isElementAccessExpression(cur)) {
						const idx = cur.argumentExpression;
						segments.unshift(idx && ts.isStringLiteralLike(idx) ? idx.text : ":param");
						cur = cur.expression;
					} else {
						break;
					}
				}
				if (segments[0] === "client") segments.shift();
				if (segments.length > 0) {
					entries.push({
						portMethod,
						httpMethod: http,
						path: `/api/${segments.join("/")}`,
						portFile: file,
						line: lineOf(sf, node.getStart(sf)),
					});
				}
			}
			ts.forEachChild(node, (child) => visit(child, portMethod));
		};
		visit(sf, null);
	}
	seamCache = entries;
	return entries;
}

// ── fingerprints ─────────────────────────────────────────────────────────────

export interface Fingerprint {
	events: Set<string>;
	ports: Set<string>;
	tables: Set<string>;
	calls: Set<string>;
}

const DRIZZLE_READ = new Set(["from"]);
const DRIZZLE_WRITE = new Set(["insert", "into", "update", "delete"]);

let entityTableCache: Map<string, string> | null = null;
export function workEntityTableMap(): Map<string, string> {
	if (entityTableCache) return entityTableCache;
	const map = new Map<string, string>();
	const sf = parse("layers/core-api/work/src/work-service.ts");
	const visit = (node: ts.Node): void => {
		if (
			ts.isSwitchStatement(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "entity"
		) {
			for (const clause of node.caseBlock.clauses) {
				if (
					ts.isCaseClause(clause) &&
					ts.isStringLiteralLike(clause.expression) &&
					!map.has(clause.expression.text)
				) {
					const entity = clause.expression.text;
					const find = (n: ts.Node): void => {
						if (
							ts.isCallExpression(n) &&
							ts.isPropertyAccessExpression(n.expression) &&
							(DRIZZLE_READ.has(n.expression.name.text) ||
								DRIZZLE_WRITE.has(n.expression.name.text))
						) {
							const a = n.arguments[0];
							if (a && ts.isIdentifier(a) && !map.has(entity)) map.set(entity, a.text);
						}
						ts.forEachChild(n, find);
					};
					find(clause);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	entityTableCache = map;
	return map;
}

function calleeChain(expr: ts.Expression): string[] {
	const chain: string[] = [];
	let cur: ts.Expression = expr;
	while (ts.isPropertyAccessExpression(cur)) {
		chain.unshift(cur.name.text);
		cur = cur.expression;
	}
	if (ts.isIdentifier(cur)) chain.unshift(cur.text);
	return chain;
}

const localsCache = new Map<string, Map<string, string>>();
function localsFor(file: string): Map<string, string> {
	const cached = localsCache.get(file);
	if (cached) return cached;
	const locals = localVarTypes(parse(file));
	localsCache.set(file, locals);
	return locals;
}

const fileFnsCache = new Map<string, Map<string, ts.Node>>();
function topLevelFns(file: string): Map<string, ts.Node> {
	const cached = fileFnsCache.get(file);
	if (cached) return cached;
	const sf = parse(file);
	const fns = new Map<string, ts.Node>();
	for (const stmt of sf.statements) {
		if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body)
			fns.set(stmt.name.text, stmt.body);
		if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations) {
				if (
					ts.isIdentifier(d.name) &&
					d.initializer &&
					(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
				) {
					fns.set(d.name.text, d.initializer.body);
				}
			}
		}
	}
	fileFnsCache.set(file, fns);
	return fns;
}

const factoryCache = new Map<string, Map<string, string>>();
function factoryCallees(file: string): Map<string, string> {
	const cached = factoryCache.get(file);
	if (cached) return cached;
	const sf = parse(file);
	const map = new Map<string, string>();
	const visit = (n: ts.Node): void => {
		if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
			const init = unwrap(n.initializer);
			if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
				map.set(n.name.text, init.expression.text);
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	factoryCache.set(file, map);
	return map;
}

export function fingerprint(anchor: ts.Node, file: string): Fingerprint {
	const fp: Fingerprint = {
		events: new Set(),
		ports: new Set(),
		tables: new Set(),
		calls: new Set(),
	};
	const known = knownEventTypes();
	const schemaSymbols = schemaTableSymbols();
	const visited = new Set<string>();
	const MAX_DEPTH = 4;

	const follow = (name: string, curFile: string, namespace: string | null, depth: number): void => {
		if (depth >= MAX_DEPTH) return;
		const localBody = namespace ? null : topLevelFns(curFile).get(name);
		if (localBody) {
			const key = `${curFile}:${name}`;
			if (!visited.has(key)) {
				visited.add(key);
				scan(localBody, curFile, depth + 1);
			}
			return;
		}
		if (!namespace) {
			const factory = factoryCallees(curFile).get(name);
			if (factory && factory !== name) {
				const fkey = `${curFile}:factory:${name}`;
				if (!visited.has(fkey)) {
					visited.add(fkey);
					follow(factory, curFile, null, depth);
				}
				return;
			}
		}
		const xkey = `${curFile}:${namespace ? `${namespace}.` : ""}${name}`;
		if (visited.has(xkey)) return;
		visited.add(xkey);
		const res = resolveImportedSymbol(curFile, name, namespace);
		if (!res) return;
		const body = topLevelFns(res.file).get(res.name);
		if (body) scan(body, res.file, depth + 1);
	};

	const scan = (node: ts.Node, curFile: string, depth: number): void => {
		const sf = parse(curFile);
		const locals = localsFor(curFile);
		const visit = (n: ts.Node): void => {
			if (ts.isCallExpression(n)) {
				const callee = n.expression;
				if (ts.isIdentifier(callee)) {
					fp.calls.add(callee.text);
					follow(callee.text, curFile, null, depth);
				} else if (ts.isPropertyAccessExpression(callee)) {
					const chain = calleeChain(callee);
					const joined = chain.join(".");
					fp.calls.add(joined);
					fp.calls.add(chain[chain.length - 1]);
					const name = callee.name.text;
					const arg0 = n.arguments[0];
					if (name === "emit") {
						const label = eventTypeLabel(arg0, sf, locals);
						if (label && label.kind === "literal" && known.has(label.text))
							fp.events.add(label.text);
						if (arg0 && ts.isIdentifier(arg0)) {
							const assigned = assignedEventTypes(sf).get(arg0.text);
							if (assigned) for (const t of assigned) if (known.has(t)) fp.events.add(t);
						}
					}
					if (
						(DRIZZLE_READ.has(name) || DRIZZLE_WRITE.has(name)) &&
						arg0 &&
						ts.isIdentifier(arg0)
					) {
						if (schemaSymbols.has(arg0.text)) fp.tables.add(arg0.text);
					}
					const arg1 = n.arguments[1];
					if (
						arg0 &&
						ts.isIdentifier(arg0) &&
						/^(db|exec|tx)$/.test(arg0.text) &&
						arg1 &&
						ts.isStringLiteralLike(arg1)
					) {
						fp.tables.add(`entity:${arg1.text}`);
					}
					if (
						/coreApi|agentOrchestration/i.test(chain[0] ?? "") ||
						/coreApi|agentOrchestration/i.test(chain[1] ?? "")
					) {
						const start = /coreApi|agentOrchestration/i.test(chain[0] ?? "") ? 0 : 1;
						fp.ports.add(chain.slice(start).join("."));
					}
					if (chain.includes("enqueueWorkIntent") || /\.intents\./.test(`.${joined}.`)) {
						fp.ports.add("enqueueWorkIntent");
					}
					if (
						name === "record" &&
						/IntentRecorder/i.test(chain[0] ?? "") &&
						n.arguments.length >= 2
					) {
						fp.ports.add("enqueueWorkIntent");
					}
					if (ts.isIdentifier(callee.expression)) {
						follow(name, curFile, callee.expression.text, depth);
					}
				}
			}
			ts.forEachChild(n, visit);
		};
		visit(node);
	};

	scan(anchor, file, 0);
	const entityMap = workEntityTableMap();
	for (const t of [...fp.tables]) {
		if (t.startsWith("entity:")) {
			const table = entityMap.get(t.slice(7));
			if (table) fp.tables.add(table);
		}
	}
	return fp;
}
