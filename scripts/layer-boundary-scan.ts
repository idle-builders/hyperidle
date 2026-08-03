#!/usr/bin/env tsx
/**
 * scripts/layer-boundary-scan.ts
 *
 * Ground-truth, mechanically-exhaustive scan of every cross-Layer import in
 * the codebase — built because `generate-dependency-graph.ts`'s
 * `resolvePortEdges` (which GUESSES which Service satisfies a locally-
 * declared Deps interface via name-voting / header-comments / a hand-
 * maintained override table) was repeatedly wrong this session: a type-alias
 * blind spot, three dead overrides nobody noticed, and a mixed-provider
 * interface collapsing 5-7 real dependencies into one mis-attributed edge.
 * Every one of those bugs came from the same root cause — trying to INFER
 * who satisfies a consumer's declared shape, instead of reading what the
 * source literally says.
 *
 * This script asks a fundamentally different, unambiguous question: which
 * files literally write `import ... from "@hyperidle/X"` (or
 * `export ... from`, or a dynamic `import(...)`) where X belongs to a
 * DIFFERENT Layer than the importing file? That is a syntactic FACT the
 * TypeScript parser gives directly via `ts.ImportDeclaration`/
 * `ts.ExportDeclaration` nodes — there is no name-matching, no voting, no
 * override table, and nothing to keep in sync as the codebase changes.
 *
 * PROOF OF RELIABILITY (see `--fixtures`):
 *  - Package -> Layer mapping comes from package.json's own `name` field,
 *    read directly, one per package, unambiguous. A package under a new
 *    `packages/<x>/` directory that isn't already classified causes a HARD
 *    THROW (`discoverAllPackages`) rather than being silently skipped — the
 *    exact opposite failure mode of the old detector's silent dead
 *    overrides. Zero blind spots by construction: an unrecognized package
 *    makes noise, not silence.
 *  - Import detection uses ONLY `ts.isImportDeclaration`/`ts.isExportDeclaration`/
 *    a dynamic-`import()` call check — TypeScript's own parser, which
 *    covers every syntactically valid form (multi-line, aliased, namespace,
 *    mixed type/value, re-export) by construction. There is no regex here
 *    that could miss a creatively-formatted statement.
 *  - `--fixtures` is a synthetic self-test proving each classification
 *    (same-layer/allowed, foundation/allowed, cross-layer type-only,
 *    cross-layer value, multi-line, aliased, namespace, mixed) is detected
 *    correctly — run it, don't take this file's word for it.
 *
 * Three independently-detected mechanisms (this file covers only #1 and
 * lists #2/#3 in its output summary from the existing detectors, so one
 * command gives the full cross-layer picture):
 *  1. DIRECT IMPORT (this file) — any import/re-export/dynamic-import whose
 *     module specifier resolves to a package outside the importing file's
 *     own Layer, excluding `@hyperidle/db`/`@hyperidle/shared`/
 *     `@hyperidle/api-contract`/`@hyperidle/design-system` (foundation
 *     packages every Layer may use) and Application-tier packages (which
 *     compose multiple Layers by design). Classified type-only vs value per
 *     symbol — a type-only import is erased at compile time (no runtime
 *     coupling) but still shows up here since it's still a package.json +
 *     build-graph coupling worth seeing.
 *  2. EVENTBUS — `generate-dependency-graph.ts`'s `detectEventEdges` (regex
 *     scan for `.emit({type:"..."})` / `.on("...")`) — genuinely decoupled
 *     pub/sub, no import required at all. Re-exported here for one-command
 *     visibility, not re-implemented.
 *  3. HIDDEN COMPOSITION BUNDLE — `detectHiddenCompositionEdges` (a
 *     Deps-shaped interface DEFINED in one Layer's package but COMPOSED with
 *     a DIFFERENT Layer's real export inside `packages/core-api/src/services/*.ts`).
 *     Re-exported here for the same reason.
 *
 * Output: `plans/AU19/layer-boundary-scan.json` (machine-readable) and a
 * human-readable summary to stdout, grouped by mechanism.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { detectEventEdges, detectHiddenCompositionEdges, discoverServices } from "./generate-dependency-graph.js";

export type LayerName = "core-ui" | "core-api" | "agent-orchestration" | "agent-execution";
export type PackageKind =
	| { kind: "layer"; layer: LayerName }
	| { kind: "foundation" }
	| { kind: "application" }
	| { kind: "tooling" };

export interface PackageEntry {
	name: string;
	dir: string;
	kind: PackageKind;
}

/**
 * Foundation packages every Layer may depend on — the codebase's own
 * equivalent of a standard library. Deliberately small and explicit; a new
 * "everyone may use this" package must be added here on purpose, not
 * inferred.
 */
