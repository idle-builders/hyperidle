#!/usr/bin/env tsx
/**
 * K4 — DS-vs-Custom CLI Inspector.
 *
 * `npm run ds:inspect <page-path>` statically analyzes a TSX file and reports JSX element
 * provenance: which elements come from the design system, the web shell, DaisyUI primitives,
 * other custom components, or are inline-styled raw HTML — with reuse-candidate hints.
 *
 * Heuristics (deterministic, reproducible across runs):
 *  - design-system:    JSX tag bound to an import from `@hyperidle/design-system`
 *  - web-shell:        JSX tag bound to an import from `packages/web/src/shell/` (or relative ./shell/, ../shell/)
 *  - custom-component: JSX tag bound to any other local import (resolved within packages/web/src or packages/design-system/src)
 *  - daisyui-primitive: raw HTML element whose className starts with a canonical DaisyUI root token
 *  - inline-styled:    raw HTML element with ≥3 layout/spacing tailwind utilities and not a daisyui-primitive
 *
 * Transitive walk: follow only local imports under packages/web/src/** and packages/design-system/src/**.
 * Never follow into node_modules. Aliased imports (@hyperidle/design-system) are bucketed but NOT followed.
 *
 * Reuse-candidate fingerprints live below in `FINGERPRINTS` — extensible by appending entries.
 *
 * @lore K4: TypeScript Compiler API only. No new dependency added (typescript is already present).
 * @lore K4: tier values are surfaced via the existing K2 `data-ds-*` contract; this script does
 *           not need to inspect rendered DOM — provenance is determined statically from imports.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Bucket =
	| "design-system"
	| "web-shell"
	| "daisyui-primitive"
	| "custom-component"
	| "inline-styled";

export interface ElementEntry {
	component: string;
	file: string;
	line: number;
	bucket: Bucket;
	reuseCandidate?: string;
	classes?: string;
}

export interface InspectReport {
	designSystem: ElementEntry[];
	webShell: ElementEntry[];
	daisyuiPrimitive: ElementEntry[];
	customComponent: ElementEntry[];
	inlineStyled: ElementEntry[];
	summary: {
		total: number;
		designSystemPercent: number;
		entryFile: string;
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical DaisyUI class roots we treat as primitives. Detection: split a node's className
 * on whitespace, take the first token, check membership. A `<div className="btn btn-primary">`
 * is therefore a daisyui-primitive `btn`. Source: https://daisyui.com/components/.
 */
const DAISY_ROOTS = new Set([
	"btn",
	"modal",
	"badge",
	"menu",
	"tabs",
	"input",
	"textarea",
	"select",
	"checkbox",
	"radio",
	"tooltip",
	"alert",
	"skeleton",
	"avatar",
	"divider",
	"collapse",
	"loading",
	"toggle",
	"drawer",
	"dropdown",
]);

/**
 * Tailwind utility prefixes we count as "layout/spacing" for the inline-styled threshold.
 * A raw HTML element with ≥3 of these counts as inline-styled and is a reuse candidate.
 */
const LAYOUT_PREFIXES = [
	"flex",
	"grid",
	"inline-flex",
	"inline-grid",
	"items-",
	"justify-",
	"content-",
	"self-",
	"gap-",
	"p-",
	"px-",
	"py-",
	"pt-",
	"pb-",
	"pl-",
	"pr-",
	"m-",
	"mx-",
	"my-",
	"mt-",
	"mb-",
	"ml-",
	"mr-",
	"w-",
	"h-",
	"min-w-",
	"min-h-",
	"max-w-",
	"max-h-",
	"rounded",
	"rounded-",
	"shadow",
	"shadow-",
	"border",
	"border-",
	"bg-",
	"text-",
	"font-",
	"uppercase",
	"lowercase",
	"capitalize",
	"truncate",
	"overflow-",
	"absolute",
	"relative",
	"fixed",
	"sticky",
	"top-",
	"bottom-",
	"left-",
	"right-",
	"z-",
];

function isLayoutClass(cls: string): boolean {
	if (LAYOUT_PREFIXES.includes(cls)) return true;
	for (const prefix of LAYOUT_PREFIXES) {
		if (prefix.endsWith("-") && cls.startsWith(prefix)) return true;
	}
	return false;
}

