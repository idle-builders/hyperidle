#!/usr/bin/env tsx
/**
 * AU19 Mechanism C — Composition boundary. A Service package NEVER depends on
 * another Service or on a Layer package. Cross-Service data flows in as a port
 * parameter wired by the owning Layer (the Layer is the only place two Services
 * are named together).
 *
 * Enforcer (architecture §7.3): read every nested Service `package.json`
 * (`packages/<layer>/<service>/package.json`) and FAIL if `dependencies` lists
 * any `@hyperidle/*` name other than the allowed leaves `@hyperidle/db` and
 * `@hyperidle/shared`. Third-party runtime deps (e.g. drizzle-orm) are allowed.
 * Layer packages (`packages/<layer>/package.json`) are NOT scanned — composing
 * their own Services is exactly a Layer's job.
 *
 * @lore AU19: tsc cannot enforce this on its own — a hoisted monorepo
 * node_modules resolves any `@hyperidle/*` from any package regardless of declared
 * deps. This package.json guard is the real enforcer; `--fixtures` proves it.
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

const ALLOWED_HYPERIDLE = new Set(["@hyperidle/db", "@hyperidle/shared"]);

export interface Finding {
	readonly file: string;
	readonly reason: string;
}

/** Every nested Service package.json: packages/<layer>/<service>/package.json. */
function serviceManifests(root: string): string[] {
	const packagesDir = join(root, "packages");
	const found: string[] = [];
	if (!existsSync(packagesDir)) return found;
	for (const layer of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!layer.isDirectory()) continue;
		const layerDir = join(packagesDir, layer.name);
		for (const svc of readdirSync(layerDir, { withFileTypes: true })) {
			if (!svc.isDirectory()) continue;
			const manifest = join(layerDir, svc.name, "package.json");
			if (existsSync(manifest)) found.push(manifest);
		}
	}
	return found;
}

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];
	for (const manifest of serviceManifests(root)) {
		const rel = relative(root, manifest).split("\\").join("/");
		const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
			dependencies?: Record<string, string>;
		};
		for (const dep of Object.keys(pkg.dependencies ?? {})) {
			if (dep.startsWith("@hyperidle/") && !ALLOWED_HYPERIDLE.has(dep)) {
				findings.push({
					file: rel,
					reason: `Service depends on "${dep}" — a Service may only depend on @hyperidle/db + @hyperidle/shared; cross-Service wiring is the Layer's job (Mechanism C)`,
				});
			}
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
		// Negative: a Service depends on another Service → finding.
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
