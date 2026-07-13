#!/usr/bin/env tsx
/**
 * AU19 Mechanism C — Composition boundary. A Service package NEVER depends on
 * another Service or on a Layer package. Cross-Service data flows in as a port
 * parameter wired by the owning Layer (the Layer is the only place two Services
 * are named together).
 *
 * Enforcer (architecture §7.3, revised post-C1): two checks, both required —
 *  1. Declared deps — read every nested Service `package.json`
 *     (`packages/<layer>/<service>/package.json`) and FAIL if `dependencies` lists
 *     any `@hyperidle/*` name other than the allowed leaves `@hyperidle/db` and
 *     `@hyperidle/shared`.
 *  2. Source imports — scan every nested Service's `src/**` for `@hyperidle/*`
 *     module specifiers (static `import`/`require` and dynamic `import()`) and
 *     FAIL on any that is not `@hyperidle/db`/`@hyperidle/shared`, REGARDLESS of
 *     what is declared in package.json.
 * Third-party runtime deps (e.g. drizzle-orm) are allowed. Layer packages
 * (`packages/<layer>/package.json`) are NOT scanned — composing their own
 * Services is exactly a Layer's job.
 *
 * @lore AU19 C1 (checkpoint review fe48f126): tsc cannot enforce this — a hoisted
 * monorepo node_modules resolves any `@hyperidle/*` from any package regardless of
 * declared deps, and packages export raw `./src/index.ts` so project-reference
 * gating never bites. A package.json-only guard is ALSO insufficient: an import
 * can be added without ever touching package.json, which is invisible to check
 * (1). Check (2) — mirroring execution-boundary-guard's own source-import scan —
 * is the real source-of-truth enforcer; `--fixtures` proves both the declared and
 * the undeclared path.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const ALLOWED_HYPERIDLE = new Set(["@hyperidle/db", "@hyperidle/shared"]);

export interface Finding {
	readonly file: string;
	readonly reason: string;
}

/** Every nested Service root: packages/<layer>/<service>/ (has a package.json). */
function serviceRoots(root: string): string[] {
	const packagesDir = join(root, "packages");
	const found: string[] = [];
	if (!existsSync(packagesDir)) return found;
	for (const layer of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!layer.isDirectory()) continue;
		const layerDir = join(packagesDir, layer.name);
		for (const svc of readdirSync(layerDir, { withFileTypes: true })) {
			if (!svc.isDirectory()) continue;
			if (existsSync(join(layerDir, svc.name, "package.json"))) {
				found.push(join(layerDir, svc.name));
			}
		}
	}
	return found;
}

/** Recursively collect production `.ts`/`.tsx` files under a dir (skip tests/dist). */
function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") {
				continue;
			}
			out.push(...collectSourceFiles(abs));
		} else if (
			/\.tsx?$/.test(entry.name) &&
			!/\.test\.tsx?$/.test(entry.name) &&
			!/\.integration\.test\.tsx?$/.test(entry.name)
		) {
			out.push(abs);
		}
	}
	return out;
}

/** Check (1) — declared package.json dependencies. */
function checkManifest(root: string, serviceRoot: string): Finding[] {
	const manifest = join(serviceRoot, "package.json");
	if (!existsSync(manifest)) return [];
	const rel = relative(root, manifest).split("\\").join("/");
	const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	const findings: Finding[] = [];
	for (const dep of Object.keys(pkg.dependencies ?? {})) {
		if (dep.startsWith("@hyperidle/") && !ALLOWED_HYPERIDLE.has(dep)) {
			findings.push({
				file: rel,
				reason: `Service depends on "${dep}" — a Service may only depend on @hyperidle/db + @hyperidle/shared; cross-Service wiring is the Layer's job (Mechanism C)`,
			});
		}
	}
	return findings;
}

/** Check (2) — source-import scan of a single file (static + dynamic import). */
function checkSourceFile(root: string, abs: string): Finding[] {
	const rel = relative(root, abs).split("\\").join("/");
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	const visit = (node: ts.Node): void => {
		let spec: string | undefined;
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			spec = node.moduleSpecifier.text;
		} else if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			spec = node.moduleSpecifier.text;
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteral(node.arguments[0])
		) {
			spec = node.arguments[0].text;
		} else if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "require" &&
			node.arguments[0] &&
			ts.isStringLiteral(node.arguments[0])
		) {
			spec = node.arguments[0].text;
		}
		if (spec !== undefined && spec.startsWith("@hyperidle/") && !ALLOWED_HYPERIDLE.has(spec)) {
			findings.push({
				file: rel,
				reason: `Service source imports "${spec}" — a Service may only import @hyperidle/db + @hyperidle/shared; cross-Service wiring is the Layer's job (Mechanism C)`,
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];
	for (const svcRoot of serviceRoots(root)) {
		findings.push(...checkManifest(root, svcRoot));
		for (const abs of collectSourceFiles(join(svcRoot, "src"))) {
			findings.push(...checkSourceFile(root, abs));
		}
	}
	return findings;
}

// -- fixtures --

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au19-comp-guard-"));
	try {
		// Negative: a Service depends on another Service (declared) → finding.
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/package.json",
			'{ "name": "@hyperidle/context-assembly", "dependencies": { "@hyperidle/db": "*", "@hyperidle/knowledge": "*" } }',
		);
		// Positive: a Service depends only on db + shared + a third-party → no finding.
		writeFixture(
			root,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge", "dependencies": { "@hyperidle/db": "*", "@hyperidle/shared": "*", "drizzle-orm": "^0.45.2" } }',
		);
		const findings = inspect(root);
		if (
			findings.length !== 1 ||
			findings[0]?.file !== "packages/agent-orchestration/context-assembly/package.json" ||
			!findings[0]?.reason.includes("@hyperidle/knowledge")
		) {
			throw new Error(
				`composition-boundary-guard: expected exactly the context-assembly→knowledge finding, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	// C1 regression fixture — UNDECLARED cross-Service import (source-only, no
	// package.json edit). This is the exact hole checkpoint review fe48f126
	// proved: a Service imports another Service's source without ever declaring
	// the dep, which the manifest check alone cannot see.
	const undeclaredRoot = mkdtempSync(join(tmpdir(), "au19-comp-guard-undeclared-"));
	try {
		writeFixture(
			undeclaredRoot,
			"packages/agent-orchestration/context-assembly/package.json",
			'{ "name": "@hyperidle/context-assembly", "dependencies": { "@hyperidle/db": "*" } }',
		);
		writeFixture(
			undeclaredRoot,
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { list } from "@hyperidle/knowledge"; export const leak = list;',
		);
		const findings = inspect(undeclaredRoot);
		if (
			findings.length !== 1 ||
			findings[0]?.file !== "packages/agent-orchestration/context-assembly/src/leak.ts" ||
			!findings[0]?.reason.includes("@hyperidle/knowledge")
		) {
			throw new Error(
				`composition-boundary-guard: expected exactly the undeclared leak.ts→knowledge finding, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(undeclaredRoot, { recursive: true, force: true });
	}

	process.stdout.write("composition-boundary-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const f of findings) process.stderr.write(`${f.file}: ${f.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`composition-boundary-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("composition-boundary-guard: PASS\n");
}
