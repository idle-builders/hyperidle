#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const root = `${process.cwd()}/`;
const grouped = new Map();

for (const file of report) {
	const path = file.filePath.startsWith(root) ? file.filePath.slice(root.length) : file.filePath;
	for (const message of file.messages) {
		if (!message.ruleId?.match(/^design\/(?:typography|motion|border-width)-profile-only$/)) continue;
		const value = /Raw (?:typography|motion|border width) '([\s\S]*)' is not public/.exec(message.message)?.[1];
		if (!value) continue;
		const key = `${path}\0${value}`;
		const item = grouped.get(key) ?? { path, value, rules: new Set() };
		item.rules.add(message.ruleId);
		grouped.set(key, item);
	}
}

function cleanTypography(text) {
	return text
		.split(/\s+/)
		.filter((token) => !/^(?:[a-z-]+:)*(?:font-(?:sans|mono|thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[(?:\d+|var\(--font-[^)]+\)|[^\]]*,[^\]]*)\])|text-(?:xs|sm|base|lg|xl|2xl|3xl|\[(?:length:)?(?:-?\d|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl)\))[^\]]*\])|leading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\])|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])|\[letter-spacing:[^\]]+\]|italic|not-italic)$/.test(token))
		.join(" ");
}

function cleanMotion(text) {
	return text
		.split(/\s+/)
		.filter((token) => !/^(?:[a-z-]+:)*(?:transition(?:-[^\s]+)?|duration-[^\s]+|ease-[^\s]+|animate-[^\s]+|\[(?:transition|transition-property|transition-duration|transition-timing-function|animation):[^\]]+\])$/.test(token))
		.join(" ");
}

function cleanBorder(text, path) {
	return text
		.split(/\s+/)
		.map((token) => {
			const prefixes = token.match(/^(?:[a-z-]+:)*/)?.[0] ?? "";
			const base = token.slice(prefixes.length);
			const side = /^border-(x|y|t|r|b|l|s|e)$/.exec(base)?.[1];
			if (base === "border" || side) return `${prefixes}border${side ? `-${side}` : ""}-[var(--bw-thin)]`;
			const numeric = /^border(?:-(x|y|t|r|b|l|s|e))?-(0|2|4|8)$/.exec(base);
			if (numeric) {
				if (numeric[2] === "0") return `${prefixes}border-none`;
				return `${prefixes}border${numeric[1] ? `-${numeric[1]}` : ""}-[var(--bw-strong)]`;
			}
			const arbitrary = /^border(?:-(x|y|t|r|b|l|s|e))?-\[(\d+(?:\.\d+)?)px\]$/.exec(base);
			if (!arbitrary) return token;
			const profile = path.endsWith("/CommentRow.tsx") ? "strong" : Number(arbitrary[2]) <= 1 ? "thin" : Number(arbitrary[2]) >= 2 ? "strong" : "default";
			return `${prefixes}border${arbitrary[1] ? `-${arbitrary[1]}` : ""}-[var(--bw-${profile})]`;
		})
		.join(" ");
}

const changed = new Set();
for (const { path, value, rules } of grouped.values()) {
	let source = readFileSync(path, "utf8");
	let replacement = value;
	if (rules.has("design/typography-profile-only")) replacement = cleanTypography(replacement);
	if (rules.has("design/motion-profile-only")) replacement = cleanMotion(replacement);
	if (rules.has("design/border-width-profile-only")) replacement = cleanBorder(replacement, path);
	let replaced = false;
	for (const quote of ['"', "'", "`"]) {
		const before = `${quote}${value}${quote}`;
		if (!source.includes(before)) continue;
		source = source.split(before).join(`${quote}${replacement}${quote}`);
		replaced = true;
	}
	if (replaced) {
		writeFileSync(path, source);
		changed.add(path);
	}
}
process.stdout.write(`AZ16 survivor cleanup: ${changed.size} files\n`);
