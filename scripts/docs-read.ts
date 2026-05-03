#!/usr/bin/env bun
// Anchor-scoped doc reader.
// Usage: bun run docs:read <file>[#<anchor>]
// Returns the slice from the matching <!-- @anchor: name --> marker
// up to the next anchor marker (or EOF). With no anchor, prints the
// full file. Lists available anchors when the requested one isn't found.

import { readFileSync, existsSync } from "node:fs";

const arg = process.argv[2];
if (!arg) {
	console.error("usage: bun run docs:read <file>[#<anchor>]");
	process.exit(2);
}

const [path, anchor] = arg.split("#") as [string, string | undefined];

if (!existsSync(path)) {
	console.error(`docs:read: file not found: ${path}`);
	process.exit(1);
}

const src = readFileSync(path, "utf8");
const lines = src.split("\n");
const ANCHOR_RE = /^<!--\s*@anchor:\s*([a-zA-Z0-9_\-./]+)\s*-->\s*$/;

const anchors: { name: string; line: number }[] = [];
for (let i = 0; i < lines.length; i++) {
	const m = lines[i].match(ANCHOR_RE);
	if (m) anchors.push({ name: m[1], line: i });
}

if (!anchor) {
	process.stdout.write(src);
	process.exit(0);
}

const idx = anchors.findIndex((a) => a.name === anchor);
if (idx === -1) {
	console.error(`docs:read: anchor "${anchor}" not found in ${path}`);
	if (anchors.length) {
		console.error("available anchors:");
		for (const a of anchors) console.error(`  - ${a.name}`);
	} else {
		console.error("(file has no @anchor markers)");
	}
	process.exit(1);
}

const start = anchors[idx].line;
const end = idx + 1 < anchors.length ? anchors[idx + 1].line : lines.length;
process.stdout.write(lines.slice(start, end).join("\n"));
if (!src.endsWith("\n")) process.stdout.write("\n");
