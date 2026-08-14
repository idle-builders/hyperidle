#!/usr/bin/env node
// Reproduce: node .pipeline/work/AZ16/typography-site-manifest.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname, join, relative, sep } from "node:path";
import ts from "typescript";

const wanted = new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]);
const roleRoots = ["layers", "framework", "applications", "tools"];
function walk(dir) {
	return readdirSync(dir).sort().flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}
const packages = roleRoots.flatMap((root) => walk(root).filter((p) => basename(p) === "package.json")).map((path) => ({ path, json: JSON.parse(readFileSync(path, "utf8")) })).filter(({ json }) => wanted.has(json.name));
for (const name of wanted) {
	const matches = packages.filter(({ json }) => json.name === name);
	if (matches.length !== 1) throw new Error(`package discovery for ${name}: expected 1, found ${matches.length}`);
}
const roots = packages.map(({ path }) => join(path.slice(0, -"package.json".length), "src"));
function isDev(path) {
	const parts = path.split(sep), name = basename(path);
	return parts.some((p) => p.startsWith("__")) || /\.(test|spec|stories)\.(ts|tsx)$/.test(name) || /^(vitest|playwright).*\.config\.ts$/.test(name);
}
const files = roots.flatMap(walk).filter((p) => [".ts", ".tsx", ".css"].includes(extname(p)) && !isDev(p));
if (files.length === 0) throw new Error("production discovery matched zero files");

const foreign = new Map([
	["layers/core-ui/src/pages/review/ReviewBrowserPreview.tsx", new Set(["RenderedPage"])],
	["layers/core-ui/src/pages/review/ReviewRenderedInContext.tsx", new Set(["EmailRender"])],
]);
const sites = [];
function returnedExpressions(body) { const result=[]; const visit=(node)=>{ if(ts.isReturnStatement(node)&&node.expression){result.push(node.expression);return;} if(node!==body&&ts.isFunctionLike(node))return; ts.forEachChild(node,visit); }; visit(body); return result; }
let constExpressions = new Map();
let helperExpressions = new Map();
const resolvingHelpers = new Set();
let currentSource;
function strings(node) {
	if (!node) return [];
	if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
	if (ts.isTemplateExpression(node)) {
		return [node.head.text, ...node.templateSpans.flatMap((span) => strings(span.expression).concat(span.literal.text))];
	}
	if (ts.isConditionalExpression(node)) return strings(node.whenTrue).concat(strings(node.whenFalse));
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return strings(node.left).concat(strings(node.right));
	if (ts.isIdentifier(node) && constExpressions.has(node.text)) return strings(constExpressions.get(node.text));
	if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && constExpressions.has(node.expression.text)) {
		const value = constExpressions.get(node.expression.text);
		if (ts.isObjectLiteralExpression(value)) return value.properties.flatMap((property) => ts.isPropertyAssignment(property) ? strings(property.initializer) : []);
	}
	if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(strings);
	if (ts.isCallExpression(node)) {
		if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "trim") return strings(node.expression.expression);
		if (ts.isPropertyAccessExpression(node.expression) && ["join", "filter"].includes(node.expression.name.text)) return strings(node.expression.expression);
		if (ts.isIdentifier(node.expression) && ["cn", "clsx", "classnames", "twMerge", "twJoin", "clickableProps"].includes(node.expression.text)) return node.arguments.flatMap(strings);
		if (ts.isIdentifier(node.expression) && helperExpressions.has(node.expression.text) && !resolvingHelpers.has(node.expression.text)) {
			resolvingHelpers.add(node.expression.text);
			const result = helperExpressions.get(node.expression.text).flatMap(strings);
			resolvingHelpers.delete(node.expression.text);
			return result;
		}
	}
	return [];
}
function styleObjects(node) {
	if (!node) return [];
	if (ts.isObjectLiteralExpression(node)) return [node];
	if (ts.isIdentifier(node) && constExpressions.has(node.text)) return styleObjects(constExpressions.get(node.text));
	if (ts.isConditionalExpression(node)) return styleObjects(node.whenTrue).concat(styleObjects(node.whenFalse));
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helperExpressions.has(node.expression.text)) return helperExpressions.get(node.expression.text).flatMap(styleObjects);
	return [];
}
function typographyClass(token) {
	const bare = token.replace(/^(?:[a-z0-9-]+:)+/, "");
	let match;
	if (/^text-(xs|sm|base|lg|xl|2xl|3xl)$/.test(bare)) return ["size", token];
	if ((match = bare.match(/^text-\[(.+)\]$/))) {
		const value = match[1];
		const length = /^(?:-?[\d.]+(?:px|rem|em|%)|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl)\)|(?:calc|min|max|clamp)\(.+\)|\$\{.+\}(?:px|rem|em|%)?)$/.test(value);
		if (length) return ["size", token];
		return null;
	}
	if (/^font-(sans|mono|serif|heading)$/.test(bare)) return ["family", token];
	if ((match = bare.match(/^font-\[(.+)\]$/))) {
		const value = match[1];
		if (/^(?:[1-9]00|var\(--fw-[a-z-]+\))$/.test(value)) return ["weight", token];
		if (/^(?:family-name:)?var\(--font-[a-z-]+\)$/.test(value) || /^family-name:/.test(value) || /[,"']/.test(value)) return ["family", token];
		return null;
	}
	if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(bare)) return ["weight", token];
	if (/^leading-(none|tight|snug|normal|relaxed|loose|\[[^\]]+\])$/.test(bare)) return ["line", token];
	if (/^tracking-(tighter|tight|normal|wide|wider|widest|\[[^\]]+\])$/.test(bare)) return ["tracking", token];
	if (/^\[letter-spacing:[^\]]+\]$/.test(bare)) return ["tracking", token];
	return null;
}
const styleMap = new Map([["fontSize","size"],["fontFamily","family"],["fontWeight","weight"],["lineHeight","line"],["letterSpacing","tracking"]]);
function namedScope(node) {
	for (let current = node; current; current = current.parent) {
		if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
		if ((ts.isFunctionExpression(current) || ts.isArrowFunction(current)) && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) return current.parent.name.text;
		if (ts.isMethodDeclaration(current) && current.name) return current.name.getText(currentSource);
	}
	return "module";
}

