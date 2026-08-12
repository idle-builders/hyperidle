#!/usr/bin/env node
// AZ7 measurement scanner — static, reproducible.
// Usage: node scan.mjs <repoRoot> <outDir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

const ROOT_ARG = process.argv[2];
if (!ROOT_ARG) throw new Error("usage: node <script> <repoRoot> <outDir>");
const ts = createRequire(`${ROOT_ARG}/package.json`)("typescript");

const ROOT = ROOT_ARG;
const OUT = process.argv[3];
if (!ROOT || !OUT) throw new Error("usage: scan.mjs <repoRoot> <outDir>");
mkdirSync(OUT, { recursive: true });

// ---- discovery: role roots, never a hardcoded package path -----------------
const ROLE_ROOTS = ["layers", "framework", "applications", "tools"];
function walk(dir, acc) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return acc;
	}
	for (const e of entries) {
		if (e === "node_modules" || e === "dist" || e === ".git") continue;
		const p = join(dir, e);
		const st = statSync(p);
		if (st.isDirectory()) walk(p, acc);
		else if (/\.tsx$/.test(e)) acc.push(p);
	}
	return acc;
}
const all = [];
for (const r of ROLE_ROOTS) walk(join(ROOT, r), all);
if (all.length === 0) throw new Error("HARD FAIL: scan found zero .tsx files under role roots");

// ---- world classification (CLAUDE.md) --------------------------------------
const SHIPPING = new Set(["layers", "framework", "applications"]);
function isProduction(rel) {
	const segs = rel.split("/");
	if (!SHIPPING.has(segs[0])) return false;
	if (/\.(test|stories|spec)\.tsx$/.test(rel)) return false;
	if (segs.some((s) => s.startsWith("__"))) return false;
	return true;
}
const files = all
	.map((p) => relative(ROOT, p))
	.filter(isProduction)
	.sort();
if (files.length === 0) throw new Error("HARD FAIL: zero production .tsx files");

// ---- JSX parsing -----------------------------------------------------------
const DYN = "«dyn»";

// AZ7 review-round-2 NEW-1: a class string held in a same-file `const` before
// reaching `className` (CommentRow.tsx's `avatarClass` ternary; ~30 more
// sites are module-level extracted class-string constants, e.g.
// ArtifactStackItem.tsx's PILL) used to be invisible to this scanner — an
// Identifier matched none of the visit() cases and fell through to DYN.
// buildConstMap resolves single-declarator `const NAME = <expr>` bindings
// per-file so visit() can follow an Identifier to its initializer, the same
// (deliberately conservative — const only, single declarator) resolution
// `createConstIdentifierResolver` in `tools/eslint-plugin-design/src/util.ts`
// does for the ESLint rule, so the two report the same population.
function buildConstMap(sf) {
	const map = new Map();
	function walk(node) {
		if (
			ts.isVariableDeclarationList(node) &&
			(node.flags & ts.NodeFlags.Const) !== 0
		) {
			for (const decl of node.declarations) {
				if (ts.isIdentifier(decl.name) && decl.initializer) {
					// A name declared more than once in the file (shadowing across
					// scopes) is ambiguous under this simple per-file map — drop it
					// rather than guess which declaration a given reference means.
					if (map.has(decl.name.text)) {
						map.set(decl.name.text, null);
					} else {
						map.set(decl.name.text, decl.initializer);
					}
				}
			}
		}
		ts.forEachChild(node, walk);
	}
	walk(sf);
	return map;
}

function classTextOf(attr, constMap) {
	// Concatenate every string literal reachable inside the className attribute.
	// Non-literal parts become the DYN marker so a dynamic recipe is not silently
	// counted as a static one.
	const out = [];
	const seen = new Set();
	function visit(n) {
		if (!n) return;
		if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
			out.push(n.text);
			return;
		}
		if (ts.isTemplateExpression(n)) {
			out.push(n.head.text);
			for (const sp of n.templateSpans) {
				visit(sp.expression);
				out.push(sp.literal.text);
			}
			return;
		}
		if (ts.isJsxExpression(n)) return visit(n.expression);
		if (ts.isBinaryExpression(n)) {
			visit(n.left);
			visit(n.right);
			return;
		}
		if (ts.isConditionalExpression(n)) {
			visit(n.whenTrue);
			visit(n.whenFalse);
			return;
		}
		if (ts.isArrayLiteralExpression(n)) {
			for (const el of n.elements) visit(el);
			return;
		}
		if (ts.isCallExpression(n)) {
			for (const a of n.arguments) visit(a);
			// `[...].join(" ")` — also visit the receiver
			if (ts.isPropertyAccessExpression(n.expression)) visit(n.expression.expression);
			return;
		}
		if (ts.isParenthesizedExpression(n)) return visit(n.expression);
		if (ts.isIdentifier(n) && constMap) {
			const init = constMap.get(n.text);
			if (init && !seen.has(n.text)) {
				seen.add(n.text);
				visit(init);
				return;
			}
		}
		out.push(DYN);
	}
	visit(attr.initializer);
	return out.join(" ").replace(/\s+/g, " ").trim();
}

