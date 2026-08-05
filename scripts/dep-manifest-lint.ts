#!/usr/bin/env tsx
/**
 * AU28 — import-vs-manifest gate.
 *
 * Fails when a workspace package imports something it does not declare, or
 * declares something it never reaches. See scripts/lib/dep-manifest-verdict.ts
 * for why knip cannot do this and what counts as "reaches".
 *
 * Usage:
 *   npm run deps:check
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
	computeDependencyVerdict,
	type DependencyField,
	type Divergence,
	JUSTIFIED_UNUSED,
	type PackageFacts,
} from "./lib/dep-manifest-verdict.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILTINS = new Set(builtinModules);

/** Directories that never hold first-party source. */
const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"coverage",
	"release",
	"test-results",
	"playwright-report",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const STYLE_EXTENSIONS = new Set([".css"]);

const DEPENDENCY_FIELDS: readonly DependencyField[] = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
];

interface Manifest {
	name?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

function readManifest(path: string): Manifest {
	return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

/**
 * Workspace package directories, discovered by scanning — never a hardcoded list.
 * Hard-fails on an empty scan so a moved folder cannot silently disable the gate.
 */
function discoverWorkspaceDirs(): string[] {
	const roots = ["layers", "framework", "applications", "tools"];
	const dirs: string[] = [];
	for (const root of roots) {
		const rootPath = join(REPO_ROOT, root);
		if (!existsSync(rootPath)) continue;
		for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
			if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
			const dir = join(rootPath, entry.name);
			if (existsSync(join(dir, "package.json"))) dirs.push(dir);
			for (const nested of readdirSync(dir, { withFileTypes: true })) {
				if (!nested.isDirectory() || SKIP_DIRS.has(nested.name)) continue;
				const nestedDir = join(dir, nested.name);
				if (existsSync(join(nestedDir, "package.json"))) dirs.push(nestedDir);
			}
		}
	}
	if (dirs.length === 0) {
		throw new Error(
			"dep-manifest-lint: found zero workspace packages — the layout moved and this gate is scanning nothing.",
		);
	}
	return dirs.sort();
}

/** Files owned by `dir`, excluding anything a nested workspace package owns. */
function collectOwnedFiles(dir: string, ownedBy: ReadonlySet<string>, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (ownedBy.has(path)) continue;
			collectOwnedFiles(path, ownedBy, out);
		} else {
			const ext = extname(entry.name);
			if (SOURCE_EXTENSIONS.has(ext) || STYLE_EXTENSIONS.has(ext)) out.push(path);
		}
	}
	return out;
}

/** `@scope/name/sub` -> `@scope/name`; `name/sub` -> `name`; builtins/relative -> null. */
function barePackageName(specifier: string): string | null {
	if (!specifier || specifier.startsWith(".") || specifier.startsWith("/")) return null;
	if (specifier.startsWith("#") || specifier.startsWith("node:")) return null;
	const segments = specifier.split("/");
	const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
	if (!name || BUILTINS.has(name)) return null;
	return name;
}

