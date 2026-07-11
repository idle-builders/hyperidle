#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

interface Finding {
	readonly file: string;
	readonly message: string;
}

const ROOT = process.cwd();
const FINDINGS: Finding[] = [];

const SOURCE_ROOTS = ["packages/server/src"] as const;
const TEXT_EXTENSIONS = new Set([".ts", ".tsx"]);
const SOURCE_EXCLUDES = [
	"/__tests__/",
	".test.ts",
	".test.tsx",
	".integration.test.ts",
	".spec.ts",
	".spec.tsx",
] as const;

const ALLOWED_DIRECT_CONSUMER_IMPORTS = new Set(["packages/server/src/services/agent-run-boundary.ts"]);
const ALLOWED_REGISTRY_DEFINITIONS = new Set([
	// AU11: provision-registry.ts moved from app-runtime/services/ to the
	// agent-owned services/ home (import-path-only move, no behavior change).
	"packages/server/src/services/provision-registry.ts",
]);

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

function isExcluded(file: string): boolean {
	return SOURCE_EXCLUDES.some((entry) => file.includes(entry));
}

function add(file: string, message: string): void {
	FINDINGS.push({ file, message });
}

for (const root of SOURCE_ROOTS) {
	for (const abs of walk(join(ROOT, root))) {
		const file = relative(ROOT, abs);
		if (isExcluded(file)) continue;
		const text = readFileSync(abs, "utf8");

		if (
			/from\s+["'][^"']*agent-session-runtime(?:\.js)?["']/.test(text) &&
			!ALLOWED_DIRECT_CONSUMER_IMPORTS.has(file)
		) {
			add(file, "agent-session-runtime consumer imports must stay behind agent-run-boundary");
		}

		if (!ALLOWED_REGISTRY_DEFINITIONS.has(file)) {
			if (/\bgetAgentSessionRequestConsumerFn\b/.test(text)) {
				add(file, "production code must not resolve request consumers from provision-registry");
			}
			if (/\bsetAgentSessionRequestConsumerFn\b/.test(text)) {
				add(file, "agent request consumer registry is test-only and banned in production code");
			}
			if (/\bsetProvisionSessionFn\b/.test(text) || /\bgetProvisionSessionFn\b/.test(text)) {
				add(file, "legacy provisionSession registry hook is test-only and banned in production code");
			}
		}

		if (/\bconst\s+consumeAgentSessionRequest\b/.test(text)) {
			add(file, "production code must use executeAgentRunRequest boundary naming");
		}
	}
}

if (FINDINGS.length > 0) {
	for (const finding of FINDINGS) {
		process.stderr.write(`${finding.file}: ${finding.message}\n`);
	}
	process.stderr.write(`au6-agent-boundary-guard: ${FINDINGS.length} finding(s)\n`);
	process.exit(1);
}

if (process.argv.includes("--check")) {
	process.stdout.write("au6-agent-boundary-guard: PASS\n");
}