for (const path of files.filter((p) => [".ts", ".tsx"].includes(extname(p)))) {
	const raw = readFileSync(path, "utf8");
	const source = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true, extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	currentSource = source;
	constExpressions = new Map();
	helperExpressions = new Map();
	const collectConsts = (node) => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constExpressions.set(node.name.text, node.initializer);
		if (ts.isFunctionDeclaration(node) && node.name && node.body) helperExpressions.set(node.name.text, returnedExpressions(node.body));
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
			const body = node.initializer.body;
			helperExpressions.set(node.name.text, ts.isBlock(body) ? returnedExpressions(body) : [body]);
		}
		ts.forEachChild(node, collectConsts);
	};
	collectConsts(source);
	const visit = (node, inForeign = false) => {
		const nestedForeign = inForeign || (ts.isFunctionDeclaration(node) && node.name && foreign.get(relative(".", path))?.has(node.name.text));
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			const declarations = [];
			const jsxTag = node.tagName.getText(source);
			for (const attr of node.attributes.properties) {
				if (ts.isJsxSpreadAttribute(attr)) {
					for (const token of strings(attr.expression).flatMap((s) => s.split(/\s+/))) { const parsed = typographyClass(token); if (parsed) declarations.push(`${parsed[0]}:${parsed[1]}`); else if (jsxTag === "em" && /^(?:italic|not-italic)$/.test(token)) declarations.push(`style:${token}`); }
					continue;
				}
				if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
				if (attr.name.text === "className") {
					const value = attr.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer;
					for (const token of strings(value).flatMap((s) => s.split(/\s+/))) {
						const parsed = typographyClass(token);
						if (parsed) declarations.push(`${parsed[0]}:${parsed[1]}`);
						else if (jsxTag === "em" && /^(?:italic|not-italic)$/.test(token)) declarations.push(`style:${token}`);
					}
				}
				if (attr.name.text === "style" && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
					for (const object of styleObjects(attr.initializer.expression)) for (const prop of object.properties) if (ts.isPropertyAssignment(prop)) {
						const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : "";
						if (styleMap.has(key)) declarations.push(`${styleMap.get(key)}:${prop.initializer.getText(source)}`);
					}
				}
			}
			if (declarations.length > 0 && !nestedForeign) {
				const point = source.getLineAndCharacterOfPosition(node.getStart(source));
				const tag = jsxTag;
				const sourceText = node.getText(source).slice(0, 500);
				const site = { path: relative(".", path), line: point.line + 1, anchor: namedScope(node), tag, declarations: [...new Set(declarations)], sourceText };
				sites.push(site);
			}
		}
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createElement" && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
			const declarations = [];
			for (const prop of node.arguments[1].properties) if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
				if (prop.name.text === "className") for (const token of strings(prop.initializer).flatMap((value) => value.split(/\s+/))) {
					const parsed = typographyClass(token);
					if (parsed) declarations.push(`${parsed[0]}:${parsed[1]}`);
				}
				if (prop.name.text === "style") for (const object of styleObjects(prop.initializer)) for (const styleProp of object.properties) if (ts.isPropertyAssignment(styleProp)) {
					const key = ts.isIdentifier(styleProp.name) || ts.isStringLiteral(styleProp.name) ? styleProp.name.text : "";
					if (styleMap.has(key)) declarations.push(`${styleMap.get(key)}:${styleProp.initializer.getText(source)}`);
				}
			}
			if (declarations.length > 0 && !nestedForeign) {
				const point = source.getLineAndCharacterOfPosition(node.getStart(source));
				const tag = `createElement:${node.arguments[0]?.getText(source) ?? "unknown"}`;
				sites.push({ path: relative(".", path), line: point.line + 1, anchor: namedScope(node), tag, declarations: [...new Set(declarations)], sourceText: node.getText(source).slice(0, 500) });
			}
		}
		ts.forEachChild(node, (child) => visit(child, nestedForeign));
	};
	visit(source);
}

