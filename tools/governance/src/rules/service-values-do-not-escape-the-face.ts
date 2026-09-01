/**
 * AU31 §7.2, R2 — `service-values-do-not-escape-the-face`.
 *
 * Founder ruling at the concept gate (verbatim): *"lets avoid overengineering. we don't need to be
 * able to catch every exotic catch, linting is engineering guidance not protection against malicious
 * actors."* The rule this ships is exactly the reduced one §7.2/§7.3 specify, ported from the
 * executed prototype at `.pipeline/work/AU31/probes/p12-r2-escape-predicate/` (git history —
 * retired at ship; `git log --all -- '*p12*'` recovers it) onto the live census rather than a
 * standalone CLI.
 *
 * WHAT IT READS: a layer root package's own modules reachable from its `exports` map (reachability
 * stops at a package boundary — a service package's own files are judged by R1/R3, not walked into
 * here) — their EXPORT DECLARATIONS, and what those declarations say. Four export forms carry a
 * value out: `export … from "<service>"` (named clause, `export *`, `export * as ns`), `export {
 * local }` with no specifier, `export default <expr>`, and an exported `const`/`let`/`var`. The
 * exported expression is read through object and array literals, spreads, parens, `as`/`satisfies`,
 * call arguments, and through top-level `const`/`let`/`var` aliases, transitively. A service symbol
 * found anywhere in that reach is a violation. One exemption, positional: a bare service identifier
 * in direct callee position of a call or `new` — calling a service factory PRODUCES a value, and
 * producing values is what composition is.
 *
 * WHAT IT DOES NOT READ, deliberately (the same ruling): function-like bodies (arrows, functions,
 * methods, accessors, constructors) — the sanctioned wiring style IS a bag of arrows over the
 * layer's own services, so a body is machine-indistinguishable from legitimate composition;
 * class/enum/namespace members; statements that mutate an already-exported object (`api.tool = svc`
 * and its variants), aliases, globals, dynamic `import()`. A developer who wants to route a service
 * symbol out through the face can. That is expected of a lint rule and is not a defect: this rule
 * exists so the plain re-export and deps-bag spellings — the ones written by accident — fail the
 * build.
 *
 * @lore AU31: "service" here means `locate(target).role === "service"` — the SAME layer's own nested
 * service package or another layer's, either way. The founding violation this rule targets
 * (`layers/core-api/src/index.ts:15`, a plain re-export of core-api's OWN `@hyperidle/knowledge`) is
 * a same-layer case; the rule does not special-case it.
 */

import ts from "typescript";

import { readExportsField, resolveExportsMap } from "../lib/exports-map.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census, ImportEdge, WorkspacePackage } from "../lib/repo-census.js";

export interface ServiceValuesDoNotEscapeTheFaceInput {
	readonly locate: (file: string) => WorkspacePackage | undefined;
	readonly readFile: (path: string) => string;
}

interface Finding2 {
	readonly line: number;
	readonly binding: string;
	readonly specifier: string;
	readonly context: string;
}

/** Every module reachable from `entries` while staying inside `pkgDir` — a package-boundary BFS. */
function ownReachableFiles(
	entries: readonly string[],
	pkgDir: string,
	edgesByFrom: ReadonlyMap<string, readonly ImportEdge[]>,
	locate: (file: string) => WorkspacePackage | undefined,
): Set<string> {
	const seen = new Set<string>();
	const queue = [...entries];
	while (queue.length > 0) {
		const file = queue.pop();
		if (file === undefined || seen.has(file)) continue;
		seen.add(file);
		for (const edge of edgesByFrom.get(file) ?? []) {
			if (seen.has(edge.to)) continue;
			if (locate(edge.to)?.dir === pkgDir) queue.push(edge.to);
		}
	}
	return seen;
}

