#!/usr/bin/env bun
// AC coverage helper (TE-12)
//
// Cold DoD's first-turn helper. Parses acceptance criteria from a story
// in docs/work-packages/TRACK-*.md, scans test descriptions across the
// repo, returns TOON {covered: [...], missing: [...]}. Cuts the
// "re-read every test file to see what's tested" loop.
//
// Usage:
//   bun .claude/skills/check-definition-of-done/ac-coverage.ts <story-id>
//
// Heuristic, not proof. A bullet is "covered" when at least two significant
// content tokens from the bullet appear in some test description. The
// auditor is still expected to verify with bun run test. The point is to
// surface the obviously-missing bullets fast, not to replace the audit.
//
// Failure modes:
//   - story file missing → exit 2
//   - story heading not found → exit 2
//   - prose-form acceptance criteria (no `- ` bullets) → covered=[], missing=[]
//     with a stderr warning. Mitigation: enforce bullet form in the work-package template.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const WORK_PACKAGES_DIR = join(REPO_ROOT, "docs", "work-packages");

const STOP_WORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"that",
	"this",
	"from",
	"into",
	"when",
	"then",
	"each",
	"all",
	"any",
	"are",
	"not",
	"but",
	"per",
	"via",
	"its",
	"has",
	"have",
	"can",
	"must",
	"should",
	"runs",
	"run",
	"return",
	"returns",
	"works",
	"work",
	"correctly",
	"valid",
	"present",
	"without",
]);

type Coverage = { covered: string[]; missing: string[] };

function trackFileFor(storyId: string): string {
	const letter = storyId.match(/^([A-Z])/)?.[1];
	if (!letter) throw new Error(`story id must start with a track letter, got ${storyId}`);
	return join(WORK_PACKAGES_DIR, `TRACK-${letter}.md`);
}

function extractAcceptanceCriteria(markdown: string, storyId: string): string[] {
	// Match a heading line containing the story id as a standalone token,
	// e.g. "### A1 — Project Scaffolding" or "## A-12: Foo".
	const headingRe = new RegExp(`^#{1,6}\\s+${storyId}\\b.*$`, "m");
	const headingMatch = markdown.match(headingRe);
	if (!headingMatch || headingMatch.index === undefined) {
		throw new Error(`story heading "${storyId}" not found in track file`);
	}
	const after = markdown.slice(headingMatch.index + headingMatch[0].length);
	// Story ends at the next heading of the same or higher level (or end of file).
	const headingLevel = headingMatch[0].match(/^#+/)?.[0].length ?? 3;
	const nextHeadingRe = new RegExp(`^#{1,${headingLevel}}\\s`, "m");
	const nextMatch = after.match(nextHeadingRe);
	const storyBlock = nextMatch?.index === undefined ? after : after.slice(0, nextMatch.index);

	// Find the **Acceptance criteria.** section and grab bullets until the
	// next bold header or blank-then-bold boundary.
	const acStart = storyBlock.search(/\*\*Acceptance criteria\.?\*\*/i);
	if (acStart === -1) return [];
	const acTail = storyBlock.slice(acStart);
	const nextBoldHeader = acTail.slice(1).search(/\n\*\*[A-Z][^*]+\*\*/);
	const acBlock = nextBoldHeader === -1 ? acTail : acTail.slice(0, nextBoldHeader + 1);

	const bullets: string[] = [];
	for (const raw of acBlock.split("\n")) {
		const m = raw.match(/^\s*[-*]\s+(.+?)\s*$/);
		if (m) bullets.push(m[1]);
	}
	return bullets;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9_./-]+/g, " ")
		.split(/\s+/)
		.filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
}

function significantTokens(bullet: string): string[] {
	// Backticked identifiers and quoted strings are the strongest signal —
	// keep them verbatim alongside the regular tokens.
	const verbatim = Array.from(bullet.matchAll(/`([^`]+)`/g)).map((m) => m[1].toLowerCase());
	const general = tokenize(bullet);
	return Array.from(new Set([...verbatim, ...general]));
}

async function* walkSourceFiles(root: string): AsyncGenerator<string> {
	const entries = await readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name.startsWith(".") && entry.name !== ".") continue;
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			yield* walkSourceFiles(full);
		} else if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".e2e.ts")) {
			yield full;
		}
	}
}

async function collectTestDescriptions(root: string): Promise<string[]> {
	const descriptions: string[] = [];
	const callRe = /\b(?:it|test|describe)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
	for await (const file of walkSourceFiles(root)) {
		let content: string;
		try {
			content = await readFile(file, "utf8");
		} catch {
			continue;
		}
		for (const m of content.matchAll(callRe)) {
			descriptions.push(m[2]);
		}
	}
	return descriptions;
}

function isCovered(bullet: string, descriptions: string[]): boolean {
	const tokens = significantTokens(bullet);
	if (tokens.length === 0) return false;
	const required = Math.min(2, tokens.length);
	for (const desc of descriptions) {
		const lc = desc.toLowerCase();
		let hits = 0;
		for (const t of tokens) {
			if (lc.includes(t)) hits++;
			if (hits >= required) return true;
		}
	}
	return false;
}

function toToon(c: Coverage): string {
	const lines: string[] = [];
	if (c.covered.length === 0) {
		lines.push("covered: ");
	} else {
		c.covered.forEach((b, i) => lines.push(`covered[${i}]: ${b}`));
	}
	if (c.missing.length === 0) {
		lines.push("missing: ");
	} else {
		c.missing.forEach((b, i) => lines.push(`missing[${i}]: ${b}`));
	}
	return lines.join("\n");
}

async function main(): Promise<number> {
	const storyId = process.argv[2];
	if (!storyId) {
		process.stderr.write("usage: bun ac-coverage.ts <story-id>\n");
		return 2;
	}

	const trackPath = trackFileFor(storyId);
	let markdown: string;
	try {
		markdown = await readFile(trackPath, "utf8");
	} catch {
		process.stderr.write(`track file not found: ${relative(REPO_ROOT, trackPath)}\n`);
		return 2;
	}

	let bullets: string[];
	try {
		bullets = extractAcceptanceCriteria(markdown, storyId);
	} catch (err) {
		process.stderr.write(`${(err as Error).message}\n`);
		return 2;
	}

	if (bullets.length === 0) {
		process.stderr.write(
			`no bulleted acceptance criteria for ${storyId}. ` +
				"check the work-package uses '- ' bullets under **Acceptance criteria.**\n",
		);
		process.stdout.write(`${toToon({ covered: [], missing: [] })}\n`);
		return 0;
	}

	const descriptions = await collectTestDescriptions(REPO_ROOT);
	const covered: string[] = [];
	const missing: string[] = [];
	for (const b of bullets) {
		(isCovered(b, descriptions) ? covered : missing).push(b);
	}

	process.stdout.write(`${toToon({ covered, missing })}\n`);
	// Always exit 0; auditor reads the TOON and decides what to do.
	return 0;
}

// Used by the work-package directory and a sanity check.
await stat(WORK_PACKAGES_DIR).catch(() => {
	process.stderr.write(`work-packages dir missing: ${WORK_PACKAGES_DIR}\n`);
	process.exit(2);
});

const code = await main();
process.exit(code);
