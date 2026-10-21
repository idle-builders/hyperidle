#!/usr/bin/env tsx
/**
 * Token check for layers/core-ui.
 *
 * (a) Every var(--name) referenced in core-ui CSS or TSX must be defined in
 *     tokens.css or defined locally in the same file.
 * (b) No raw colour literals (#hex, rgb(), rgba(), hsl(), hsla()) in core-ui
 *     CSS or TSX outside tokens.css.
 *
 * Hard-fails when the scan finds zero files (guard against silent empty pass).
 */

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

export interface TokenFinding {
	path: string;
	line: number;
	message: string;
}

/** Parse all --name: definitions in a CSS string. */
export function extractDefinedTokens(css: string): Set<string> {
	const defined = new Set<string>();
	for (const match of css.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) {
		const name = match[1];
		if (name !== undefined) defined.add(`--${name}`);
	}
	return defined;
}

/** Parse all var(--name) references in a string. */
export function extractVarReferences(src: string): Array<{ name: string; line: number }> {
	const refs: Array<{ name: string; line: number }> = [];
	let lineNum = 0;
	for (const line of src.split("\n")) {
		lineNum++;
		for (const match of line.matchAll(/var\((--[a-zA-Z0-9_-]+)/g)) {
			const name = match[1];
			if (name !== undefined) refs.push({ name, line: lineNum });
		}
	}
	return refs;
}

/** Find raw colour literals in a string (line number, snippet). */
export function findRawColours(src: string): Array<{ line: number; snippet: string }> {
	const found: Array<{ line: number; snippet: string }> = [];
	const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(/g;
	let lineNum = 0;
	for (const line of src.split("\n")) {
		lineNum++;
		for (const match of line.matchAll(RAW_COLOUR)) {
			found.push({ line: lineNum, snippet: match[0] });
		}
	}
	return found;
}

/**
 * Run both checks against a set of source files.
 * tokensCss: the raw content of tokens.css (the only file allowed to have raw values).
 * files: all other core-ui CSS and TSX files as {path, content}.
 */
export function checkCoreUiTokens(
	tokensCss: string,
	files: ReadonlyArray<{ path: string; content: string }>,
): TokenFinding[] {
	const globalTokens = extractDefinedTokens(tokensCss);
	const findings: TokenFinding[] = [];

	for (const { path, content } of files) {
		// (a) undefined token references
		const localTokens =
			extname(path) === ".css" ? extractDefinedTokens(content) : new Set<string>();
		for (const { name, line } of extractVarReferences(content)) {
			if (!(globalTokens.has(name) || localTokens.has(name))) {
				findings.push({ path, line, message: `undefined token ${name}` });
			}
		}

		// (b) raw colour literals
		for (const { line, snippet } of findRawColours(content)) {
			findings.push({ path, line, message: `raw colour: ${snippet}` });
		}
	}

	return findings;
}

function walkDir(dir: string, visit: (p: string) => void): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
			continue;
		const p = join(dir, entry.name);
		if (entry.isDirectory()) walkDir(p, visit);
		else visit(p);
	}
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
	const root = process.cwd();
	const srcDir = resolve(root, "layers/core-ui/src");
	const tokensPath = resolve(srcDir, "tokens.css");

	const tokensCss = readFileSync(tokensPath, "utf8");
	const files: Array<{ path: string; content: string }> = [];

	walkDir(srcDir, (abs) => {
		const ext = extname(abs);
		if (ext !== ".css" && ext !== ".tsx" && ext !== ".ts") return;
		if (abs === tokensPath) return;
		// skip dev files
		const parts = abs.split("/");
		if (parts.some((p) => p.startsWith("__"))) return;
		if (/\.(test|spec|stories)\.[^.]+$/.test(abs)) return;
		files.push({
			path: relative(root, abs).replace(/\\/g, "/"),
			content: readFileSync(abs, "utf8"),
		});
	});

	if (files.length === 0) {
		process.stderr.write(
			"design-css-gate: no files found in layers/core-ui/src — check the path\n",
		);
		process.exitCode = 1;
	} else {
		const findings = checkCoreUiTokens(tokensCss, files);
		if (findings.length > 0) {
			for (const f of findings) {
				process.stderr.write(`${f.path}:${f.line} ${f.message}\n`);
			}
			process.exitCode = 1;
		} else {
			process.stdout.write(`design-css-gate: OK (${files.length} files checked)\n`);
		}
	}
}