/** Analyze one module's export surface for an escaping service value. Mirrors the P12 prototype. */
function analyzeModule(
	filePath: string,
	source: string,
	isService: (file: string) => boolean,
): Finding2[] {
	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const findings: Finding2[] = [];

	const lineOf = (node: ts.Node): number =>
		sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
	const isExported = (node: ts.Node): boolean =>
		(ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		) === true;
	const unwrapParens = (e: ts.Expression): ts.Expression => {
		let cur = e;
		while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
		return cur;
	};

	/** Local binding name -> the service specifier that named it, for a VALUE import only. */
	const serviceBindings = new Map<string, string>();
	/** Top-level value declarations: name -> the expressions that feed it. */
	const aliases = new Map<string, ts.Expression[]>();

	const addAlias = (name: string, expr: ts.Expression | undefined): void => {
		const list = aliases.get(name) ?? [];
		if (expr !== undefined) list.push(expr);
		aliases.set(name, list);
	};
	const patternNames = (pattern: ts.BindingName, out: string[]): void => {
		if (ts.isIdentifier(pattern)) {
			out.push(pattern.text);
			return;
		}
		for (const el of pattern.elements) if (!ts.isOmittedExpression(el)) patternNames(el.name, out);
	};

	// ---- pass 1: what this module holds — service value imports, top-level aliases ----
	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			if (!isService(stmt.moduleSpecifier.text)) continue;
			const clause = stmt.importClause;
			if (clause === undefined || clause.isTypeOnly) continue; // type-only: no value escapes
			if (clause.name !== undefined)
				serviceBindings.set(clause.name.text, stmt.moduleSpecifier.text);
			const bindings = clause.namedBindings;
			if (bindings === undefined) continue;
			if (ts.isNamespaceImport(bindings)) {
				serviceBindings.set(bindings.name.text, stmt.moduleSpecifier.text);
			} else {
				for (const el of bindings.elements)
					if (!el.isTypeOnly) serviceBindings.set(el.name.text, stmt.moduleSpecifier.text);
			}
		} else if (ts.isVariableStatement(stmt)) {
			for (const decl of stmt.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					addAlias(decl.name.text, decl.initializer);
				} else {
					const names: string[] = [];
					patternNames(decl.name, names);
					for (const n of names) addAlias(n, decl.initializer);
				}
			}
		}
	}

	// ---- reading an escaping expression ----
	const seenNodes = new Set<ts.Node>();
	const seenNames = new Set<string>();

	function readEscaping(node: ts.Node, context: string): void {
		if (seenNodes.has(node)) return;
		seenNodes.add(node);

		if (ts.isIdentifier(node)) {
			readEscapingName(node.text, node, context);
			return;
		}
		if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
			const callee = unwrapParens(node.expression);
			// THE ONE EXEMPTION, positional: a bare service identifier in direct callee position.
			// The call's RESULT is a produced value; the symbol itself does not flow into it.
			if (!(ts.isIdentifier(callee) && serviceBindings.has(callee.text))) {
				readEscaping(callee, `${context} > callee`);
			}
			for (const arg of node.arguments ?? []) readEscaping(arg, `${context} > call argument`);
			return;
		}
		if (ts.isObjectLiteralExpression(node)) {
			for (const prop of node.properties) {
				if (ts.isPropertyAssignment(prop)) readEscaping(prop.initializer, context);
				else if (ts.isShorthandPropertyAssignment(prop)) readEscaping(prop.name, context);
				else if (ts.isSpreadAssignment(prop)) readEscaping(prop.expression, `${context} > spread`);
				// methods, getters, setters: function-like bodies — not read
			}
			return;
		}
		// function-like values, classes, enums, namespaces, types: own-module code — not read
		if (
			ts.isArrowFunction(node) ||
			ts.isFunctionExpression(node) ||
			ts.isFunctionDeclaration(node) ||
			ts.isClassLike(node) ||
			ts.isEnumDeclaration(node) ||
			ts.isModuleDeclaration(node) ||
			ts.isTypeNode(node)
		) {
			return;
		}
		// array literals, spreads, template spans, conditionals, binaries, await, as/satisfies,
		// parens, property access: read through generically
		ts.forEachChild(node, (child) => readEscaping(child, context));
	}

	function readEscapingName(name: string, at: ts.Node, context: string): void {
		const spec = serviceBindings.get(name);
		if (spec !== undefined) {
			findings.push({ line: lineOf(at), binding: name, specifier: spec, context });
			return;
		}
		if (seenNames.has(name)) return;
		seenNames.add(name);
		for (const expr of aliases.get(name) ?? []) readEscaping(expr, `${context} > \`${name}\``);
	}

	// ---- pass 2: the export forms ----
	for (const stmt of sf.statements) {
		if (ts.isExportDeclaration(stmt)) {
			if (stmt.isTypeOnly) continue;
			if (stmt.moduleSpecifier !== undefined && ts.isStringLiteral(stmt.moduleSpecifier)) {
				const spec = stmt.moduleSpecifier.text;
				if (isService(spec)) {
					findings.push({
						line: lineOf(stmt),
						binding: stmt.exportClause !== undefined ? "(re-export)" : "*",
						specifier: spec,
						context: "export … from a service module",
					});
				}
			} else if (stmt.exportClause !== undefined && ts.isNamedExports(stmt.exportClause)) {
				for (const el of stmt.exportClause.elements) {
					if (el.isTypeOnly) continue;
					const local = el.propertyName ?? el.name;
					readEscapingName(local.text, el, `named export of \`${local.text}\``);
				}
			}
		} else if (ts.isExportAssignment(stmt)) {
			readEscaping(stmt.expression, "default export");
		} else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
			for (const decl of stmt.declarationList.declarations) {
				if (ts.isIdentifier(decl.name))
					readEscapingName(decl.name.text, decl.name, "exported binding");
				else if (decl.initializer !== undefined)
					readEscaping(decl.initializer, "exported destructured binding");
			}
		}
	}

	return findings;
}

