#!/usr/bin/env node

/**
 * AZ15 shipped spacing census.
 *
 * Usage (from repository root):
 *   node .pipeline/work/AZ15/measurement/scripts/spacing-census.mjs
 *
 * Scans production TS/TSX/CSS in Core UI and the design system. Stories,
 * tests, fixtures, mocks, and dev-only surfaces are deliberately excluded.
 * Classification is deterministic and heuristic: inspect the emitted raw CSV
 * and the representative review before treating a semantic label as fact.
 */

import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const outputDir = path.join(
	repo,
	process.env.AZ15_CENSUS_OUTPUT ?? ".pipeline/work/AZ15/measurement/census",
);
const roots = ["layers/core-ui/src", "framework/design-system/src"];
const excluded = /(?:^|\/)(?:__tests__|__fixtures__|__mocks__|_dev)(?:\/|$)|\.(?:stories|test|spec)\.[^.]+$/;
const extensions = /\.(?:ts|tsx|css)$/;

const hearthTokens = new Map([
	[0, "zero"],
	[3, "--space-1"],
	[6, "--space-2"],
	[9, "--space-3"],
	[12, "--space-4"],
	[18, "--space-6"],
	[24, "--space-8"],
	[36, "--space-12"],
	[48, "--space-16"],
]);

// Tailwind v4 default spacing aliases observed/expected in the repository.
const aliases = new Map([
	["0", 0], ["px", 1], ["0.5", 2], ["1", 4], ["1.5", 6], ["2", 8],
	["2.5", 10], ["3", 12], ["3.5", 14], ["4", 16], ["5", 20], ["6", 24],
	["7", 28], ["8", 32], ["9", 36], ["10", 40], ["11", 44], ["12", 48],
	["14", 56], ["16", 64], ["18", 72], ["20", 80], ["24", 96], ["28", 112],
	["32", 128], ["36", 144], ["40", 160], ["44", 176], ["48", 192],
	["52", 208], ["56", 224], ["60", 240], ["64", 256], ["72", 288],
	["80", 320], ["96", 384],
]);

