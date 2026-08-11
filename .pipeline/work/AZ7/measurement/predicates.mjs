// Second pass: size the exact populations the proposed rules would flag.
// Reuses scan.mjs's parse by re-implementing the element walk (kept in one file
// so the numbers can be re-derived from a single command).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

const ROOT_ARG = process.argv[2];
if (!ROOT_ARG) throw new Error("usage: node <script> <repoRoot> <outDir>");
const ts = createRequire(`${ROOT_ARG}/package.json`)("typescript");

const ROOT = ROOT_ARG;
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const ROLE_ROOTS = ["layers", "framework", "applications"];
const acc = [];
function walk(dir) {
	let es;
	try {
		es = readdirSync(dir);
	} catch {
		return;
	}
	for (const e of es) {
		if (e === "node_modules" || e === "dist") continue;
		const p = join(dir, e);
		if (statSync(p).isDirectory()) walk(p);
		else if (/\.tsx$/.test(e)) acc.push(relative(ROOT, p));
	}
}
for (const r of ROLE_ROOTS) walk(join(ROOT, r));
if (acc.length === 0) throw new Error("HARD FAIL: zero tsx");
const isProd = (rel) =>
	!/\.(test|stories|spec)\.tsx$/.test(rel) && !rel.split("/").some((s) => s.startsWith("__"));

const DYN = "«dyn»";
function classTextOf(attr) {
	const out = [];
	function visit(n) {
		if (!n) return;
		if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return void out.push(n.text);
		if (ts.isTemplateExpression(n)) {
			out.push(n.head.text);
			for (const sp of n.templateSpans) {
				out.push(DYN);
				out.push(sp.literal.text);
			}
			return;
		}
		if (ts.isJsxExpression(n)) return visit(n.expression);
		if (ts.isBinaryExpression(n)) return void (visit(n.left), visit(n.right));
		if (ts.isConditionalExpression(n)) return void (visit(n.whenTrue), visit(n.whenFalse));
		if (ts.isArrayLiteralExpression(n)) return void n.elements.forEach(visit);
		if (ts.isCallExpression(n)) {
			n.arguments.forEach(visit);
			if (ts.isPropertyAccessExpression(n.expression)) visit(n.expression.expression);
			return;
		}
		if (ts.isParenthesizedExpression(n)) return visit(n.expression);
		out.push(DYN);
	}
	visit(attr.initializer);
	return out.join(" ").replace(/\s+/g, " ").trim();
}
const els = [];
for (const rel of acc) {
	const sf = ts.createSourceFile(rel, readFileSync(join(ROOT, rel), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	(function v(node) {
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			let cls = "";
			for (const a of node.attributes.properties)
				if (ts.isJsxAttribute(a) && a.name.getText(sf) === "className") cls = classTextOf(a);
			els.push({
				file: rel,
				line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
				tag: node.tagName.getText(sf),
				cls,
				prod: isProd(rel),
			});
		}
		ts.forEachChild(node, v);
	})(sf);
}
const tok = (c) => c.split(/\s+/).filter(Boolean);
const base = (t) => t.replace(/^[a-z-]+:/, ""); // strip variant prefixes (hover:, lg:, …)

const RADIUS_RE = /^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?(-\[[^\]]+\])?$/;
const TOKEN_RADIUS_RE = /^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?-\[var\(--r-(none|subtle|default|pill)\)\]$/;
const PILL = (t) => t === "rounded-full" || /^rounded(-[a-z]{1,2})?-\[var\(--r-pill\)\]$/.test(t) || t === "rounded-[9999px]";
const FILL_RE = /^bg-\[(var\(--(surface|accent|status)[a-z-]*\)|color-mix\([^\]]*\))\]$/;
const BORDER_TOKEN_RE = /^border(-[a-z]{1,2})?-\[(1\.5px|var\(--border[a-z-]*\))\]$/;
const DAISY_CONTROL = /^(btn|input|textarea|select|badge|checkbox|toggle|radio|file-input|range)(-[a-z0-9]+)*$/;
const CONTROL_TAGS = new Set(["button", "input", "textarea", "select"]);
const DS_CHIPS = new Set(["StatusChip", "Tag", "ReferenceChip", "ArtifactKindBadge", "RowDot", "LiveDot", "Avatar"]);

const R = { radiusNonToken: [], controlChrome: [], handrolledChip: [] };
for (const e of els) {
	const ts_ = tok(e.cls).map(base);
	// 1 — radius spelled as anything other than a --r-* token
	for (const t of ts_) if (RADIUS_RE.test(t) && !TOKEN_RADIUS_RE.test(t)) R.radiusNonToken.push({ ...e, token: t });
	// 2 — a raw control that paints its own chrome
	if (CONTROL_TAGS.has(e.tag)) {
		const fill = ts_.some((t) => FILL_RE.test(t));
		const border = ts_.some((t) => BORDER_TOKEN_RE.test(t));
		const daisy = ts_.some((t) => DAISY_CONTROL.test(t));
		const radius = ts_.some((t) => RADIUS_RE.test(t));
		if (fill || border || daisy || radius) R.controlChrome.push({ ...e, fill, border, daisy, radius });
	}
	// 3 — a hand-rolled chip: pill radius + a fill, on a non-DS-chip element
	if (!DS_CHIPS.has(e.tag) && !CONTROL_TAGS.has(e.tag)) {
		const pill = ts_.some(PILL);
		const fill = ts_.some((t) => FILL_RE.test(t));
		if (pill && fill) R.handrolledChip.push(e);
	}
}
const count = (a) => ({
	prod: a.filter((x) => x.prod).length,
	dev: a.filter((x) => !x.prod).length,
	prodFiles: new Set(a.filter((x) => x.prod).map((x) => x.file)).size,
});
const summary = {
	radiusNonToken: count(R.radiusNonToken),
	radiusNonTokenByToken: Object.fromEntries(
		Object.entries(
			R.radiusNonToken.filter((x) => x.prod).reduce((m, x) => ((m[x.token] = (m[x.token] ?? 0) + 1), m), {}),
		).sort((a, b) => b[1] - a[1]),
	),
	controlChrome: count(R.controlChrome),
	controlChromeByTag: Object.fromEntries(
		Object.entries(
			R.controlChrome.filter((x) => x.prod).reduce((m, x) => ((m[x.tag] = (m[x.tag] ?? 0) + 1), m), {}),
		).sort((a, b) => b[1] - a[1]),
	),
	controlChromeByPkg: Object.fromEntries(
		Object.entries(
			R.controlChrome
				.filter((x) => x.prod)
				.reduce((m, x) => {
					const k = x.file.startsWith("framework/design-system") ? "design-system" : "core-ui";
					m[k] = (m[k] ?? 0) + 1;
					return m;
				}, {}),
		),
	),
	handrolledChip: count(R.handrolledChip),
};
writeFileSync(join(OUT, "predicate-summary.json"), `${JSON.stringify(summary, null, "\t")}\n`);
writeFileSync(join(OUT, "predicate-sites.json"), `${JSON.stringify(R, null, "\t")}\n`);
console.log(JSON.stringify(summary, null, 2));