/**
 * Reuse-candidate fingerprint table — class-set signatures that suggest swapping an inline-styled
 * element for an existing design-system primitive. A match requires every class in `must` to be
 * present (order-insensitive). Add entries below as new patterns emerge — single source of truth.
 *
 * Format:
 *   { must: [...required classes...], suggest: "ComponentName" }
 *
 * Tested cases:
 *  - StatusChip: pill-shaped badge with uppercase text and round-full corners
 *  - KeyValue:   labeled value row (flex-row, justify-between)
 *  - Tag:        small inline label (rounded, px/py micro padding, no uppercase)
 */
const FINGERPRINTS: ReadonlyArray<{
	must: ReadonlyArray<string>;
	suggest: string;
}> = [
	{ must: ["inline-flex", "items-center", "rounded-full", "uppercase"], suggest: "StatusChip" },
	{ must: ["rounded-full", "uppercase"], suggest: "StatusChip" },
	{ must: ["flex", "items-center", "justify-between"], suggest: "KeyValue" },
];

function classesArray(className: string | undefined): string[] {
	if (!className) return [];
	return className.split(/\s+/).filter(Boolean);
}

function findReuseCandidate(classes: string[]): string | undefined {
	const set = new Set(classes);
	for (const fp of FINGERPRINTS) {
		if (fp.must.every((c) => set.has(c))) return fp.suggest;
	}
	return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// AST walking
// ─────────────────────────────────────────────────────────────────────────────

interface ImportInfo {
	moduleSpecifier: string;
	resolvedFile?: string; // absolute path on disk if local
	bucket: "design-system" | "web-shell" | "custom-component" | "external";
	// Map of localName -> imported name (or "default")
	bindings: Map<string, string>;
}

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

function classifyImport(spec: string, fromFile: string): ImportInfo["bucket"] {
	if (spec === "@hyperidle/design-system" || spec.startsWith("@hyperidle/design-system/")) {
		return "design-system";
	}
	if (spec.startsWith(".")) {
		const abs = resolve(dirname(fromFile), spec);
		const rel = relative(REPO_ROOT, abs);
		if (rel.includes("packages/web/src/shell")) return "web-shell";
		// any other local import
		return "custom-component";
	}
	return "external";
}

const TSX_EXTS = [".tsx", ".ts"];

function resolveLocalImport(spec: string, fromFile: string): string | undefined {
	if (!spec.startsWith(".")) return undefined;
	const base = resolve(dirname(fromFile), spec);
	for (const ext of TSX_EXTS) {
		if (existsSync(base + ext)) return base + ext;
	}
	if (existsSync(base) && statSync(base).isDirectory()) {
		for (const ext of TSX_EXTS) {
			const idx = join(base, `index${ext}`);
			if (existsSync(idx)) return idx;
		}
	}
	// strip stray `.js` (TS-style ESM imports map .js -> .ts)
	if (spec.endsWith(".js")) {
		const stripped = base.slice(0, -3);
		for (const ext of TSX_EXTS) {
			if (existsSync(stripped + ext)) return stripped + ext;
		}
	}
	return undefined;
}

function isFollowable(absPath: string): boolean {
	const rel = relative(REPO_ROOT, absPath);
	return rel.startsWith("packages/web/src/") || rel.startsWith("packages/design-system/src/");
}

function parseImports(sourceFile: ts.SourceFile, file: string): ImportInfo[] {
	const out: ImportInfo[] = [];
	for (const stmt of sourceFile.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const spec = stmt.moduleSpecifier.text;
		const bucket = classifyImport(spec, file);
		const bindings = new Map<string, string>();
		const clause = stmt.importClause;
		if (clause) {
			if (clause.name) {
				bindings.set(clause.name.text, "default");
			}
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const el of clause.namedBindings.elements) {
					const local = el.name.text;
					const imported = el.propertyName?.text ?? local;
					bindings.set(local, imported);
				}
			}
			// namespace imports (e.g. `import * as X from`) are skipped — JSX cannot use them as tags
			// without dot-access, which we treat as custom-component below.
		}
		const info: ImportInfo = {
			moduleSpecifier: spec,
			bucket,
			bindings,
		};
		if (bucket !== "external") {
			info.resolvedFile = resolveLocalImport(spec, file);
		}
		out.push(info);
	}
	return out;
}

/**
 * Look up the bucket + originating import for a JSX tag name in the local file's import table.
 * Returns undefined for raw HTML tags (lowercase) or unknown identifiers (treated as locally
 * defined components by the caller).
 */