// Production .ts can export class strings without JSX. Include only strings that
// actually contain a typography utility; ordinary strings and color utilities are ignored.
for (const path of files.filter((p) => extname(p) === ".ts")) {
	const raw = readFileSync(path, "utf8");
	const source = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	currentSource = source;
	const visit = (node) => {
		if (ts.isVariableDeclaration(node) && node.initializer) {
			const declarations = [];
			for (const token of strings(node.initializer).flatMap((s) => s.split(/\s+/))) {
				const parsed = typographyClass(token);
				if (parsed) declarations.push(`${parsed[0]}:${parsed[1]}`);
			}
			if (declarations.length) {
				const point = source.getLineAndCharacterOfPosition(node.getStart(source));
				const sourceText = node.getText(source).slice(0, 500);
				const tag = `ts:${node.name.getText(source)}`;
				const site = { path: relative(".", path), line: point.line + 1, anchor: tag, tag, declarations: [...new Set(declarations)], sourceText };
				sites.push(site);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
}

for (const path of files.filter((p) => extname(p) === ".css")) {
	const text = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, (comment) => "\n".repeat(comment.split("\n").length - 1));
	for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const declarations = [];
		for (const decl of block[2].matchAll(/(font-size|font-family|font-weight|line-height|letter-spacing)\s*:\s*([^;]+);/g)) declarations.push(`${decl[1]}:${decl[2].trim()}`);
		if (declarations.length) {
			const line = text.slice(0, block.index).split("\n").length;
			const sourceText = `${block[1]} ${block[2]}`;
			const tag = `css:${block[1].trim().replace(/\s+/g, " ")}`;
			const site = { path: relative(".", path), line, anchor: tag, tag, declarations, sourceText };
			sites.push(site);
		}
	}
}
if (sites.length === 0) throw new Error("typography manifest matched zero sites");
const ordered = sites.sort((a,b) => a.path.localeCompare(b.path) || a.line-b.line || a.tag.localeCompare(b.tag));
const occurrences = new Map();
for (const site of ordered) {
	const normalized = `${site.sourceText.replace(/\s+/g, " ").trim()}|${site.declarations.join("|")}`;
	const fingerprint = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
	const base = `${site.path}::${site.anchor}::${site.tag}::${fingerprint}`;
	const occurrence = occurrences.get(base) ?? 0;
	occurrences.set(base, occurrence + 1);
	site.id = `${base}::${occurrence + 1}`;
}
if (process.argv.includes("--extract")) {
	console.log("site_id\tpath\tline\tanchor\ttag\tdeclarations");
	for (const site of ordered) console.log([site.id,site.path,site.line,site.anchor,site.tag,site.declarations.join(" | ")].join("\t"));
	process.exit(0);
}
const decisionFile = ".pipeline/work/AZ16/typography-decisions.tsv";
const decisionLines = readFileSync(decisionFile, "utf8").trimEnd().split("\n");
if (decisionLines[0] !== "site_id\tdestination\treason") throw new Error("invalid typography decision-map header");
const decisions = new Map();
for (const line of decisionLines.slice(1)) {
	const [id, destination, reason] = line.split("\t");
	if (!id || !destination || !reason) throw new Error(`invalid typography decision row: ${line}`);
	if (decisions.has(id)) throw new Error(`duplicate typography decision: ${id}`);
	decisions.set(id, { destination, reason });
}
const valid = new Set(["label","metadata","small","copy","control","input","avatar-initial","subheading","lead","title","display","metric","data","inline-code","heading-variant","glyph-repair","REMOVE"]);
const extractedIds = new Set(ordered.map((site) => site.id));
const missing = ordered.filter((site) => !decisions.has(site.id));
const stale = [...decisions.keys()].filter((id) => !extractedIds.has(id));
const invalid = [...decisions.entries()].filter(([, value]) => !valid.has(value.destination));
const fingerprintDestinations = new Map();
for (const site of ordered) {
	const fingerprintId = site.id.replace(/::\d+$/, "");
	const destination = decisions.get(site.id)?.destination;
	if (!destination) continue;
	const prior = fingerprintDestinations.get(fingerprintId);
	if (prior && prior !== destination) invalid.push([site.id, { destination }]);
	fingerprintDestinations.set(fingerprintId, destination);
}
const report = ["site_id\tpath\tline\tproblem"];
for (const site of missing) report.push(`${site.id}\t${site.path}\t${site.line}\tunmapped source site`);
for (const id of stale) report.push(`${id}\t\t\tstale decision`);
for (const [id] of invalid) report.push(`${id}\t\t\tinvalid destination`);
writeFileSync(".pipeline/work/AZ16/typography-unmapped.tsv", `${report.join("\n")}\n`);
if (missing.length || stale.length || invalid.length) throw new Error(`typography decisions: unmapped=${missing.length}, stale=${stale.length}, invalid=${invalid.length}`);
console.log("site_id\tpath\tline\tanchor\ttag\tdeclarations\tdestination\treason");
for (const site of ordered) {
	const decision = decisions.get(site.id);
	console.log([site.id,site.path,site.line,site.anchor,site.tag,site.declarations.join(" | "),decision.destination,decision.reason].join("\t"));
}
