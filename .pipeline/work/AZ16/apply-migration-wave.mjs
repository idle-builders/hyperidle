#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const wave = Number(process.argv[2]);
if (![4, 5, 6, 7].includes(wave)) throw new Error("usage: apply-migration-wave.mjs <4|5|6|7>");
const work = ".pipeline/work/AZ16";

function parseTsv(path) {
	const [header, ...lines] = readFileSync(path, "utf8").trimEnd().split("\n");
	const keys = header.split("\t");
	return lines.filter(Boolean).map((line) => Object.fromEntries(line.split("\t").map((value, index) => [keys[index], value])));
}

function ownsWave(path) {
	if (wave === 4) return path.startsWith("framework/design-system/");
	if (wave === 7) return path.startsWith("layers/core-ui/src/pages/review/");
	if (wave === 6)
		return path.startsWith("layers/core-ui/src/pages/")
			&& !path.startsWith("layers/core-ui/src/pages/review/")
			&& !path.split("/").some((segment) => segment.startsWith("_"));
	return path.startsWith("layers/core-ui/") && !path.startsWith("layers/core-ui/src/pages/");
}

const families = [
	{ name: "typography", rows: parseTsv(`${work}/typography-site-manifest.tsv`) },
	{ name: "motion", rows: parseTsv(`${work}/motion-site-manifest.tsv`) },
	{ name: "border", rows: parseTsv(`${work}/border-site-manifest.tsv`) },
];

function outcome(family, destination) {
	const profiles = family === "typography"
		? new Set(["label", "metadata", "small", "copy", "control", "input", "avatar-initial", "subheading", "lead", "title", "display", "metric", "data", "inline-code"])
		: family === "motion"
			? new Set(["feedback", "move", "spring", "enter", "activity", "loading", "busy"])
			: new Set(["thin", "default", "strong"]);
	if (profiles.has(destination)) return ["PROFILE", destination];
	if (destination === "heading-variant") return ["HEADING_VARIANT", "h1=display:1;h2=title:1;h3=lead:1;h4-h6=subheading:3"];
	if (destination === "glyph-repair") return ["GLYPH_REPAIR", ""];
	return [destination, ""];
}

function lineOffset(text, line) {
	let offset = 0;
	for (let index = 1; index < line; index++) {
		offset = text.indexOf("\n", offset) + 1;
		if (offset === 0) throw new Error(`line ${line} not found`);
	}
	return offset;
}

function endOfOpening(text, start) {
	let quote = "";
	let braces = 0;
	for (let index = start; index < Math.min(text.length, start + 2500); index++) {
		const char = text[index];
		if (quote) {
			if (char === quote && text[index - 1] !== "\\") quote = "";
			continue;
		}
		if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
		if (char === "{") braces++;
		else if (char === "}") braces--;
		else if (char === ">" && text[index - 1] !== "=" && braces === 0) return index + 1;
	}
	return Math.min(text.length, start + 1200);
}

function matchingBrace(text, open) {
	let depth = 0;
	let quote = "";
	for (let index = open; index < text.length; index++) {
		const char = text[index];
		if (quote) {
			if (char === quote && text[index - 1] !== "\\") quote = "";
			continue;
		}
		if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
		if (char === "{") depth++;
		if (char === "}" && --depth === 0) return index;
	}
	return -1;
}

function openingStart(text, lineStart, tag) {
	if (tag.startsWith("ts:") || tag.startsWith("createElement:") || tag.startsWith("generated:")) return lineStart;
	const needle = `<${tag}`;
	const lineEnd = text.indexOf("\n", lineStart);
	const candidate = text.lastIndexOf(needle, lineEnd < 0 ? text.length : lineEnd);
	return candidate >= 0 && lineStart - candidate < 3000 ? candidate : lineStart;
}

