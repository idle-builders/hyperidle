#!/usr/bin/env bun
// Anchor-scoped doc reader for split concept docs.
// Usage: bun run docs:read <topic>[#<section>]
//   - `bun run docs:read architecture#components` → reads docs/concept/architecture/components.md
//   - `bun run docs:read architecture` → reads docs/concept/architecture/index.md
//   - `bun run docs:read docs/concept/architecture/components.md` → reads file directly
// Lists available sections when the requested one isn't found.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONCEPT_DIR = join(import.meta.dir, "../docs/concept");

const arg = process.argv[2];
if (!arg) {
	console.error(
		"usage: bun run docs:read <topic>[#<section>]\n\nExamples:\n  bun run docs:read architecture#components\n  bun run docs:read architecture\n  bun run docs:read docs/concept/architecture/components.md",
	);
	process.exit(2);
}

// Direct file path — just read it
if (arg.includes("/") && !arg.includes("#")) {
	if (!existsSync(arg)) {
		console.error(`docs:read: file not found: ${arg}`);
		process.exit(1);
	}
	process.stdout.write(readFileSync(arg, "utf8"));
	process.exit(0);
}

const [topic, section] = arg.split("#") as [string, string | undefined];

// Resolve topic to directory
const topicDir = join(CONCEPT_DIR, topic);

if (!existsSync(topicDir)) {
	// Try as a direct file path (backward compat)
	if (existsSync(topic)) {
		process.stdout.write(readFileSync(topic, "utf8"));
		process.exit(0);
	}
	console.error(`docs:read: topic not found: ${topic}`);
	const dirs = readdirSync(CONCEPT_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	if (dirs.length) {
		console.error("available topics:");
		for (const d of dirs) console.error(`  - ${d}`);
	}
	process.exit(1);
}

if (!section) {
	// Read the index file
	const indexPath = join(topicDir, "index.md");
	if (!existsSync(indexPath)) {
		console.error(`docs:read: no index.md in ${topicDir}`);
		process.exit(1);
	}
	process.stdout.write(readFileSync(indexPath, "utf8"));
	process.exit(0);
}

// Read specific section
const sectionPath = join(topicDir, `${section}.md`);
if (!existsSync(sectionPath)) {
	console.error(`docs:read: section "${section}" not found in topic "${topic}"`);
	const files = readdirSync(topicDir)
		.filter((f) => f.endsWith(".md") && f !== "index.md")
		.map((f) => f.replace(/\.md$/, ""));
	if (files.length) {
		console.error("available sections:");
		for (const f of files) console.error(`  - ${f}`);
	}
	process.exit(1);
}

process.stdout.write(readFileSync(sectionPath, "utf8"));