const FOUNDATION_PACKAGES: ReadonlySet<string> = new Set([
	"@hyperidle/db",
	"@hyperidle/shared",
	"@hyperidle/api-contract",
	"@hyperidle/design-system",
]);

/**
 * Application-tier packages — deployment units that compose MULTIPLE Layers
 * into one running process by design (`docs/architecture/runtime-simplification.md`'s
 * own "Applications" section). Importing across Layers is their entire job;
 * they are not scanned as a `from` side at all (see `discoverAllPackages`'s
 * `kind: "application"`, which `scanFileForCrossLayerImports` skips).
 */
const APPLICATION_PACKAGES: ReadonlySet<string> = new Set([
	"@hyperidle/desktop",
	"@hyperidle/remote-server",
	"@hyperidle/remote-worker",
]);

/** Tooling/test-harness packages — not part of the runtime Layer graph at all. */
const TOOLING_PACKAGES: ReadonlySet<string> = new Set([
	"@hyperidle/eval",
	"eslint-plugin-authz",
	"eslint-plugin-design",
]);

function readPkgName(pkgJsonPath: string): string | undefined {
	try {
		return (JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name?: string }).name;
	} catch {
		return undefined;
	}
}

/**
 * Ground-truth package topology: every package.json under `packages/`,
 * classified by ITS FILESYSTEM LOCATION (unambiguous — a package under
 * `packages/core-api/` is a core-api package, full stop) plus the small
 * explicit lookups above for foundation/application/tooling packages and
 * `web` (core-ui's only real package today — `docs/architecture/
 * runtime-simplification.md` itself calls core-ui's internal package split
 * an open question).
 *
 * FAILS LOUD on any top-level `packages/<x>/` directory this function
 * doesn't already know how to classify — the opposite failure mode of the
 * old detector's silent dead overrides. A new package must be classified
 * here on purpose; it is never silently dropped from the scan.
 */
export function discoverAllPackages(root: string): PackageEntry[] {
	const packagesDir = join(root, "packages");
	const layerDirNames: Record<string, LayerName> = {
		"core-api": "core-api",
		"agent-orchestration": "agent-orchestration",
		"agent-execution": "agent-execution",
	};
	const out: PackageEntry[] = [];

	for (const topEntry of readdirSync(packagesDir)) {
		const topDir = join(packagesDir, topEntry);
		if (!statSync(topDir).isDirectory()) continue;
		const topPkgJson = join(topDir, "package.json");
		const layer = layerDirNames[topEntry];

		if (layer) {
			if (existsSync(topPkgJson)) {
				const name = readPkgName(topPkgJson);
				if (name) out.push({ name, dir: topDir, kind: { kind: "layer", layer } });
			}
			for (const nested of readdirSync(topDir)) {
				const nestedDir = join(topDir, nested);
				if (!statSync(nestedDir).isDirectory()) continue;
				const nestedPkgJson = join(nestedDir, "package.json");
				if (!existsSync(nestedPkgJson)) continue;
				const name = readPkgName(nestedPkgJson);
				if (name) out.push({ name, dir: nestedDir, kind: { kind: "layer", layer } });
			}
			continue;
		}

		if (!existsSync(topPkgJson)) continue;
		const name = readPkgName(topPkgJson);
		if (!name) continue;

		if (FOUNDATION_PACKAGES.has(name)) {
			out.push({ name, dir: topDir, kind: { kind: "foundation" } });
		} else if (APPLICATION_PACKAGES.has(name)) {
			out.push({ name, dir: topDir, kind: { kind: "application" } });
		} else if (TOOLING_PACKAGES.has(name)) {
			out.push({ name, dir: topDir, kind: { kind: "tooling" } });
		} else if (topEntry === "web") {
			out.push({ name, dir: topDir, kind: { kind: "layer", layer: "core-ui" } });
		} else {
			throw new Error(
				`layer-boundary-scan: unclassified package "${name}" at ${topDir} — ` +
					"add it to FOUNDATION_PACKAGES / APPLICATION_PACKAGES / TOOLING_PACKAGES, " +
					"or a layer directory mapping, in scripts/layer-boundary-scan.ts before running this scan again. " +
					"This throws on purpose: an unclassified package is a blind spot, not a default.",
			);
		}
	}
	return out;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir)) {
		if (entry === "__tests__" || entry === "node_modules" || entry === "dist") continue;
		const abs = join(dir, entry);
		const st = statSync(abs);
		if (st.isDirectory()) walkSourceFiles(abs, out);
		else if (/\.tsx?$/.test(entry) && !/\.(integration|spec|stories|test)\./.test(entry)) out.push(abs);
	}
	return out;
}