function lookupTag(
	tagName: string,
	imports: ImportInfo[],
): { bucket: ImportInfo["bucket"]; importInfo: ImportInfo } | undefined {
	for (const imp of imports) {
		if (imp.bindings.has(tagName)) return { bucket: imp.bucket, importInfo: imp };
	}
	return undefined;
}

function getJsxTagName(node: ts.JsxOpeningLikeElement): string {
	const tag = node.tagName;
	if (ts.isIdentifier(tag)) return tag.text;
	if (ts.isPropertyAccessExpression(tag)) {
		// e.g. <Foo.Bar /> — surface as "Foo.Bar"
		return tag.getText();
	}
	return tag.getText();
}

function getClassName(node: ts.JsxOpeningLikeElement): string | undefined {
	const attrs = node.attributes.properties;
	for (const attr of attrs) {
		if (!ts.isJsxAttribute(attr)) continue;
		if (attr.name?.getText() !== "className") continue;
		const init = attr.initializer;
		if (!init) return undefined;
		if (ts.isStringLiteral(init)) return init.text;
		if (ts.isJsxExpression(init) && init.expression) {
			const expr = init.expression;
			if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
				return expr.text;
			}
			// best-effort: if it's a template with no substitutions, use head
			if (ts.isTemplateExpression(expr)) {
				return expr.head.text; // partial — better than nothing
			}
		}
	}
	return undefined;
}

function isLowercaseHtml(tagName: string): boolean {
	if (tagName.length === 0) return false;
	const first = tagName[0];
	return first === first?.toLowerCase() && first !== first?.toUpperCase();
}

interface WalkContext {
	file: string;
	imports: ImportInfo[];
	report: InspectReport;
	visitedFiles: Set<string>;
}

function pushEntry(report: InspectReport, entry: ElementEntry): void {
	switch (entry.bucket) {
		case "design-system":
			report.designSystem.push(entry);
			break;
		case "web-shell":
			report.webShell.push(entry);
			break;
		case "daisyui-primitive":
			report.daisyuiPrimitive.push(entry);
			break;
		case "custom-component":
			report.customComponent.push(entry);
			break;
		case "inline-styled":
			report.inlineStyled.push(entry);
			break;
	}
}

function visitJsx(node: ts.Node, ctx: WalkContext, sourceFile: ts.SourceFile): void {
	if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
		const tagName = getJsxTagName(node);
		const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		const className = getClassName(node);
		const classes = classesArray(className);

		if (isLowercaseHtml(tagName)) {
			// raw HTML — daisyui-primitive vs inline-styled vs ignored
			const root = classes[0];
			if (root && DAISY_ROOTS.has(root)) {
				pushEntry(ctx.report, {
					component: tagName,
					file: ctx.file,
					line: line + 1,
					bucket: "daisyui-primitive",
					classes: className,
				});
			} else if (classes.filter(isLayoutClass).length >= 3) {
				const reuseCandidate = findReuseCandidate(classes);
				const entry: ElementEntry = {
					component: tagName,
					file: ctx.file,
					line: line + 1,
					bucket: "inline-styled",
					classes: className,
				};
				if (reuseCandidate !== undefined) entry.reuseCandidate = reuseCandidate;
				pushEntry(ctx.report, entry);
			}
			// else: ignore (unstyled / minimally styled raw element)
		} else {
			const lookup = lookupTag(tagName, ctx.imports);
			if (lookup) {
				const bucketMap: Record<ImportInfo["bucket"], Bucket> = {
					"design-system": "design-system",
					"web-shell": "web-shell",
					"custom-component": "custom-component",
					external: "custom-component",
				};
				const bucket = bucketMap[lookup.bucket];
				const entry: ElementEntry = {
					component: tagName,
					file: ctx.file,
					line: line + 1,
					bucket,
				};
				if (className !== undefined) entry.classes = className;
				pushEntry(ctx.report, entry);
			}
			// else: locally defined component (not imported) — skip; its body is in this file
			// already and will be walked by ts.forEachChild below.
		}
	}
	ts.forEachChild(node, (child) => {
		visitJsx(child, ctx, sourceFile);
	});
}

