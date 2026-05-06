#!/usr/bin/env bun
// Lint wrapper (biome + eslint). Groups errors by file, caps at 10 files, outputs TOON.
// Called via: bun run lint

import { spawn } from "node:child_process";
import { capByFile, type FileErrors, groupByFile, toToon } from "./lib/output-cap.js";

const MAX_FILES = 10;

// Biome format: "path/file.ts:line:col lint/rule ━━━━" or "path/file.ts organizeImports ━━━━"
const BIOME_ERROR_RE = /^(.+?\.[a-z]+)(?::\d+:\d+)?\s+\S+\s+━+.*$/;
// ESLint --quiet format: "  line:col  error  message  rule-name" preceded by file path
const ESLINT_FILE_RE = /^(.+\.[a-z]+)$/;

interface LintRun {
	name: string;
	cmd: string;
	args: string[];
}

function runTool(tool: LintRun): Promise<{ ok: boolean; output: string }> {
	return new Promise((resolve) => {
		const child = spawn(tool.cmd, tool.args, { stdio: ["ignore", "pipe", "pipe"] });
		const chunks: string[] = [];
		child.stdout.on("data", (c: Buffer) => chunks.push(c.toString()));
		child.stderr.on("data", (c: Buffer) => chunks.push(c.toString()));
		child.on("close", (code) => resolve({ ok: code === 0, output: chunks.join("") }));
	});
}

function parseBiomeErrors(output: string): FileErrors[] {
	return groupByFile(output, BIOME_ERROR_RE);
}

function parseEslintErrors(output: string): FileErrors[] {
	const groups: FileErrors[] = [];
	let currentFile: string | null = null;
	let currentErrors: string[] = [];

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			if (currentFile && currentErrors.length > 0) {
				groups.push({ file: currentFile, errors: currentErrors });
			}
			currentFile = null;
			currentErrors = [];
			continue;
		}
		// ESLint prints file path on its own line, then indented errors
		if (!line.startsWith(" ") && ESLINT_FILE_RE.test(trimmed) && !trimmed.includes("  ")) {
			if (currentFile && currentErrors.length > 0) {
				groups.push({ file: currentFile, errors: currentErrors });
			}
			currentFile = trimmed;
			currentErrors = [];
		} else if (currentFile && trimmed.includes("error")) {
			currentErrors.push(trimmed);
		}
	}
	if (currentFile && currentErrors.length > 0) {
		groups.push({ file: currentFile, errors: currentErrors });
	}
	return groups;
}

const [biome, eslint] = await Promise.all([
	runTool({ name: "biome", cmd: "bun", args: ["run", "lint:biome"] }),
	runTool({ name: "eslint", cmd: "bunx", args: ["--bun", "eslint", ".", "--quiet"] }),
]);

if (biome.ok && eslint.ok) {
	process.stdout.write("status: passed\ntool: lint\ntotalErrors: 0\n");
	process.exit(0);
}

// Merge file groups from both tools
const allFiles = new Map<string, string[]>();
const mergeGroup = (groups: FileErrors[], prefix: string): void => {
	for (const g of groups) {
		const existing = allFiles.get(g.file);
		const tagged = g.errors.map((e) => `[${prefix}] ${e}`);
		if (existing) {
			existing.push(...tagged);
		} else {
			allFiles.set(g.file, [...tagged]);
		}
	}
};

if (!biome.ok) mergeGroup(parseBiomeErrors(biome.output), "biome");
if (!eslint.ok) mergeGroup(parseEslintErrors(eslint.output), "eslint");

const grouped: FileErrors[] = [...allFiles.entries()].map(([file, errors]) => ({ file, errors }));
const result = capByFile(grouped, MAX_FILES);
result.tool = "lint";
process.stderr.write(`${toToon(result)}\n`);
process.exit(1);