function addProfile(segment, profile) {
	const classMatch = /className\s*=\s*/.exec(segment);
	if (classMatch) {
		const valueStart = classMatch.index + classMatch[0].length;
		const first = segment[valueStart];
		if (first === '"' || first === "'") {
			return `${segment.slice(0, valueStart + 1)}${profile} ${segment.slice(valueStart + 1)}`;
		}
		if (first === "{") {
			const close = matchingBrace(segment, valueStart);
			if (close > valueStart) {
				const expression = segment.slice(valueStart + 1, close);
				return `${segment.slice(0, valueStart)}{\`${profile} \${${expression}}\`}${segment.slice(close + 1)}`;
			}
		}
	}
	const propertyMatch = /className\s*:\s*/.exec(segment);
	if (propertyMatch) {
		const valueStart = propertyMatch.index + propertyMatch[0].length;
		const first = segment[valueStart];
		if (first === '"' || first === "'" || first === "`") {
			return `${segment.slice(0, valueStart + 1)}${profile} ${segment.slice(valueStart + 1)}`;
		}
		const comma = segment.indexOf(",", valueStart);
		if (comma > valueStart) {
			const expression = segment.slice(valueStart, comma);
			return `${segment.slice(0, valueStart)}\`${profile} \${${expression}}\`${segment.slice(comma)}`;
		}
	}
	const close = segment.lastIndexOf(">");
	return close >= 0
		? `${segment.slice(0, close)} className="${profile}"${segment.slice(close)}`
		: segment;
}

function removeClassToken(segment, token) {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return segment.replace(new RegExp("(^|[\\s\"'`])" + escaped + "(?=$|[\\s\"'`])", "g"), "$1");
}