const tokenToPx = new Map([...hearthTokens].filter(([px]) => px !== 0).map(([px, token]) => [token, px]));
const utilityPattern = /(?<![\w-])(-)?(?:(?:[a-z-]+):)*(p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|translate-[xy]|w|h|min-w|max-w|min-h|max-h|size)-(\[(?:[^\]"']+)\]|(?:\d+(?:\.\d+)?|px))(?![\w-])/g;
const cssPattern = /\b(gap|row-gap|column-gap|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|inset|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|translate)\s*:\s*(-?\d+(?:\.\d+)?px|var\(--space-(?:1|2|3|4|6|8|12|16)\))/g;
const styleNumberPattern = /\b(gap|rowGap|columnGap|margin(?:Top|Right|Bottom|Left)?|padding(?:Top|Right|Bottom|Left)?|inset|top|right|bottom|left|width|height|minWidth|maxWidth|minHeight|maxHeight)\s*:\s*(-?\d+(?:\.\d+)?)(?=\s*[,}])/g;
const styleStringPattern = /\b(margin|padding)\s*:\s*["']([^"']+)["']/g;

function walk(dir) {
	const result = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const relative = path.posix.join(dir, entry.name);
		if (excluded.test(relative)) continue;
		if (entry.isDirectory()) result.push(...walk(relative));
		else if (extensions.test(entry.name)) result.push(relative);
	}
	return result;
}

function lineNumber(text, index) {
	return text.slice(0, index).split("\n").length;
}

function lineContext(text, index) {
	const start = text.lastIndexOf("\n", index) + 1;
	const end = text.indexOf("\n", index);
	return text.slice(start, end === -1 ? text.length : end).trim().replace(/\s+/g, " ").slice(0, 240);
}

function tagContext(text, index) {
	const start = Math.max(text.lastIndexOf("<", index), index - 500);
	const next = text.indexOf(">", index);
	const end = next === -1 || next - index > 800 ? index + 500 : next + 1;
	return text.slice(start, end).replace(/\s+/g, " ").slice(0, 1000);
}

function familyFor(file) {
	if (file.startsWith("framework/design-system/")) return "design-system";
	if (/\/pages\/review\//.test(file)) return "review";
	if (/\/settings\//.test(file) || /Settings/.test(file)) return "settings";
	if (/\/shell\//.test(file) || /\/layouts\//.test(file)) return "shell";
	if (/Knowledge|\/knowledge\//.test(file)) return "knowledge";
	if (/Conversation|\/conversations\//.test(file)) return "conversations";
	if (/Work|\/pages\/work\//.test(file) || /Routine|AgentProfile/.test(file)) return "work";
	if (/\/components\//.test(file)) return "shared-components";
	return "core-ui-other";
}

function propertyForUtility(prefix) {
	if (prefix.startsWith("gap")) return prefix === "gap-x" ? "column-gap" : prefix === "gap-y" ? "row-gap" : "gap";
	if (prefix.startsWith("space-")) return prefix === "space-x" ? "space-x" : "space-y";
	if (/^p[xytrbl]?$/.test(prefix)) {
		return ({ p: "padding", px: "padding-inline", py: "padding-block", pt: "padding-top", pr: "padding-right", pb: "padding-bottom", pl: "padding-left" })[prefix];
	}
	if (/^m[xytrbl]?$/.test(prefix)) {
		return ({ m: "margin", mx: "margin-inline", my: "margin-block", mt: "margin-top", mr: "margin-right", mb: "margin-bottom", ml: "margin-left" })[prefix];
	}
	if (prefix === "translate-x") return "translate-x";
	if (prefix === "translate-y") return "translate-y";
	return prefix;
}

function axisFor(property, context) {
	if (/inline|left|right|-x$|column-gap|width/.test(property)) return "horizontal";
	if (/block|top|bottom|-y$|row-gap|height/.test(property)) return "vertical";
	if (property === "gap") {
		if (/\bflex-col\b/.test(context)) return "vertical";
		if (/\bflex\b/.test(context) && !/\bgrid\b/.test(context)) return "horizontal";
		if (/\bgrid\b/.test(context)) return "two-dimensional";
	}
	return "all/unknown";
}

function valueFor(raw) {
	const inner = raw.startsWith("[") ? raw.slice(1, -1) : raw;
	const token = inner.match(/var\((--space-(?:1|2|3|4|6|8|12|16))\)/)?.[1];
	if (token) return { px: tokenToPx.get(token), token, authoredForm: "css-token" };
	const px = inner.match(/^(-?\d+(?:\.\d+)?)px$/)?.[1];
	if (px != null) return { px: Number(px), token: hearthTokens.get(Math.abs(Number(px))) ?? null, authoredForm: "arbitrary-px" };
	if (aliases.has(inner)) {
		const value = aliases.get(inner);
		return { px: value, token: hearthTokens.get(value) ?? null, authoredForm: "tailwind-alias" };
	}
	return { px: null, token: null, authoredForm: "unresolved" };
}

function isControlContext(file, context) {
	return /\/(?:Button|Input|Select|Textarea|Checkbox|Radio|Toggle|Badge|Tag|SearchField|SegmentedControl|Tabs|Menu|Combobox|DatePicker)\.tsx$/.test(file)
		|| /<(?:button|input|select|textarea)\b/i.test(context)
		|| /\b(?:button|input|select|textarea|badge|toggle|control)\b/i.test(context);
}

function classify({ file, property, px, negative, context, sourceKind }) {
	const positioning = /^(?:inset|inset-|top|right|bottom|left|translate)/.test(property);
	const sizing = /^(?:w|h|min-w|max-w|min-h|max-h|size|width|height|min-width|max-width|min-height|max-height)$/.test(property);
	const padding = property.startsWith("padding");
	const margin = property.startsWith("margin");
	const gap = /^(?:gap|row-gap|column-gap|space-x|space-y)$/.test(property);
	const reviewSubject = /Review(?:BrowserPreview|RenderedInContext)\.tsx$/.test(file) && sourceKind !== "utility";
	if (reviewSubject) return { category: "authored-artifact-content", relationship: "subject-authored", confidence: "high" };
	if (negative) return { category: "negative-overlap", relationship: "intentional-overlap", confidence: "high" };
	if (positioning && /review|canvas|diff|absolute|inset/i.test(`${file} ${context}`)) return { category: "canvas-coordinate", relationship: "position-coordinate", confidence: "high" };
	if (positioning || sizing) return { category: "geometry", relationship: sizing ? "size-constraint" : "position-coordinate", confidence: "high" };
	if (isControlContext(file, context) && (padding || gap || margin)) return { category: "control-internal", relationship: padding ? "control-padding" : "control-parts", confidence: "medium" };
	if (px === 0 && (padding || margin)) return { category: "css-reset", relationship: "native-spacing-reset", confidence: "high" };
	if (padding) return { category: "padding", relationship: "surface/content-inset", confidence: "high" };
	if (margin && /left|right|inline/.test(property) && px != null && px >= 36) return { category: "geometry", relationship: "alignment-indent", confidence: "high" };
	if (margin && px != null && px <= 4 && /icon|badge|dot|chevron|absolute|relative|translate|leading/i.test(context)) return { category: "optical-offset", relationship: "optical-alignment", confidence: "medium" };
	if (gap || margin) {
		let relationship = "unclassified-composition";
		if (/sectionlabel|section-title|<h[1-6]\b|heading/i.test(context)) relationship = "label-to-content";
		else if (/flex-col/.test(context) && px != null && px >= 24) relationship = "section-or-major-stack";
		else if (/flex-col/.test(context) && px != null && px >= 12) relationship = "group-or-content-stack";
		else if (/items-center|inline-flex|flex-row/.test(context)) relationship = "horizontal-inline-peers";
		else if (px != null && px <= 9) relationship = "close-related-content";
		return { category: "composition", relationship, confidence: "low" };
	}
	return { category: "unclassified", relationship: "unknown", confidence: "low" };
}

const rows = [];
function pushRow({ file, text, index, sourceKind, authored, property, raw, negative = false, context }) {
	const value = valueFor(raw);
	const signedPx = value.px == null ? null : negative ? -value.px : value.px;
	const classification = classify({ file, property, px: value.px, negative, context, sourceKind });
	rows.push({
		id: rows.length + 1,
		file,
		line: lineNumber(text, index),
		sourceKind,
		authored,
		property,
		orientation: axisFor(property, context),
		rawValue: raw,
		computedPx: signedPx,
		hearthToken: value.token,
		onVocabulary: value.px != null ? hearthTokens.has(value.px) : false,
		authoredForm: value.authoredForm,
		family: familyFor(file),
		...classification,
		context: lineContext(text, index),
	});
}

const files = roots.flatMap(walk).sort();
for (const file of files) {
	const text = fs.readFileSync(path.join(repo, file), "utf8");
	for (const match of text.matchAll(utilityPattern)) {
		const [authored, minus, prefix, raw] = match;
		pushRow({ file, text, index: match.index, sourceKind: "utility", authored, property: propertyForUtility(prefix), raw, negative: Boolean(minus), context: tagContext(text, match.index) });
	}
	for (const match of text.matchAll(cssPattern)) {
		const [authored, property, raw] = match;
		pushRow({ file, text, index: match.index, sourceKind: "css-declaration", authored, property, raw, negative: raw.startsWith("-"), context: lineContext(text, match.index) });
	}
	for (const match of text.matchAll(styleNumberPattern)) {
		const [authored, property, rawNumber] = match;
		pushRow({ file, text, index: match.index, sourceKind: "style-number", authored, property: property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), raw: `${Math.abs(Number(rawNumber))}px`, negative: Number(rawNumber) < 0, context: lineContext(text, match.index) });
	}
	for (const match of text.matchAll(styleStringPattern)) {
		const [authored, property, shorthand] = match;
		const parts = shorthand.trim().split(/\s+/);
		if (![1, 2, 3, 4].includes(parts.length) || parts.some((part) => !/^-?\d+(?:\.\d+)?px$/.test(part))) continue;
		const [a, b = a, c = a, d = b] = parts;
		const sides = property === "margin"
			? [["margin-top", a], ["margin-right", b], ["margin-bottom", c], ["margin-left", d]]
			: [["padding-top", a], ["padding-right", b], ["padding-bottom", c], ["padding-left", d]];
		for (const [physicalProperty, raw] of sides) {
			pushRow({ file, text, index: match.index, sourceKind: "style-string-shorthand", authored, property: physicalProperty, raw: raw.replace("-", ""), negative: raw.startsWith("-"), context: lineContext(text, match.index) });
		}
	}
}

function grouped(keys, filter = () => true) {
	const counts = new Map();
	for (const row of rows.filter(filter)) {
		const key = keys.map((name) => String(row[name] ?? "null")).join(" | ");
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }));
}

const summary = {
	generatedAt: new Date().toISOString(),
	scope: { roots, excluded: "tests, stories, fixtures, mocks, dev-only", filesScanned: files.length },
	totalAuthoredOccurrences: rows.length,
	byCategory: grouped(["category"]),
	byValue: grouped(["computedPx", "hearthToken", "onVocabulary"]),
	byAuthoredFormValue: grouped(["authoredForm", "computedPx", "hearthToken", "onVocabulary"]),
	byPropertyOrientation: grouped(["property", "orientation"]),
	byFamily: grouped(["family"]),
	compositionByValue: grouped(["computedPx", "hearthToken", "onVocabulary"], (row) => row.category === "composition"),
	compositionByPropertyOrientation: grouped(["property", "orientation"], (row) => row.category === "composition"),
	compositionByFamily: grouped(["family"], (row) => row.category === "composition"),
	compositionByLikelyRelationship: grouped(["relationship", "confidence"], (row) => row.category === "composition"),
	compositionCrossTab: grouped(["computedPx", "property", "orientation", "family", "relationship"], (row) => row.category === "composition"),
	offVocabularyComposition: grouped(["computedPx", "authoredForm", "property", "orientation"], (row) => row.category === "composition" && !row.onVocabulary),
};

function csvEscape(value) {
	if (value == null) return "";
	const string = String(value);
	return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

fs.mkdirSync(outputDir, { recursive: true });
const classificationFields = new Set(["category", "relationship", "confidence"]);
const rawRows = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !classificationFields.has(key))));
fs.writeFileSync(path.join(outputDir, "raw.json"), `${JSON.stringify(rawRows, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "classified.json"), `${JSON.stringify(rows, null, 2)}\n`);
const headers = Object.keys(rows[0] ?? {});
const rawHeaders = Object.keys(rawRows[0] ?? {});
fs.writeFileSync(path.join(outputDir, "raw.csv"), `${rawHeaders.join(",")}\n${rawRows.map((row) => rawHeaders.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`);
fs.writeFileSync(path.join(outputDir, "classified.csv"), `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`);
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify({ filesScanned: files.length, rows: rows.length, outputDir }, null, 2));