function readSourceFile(file: string): ts.SourceFile {
	const text = readFileSync(file, "utf8");
	return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walkFile(file: string, report: InspectReport, visited: Set<string>): void {
	if (visited.has(file)) return;
	visited.add(file);
	const sf = readSourceFile(file);
	const imports = parseImports(sf, file);
	const ctx: WalkContext = { file, imports, report, visitedFiles: visited };
	ts.forEachChild(sf, (n) => {
		visitJsx(n, ctx, sf);
	});
	for (const imp of imports) {
		if (!imp.resolvedFile) continue;
		if (!isFollowable(imp.resolvedFile)) continue;
		// Don't follow design-system source — its components are tracked at the call site.
		const rel = relative(REPO_ROOT, imp.resolvedFile);
		if (rel.startsWith("packages/design-system/src/")) continue;
		// Web shell components ARE followed for transitive custom JSX inside them, since they
		// are still local to the codebase.
		walkFile(imp.resolvedFile, report, visited);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function inspectPage(entryFile: string): InspectReport {
	const abs = isAbsolute(entryFile) ? entryFile : resolve(process.cwd(), entryFile);
	if (!existsSync(abs)) {
		throw new Error(`File not found: ${entryFile}`);
	}
	const report: InspectReport = {
		designSystem: [],
		webShell: [],
		daisyuiPrimitive: [],
		customComponent: [],
		inlineStyled: [],
		summary: { total: 0, designSystemPercent: 0, entryFile: abs },
	};
	walkFile(abs, report, new Set());
	const total =
		report.designSystem.length +
		report.webShell.length +
		report.daisyuiPrimitive.length +
		report.customComponent.length +
		report.inlineStyled.length;
	const dsPct = total === 0 ? 0 : Math.round((report.designSystem.length / total) * 1000) / 10;
	report.summary.total = total;
	report.summary.designSystemPercent = dsPct;
	return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function relForDisplay(p: string): string {
	return relative(REPO_ROOT, p) || p;
}

function formatHuman(report: InspectReport): string {
	const lines: string[] = [];
	lines.push(`DS Inspector — ${relForDisplay(report.summary.entryFile)}`);
	lines.push("─".repeat(60));
	lines.push(`design-system     : ${String(report.designSystem.length).padStart(4)}`);
	lines.push(`web-shell         : ${String(report.webShell.length).padStart(4)}`);
	lines.push(`daisyui-primitive : ${String(report.daisyuiPrimitive.length).padStart(4)}`);
	lines.push(`custom-component  : ${String(report.customComponent.length).padStart(4)}`);
	lines.push(`inline-styled     : ${String(report.inlineStyled.length).padStart(4)}`);
	lines.push(`total             : ${String(report.summary.total).padStart(4)}`);
	lines.push(`design-system %   : ${report.summary.designSystemPercent.toFixed(1)}%`);
	if (report.inlineStyled.length > 0) {
		lines.push("");
		lines.push("inline-styled (reuse candidates):");
		for (const e of report.inlineStyled) {
			const hint = e.reuseCandidate ? `  → reuseCandidate: ${e.reuseCandidate}` : "";
			lines.push(`  ${relForDisplay(e.file)}:${e.line}  <${e.component}>${hint}`);
		}
	}
	if (report.customComponent.length > 0) {
		lines.push("");
		lines.push("custom-component (local components):");
		for (const e of report.customComponent) {
			lines.push(`  ${relForDisplay(e.file)}:${e.line}  <${e.component}>`);
		}
	}
	return lines.join("\n");
}

function main(argv: string[]): number {
	const args = argv.slice(2);
	const positional = args.filter((a) => !a.startsWith("--"));
	const flags = new Set(args.filter((a) => a.startsWith("--")));
	if (positional.length !== 1) {
		process.stderr.write(
			"Usage: npm run ds:inspect <page-path> [--format=json]\n" +
				"  <page-path>   path to a .tsx file under packages/web/src/\n",
		);
		return 1;
	}
	const file = positional[0];
	if (!file) {
		process.stderr.write("Usage: npm run ds:inspect <page-path> [--format=json]\n");
		return 1;
	}
	let report: InspectReport;
	try {
		report = inspectPage(file);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		process.stderr.write(`Error: ${msg}\n`);
		return 1;
	}
	const json = flags.has("--format=json") || flags.has("--json");
	if (json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		process.stdout.write(`${formatHuman(report)}\n`);
	}
	return 0;
}

// Node-compatible entrypoint check (replaces Bun's import.meta.main).
const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));
if (isEntrypoint) {
	process.exit(main(process.argv));
}
