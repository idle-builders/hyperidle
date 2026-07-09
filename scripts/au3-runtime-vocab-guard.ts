#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

interface Finding {
	readonly file: string;
	readonly message: string;
}

const ROOT = process.cwd();
const FINDINGS: Finding[] = [];

const SOURCE_ROOTS = [
	"packages/server/src",
	"packages/shared/src",
	"packages/api-contract/src",
	"packages/web/src",
	"packages/design-system/src",
] as const;

const MANIFESTS = [
	"packages/server/package.json",
	"packages/web/package.json",
	"packages/design-system/package.json",
] as const;

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".json"]);

const SOURCE_EXCLUDES = [
	"/__tests__/",
	".test.ts",
	".test.tsx",
	".integration.test.ts",
	".spec.ts",
	".spec.tsx",
	".stories.tsx",
	"packages/server/src/services/strategy-registry.ts",
	"packages/shared/src/strategy-port.ts",
] as const;

const CURRENT_DOCS = [
	"docs/architecture/system-overview.md",
	"docs/architecture/as-implemented-domain-architecture.md",
	"docs/architecture/data-flow-examples.md",
	"docs/knowledge-architecture/the-canonical-store.md",
	"docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md",
	"docs/process-layer/tasks-and-sessions.md",
	"docs/process-layer/routines-and-retros.md",
] as const;

function isExcluded(path: string): boolean {
	return SOURCE_EXCLUDES.some((entry) => path.includes(entry));
}

function extension(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot === -1 ? "" : path.slice(dot);
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full));
		} else if (TEXT_EXTENSIONS.has(extension(entry.name))) {
			out.push(full);
		}
	}
	return out;
}

function add(file: string, message: string): void {
	FINDINGS.push({ file, message });
}

for (const manifest of MANIFESTS) {
	const raw = JSON.parse(readFileSync(join(ROOT, manifest), "utf8")) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		exports?: Record<string, string>;
	};
	for (const dep of ["@hyperidle/fabric", "@hyperidle/strategy-minimal"]) {
		if (raw.dependencies?.[dep]) {
			add(manifest, `production dependency on ${dep} is banned by AU3`);
		}
	}
	if (manifest === "packages/server/package.json" && raw.exports?.["./services/strategy-registry"]) {
		add(manifest, "exporting strategy-registry is banned by AU3");
	}
}

for (const root of SOURCE_ROOTS) {
	for (const abs of walk(join(ROOT, root))) {
		const file = relative(ROOT, abs);
		if (isExcluded(file)) continue;
		const text = readFileSync(abs, "utf8");
		if (/from\s+["']@hyperidle\/fabric(?:\/types)?["']/.test(text)) {
			add(file, "production import from @hyperidle/fabric is banned by AU3");
		}
		if (/from\s+["']@hyperidle\/strategy-minimal["']/.test(text)) {
			add(file, "production import from @hyperidle/strategy-minimal is banned by AU3");
		}
		if (/from\s+["'][^"']*strategy-registry(?:\.js)?["']/.test(text)) {
			add(file, "production import from strategy-registry is banned by AU3");
		}
		if (
			/\b(setActiveStrategy|getActiveStrategy|fabricStrategy|bootstrapFabric|FABRIC_ASSISTANT_SYSTEM_PROMPT|KnowledgeItemWithFabric)\b/.test(
				text,
			)
		) {
			add(file, "production Strategy/Fabric runtime symbol is banned by AU3");
		}
		if (
			/from\s+["']@hyperidle\/db["']/.test(text) &&
			/\b(knowledgeStrategyFabric|taskStrategyFabric)\b/.test(text)
		) {
			add(file, "production code must import app-owned projection aliases, not Fabric-named tables");
		}
		if (/\bmanaged by strategy\b/i.test(text) || /\bstrategy agent\b/i.test(text)) {
			add(file, "user-facing Strategy runtime vocabulary is banned by AU3");
		}
		if (
			file.includes("packages/server/src/app-runtime/") &&
			/\b(Strategy types|strategy fields|strategy filter|strategy fabric|skip strategy|Fabric's implementation|Fabric-internal|Fabric-owned|fabric row|fabric table|fabric projects|fabric must|fabric does not|depends on fabric|packages\/fabric|kernel\/strategy|strategy\/fabric)\b/i.test(
				text,
			)
		) {
			add(file, "app-runtime must use app-owned projection/defaults vocabulary");
		}
	}
}

for (const doc of CURRENT_DOCS) {
	const abs = join(ROOT, doc);
	if (!existsSync(abs)) continue;
	const text = readFileSync(abs, "utf8");
	if (
		/\b(active Strategy|Strategy runtime|Fabric runtime|Knowledge Fabric|Knowledge fabric|Fabric metadata|Strategy fields|Strategy interface|strategy repository|managed by the Knowledge Fabric|fabric projects|packages\/fabric|bootstrapFabric|fabricStrategy)\b/.test(
			text,
		)
	) {
		add(doc, "current-state docs must not present Fabric/Strategy as runtime boundaries");
	}
}

if (FINDINGS.length > 0) {
	for (const finding of FINDINGS) {
		process.stderr.write(`${finding.file}: ${finding.message}\n`);
	}
	process.stderr.write(`au3-runtime-vocab-guard: ${FINDINGS.length} finding(s)\n`);
	process.exit(1);
}

if (process.argv.includes("--check")) {
	process.stdout.write("au3-runtime-vocab-guard: PASS\n");
}
