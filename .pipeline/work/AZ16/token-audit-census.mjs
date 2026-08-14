#!/usr/bin/env node
// Reproduce from repository root: node .pipeline/work/AZ16/token-audit-census.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import ts from "typescript";

const wantedPackages = new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]);
const roleRoots = ["layers", "framework", "applications", "tools"];
const foreignFunctions = new Map([
	["layers/core-ui/src/pages/review/ReviewBrowserPreview.tsx", new Set(["RenderedPage"])],
	["layers/core-ui/src/pages/review/ReviewRenderedInContext.tsx", new Set(["EmailRender"])],
]);

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir).sort()) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else out.push(path);
	}
	return out;
}
const packageFiles = roleRoots.flatMap((root) => walk(root).filter((path) => basename(path) === "package.json"));
const packages = packageFiles.map((path) => ({ path, json: JSON.parse(readFileSync(path, "utf8")) })).filter(({ json }) => wantedPackages.has(json.name));
for (const name of wantedPackages) {
	const found = packages.filter(({ json }) => json.name === name);
	if (found.length !== 1) throw new Error(`package discovery for ${name}: expected 1, found ${found.length}`);
}
const roots = packages.map(({ path }) => join(path.slice(0, -"package.json".length), "src"));
const designRoot = roots[packages.findIndex(({ json }) => json.name === "@hyperidle/design-system")];
const tokenFile = join(designRoot, "tokens.css");

function isDevelopment(path) {
	const parts = path.split(sep);
	const name = basename(path);
	return (
		parts.some((part) => part.startsWith("__")) ||
		/\.(test|spec|stories)\.(ts|tsx)$/.test(name) ||
		/^(vitest|playwright).*\.config\.ts$/.test(name)
	);
}

const files = roots
	.flatMap(walk)
	.filter((path) => [".ts", ".tsx", ".css"].includes(extname(path)));
if (files.length === 0) throw new Error("production discovery matched zero source files");
const production = files.filter((path) => !isDevelopment(path));
const development = files.filter(isDevelopment);
const tokenCss = readFileSync(tokenFile, "utf8");
const declarations = [...tokenCss.matchAll(/(^|\n)\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
	(match) => ({ name: match[2], value: match[3].trim() }),
);
const names = [...new Set(declarations.map(({ name }) => name))].sort();

const exact = {
	"font-size": new Set(["--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl", "--text-3xl"]),
	"font-family": new Set(["--font-sans", "--font-mono"]),
	"font-weight": new Set(["--fw-normal", "--fw-medium", "--fw-semibold", "--fw-bold"]),
	"line-height": new Set(["--leading-tight", "--leading-normal", "--leading-body", "--leading-relaxed"]),
	tracking: new Set(["--tracking-caps", "--tracking-caps-sm"]),
	duration: new Set(["--motion-fast", "--motion-default", "--motion-slow"]),
	easing: new Set(["--motion-ease", "--easing-expressive"]),
	"border-width": new Set(["--bw-thin", "--bw-default", "--bw-strong"]),
};

function family(name) {
	for (const [id, set] of Object.entries(exact)) if (set.has(name)) return id;
	if (name.startsWith("--r-")) return "radius";
	if (name.startsWith("--space-")) return "spacing";
	if (name.startsWith("--shadow-")) return "shadow";
	if (name.startsWith("--z-")) return "z-index";
	if (
		name.startsWith("--surface-") ||
		name.startsWith("--accent-") ||
		name.startsWith("--status-") ||
		name.startsWith("--border-") ||
		name === "--scrim" ||
		(name.startsWith("--text-") && !exact["font-size"].has(name))
	) return "color";
	if (name === "--card-max-h") return "component-geometry";
	return "UNCLASSIFIED";
}

function extractDocuments(paths) {
	const documents = [];
	for (const path of paths) {
		const raw = readFileSync(path, "utf8");
		const chunks = [];
		if (extname(path) === ".css") {
			chunks.push({ text: raw.replace(/\/\*[\s\S]*?\*\//g, ""), foreign: false });
		} else {
			const source = ts.createSourceFile(
				path,
				raw,
				ts.ScriptTarget.Latest,
				true,
				extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
			);
			const visit = (node, foreign = false) => {
				const nestedForeign =
					foreign ||
					(ts.isFunctionDeclaration(node) &&
						node.name &&
						foreignFunctions.get(path)?.has(node.name.text));
				if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
					chunks.push({ text: node.text, foreign: nestedForeign });
				} else if (ts.isTemplateExpression(node)) {
					chunks.push(
						{ text: node.head.text, foreign: nestedForeign },
						...node.templateSpans.map((span) => ({ text: span.literal.text, foreign: nestedForeign })),
					);
				}
				ts.forEachChild(node, (child) => visit(child, nestedForeign));
			};
			visit(source);
		}
		documents.push({ path, chunks });
	}
	return documents;
}

const productionDocuments = extractDocuments(production);
const developmentDocuments = extractDocuments(development);

function countRefs(documents, token) {
	const needle = `var(${token})`;
	let count = 0;
	let foreignCount = 0;
	const contexts = new Map();
	for (const { path, chunks } of documents) {
		for (const chunk of chunks) {
			const { text, foreign } = chunk;
			let index = text.indexOf(needle);
			while (index !== -1) {
				if (foreign) foreignCount += 1;
				else {
					count += 1;
					contexts.set(path, (contexts.get(path) ?? 0) + 1);
				}
				index = text.indexOf(needle, index + needle.length);
			}
		}
	}
	return {
		count,
		foreignCount,
		contexts: [...contexts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, 3)
			.map(([path, amount]) => `${relative(".", path)} (${amount})`)
			.join("; "),
	};
}

console.log(`# population\tproduction=${production.length}\tdevelopment=${development.length}\tcss=${production.filter((p) => extname(p) === ".css").length}`);
console.log("family\ttoken\tvalues\tdeclarations\tproduction_refs\tforeign_refs\tdevelopment_refs\ttop_production_contexts");
for (const name of names) {
	const tokenDeclarations = declarations.filter((entry) => entry.name === name);
	const values = [...new Set(tokenDeclarations.map(({ value }) => value))].join(" / ");
	const prod = countRefs(productionDocuments, name);
	const dev = countRefs(developmentDocuments, name);
	console.log([family(name), name, values, tokenDeclarations.length, prod.count, prod.foreignCount, dev.count, prod.contexts || "—"].join("\t"));
}