export interface ImportSymbol {
	name: string;
	isTypeOnly: boolean;
}

export interface CrossLayerImport {
	file: string;
	line: number;
	fromPackage: string;
	fromLayer: LayerName;
	toPackage: string;
	toLayerOrKind: string;
	symbols: ImportSymbol[];
	statementKind: "import" | "export" | "dynamic-import";
}

function packageForFile(file: string, packages: readonly PackageEntry[]): PackageEntry | undefined {
	let best: PackageEntry | undefined;
	for (const p of packages) {
		if (file === p.dir || file.startsWith(`${p.dir}/`)) {
			if (!best || p.dir.length > best.dir.length) best = p;
		}
	}
	return best;
}

/**
 * Scan one Layer-package source file for every cross-Layer import/re-export/
 * dynamic-import. Uses ONLY `ts.isImportDeclaration`/`ts.isExportDeclaration`
 * and a dynamic-`import()` call check — real AST node types, not a regex —
 * so every syntactically valid form (multi-line, aliased, namespace, mixed
 * type/value specifiers, re-export, side-effect-only import) is covered by
 * construction.
 */
export function scanFileForCrossLayerImports(
	file: string,
	root: string,
	fromPkg: PackageEntry,
	packagesByName: ReadonlyMap<string, PackageEntry>,
): CrossLayerImport[] {
	if (fromPkg.kind.kind !== "layer") return [];
	const fromLayer = fromPkg.kind.layer;
	const text = readFileSync(file, "utf-8");
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const out: CrossLayerImport[] = [];
	const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

	const record = (
		moduleSpecifier: string,
		line: number,
		symbols: ImportSymbol[],
		statementKind: CrossLayerImport["statementKind"],
	) => {
		if (!moduleSpecifier.startsWith("@hyperidle/")) return;
		const pkgName = moduleSpecifier.split("/").slice(0, 2).join("/");
		const target = packagesByName.get(pkgName);
		if (!target) return; // an @hyperidle/* specifier this topology scan doesn't know — see discoverAllPackages's throw
		if (target.kind.kind === "foundation") return; // always allowed
		if (target.kind.kind === "layer" && target.kind.layer === fromLayer) return; // same layer, allowed
		out.push({
			file: relative(root, file),
			line,
			fromPackage: fromPkg.name,
			fromLayer,
			toPackage: pkgName,
			toLayerOrKind: target.kind.kind === "layer" ? target.kind.layer : target.kind.kind,
			symbols,
			statementKind,
		});
	};

	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const clause = stmt.importClause;
			const wholeTypeOnly = clause?.isTypeOnly ?? false;
			const symbols: ImportSymbol[] = [];
			if (clause?.name) symbols.push({ name: "default", isTypeOnly: wholeTypeOnly });
			const nb = clause?.namedBindings;
			if (nb && ts.isNamespaceImport(nb)) {
				symbols.push({ name: `* as ${nb.name.text}`, isTypeOnly: wholeTypeOnly });
			} else if (nb && ts.isNamedImports(nb)) {
				for (const el of nb.elements) {
					symbols.push({ name: (el.propertyName ?? el.name).text, isTypeOnly: wholeTypeOnly || el.isTypeOnly });
				}
			}
			if (!clause) symbols.push({ name: "(side-effect)", isTypeOnly: false });
			record(stmt.moduleSpecifier.text, lineOf(stmt), symbols, "import");
		} else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const wholeTypeOnly = stmt.isTypeOnly;
			const symbols: ImportSymbol[] = [];
			if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
				for (const el of stmt.exportClause.elements) {
					symbols.push({ name: (el.propertyName ?? el.name).text, isTypeOnly: wholeTypeOnly || el.isTypeOnly });
				}
			} else if (stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
				symbols.push({ name: `* as ${stmt.exportClause.name.text}`, isTypeOnly: wholeTypeOnly });
			} else if (!stmt.exportClause) {
				symbols.push({ name: "*", isTypeOnly: wholeTypeOnly });
			}
			record(stmt.moduleSpecifier.text, lineOf(stmt), symbols, "export");
		}
	}

	const visit = (node: ts.Node) => {
		if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const arg = node.arguments[0];
			if (arg && ts.isStringLiteral(arg)) {
				record(arg.text, lineOf(node), [{ name: "(dynamic)", isTypeOnly: false }], "dynamic-import");
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);

	return out;
}

