#!/usr/bin/env node
// Reproduce from repository root: node .pipeline/work/AZ16/token-literal-census.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import ts from "typescript";

const wantedPackages = new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]);
const roleRoots = ["layers", "framework", "applications", "tools"];
function walk(dir) {
	return readdirSync(dir).sort().flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}
const packageFiles = roleRoots.flatMap((root) => walk(root).filter((path) => basename(path) === "package.json"));
const packages = packageFiles.map((path) => ({ path, json: JSON.parse(readFileSync(path, "utf8")) })).filter(({ json }) => wantedPackages.has(json.name));
for (const name of wantedPackages) {
	const found = packages.filter(({ json }) => json.name === name);
	if (found.length !== 1) throw new Error(`package discovery for ${name}: expected 1, found ${found.length}`);
}
const roots = packages.map(({ path }) => join(path.slice(0, -"package.json".length), "src"));
function isDevelopment(path) {
	const parts = path.split(sep);
	const name = basename(path);
	return parts.some((part) => part.startsWith("__")) || /\.(test|spec|stories)\.(ts|tsx)$/.test(name) || /^(vitest|playwright).*\.config\.ts$/.test(name);
}
const files = roots.flatMap(walk).filter((p) => [".ts", ".tsx", ".css"].includes(extname(p)));
if (files.length === 0) throw new Error("production discovery matched zero source files");
const findings = [];
const foreignFunctions = new Map([
	["layers/core-ui/src/pages/review/ReviewBrowserPreview.tsx", new Set(["RenderedPage"])],
	["layers/core-ui/src/pages/review/ReviewRenderedInContext.tsx", new Set(["EmailRender"])],
]);

