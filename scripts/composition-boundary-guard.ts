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
 *
 * @lore AU19 Increment 5 (core-ui boundary, item 1/6): `packages/web` IS the
 * `core-ui` Layer package (§4, undecomposed — no nested Services this WP), so
 * it doesn't fit `serviceRoots()`'s nested-package shape above. A THIRD check,
 * `inspectCoreUiLayer`, generalizes Mechanism C to the Layer grain: `packages/
 * web/src/**` may only import the sanctioned composition surface (`@hyperidle/
 * server` — still the composition root pending Increment 5's own Application-
 * bootstrap item — `@hyperidle/core-api`, plus the universal `@hyperidle/shared`
 * + `@hyperidle/design-system` leaves), not an individual Service package or an
 * agent-orchestration/agent-execution internal directly. Deliberately scoped to
 * `src/**` only, source-import-only (no manifest check): `packages/web/scripts/*`
 * (the ah1/ah5/ah6 e2e test-server bootstraps) already deep-import `@hyperidle/
 * connections` + `@hyperidle/server/server-factory` — a known, separately
 * scheduled cleanup (§12 Increment 5's own next item, "external-consumer
 * migration ... packages/web/scripts/*"), and `packages/web/package.json`'s
 * `dependencies` mix both scopes in one manifest, so the binary allowed/denied
 * manifest check the Service grain uses doesn't fit here — the source scan is
 * the real enforcer regardless (same reasoning as the C1 lore above).
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

/**
 * A module specifier is allowed if it IS an allowed leaf package, or is a
 * subpath EXPORT of one (e.g. `@hyperidle/shared/net`) — `@hyperidle/shared`
 * deliberately splits some utilities (SSRF checking) into a subpath export
 * so pulling in the whole package isn't required; a nested Service importing
 * that subpath is not a cross-Service edge, just a different entry point of
 * the same allowed leaf.
 *
 * @lore AU19 Increment 1h: surfaced by `connections`' real `connection-provisioning.ts`
 * importing `resolveUrlForSSRF` from `@hyperidle/shared/net` (the only place
 * that function is exported — `@hyperidle/shared`'s main barrel does not
 * re-export it). The guard's original exact-Set-membership check rejected
 * this as if it were a cross-Service edge; fixed to prefix-match subpaths of
 * an allowed leaf package, same shape as `execution-boundary-guard`'s own
 * leaf-package allowance.
 */
function isAllowedHyperidleSpec(spec: string): boolean {
	return matchesAllowedLeaf(spec, ALLOWED_HYPERIDLE);
}

/** The core-ui Layer's (`packages/web`) sanctioned composition surface — see the top `@lore`. */
const CORE_UI_ROOT = "packages/web";
const CORE_UI_ALLOWED_HYPERIDLE = new Set([
	"@hyperidle/shared",
	"@hyperidle/design-system",
	"@hyperidle/server",
	"@hyperidle/core-api",
]);

function isAllowedCoreUiSpec(spec: string): boolean {
	return matchesAllowedLeaf(spec, CORE_UI_ALLOWED_HYPERIDLE);
}

/** Shared prefix-match: `spec` is allowed if it IS a leaf, or a subpath export of one. */
function matchesAllowedLeaf(spec: string, allowed: ReadonlySet<string>): boolean {
	if (allowed.has(spec)) return true;
	for (const leaf of allowed) {
		if (spec.startsWith(`${leaf}/`)) return true;
	}
	return false;
}

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

/**
 * Check (2) — source-import scan of a single file (static + dynamic import).
 * `isAllowed`/`reason` are parameterized so the same AST walk serves both the
 * Service grain (default) and the core-ui Layer grain (`inspectCoreUiLayer`).
 */
function checkSourceFile(
	root: string,
	abs: string,
	isAllowed: (spec: string) => boolean = isAllowedHyperidleSpec,
	reason: (spec: string) => string = (spec) =>
		`Service source imports "${spec}" — a Service may only import @hyperidle/db + @hyperidle/shared; cross-Service wiring is the Layer's job (Mechanism C)`,
): Finding[] {
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
		if (spec !== undefined && spec.startsWith("@hyperidle/") && !isAllowed(spec)) {
			findings.push({ file: rel, reason: reason(spec) });
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

/** Check (3) — core-ui Layer boundary: `packages/web/src/**` (see top `@lore`). */
function inspectCoreUiLayer(root: string): Finding[] {
	const findings: Finding[] = [];
	const srcDir = join(root, CORE_UI_ROOT, "src");
	for (const abs of collectSourceFiles(srcDir)) {
		findings.push(
			...checkSourceFile(
				root,
				abs,
				isAllowedCoreUiSpec,
				(spec) =>
					`core-ui (packages/web) source imports "${spec}" — the core-ui Layer may only import @hyperidle/shared + @hyperidle/design-system + @hyperidle/server + @hyperidle/core-api; direct Service/Layer-internal imports reach past the Layer boundary (Mechanism C)`,
			),
		);
	}
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
	findings.push(...inspectCoreUiLayer(root));
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

	// AU19 Increment 1h regression fixture — subpath imports of an ALLOWED leaf
	// package (e.g. `@hyperidle/shared/net`) must NOT be flagged, but a subpath
	// import of a disallowed cross-Service package (e.g. `@hyperidle/knowledge/x`)
	// still must be. Surfaced by `connections`' real `connection-provisioning.ts`
	// importing `resolveUrlForSSRF` from `@hyperidle/shared/net` (the only export
	// path for that function) — the guard's original exact-Set-membership check
	// wrongly rejected it as a cross-Service edge.
	const subpathRoot = mkdtempSync(join(tmpdir(), "au19-comp-guard-subpath-"));
	try {
		writeFixture(
			subpathRoot,
			"packages/core-api/connections/package.json",
			'{ "name": "@hyperidle/connections", "dependencies": { "@hyperidle/db": "*", "@hyperidle/shared": "*" } }',
		);
		writeFixture(
			subpathRoot,
			"packages/core-api/connections/src/allowed.ts",
			'import { resolveUrlForSSRF } from "@hyperidle/shared/net"; export const f = resolveUrlForSSRF;',
		);
		writeFixture(
			subpathRoot,
			"packages/core-api/connections/src/leak.ts",
			'import { list } from "@hyperidle/knowledge/deep"; export const leak = list;',
		);
		const findings = inspect(subpathRoot);
		if (
			findings.length !== 1 ||
			findings[0]?.file !== "packages/core-api/connections/src/leak.ts" ||
			!findings[0]?.reason.includes("@hyperidle/knowledge/deep")
		) {
			throw new Error(
				`composition-boundary-guard: expected exactly the leak.ts→knowledge/deep finding (allowed.ts's @hyperidle/shared/net import must NOT be flagged), got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(subpathRoot, { recursive: true, force: true });
	}

	// AU19 Increment 5 (core-ui boundary) regression fixture — `packages/web/src`
	// reaching PAST the Layer boundary into an individual Service package (e.g.
	// `@hyperidle/knowledge`) must be flagged, but its sanctioned composition
	// surface (`@hyperidle/server`, `@hyperidle/shared`, `@hyperidle/design-system`,
	// `@hyperidle/core-api`) must NOT be — and `packages/web/scripts/*` (the known,
	// separately-scheduled Increment-5 item-3 cleanup) must NOT be scanned at all.
	const coreUiRoot = mkdtempSync(join(tmpdir(), "au19-comp-guard-core-ui-"));
	try {
		writeFixture(
			coreUiRoot,
			"packages/web/src/api/client.ts",
			'import type { AppType } from "@hyperidle/server/schemas"; export type A = AppType;',
		);
		writeFixture(
			coreUiRoot,
			"packages/web/src/leak.ts",
			'import { list } from "@hyperidle/knowledge"; export const leak = list;',
		);
		writeFixture(
			coreUiRoot,
			"packages/web/scripts/ah6-test-server.ts",
			'import { encryptCredentialValue } from "@hyperidle/connections"; export const f = encryptCredentialValue;',
		);
		const findings = inspect(coreUiRoot);
		if (
			findings.length !== 1 ||
			findings[0]?.file !== "packages/web/src/leak.ts" ||
			!findings[0]?.reason.includes("@hyperidle/knowledge")
		) {
			throw new Error(
				`composition-boundary-guard: expected exactly the web/src/leak.ts→knowledge finding (client.ts's @hyperidle/server/schemas import must NOT be flagged, scripts/ must NOT be scanned), got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(coreUiRoot, { recursive: true, force: true });
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