const elements = []; // {file,line,tag,cls,attrs:Set}
for (const rel of files) {
	const src = readFileSync(join(ROOT, rel), "utf8");
	const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const constMap = buildConstMap(sf);
	function visit(node) {
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			const tag = node.tagName.getText(sf);
			let cls = "";
			const attrNames = [];
			for (const a of node.attributes.properties) {
				if (!ts.isJsxAttribute(a)) {
					attrNames.push("...spread");
					continue;
				}
				const n = a.name.getText(sf);
				attrNames.push(n);
				if (n === "className") cls = classTextOf(a, constMap);
			}
			const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
			elements.push({ file: rel, line: line + 1, tag, cls, attrs: attrNames });
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
}
if (elements.length === 0) throw new Error("HARD FAIL: zero JSX elements parsed");

const tokensOf = (cls) => cls.split(/\s+/).filter(Boolean);

// ---- axis: radius ----------------------------------------------------------
const RADIUS_RE =
	/^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?(-\[[^\]]+\])?$/;
const radius = new Map(); // spelling -> count
const radiusSites = [];
for (const el of elements) {
	for (const t of tokensOf(el.cls)) {
		if (RADIUS_RE.test(t)) {
			radius.set(t, (radius.get(t) ?? 0) + 1);
			radiusSites.push({ file: el.file, line: el.line, tag: el.tag, token: t });
		}
	}
}
// css files too
const cssFiles = [];
(function walkCss(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const e of entries) {
		if (e === "node_modules" || e === "dist" || e === ".git") continue;
		const p = join(dir, e);
		const st = statSync(p);
		if (st.isDirectory()) walkCss(p);
		else if (/\.css$/.test(e)) cssFiles.push(relative(ROOT, p));
	}
})(join(ROOT, "framework"));
(function () {
	for (const r of ["layers", "applications"]) {
		(function w(dir) {
			let entries;
			try {
				entries = readdirSync(dir);
			} catch {
				return;
			}
			for (const e of entries) {
				if (e === "node_modules" || e === "dist") continue;
				const p = join(dir, e);
				const st = statSync(p);
				if (st.isDirectory()) w(p);
				else if (/\.css$/.test(e)) cssFiles.push(relative(ROOT, p));
			}
		})(join(ROOT, r));
	}
})();
const cssRadius = [];
for (const rel of cssFiles) {
	const txt = readFileSync(join(ROOT, rel), "utf8");
	for (const m of txt.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
		cssRadius.push({ file: rel, value: m[1].trim() });
	}
}