const CSS_REFERENCE = /@(?:import|plugin)\s+["']([^"']+)["']/g;
const VITEST_ENVIRONMENT_PRAGMA = /@vitest-environment\s+([\w-]+)/g;
const VITEST_ENVIRONMENT_FIELD = /\benvironment\s*:\s*["']([\w-]+)["']/g;

function gatherFacts(dir: string, ownedBy: ReadonlySet<string>): PackageFacts {
	const manifest = readManifest(join(dir, "package.json"));
	const name = manifest.name ?? relative(REPO_ROOT, dir);

	const declared = new Map<string, DependencyField>();
	for (const field of DEPENDENCY_FIELDS) {
		for (const dependency of Object.keys(manifest[field] ?? {})) {
			if (!declared.has(dependency)) declared.set(dependency, field);
		}
	}

	const imported = new Map<string, string[]>();
	const cssReferences = new Set<string>();
	const testEnvironments = new Set<string>();
	let usesNodeBuiltins = false;

	for (const file of collectOwnedFiles(dir, ownedBy)) {
		const source = readFileSync(file, "utf8");
		const site = relative(REPO_ROOT, file);

		if (STYLE_EXTENSIONS.has(extname(file))) {
			for (const match of source.matchAll(CSS_REFERENCE)) {
				const referenced = barePackageName(match[1] ?? "");
				if (referenced) cssReferences.add(referenced);
			}
			continue;
		}

		// preProcessFile is the compiler's own specifier extractor: it sees real
		// imports/exports/require/dynamic-import and triple-slash type references,
		// and — unlike a regex — never mistakes a string literal for an import.
		const preprocessed = ts.preProcessFile(source, true, true);
		const specifiers = [
			...preprocessed.importedFiles.map((reference) => reference.fileName),
			...preprocessed.typeReferenceDirectives.map((reference) => reference.fileName),
		];
		for (const specifier of specifiers) {
			if (specifier.startsWith("node:")) usesNodeBuiltins = true;
			const referenced = barePackageName(specifier);
			if (!referenced) {
				if (BUILTINS.has(specifier.split("/")[0] ?? "")) usesNodeBuiltins = true;
				continue;
			}
			const sites = imported.get(referenced) ?? [];
			if (sites.length < 3) sites.push(site);
			imported.set(referenced, sites);
		}

		for (const match of source.matchAll(VITEST_ENVIRONMENT_PRAGMA)) {
			if (match[1] && match[1] !== "node") testEnvironments.add(match[1]);
		}
		if (/vitest.*config/.test(site)) {
			for (const match of source.matchAll(VITEST_ENVIRONMENT_FIELD)) {
				if (match[1] && match[1] !== "node") testEnvironments.add(match[1]);
			}
		}
	}

	const scriptTokens = new Set(Object.values(manifest.scripts ?? {}).join(" ").match(/[\w@/.-]+/g) ?? []);

	const peersOfDeclared = new Map<string, string[]>();
	for (const dependency of declared.keys()) {
		const manifestPath = join(REPO_ROOT, "node_modules", dependency, "package.json");
		if (!existsSync(manifestPath)) continue;
		const installed = readManifest(manifestPath);
		const optional = installed.peerDependenciesMeta ?? {};
		const peers = Object.keys(installed.peerDependencies ?? {}).filter(
			(peer) => optional[peer]?.optional !== true,
		);
		if (peers.length > 0) peersOfDeclared.set(dependency, peers);
	}

	return {
		name,
		dir: relative(REPO_ROOT, dir),
		declared,
		imported,
		usesNodeBuiltins,
		cssReferences,
		testEnvironments,
		scriptTokens,
		peersOfDeclared,
	};
}

function report(divergences: readonly Divergence[]): void {
	const undeclared = divergences.filter((d) => d.direction === "undeclared");
	const unused = divergences.filter((d) => d.direction === "unused");

	if (undeclared.length > 0) {
		process.stderr.write(
			`\nImported but not declared (${undeclared.length}) — resolves only by workspace hoisting:\n`,
		);
		for (const d of undeclared) {
			process.stderr.write(`  ${d.dir}  needs  ${d.dependency}\n    e.g. ${d.sites.join("\n    e.g. ")}\n`);
		}
	}
	if (unused.length > 0) {
		process.stderr.write(`\nDeclared but never referenced (${unused.length}):\n`);
		for (const d of unused) {
			process.stderr.write(`  ${d.dir}  drop  ${d.dependency}\n`);
		}
	}
	process.stderr.write(
		"\nEvery package declares exactly what it imports. Add the declaration, or drop it.\n" +
			"A declaration that is real but unreachable belongs in JUSTIFIED_UNUSED\n" +
			"(scripts/lib/dep-manifest-verdict.ts) with a reason.\n",
	);
}

function main(): void {
	const dirs = discoverWorkspaceDirs();
	const ownedBy = new Set(dirs);
	const packages = dirs.map((dir) => gatherFacts(dir, ownedBy));
	const divergences = computeDependencyVerdict(packages);

	if (divergences.length > 0) {
		report(divergences);
		process.exit(1);
	}

	process.stdout.write(
		`dep-manifest-lint: ${packages.length} packages, imports and manifests agree` +
			` (${JUSTIFIED_UNUSED.length} justified exception${JUSTIFIED_UNUSED.length === 1 ? "" : "s"}).\n`,
	);
}

main();
