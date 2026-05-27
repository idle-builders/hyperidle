#!/usr/bin/env tsx
// Test wrapper. Groups failures by file, caps at 10 files, outputs TOON.
// Called via: bun run test

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { capByFile, type FileErrors, toToon } from "./lib/output-cap.js";

const MAX_FILES = 10;
const TEST_OUTPUT_FILE = "test-output.toon";

const extraArgs = process.argv.slice(2);
const child = spawn("npm", ["run", "test:raw", ...extraArgs], {
	stdio: ["ignore", "pipe", "pipe"],
	env: { ...process.env, VITEST_TOON_OUTPUT: TEST_OUTPUT_FILE },
});

const stdoutChunks: string[] = [];
const stderrChunks: string[] = [];
child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c.toString()));
child.stderr.on("data", (c: Buffer) => stderrChunks.push(c.toString()));

child.on("close", (code) => {
	if (code === 0) {
		process.stdout.write("status: passed\ntool: test\ntotalErrors: 0\n");
		process.exit(0);
	}

	// Try structured TOON output first
	const toonPath = resolve(process.cwd(), TEST_OUTPUT_FILE);
	if (existsSync(toonPath)) {
		const toon = readFileSync(toonPath, "utf-8");
		process.stderr.write(`${toon}\n`);
		process.exit(1);
	}

	// Fallback: parse vitest output for failing test files
	const combined = stdoutChunks.join("") + stderrChunks.join("");
	const grouped = parseVitestFailures(combined);
	const result = capByFile(grouped, MAX_FILES);
	result.tool = "test";
	process.stderr.write(`${toToon(result)}\n`);
	process.exit(1);
});

function parseVitestFailures(output: string): FileErrors[] {
	const groups: FileErrors[] = [];
	// Vitest failure format: " FAIL  path/to/file.test.ts > describe > test name"
	// Or: "❯ path/to/file.test.ts:line:col"
	const failRe = /^ *FAIL\s+(.+?)\s*[>\n]/gm;
	const fileErrors = new Map<string, string[]>();

	let match: RegExpExecArray | null;
	while ((match = failRe.exec(output)) !== null) {
		const file = match[1].trim();
		const existing = fileErrors.get(file);
		// Grab context: the line plus next few lines until empty line
		const startIdx = match.index;
		const nextNewlines = output.indexOf("\n\n", startIdx);
		const endIdx = nextNewlines > 0 ? nextNewlines : startIdx + 200;
		const context = output.slice(startIdx, endIdx).trim();
		if (existing) {
			existing.push(context);
		} else {
			fileErrors.set(file, [context]);
		}
	}

	// Also catch "× test name" pattern from verbose reporter
	const altFailRe = /^ *[×✗❌]\s+(.+)$/gm;
	if (fileErrors.size === 0) {
		let currentFile = "unknown";
		const fileHeaderRe = /^ *(?:FAIL|❯)\s+(.+?\.[a-z]+)/gm;
		let header: RegExpExecArray | null;
		while ((header = fileHeaderRe.exec(output)) !== null) {
			currentFile = header[1];
		}
		while ((match = altFailRe.exec(output)) !== null) {
			const existing = fileErrors.get(currentFile);
			if (existing) {
				existing.push(match[0].trim());
			} else {
				fileErrors.set(currentFile, [match[0].trim()]);
			}
		}
	}

	for (const [file, errors] of fileErrors) {
		groups.push({ file, errors });
	}
	return groups;
}