export function scanAllCrossLayerImports(root: string): CrossLayerImport[] {
	const packages = discoverAllPackages(root);
	const packagesByName = new Map(packages.map((p) => [p.name, p]));
	const out: CrossLayerImport[] = [];
	for (const pkg of packages) {
		if (pkg.kind.kind !== "layer") continue;
		for (const file of walkSourceFiles(join(pkg.dir, "src"))) {
			out.push(...scanFileForCrossLayerImports(file, root, pkg, packagesByName));
		}
	}
	return out.sort(
		(a, b) => a.fromPackage.localeCompare(b.fromPackage) || a.file.localeCompare(b.file) || a.line - b.line,
	);
}

// --- fixtures --------------------------------------------------------------
// Synthetic, from-scratch monorepo fixtures — proof that `discoverAllPackages`
// + `scanFileForCrossLayerImports` classify every real TypeScript import form
// correctly, not just the shapes this session happened to encounter live.
// This is the same idiom `composition-edge-anti-regrowth-guard.ts --fixtures`
// already established: build a real (throwaway) file tree, run the real
// function against it, assert on the real output, clean up.

function writeFixtureFile(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

/** A minimal 4-package fixture monorepo: one package per real Layer, plus shared. */
function buildFixtureMonorepo(root: string): void {
	writeFixtureFile(root, "packages/core-api/fixture-a/package.json", JSON.stringify({ name: "@hyperidle/fixture-a" }));
	writeFixtureFile(root, "packages/core-api/fixture-b/package.json", JSON.stringify({ name: "@hyperidle/fixture-b" }));
	writeFixtureFile(
		root,
		"packages/agent-orchestration/fixture-c/package.json",
		JSON.stringify({ name: "@hyperidle/fixture-c" }),
	);
	writeFixtureFile(root, "packages/shared/package.json", JSON.stringify({ name: "@hyperidle/shared" }));
	writeFixtureFile(root, "packages/shared/src/index.ts", "export const sharedThing = 1;\n");
	writeFixtureFile(root, "packages/core-api/fixture-b/src/index.ts", "export function fromB(): number { return 1; }\n");
	writeFixtureFile(
		root,
		"packages/agent-orchestration/fixture-c/src/index.ts",
		"export function fromC(): number { return 1; }\nexport function alsoFromC(): number { return 2; }\n",
	);
}

/** Every real-world TypeScript import/export form, in one file, over `@hyperidle/fixture-b` (same layer), `@hyperidle/fixture-c` (cross layer), and `@hyperidle/shared` (foundation). */
function buildFixtureImportShapes(root: string): void {
	writeFixtureFile(
		root,
		"packages/core-api/fixture-a/src/index.ts",
		[
			'import { sharedThing } from "@hyperidle/shared";', // foundation — never reported
			'import { fromB } from "@hyperidle/fixture-b";', // same layer — never reported
			'import type { OnlyType } from "@hyperidle/fixture-c";', // cross-layer, type-only
			'import { fromC } from "@hyperidle/fixture-c";', // cross-layer, value
			"import {", // cross-layer, MULTI-LINE — the exact shape a manual grep missed this session
			"\talsoFromC,",
			'} from "@hyperidle/fixture-c";',
			'import { fromC as renamedFromC } from "@hyperidle/fixture-c";', // cross-layer, ALIASED
			'import * as NsC from "@hyperidle/fixture-c";', // cross-layer, NAMESPACE
			'import { fromC as valueOne, type OnlyType as typeOne } from "@hyperidle/fixture-c";', // cross-layer, MIXED type+value in one statement
			'export { fromC as reexported } from "@hyperidle/fixture-c";', // cross-layer, RE-EXPORT (value)
			'export type { OnlyType as reexportedType } from "@hyperidle/fixture-c";', // cross-layer, RE-EXPORT (type-only)
			"async function loadDynamically() {",
			'\tconst mod = await import("@hyperidle/fixture-c");', // cross-layer, DYNAMIC IMPORT
			"\treturn mod;",
			"}",
			"void sharedThing; void fromB; void renamedFromC; void NsC; void valueOne; void typeOne; void loadDynamically;",
			"",
		].join("\n"),
	);
}

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "layer-boundary-scan-fixture-"));
	try {
		buildFixtureMonorepo(root);
		buildFixtureImportShapes(root);

		const packages = discoverAllPackages(root);
		const byName = new Map(packages.map((p) => [p.name, p]));
		if (!byName.has("@hyperidle/fixture-a") || !byName.has("@hyperidle/fixture-c")) {
			throw new Error("layer-boundary-scan fixtures: discoverAllPackages did not find the synthetic fixture packages");
		}

		const imports = scanAllCrossLayerImports(root);

		// 1. Foundation and same-layer imports must NEVER appear.
		if (imports.some((i) => i.toPackage === "@hyperidle/shared")) {
			throw new Error("layer-boundary-scan fixtures: FAILED — a foundation (@hyperidle/shared) import was reported as cross-layer");
		}
		if (imports.some((i) => i.toPackage === "@hyperidle/fixture-b")) {
			throw new Error("layer-boundary-scan fixtures: FAILED — a same-layer import (fixture-a -> fixture-b, both core-api) was reported as cross-layer");
		}

		const toC = imports.filter((i) => i.toPackage === "@hyperidle/fixture-c");
		const allSymbols = toC.flatMap((i) => i.symbols.map((s) => s.name));

		// 2. Every real cross-layer statement form must be found, including the
		//    multi-line one — the exact class of miss a manual grep made this
		//    session (grep saw only the statement's closing line, missing the
		//    `import type`/multi-line context that determines type-only-ness).
		// 9 distinct statement forms into fixture-c: type-only, value, multi-line,
		// aliased, namespace, mixed (1 statement, 2 differently-classified
		// symbols), re-export (value), re-export (type-only), dynamic import.
		const expectedStatementCount = 9;
		if (toC.length !== expectedStatementCount) {
			throw new Error(
				`layer-boundary-scan fixtures: FAILED — expected ${expectedStatementCount} cross-layer statements into fixture-c, got ${toC.length}: ${JSON.stringify(toC, null, 2)}`,
			);
		}

		// 3. Type-only classification must be correct per statement/symbol,
		//    not just "some symbol somewhere is type-only."
		const onlyTypeStmt = toC.find((i) => i.symbols.some((s) => s.name === "OnlyType"));
		if (!onlyTypeStmt || !onlyTypeStmt.symbols.every((s) => s.isTypeOnly)) {
			throw new Error("layer-boundary-scan fixtures: FAILED — `import type { OnlyType }` was not classified as fully type-only");
		}
		const valueStmt = toC.find((i) => i.symbols.some((s) => s.name === "fromC") && i.statementKind === "import" && i.symbols.length === 1);
		if (!valueStmt || valueStmt.symbols.some((s) => s.isTypeOnly)) {
			throw new Error("layer-boundary-scan fixtures: FAILED — `import { fromC }` was not classified as a value import");
		}

		// 4. Multi-line import must resolve correctly (this is the one a raw
		//    grep/regex approach got wrong earlier this session).
		if (!allSymbols.includes("alsoFromC")) {
			throw new Error("layer-boundary-scan fixtures: FAILED — the multi-line `import {\\n\\talsoFromC,\\n} from ...` statement was not detected");
		}

		// 5. Aliased import resolves to the REAL imported name, not the local
		// alias — both `import { fromC }` and `import { fromC as renamedFromC }`
		// must independently report symbol name "fromC" (never "renamedFromC"),
		// so there must be at least 2 distinct statements carrying it.
		const fromCStatements = toC.filter((i) => i.symbols.some((s) => s.name === "fromC"));
		if (fromCStatements.length < 2) {
			throw new Error(
				`layer-boundary-scan fixtures: FAILED — expected >=2 statements resolving to real name "fromC" (plain + aliased), got ${fromCStatements.length}`,
			);
		}
		if (allSymbols.includes("renamedFromC")) {
			throw new Error('layer-boundary-scan fixtures: FAILED — aliased import reported the LOCAL alias "renamedFromC" instead of the real imported name "fromC"');
		}

		// 6. Namespace import detected.
		if (!allSymbols.some((s) => s.startsWith("* as NsC"))) {
			throw new Error("layer-boundary-scan fixtures: FAILED — namespace import `* as NsC` was not detected");
		}

		// 7. Mixed type+value in one statement: per-symbol classification, not
		//    per-statement — the exact bug class a whole-statement heuristic
		//    would get wrong. Real names are reported (not the local aliases
		//    `valueOne`/`typeOne`), per check #5's requirement — this statement
		//    is identified by being the ONE with exactly 2 symbols, both real
		//    names (fromC + OnlyType) present together.
		const mixedStmt = toC.find((i) => i.symbols.length === 2 && i.symbols.some((s) => s.name === "fromC") && i.symbols.some((s) => s.name === "OnlyType"));
		if (!mixedStmt) {
			throw new Error("layer-boundary-scan fixtures: FAILED — mixed statement `{ fromC as valueOne, type OnlyType as typeOne }` not found");
		}
		const valueSym = mixedStmt.symbols.find((s) => s.name === "fromC");
		const typeSym = mixedStmt.symbols.find((s) => s.name === "OnlyType");
		if (valueSym?.isTypeOnly !== false || typeSym?.isTypeOnly !== true) {
			throw new Error(
				`layer-boundary-scan fixtures: FAILED — mixed-statement per-symbol type classification wrong: ${JSON.stringify(mixedStmt)}`,
			);
		}
		if (allSymbols.includes("valueOne") || allSymbols.includes("typeOne")) {
			throw new Error('layer-boundary-scan fixtures: FAILED — mixed statement reported a LOCAL alias ("valueOne"/"typeOne") instead of the real imported names');
		}

		// 8. Re-export (value and type-only) detected.
		if (!toC.some((i) => i.statementKind === "export" && i.symbols.some((s) => s.name === "fromC" && !s.isTypeOnly))) {
			throw new Error("layer-boundary-scan fixtures: FAILED — value re-export `export { fromC as reexported } from ...` not detected");
		}
		if (!toC.some((i) => i.statementKind === "export" && i.symbols.some((s) => s.name === "OnlyType" && s.isTypeOnly))) {
			throw new Error("layer-boundary-scan fixtures: FAILED — type-only re-export `export type { OnlyType as reexportedType } from ...` not detected");
		}

		// 9. Dynamic import() detected.
		if (!toC.some((i) => i.statementKind === "dynamic-import")) {
			throw new Error("layer-boundary-scan fixtures: FAILED — dynamic `await import(\"@hyperidle/fixture-c\")` not detected");
		}

		// 10. Unclassified package must throw, not silently pass through.
		const unclassifiedRoot = mkdtempSync(join(tmpdir(), "layer-boundary-scan-fixture-unclassified-"));
		try {
			writeFixtureFile(unclassifiedRoot, "packages/mystery-new-thing/package.json", JSON.stringify({ name: "@hyperidle/mystery-new-thing" }));
			let threw = false;
			try {
				discoverAllPackages(unclassifiedRoot);
			} catch {
				threw = true;
			}
			if (!threw) {
				throw new Error(
					"layer-boundary-scan fixtures: FAILED — an unclassified packages/<x>/ directory did not throw (a new package must be classified on purpose, never silently skipped)",
				);
			}
		} finally {
			rmSync(unclassifiedRoot, { recursive: true, force: true });
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	process.stdout.write("layer-boundary-scan fixtures: PASS (10/10 statement-shape checks + unclassified-package throw check)\n");
}

// --- CLI entrypoint -------------------------------------------------------

function main(): void {
	const root = process.cwd();

	// Mechanism 1 — direct import (this file's own scan).
	const imports = scanAllCrossLayerImports(root);
	const byPair = new Map<string, { from: string; to: string; count: number; typeOnlyCount: number; valueCount: number }>();
	for (const imp of imports) {
		const key = `${imp.fromPackage} -> ${imp.toPackage}`;
		const entry = byPair.get(key) ?? { from: imp.fromPackage, to: imp.toPackage, count: 0, typeOnlyCount: 0, valueCount: 0 };
		entry.count += 1;
		for (const s of imp.symbols) {
			if (s.isTypeOnly) entry.typeOnlyCount += 1;
			else entry.valueCount += 1;
		}
		byPair.set(key, entry);
	}

	// Mechanism 2 (EventBus) and 3 (hidden composition bundle) — reuse the
	// already-fixed detectors from generate-dependency-graph.ts rather than
	// re-implementing them, so there is exactly one place each mechanism's
	// logic lives.
	const services = discoverServices(root);
	const eventEdges = detectEventEdges(root, services);
	const hiddenEdges = detectHiddenCompositionEdges(root, services);

	process.stderr.write(
		`layer-boundary-scan: ${discoverAllPackages(root).length} packages classified, zero unclassified (would have thrown).\n`,
	);
	process.stderr.write(
		`layer-boundary-scan: ${imports.length} cross-layer import statements found, across ${byPair.size} distinct (package -> package) pairs.\n\n`,
	);

	process.stderr.write("=== Mechanism 1: DIRECT IMPORT — by (package -> package) pair ===\n");
	for (const { from, to, count, typeOnlyCount, valueCount } of [...byPair.values()].sort(
		(a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
	)) {
		process.stderr.write(`  ${from} -> ${to}  (${count} statement(s): ${valueCount} value symbol(s), ${typeOnlyCount} type-only symbol(s))\n`);
	}
	process.stderr.write("\n=== Mechanism 1: every statement, file:line ===\n");
	for (const imp of imports) {
		const symbolsText = imp.symbols.map((s) => (s.isTypeOnly ? `type ${s.name}` : s.name)).join(", ");
		process.stderr.write(
			`  [${imp.statementKind}] ${imp.file}:${imp.line}  ${imp.fromPackage} -> ${imp.toPackage} (${imp.toLayerOrKind})  { ${symbolsText} }\n`,
		);
	}

	process.stderr.write(`\n=== Mechanism 2: EVENTBUS — ${eventEdges.length} edge(s) ===\n`);
	for (const e of eventEdges) {
		process.stderr.write(`  ${e.source} -> ${e.target}  (${e.eventType})\n`);
	}

	process.stderr.write(`\n=== Mechanism 3: HIDDEN COMPOSITION BUNDLE — ${hiddenEdges.length} edge(s) ===\n`);
	for (const e of hiddenEdges) {
		process.stderr.write(`  ${e.consumer} (${e.consumerLayer}) -> ${e.provider} (${e.providerLayer})  via ${e.viaType}, ${e.file}\n`);
	}

	const outPath = join(root, "plans/AU19/layer-boundary-scan.json");
	writeFileSync(
		outPath,
		JSON.stringify(
			{
				generatedAt: "2026-08-03",
				packages: discoverAllPackages(root),
				mechanism1DirectImports: imports,
				mechanism1ByPair: [...byPair.values()],
				mechanism2EventBus: eventEdges,
				mechanism3HiddenCompositionBundle: hiddenEdges,
			},
			null,
			2,
		),
	);
	process.stderr.write(`\nWrote ${outPath}\n`);
}

const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	if (process.argv.includes("--fixtures")) {
		fixtureCheck();
	} else {
		main();
	}
}