function add(path, source, node, family, value, syntax, foreign = false) {
	const point = source.getLineAndCharacterOfPosition(node.getStart(source));
	findings.push({ world: isDevelopment(path) ? "development" : foreign ? "foreign" : "production", family, value, syntax, path, line: point.line + 1 });
}
function addColorLiterals(path, source, node, text, syntax, foreign) {
	const matches = [...text.matchAll(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/g)];
	for (const match of matches) add(path, source, node, "color", match[0], syntax, foreign);
	return matches.length;
}
function scanClass(path, source, node, text, foreign) {
	for (const token of text.split(/\s+/)) {
		const bare = token.replace(/^(?:[a-z0-9-]+:)+/, "");
		let match;
		if ((match = bare.match(/^(?:text|bg|border|ring|fill|stroke|from|to|via|divide|placeholder|caret|accent|outline|shadow|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$/))) add(path, source, node, "color", match[0], bare, foreign);
		else if (/^(?:text|bg|border|ring|fill|stroke|from|to|via|divide|placeholder|caret|accent|outline|shadow|decoration)-\[(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\(.+\))\]$/.test(bare)) addColorLiterals(path, source, node, bare, bare, foreign);
		if ((match = bare.match(/^text-\[((?:-?[0-9.]+(?:px|em|rem|%))|(?:calc|min|max|clamp)\(.+\)|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl)\))\]$/))) add(path, source, node, "font-size", match[1], bare, foreign);
		else if ((match = bare.match(/^text-(xs|sm|base|lg|xl|2xl|3xl)$/))) add(path, source, node, "font-size", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^font-\[family-name:(.+)\]$/))) add(path, source, node, "font-family", match[1], bare, foreign);
		else if ((match = bare.match(/^font-(sans|mono|heading|serif)$/))) add(path, source, node, "font-family", match[1], bare, foreign);
		if ((match = bare.match(/^font-\[((?:[0-9]+)|var\(--fw-[a-z-]+\)|calc\(.+\))\]$/))) add(path, source, node, "font-weight", match[1], bare, foreign);
		else if ((match = bare.match(/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/))) add(path, source, node, "font-weight", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^leading-\[((?:-?[0-9.]+(?:px|em|rem|%)?)|var\(--leading-[a-z-]+\)|calc\(.+\))\]$/))) add(path, source, node, "line-height", match[1], bare, foreign);
		else if ((match = bare.match(/^leading-(none|tight|snug|normal|relaxed|loose)$/))) add(path, source, node, "line-height", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^tracking-\[((?:-?[0-9.]+em)|var\(--tracking-[a-z-]+\)|calc\(.+\))\]$/))) add(path, source, node, "tracking", match[1], bare, foreign);
		else if ((match = bare.match(/^tracking-(tighter|tight|normal|wide|wider|widest)$/))) add(path, source, node, "tracking", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^duration-\[((?:[0-9.]+m?s)|var\(--[a-z-]+\)|calc\(.+\))\]$/))) add(path, source, node, "duration", match[1], bare, foreign);
		else if ((match = bare.match(/^duration-([0-9]+)$/))) add(path, source, node, "duration", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^delay-\[((?:[0-9.]+m?s)|var\(--[a-z-]+\)|calc\(.+\))\]$/))) add(path, source, node, "delay", match[1], bare, foreign);
		else if ((match = bare.match(/^delay-([0-9]+)$/))) add(path, source, node, "delay", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^ease-\[(.+)\]$/))) add(path, source, node, "easing", match[1], bare, foreign);
		else if ((match = bare.match(/^ease-(linear|in|out|in-out)$/))) add(path, source, node, "easing", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^animate-\[(.+)\]$/))) add(path, source, node, "animation-shorthand", match[1], bare, foreign);
		else if ((match = bare.match(/^animate-(spin|ping|pulse|bounce)$/))) add(path, source, node, "animation-shorthand", `alias:${match[1]}`, bare, foreign);
		if (bare === "scroll-smooth") add(path, source, node, "scroll-motion", "smooth", bare, foreign);
		if (/^border(?:-[trblxyse])?$/.test(bare)) add(path, source, node, "border-width", "1px", bare, foreign);
		else if ((match = bare.match(/^border(?:-[trblxyse])?-\[([0-9.]+px)\]$/))) add(path, source, node, "border-width", match[1], bare, foreign);
		else if ((match = bare.match(/^border(?:-[trblxyse])?-\[((?:var\(--bw-[a-z-]+\))|(?:calc|min|max|clamp)\(.+\))\]$/))) add(path, source, node, "border-width", match[1], bare, foreign);
		else if ((match = bare.match(/^border(?:-[trblxyse])?-(0|2|4|8)$/))) add(path, source, node, "border-width", `${match[1]}px`, bare, foreign);
		if ((match = bare.match(/^rounded(?:-[trbl]{1,2})?-\[([0-9.]+px)\]$/))) add(path, source, node, "radius", match[1], bare, foreign);
		if ((match = bare.match(/^z-\[((?:-?[0-9]+)|var\(--z-[a-z-]+\)|calc\(.+\))\]$/))) add(path, source, node, "z-index", match[1], bare, foreign);
		else if ((match = bare.match(/^-?z-(0|10|20|30|40|50|60|70|auto)$/))) add(path, source, node, "z-index", `alias:${match[1]}`, bare, foreign);
		if ((match = bare.match(/^(?:gap(?:-[xy])?|space-[xy]|m[trblxy]?)-(?:\[)?([0-9.]+)(px)?(?:\])?$/))) {
			const pixels = match[2] ? Number(match[1]) : Number(match[1]) * 4;
			add(path, source, node, "spacing", `${pixels}px`, bare, foreign);
		}
		if ((match = bare.match(/^(?:gap(?:-[xy])?|space-[xy]|m[trblxy]?)-\[((?:var\(--space-[a-z0-9-]+\))|(?:calc|min|max|clamp)\(.+\))\]$/))) add(path, source, node, "spacing", match[1], bare, foreign);
		if (/^shadow(?:-|$)/.test(bare) && !/^shadow-\[var\(--shadow-/.test(bare)) add(path, source, node, "shadow", bare, bare, foreign);
		else if ((match = bare.match(/^shadow-\[(var\(--shadow-[a-z-]+\))\]$/))) add(path, source, node, "shadow", match[1], bare, foreign);
	}
}

const styleFamilies = new Map([
	["color", "color"], ["background", "color"], ["backgroundColor", "color"],
	["borderColor", "color"], ["borderTopColor", "color"], ["borderRightColor", "color"],
	["borderBottomColor", "color"], ["borderLeftColor", "color"], ["outlineColor", "color"],
	["fill", "color"], ["stroke", "color"], ["caretColor", "color"],
	["fontSize", "font-size"], ["fontFamily", "font-family"], ["fontWeight", "font-weight"],
	["lineHeight", "line-height"], ["letterSpacing", "tracking"],
	["transitionDuration", "duration"], ["animationDuration", "duration"],
	["transitionDelay", "delay"], ["animationDelay", "delay"], ["scrollBehavior", "scroll-motion"],
	["transitionTimingFunction", "easing"], ["animationTimingFunction", "easing"],
	["animation", "animation-shorthand"], ["transition", "transition-shorthand"],
	["border", "border-width"], ["borderTop", "border-width"], ["borderRight", "border-width"],
	["borderBottom", "border-width"], ["borderLeft", "border-width"], ["borderWidth", "border-width"],
	["borderInline", "border-width"], ["borderBlock", "border-width"],
	["borderInlineStart", "border-width"], ["borderInlineEnd", "border-width"],
	["borderBlockStart", "border-width"], ["borderBlockEnd", "border-width"],
	["borderTopWidth", "border-width"], ["borderRightWidth", "border-width"],
	["borderBottomWidth", "border-width"], ["borderLeftWidth", "border-width"],
	["borderInlineWidth", "border-width"], ["borderBlockWidth", "border-width"],
	["borderInlineStartWidth", "border-width"], ["borderInlineEndWidth", "border-width"],
	["borderBlockStartWidth", "border-width"], ["borderBlockEndWidth", "border-width"],
	["borderRadius", "radius"], ["boxShadow", "shadow"], ["zIndex", "z-index"],
]);