// ---- axis: buttons ---------------------------------------------------------
// DaisyUI component classes are part of a control's recipe — they carry the
// whole fill/border/height/radius package.
const DAISY_RE = /^(btn|input|textarea|select|badge|checkbox|toggle|radio|file-input|range|tab|tabs|card|menu|dropdown|modal|alert|kbd)(-[a-z0-9]+)*$/;
const RECIPE_RE =
	/^(bg-|border|rounded|h-\[|h-\d|min-h-|max-h-|py-|px-|p-\d|p-\[|pt-|pb-|pl-|pr-|text-\[\d+px\]|text-(xs|sm|base|lg|xl)$|font-|leading-|gap-|shadow|ring|outline|uppercase|lowercase|capitalize|tracking-)/;
function recipeKey(cls) {
	const toks = tokensOf(cls)
		.filter((t) => RECIPE_RE.test(t) || DAISY_RE.test(t) || t === DYN)
		.map((t) => t.replace(/^(hover|focus|active|disabled|lg|md|sm|dark|group-hover|focus-visible):.*$/, ""))
		.filter(Boolean);
	return [...new Set(toks)].sort().join(" ");
}
const rawButtons = elements.filter((e) => e.tag === "button");
const dsButtons = elements.filter((e) => e.tag === "Button");
const btnRecipes = new Map();
for (const b of rawButtons) {
	const k = recipeKey(b.cls) || "(no visual classes)";
	if (!btnRecipes.has(k)) btnRecipes.set(k, []);
	btnRecipes.get(k).push(`${b.file}:${b.line}`);
}

// ---- axis: inputs ----------------------------------------------------------
const RAW_INPUT_TAGS = new Set(["input", "textarea", "select"]);
const rawInputs = elements.filter((e) => RAW_INPUT_TAGS.has(e.tag));
const inputRecipes = new Map();
for (const b of rawInputs) {
	const k = `${b.tag}|${recipeKey(b.cls) || "(no visual classes)"}`;
	if (!inputRecipes.has(k)) inputRecipes.set(k, []);
	inputRecipes.get(k).push(`${b.file}:${b.line}`);
}
const dsInputLike = elements.filter((e) =>
	["Input", "SearchField", "Select", "Composer", "BodyEditor", "RoleCombobox", "Checkbox", "Toggle"].includes(e.tag),
);

// ---- axis: filled surfaces -------------------------------------------------
const SURFACE_RE = /--surface-[a-z-]+|--accent-[a-z-]+-dim|--status-[a-z]+-dim/g;
const surfaceUse = new Map(); // token -> [{file,line,tag,radius,border}]
for (const el of elements) {
	const bgToks = tokensOf(el.cls).filter((t) => /^bg-/.test(t));
	for (const t of bgToks) {
		for (const m of t.matchAll(SURFACE_RE)) {
			const tok = m[0];
			if (!surfaceUse.has(tok)) surfaceUse.set(tok, []);
			surfaceUse.get(tok).push({
				file: el.file,
				line: el.line,
				tag: el.tag,
				cls: el.cls,
				radius: tokensOf(el.cls).filter((x) => RADIUS_RE.test(x)),
				border: tokensOf(el.cls).filter((x) => /^border/.test(x)),
			});
		}
	}
}

// ---- axis: status ----------------------------------------------------------
const statusChipUses = elements.filter((e) => e.tag === "StatusChip");
const statusChipFiles = [...new Set(statusChipUses.map((e) => e.file))];
// candidate local status presentations: pill/dot/uppercase-mono treatments that
// are not StatusChip
const localStatusCandidates = [];
for (const el of elements) {
	if (el.tag === "StatusChip") continue;
	const cls = el.cls;
	const t = tokensOf(cls);
	const pill = t.some((x) => /^rounded-full$|^rounded-\[9999px\]$|^rounded-\[var\(--r-pill\)\]$/.test(x));
	const mono = /font-\[family-name:var\(--font-mono\)\]|font-mono/.test(cls);
	const upper = t.includes("uppercase");
	const tinted = /color-mix\(/.test(cls);
	const dot = t.includes("rounded-full") && t.some((x) => /^h-\[\d+px\]$/.test(x)) && t.some((x) => /^w-\[\d+px\]$/.test(x));
	const score = [pill, mono, upper, tinted].filter(Boolean).length;
	if (dot || (score >= 2 && /status|state|kind|verdict|badge|chip|tag|pill/i.test(cls + el.file))) {
		localStatusCandidates.push({ file: el.file, line: el.line, tag: el.tag, pill, mono, upper, tinted, dot, cls });
	}
}

// ---- output ----------------------------------------------------------------
const summary = {
	generatedFrom: "static scan of production .tsx under layers/ framework/ applications/",
	productionTsxFiles: files.length,
	jsxElements: elements.length,
	buttons: {
		rawButtonElements: rawButtons.length,
		distinctStaticRecipes: btnRecipes.size,
		dsButtonUses: dsButtons.length,
	},
	inputs: {
		rawInputElements: rawInputs.length,
		distinctStaticRecipes: inputRecipes.size,
		dsInputLikeUses: dsInputLike.length,
	},
	radius: Object.fromEntries([...radius.entries()].sort((a, b) => b[1] - a[1])),
	cssBorderRadiusDecls: cssRadius.length,
	surfaces: Object.fromEntries([...surfaceUse.entries()].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1])),
	status: {
		statusChipUses: statusChipUses.length,
		statusChipFiles: statusChipFiles.length,
		localStatusCandidates: localStatusCandidates.length,
	},
};
writeFileSync(join(OUT, "summary.json"), `${JSON.stringify(summary, null, "\t")}\n`);
writeFileSync(
	join(OUT, "button-recipes.json"),
	`${JSON.stringify(
		[...btnRecipes.entries()].map(([k, v]) => ({ recipe: k, count: v.length, sites: v })).sort((a, b) => b.count - a.count),
		null,
		"\t",
	)}\n`,
);
writeFileSync(
	join(OUT, "input-recipes.json"),
	`${JSON.stringify(
		[...inputRecipes.entries()].map(([k, v]) => ({ recipe: k, count: v.length, sites: v })).sort((a, b) => b.count - a.count),
		null,
		"\t",
	)}\n`,
);
writeFileSync(join(OUT, "radius-sites.json"), `${JSON.stringify(radiusSites, null, "\t")}\n`);
writeFileSync(join(OUT, "css-radius.json"), `${JSON.stringify(cssRadius, null, "\t")}\n`);
writeFileSync(join(OUT, "surface-sites.json"), `${JSON.stringify(Object.fromEntries(surfaceUse), null, "\t")}\n`);
writeFileSync(join(OUT, "status-sites.json"), `${JSON.stringify({ statusChipUses, localStatusCandidates }, null, "\t")}\n`);
console.log(JSON.stringify(summary, null, 2));