export function serviceValuesDoNotEscapeTheFace(input: ServiceValuesDoNotEscapeTheFaceInput): Rule {
	const { locate, readFile } = input;

	const facePopulation = (census: Census): string[] => {
		const edgesByFrom = new Map<string, ImportEdge[]>();
		for (const edge of census.edges) {
			const list = edgesByFrom.get(edge.from) ?? [];
			list.push(edge);
			edgesByFrom.set(edge.from, list);
		}
		const out = new Set<string>();
		for (const pkg of census.packages) {
			if (pkg.role !== "layer") continue;
			// The roots are the manifest's OWN declared `exports` entries — R1 judges whether those
			// entries resolve somewhere legal; this rule starts exactly there and walks same-package
			// relative imports outward, because that is the face's real reach: a file the manifest
			// never names, and nothing named reaches by a relative import, cannot be a consumer's path
			// to a service value regardless of what it says.
			const manifestPath = `${pkg.dir}/package.json`;
			if (!census.byPath.has(manifestPath)) continue;
			const exp = readExportsField(readFile(manifestPath));
			const roots = resolveExportsMap(pkg.dir, exp, census.byPath).map((e) => e.target);
			for (const file of ownReachableFiles(roots, pkg.dir, edgesByFrom, locate)) out.add(file);
		}
		return [...out];
	};

	return {
		id: "service-values-do-not-escape-the-face",
		description:
			"a layer's own modules never export a service-imported value — the plain re-export and deps-bag shapes a face gains by accident",
		scope: facePopulation,
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const isService = (specifier: string): boolean => {
				const pkgName = specifier.split("/").slice(0, 2).join("/");
				const target = census.packages.find((p) => p.scopedName === pkgName);
				return target?.role === "service";
			};
			for (const file of facePopulation(census)) {
				let source: string;
				try {
					source = readFile(file);
				} catch {
					continue;
				}
				for (const finding of analyzeModule(file, source, isService)) {
					findings.push({
						ruleId: "service-values-do-not-escape-the-face",
						severity: "error",
						message:
							`exports \`${finding.binding}\` (from ${finding.specifier}) — ${finding.context}. A service ` +
							"value must not reach a layer face's export surface; wrap it in a function the face owns, " +
							"or drop it if nothing outside this package consumes it.",
						path: file,
						line: finding.line,
						world: census.byPath.get(file)?.kind,
					});
				}
			}
			return findings;
		},
	};
}