function stripTypography(segment, declarations) {
	const field = { family: "fontFamily", size: "fontSize", weight: "fontWeight", line: "lineHeight", tracking: "letterSpacing", style: "fontStyle" };
	for (const declaration of declarations.split(" | ")) {
		const split = declaration.indexOf(":");
		const kind = declaration.slice(0, split);
		const value = declaration.slice(split + 1);
		if (/^(?:[a-z0-9-]+:)*(?:font-|text-|leading-|tracking-|\[letter-spacing:|italic|not-italic)/.test(value)) {
			segment = removeClassToken(segment, value);
		}
		const property = field[kind];
		if (property) {
			segment = segment.replace(new RegExp(`(?:${property}|["']${property}["'])\\s*:\\s*[^,}\\n]+,?[^\\S\\n]*`), "");
		}
	}
	return segment;
}

function stripMotion(segment, value) {
	for (const item of value.split(" | ")) {
		const [kind, ...rest] = item.split(":");
		const raw = rest.join(":");
		if (kind === "transition") {
			const token = raw.split(":")[0];
			if (/^(?:transition|duration-|ease-|animate-|\[transition)/.test(token)) segment = removeClassToken(segment, token);
		}
		if (["animation", "smooth-scroll"].includes(kind)) {
			segment = segment.replace(new RegExp(`(?:animation|transition|scrollBehavior)\\s*:\\s*[^,}\\n]+,?[^\\S\\n]*`), "");
		}
	}
	segment = segment.replace(
		/(^|[\s"'`])(?:motion-safe:|motion-reduce:)?(?:\[transition:[^\]]+\]|transition(?:-[^\s"'`}]+)?|duration-\[[^\]]+\]|ease-\[[^\]]+\]|animate-(?:\[[^\]]+\]|[a-z-]+))(?=$|[\s"'`}])/g,
		"$1",
	);
	segment = segment.replace(
		/(?:animation|transition|transitionDuration|transitionProperty|transitionTimingFunction|scrollBehavior)\s*:\s*[^,}\n]+,?[^\S\n]*/g,
		"",
	);
	return segment;
}

function migrateBorder(segment, syntax, destination) {
	if (syntax.startsWith("generated-style:")) {
		return segment.replace(/(?<=border(?:-(?:top|right|bottom|left|inline|block))?-width:\s*)\d+(?:\.\d+)?px/g, `var(--bw-${destination})`);
	}
	if (syntax.startsWith("style:")) {
		const property = syntax.slice("style:".length);
		const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return segment.replace(
			new RegExp(`(${escaped}\\s*:\\s*["'\\x60]?)(?:\\d+(?:\\.\\d+)?px|var\\(--bw-[^)]+\\))`),
			`$1var(--bw-${destination})`,
		);
	}
	const base = syntax.replace(/^(?:[a-z0-9-]+:)*/, "");
	const side = /^border-(x|y|t|r|b|l|s|e)(?:-|$)/.exec(base)?.[1];
	const canonical = `border${side ? `-${side}` : ""}-[var(--bw-${destination})]`;
	return removeClassToken(segment, syntax).replace(/(className\s*=\s*["'])/, `$1${canonical} `);
}

function removeBorder(segment, syntax) {
	if (syntax.startsWith("generated-style:")) return segment;
	if (syntax.startsWith("style:")) {
		const property = syntax.slice("style:".length);
		const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return segment.replace(new RegExp(`${escaped}\\s*:\\s*[^,}\\n]+,?\\s*`), "");
	}
	return removeClassToken(segment, syntax);
}

function preserveBorderless(segment, syntax) {
	if (syntax === "border-none") return segment;
	return `${removeClassToken(segment, syntax)}`.replace(/(className\s*=\s*["'])/, "$1border-none ");
}

function migrateCss(text, row, family) {
	const start = lineOffset(text, Number(row.line));
	const open = text.lastIndexOf("\n", start) + 1;
	const brace = text.indexOf("{", open);
	const close = text.indexOf("}", brace);
	if (brace < 0 || close < 0) return text;
	let block = text.slice(open, close + 1);
	if (family === "typography") {
		for (const declaration of row.declarations.split(" | ")) {
			const property = declaration.slice(0, declaration.indexOf(":"));
			block = block.replace(new RegExp(`\\n?\\s*${property}\\s*:[^;]+;`), "");
		}
	} else if (family === "motion") {
		block = block.replace(/\n?\s*(?:animation|transition|scroll-behavior)[^:]*:[^;]+;/g, "");
	} else {
		block = block.replace(
			/(border(?:-[a-z-]+)?(?:-width)?\s*:\s*)(\d+(?:\.\d+)?px|var\(--bw-[^)]+\))/g,
			`$1var(--bw-${row.destination})`,
		);
	}
	const [receiptOutcome] = outcome(family, row.destination);
	if (receiptOutcome === "PROFILE") {
		if (family !== "border") {
			const prefix = family === "typography" ? "type" : "motion";
			block = block.replace("{", `{\n\t@apply ${prefix}-${row.destination};`);
		}
	}
	return `${text.slice(0, open)}${block}${text.slice(close + 1)}`;
}

const rowsByPath = new Map();
for (const family of families) {
	for (const row of family.rows.filter((entry) => ownsWave(entry.path))) {
		const list = rowsByPath.get(row.path) ?? [];
		list.push({ ...row, family: family.name });
		rowsByPath.set(row.path, list);
	}
}

for (const [path, rows] of rowsByPath) {
	let text = readFileSync(path, "utf8");
	for (const row of rows.sort((a, b) => Number(b.line) - Number(a.line))) {
		if (path.endsWith(".css")) {
			text = migrateCss(text, row, row.family);
			continue;
		}
		if (row.destination === "heading-variant" || row.destination === "glyph-repair" || row.destination === "GEOMETRY" || row.destination === "FOREIGN") continue;
		const lineStart = lineOffset(text, Number(row.line));
		const start = openingStart(text, lineStart, row.tag);
		const end = row.tag.startsWith("ts:") ? text.indexOf(";", start) + 1 : endOfOpening(text, start);
		let segment = text.slice(start, end > start ? end : start + 800);
		const [receiptOutcome] = outcome(row.family, row.destination);
		if (row.family === "typography") segment = stripTypography(segment, row.declarations);
		else if (row.family === "motion") segment = stripMotion(segment, row.value);
		else if (receiptOutcome === "PROFILE") segment = migrateBorder(segment, row.syntax, row.destination);
		else if (receiptOutcome === "REMOVE") segment = removeBorder(segment, row.syntax);
		else if (receiptOutcome === "NONE") segment = preserveBorderless(segment, row.syntax);
		if (receiptOutcome === "PROFILE" && row.family !== "border") {
			const prefix = row.family === "typography" ? "type" : "motion";
			segment = addProfile(segment, `${prefix}-${row.destination}`);
		}
		text = `${text.slice(0, start)}${segment}${text.slice(end > start ? end : start + 800)}`;
	}
	writeFileSync(path, text);
}

const receiptRows = [];
for (const family of families) {
	for (const row of family.rows.filter((entry) => ownsWave(entry.path))) {
		const [result, profile] = outcome(family.name, row.destination);
		receiptRows.push([
			row.site_id,
			row.destination,
			result,
			profile,
			row.path,
			`${row.anchor}:${row.tag}`.replace(/\t|\n/g, " "),
		].join("\t"));
	}
}
writeFileSync(
	`${work}/migration-receipts-wave-${wave}.tsv`,
	`audit_site_id\taudit_destination\toutcome\tprofile\tfinal_path\tfinal_locator\n${receiptRows.sort().join("\n")}\n`,
);
console.log(`AZ16 wave ${wave}: migrated ${rowsByPath.size} files; wrote ${receiptRows.length} receipts`);
