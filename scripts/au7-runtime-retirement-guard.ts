#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

interface Finding {
	readonly file: string;
	readonly message: string;
}

const ROOT = process.cwd();
const FINDINGS: Finding[] = [];
const TEXT_EXTENSIONS = new Set([".json", ".ts", ".tsx"]);
const RUNTIME_ROOTS = [
	"package.json",
	"tsconfig.json",
	"packages/server",
	"packages/core-app",
	"packages/agent-layer",
	"packages/shared",
	"packages/desktop",
	"packages/eval",
] as const;
const EXCLUDES = [
	"/node_modules/",
	"/dist/",
	"/drizzle/",
	"/drizzle-sqlite-archive/",
	"/__tests__/",
	".test.ts",
	".test.tsx",
	".integration.test.ts",
	".spec.ts",
	".spec.tsx",
] as const;
const RETIRED_PATHS = [
	"packages/fabric",
	"packages/strategy-minimal",
	"packages/shared/src/strategy-port.ts",
	"packages/server/src/services/strategy-registry.ts",
	"packages/core-app/src/services/strategy-registry.ts",
] as const;

function extension(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot === -1 ? "" : path.slice(dot);
}

function walk(path: string): string[] {
	const full = join(ROOT, path);
	if (!existsSync(full)) return [];
	const statEntries = readdirSync(full, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of statEntries) {
		const child = join(full, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(relative(ROOT, child)));
		} else if (TEXT_EXTENSIONS.has(extension(entry.name))) {
			out.push(child);
		}
	}
	return out;
}

function filesForRoot(root: string): string[] {
	const full = join(ROOT, root);
	if (!existsSync(full)) return [];
	if (!readdirSync(ROOT).includes(root) && root.includes(".json")) return [full];
	if (root.endsWith(".json")) return [full];
	return walk(root);
}

function isExcluded(file: string): boolean {
	return EXCLUDES.some((entry) => file.includes(entry));
}

function add(file: string, message: string): void {
	FINDINGS.push({ file, message });
}

for (const path of RETIRED_PATHS) {
	if (existsSync(join(ROOT, path))) {
		add(path, "live Strategy/Fabric source path must be deleted or archived outside the workspace after AU7");
	}
}

for (const root of RUNTIME_ROOTS) {
	for (const abs of filesForRoot(root)) {
		const file = relative(ROOT, abs);
		if (isExcluded(file)) continue;
		const text = readFileSync(abs, "utf8");

		if (/from\s+["']@hyperidle\/fabric["']|import\(["']@hyperidle\/fabric["']\)/.test(text)) {
			add(file, "runtime must not depend on @hyperidle/fabric after AU7");
		}
		if (
			/from\s+["']@hyperidle\/strategy-minimal["']|import\(["']@hyperidle\/strategy-minimal["']\)/.test(
				text,
			)
		) {
			add(file, "runtime must not depend on @hyperidle/strategy-minimal after AU7");
		}
		if (
			/from\s+["'][^"']*strategy-port(?:\.js)?["']/.test(text) &&
			!/export\s+type\s*\{[\s\S]*\}\s+from\s+["'][^"']*strategy-port(?:\.js)?["'];?/.test(text)
		) {
			add(file, "runtime must not import or export the Strategy port after AU7");
		}
		if (/from\s+["'][^"']*strategy-registry(?:\.js)?["']/.test(text)) {
			add(file, "runtime must not import or register an active Strategy after AU7");
		}
		if (/\b(setActiveStrategy|getActiveStrategy|clearActiveStrategy)\b/.test(text)) {
			add(file, "active Strategy singleton API is retired after AU7");
		}
		if (/\b(createMinimalStrategy|minimalStrategy)\b/.test(text)) {
			add(file, "minimal Strategy fallback is retired after AU7");
		}
		if (/\b(createFabricStrategy|fabricStrategy|bootstrapFabric|strategyBootstrap)\b/.test(text)) {
			add(file, "Fabric bootstrap/Strategy runtime is retired after AU7");
		}
	}
}

if (FINDINGS.length > 0) {
	for (const finding of FINDINGS) {
		process.stderr.write(`${finding.file}: ${finding.message}\n`);
	}
	process.stderr.write(`au7-runtime-retirement-guard: ${FINDINGS.length} finding(s)\n`);
	process.exit(1);
}

if (process.argv.includes("--check")) {
	process.stdout.write("au7-runtime-retirement-guard: PASS\n");
}