for (const path of files.filter((p) => extname(p) !== ".css")) {
	const text = readFileSync(path, "utf8");
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const visit = (node, foreign = false) => {
		let nestedForeign = foreign;
		if (ts.isFunctionDeclaration(node) && node.name && foreignFunctions.get(path)?.has(node.name.text)) nestedForeign = true;
		if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) scanClass(path, source, node, node.text, nestedForeign);
		if (ts.isPropertyAssignment(node)) {
			const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
			const family = styleFamilies.get(key);
			if (family && (ts.isStringLiteralLike(node.initializer) || ts.isNumericLiteral(node.initializer))) {
				const literalCount = ts.isStringLiteralLike(node.initializer)
					? addColorLiterals(path, source, node, node.initializer.text, `${key}:${node.initializer.text}`, nestedForeign)
					: 0;
				if (family !== "color" || literalCount === 0) add(path, source, node, family, node.initializer.text, `${key}:${node.initializer.text}`, nestedForeign);
			}
			if (key === "behavior" && ts.isStringLiteralLike(node.initializer)) {
				let current = node.parent;
				while (current && !ts.isCallExpression(current)) current = current.parent;
				if (current && /(?:scrollIntoView|scrollTo|scrollBy)$/.test(current.expression.getText(source))) {
					add(path, source, node, "scroll-motion", node.initializer.text, `behavior:${node.initializer.text}`, nestedForeign);
				}
			}
		}
		ts.forEachChild(node, (child) => visit(child, nestedForeign));
	};
	visit(source);
}

for (const path of files.filter((p) => extname(p) === ".css")) {
	const raw = readFileSync(path, "utf8");
	const text = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => "\n".repeat(comment.split("\n").length - 1));
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.Unknown);
	const propertyFamilies = [
		[/^(?:color|background|background-color|border-color|border-(?:top|right|bottom|left)-color|outline-color|fill|stroke|caret-color)$/, "color"],
		[/^font-size$/, "font-size"], [/^font-family$/, "font-family"], [/^font-weight$/, "font-weight"],
		[/^line-height$/, "line-height"], [/^letter-spacing$/, "tracking"],
		[/^(?:transition|animation)-duration$/, "duration"], [/^(?:transition|animation)-delay$/, "delay"], [/^scroll-behavior$/, "scroll-motion"], [/^(?:transition|animation)-timing-function$/, "easing"],
		[/^(?:transition|animation)$/, "animation-shorthand"], [/^border(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?(?:-width)?$/, "border-width"],
		[/^border-radius$/, "radius"], [/^box-shadow$/, "shadow"], [/^z-index$/, "z-index"],
	];
	for (const match of text.matchAll(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+);/gm)) {
		const property = match[2];
		const value = match[3].trim();
		const family = propertyFamilies.find(([pattern]) => pattern.test(property))?.[1];
		if (!family) continue;
		const node = { getStart: () => (match.index ?? 0) + match[1].length };
		const literalCount = addColorLiterals(path, source, node, value, `${property}:${value}`, false);
		if (family !== "color" || literalCount === 0) add(path, source, node, family, value, `${property}:${value}`, false);
	}
}

console.log("world\tfamily\tkind\tvalue\tcount\ttop_contexts");
const grouped = new Map();
for (const finding of findings) {
	const kind = /var\(--/.test(finding.value)
		? /calc\(|min\(|max\(|clamp\(/.test(finding.value) ? "composed-token" : "token"
		: /calc\(|min\(|max\(|clamp\(/.test(finding.value) ? "composed-raw" : "raw-or-alias";
	const key = [finding.world, finding.family, kind, finding.value].join("\0");
	const group = grouped.get(key) ?? { ...finding, kind, count: 0, contexts: new Map() };
	group.count += 1;
	const context = `${relative(".", finding.path)}:${finding.line}`;
	group.contexts.set(context, (group.contexts.get(context) ?? 0) + 1);
	grouped.set(key, group);
}
for (const group of [...grouped.values()].sort((a, b) => a.world.localeCompare(b.world) || a.family.localeCompare(b.family) || a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value))) {
	const contexts = [...group.contexts.keys()].slice(0, 5).join("; ");
	console.log([group.world, group.family, group.kind, group.value, group.count, contexts].join("\t"));
}
