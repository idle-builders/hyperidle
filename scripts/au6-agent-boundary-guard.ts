#!/usr/bin/env tsx
/**
 * AU15 W4: extended with an `inspect(root)` export + a `--fixtures` self-test
 * harness (au13-style temp-fixture writer), mirroring
 * `au13-work-routine-ownership-guard.ts`'s shape. au6 previously only had a
 * `--check` CLI invocation with no way to unit-verify the rule logic itself
 * against synthetic inputs.
 *
 * AU15 also adds two rules FILE-SCOPED to
 * `packages/server/src/services/routine-scheduler.ts` only (`file ===` that
 * exact path — NOT repo-wide): (1) no import from `agent-selection` there;
 * (2) no raw `.from/.insert/.update/.delete(agentWorkIntents)` there. A
 * repo-wide version of either rule would false-positive on legitimately
 * agent-owned importers/accessors (`agent-work-intent-worker.ts`,
 * `agent-defaults/resolvers.ts`, `agent-work-intents.ts` itself, etc.) — see
 * architecture §5 / DoD AC-1.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

interface Finding {
	readonly file: string;
	readonly message: string;
}

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

// AU19 Increment 3c: `agent-run-boundary.ts` (the sole prior entry) moved to
// `@hyperidle/run-orchestration` — out of this guard's scanned
// `packages/server/src` tree entirely, so it can no longer even be visited.
// Left empty rather than deleted: this is the rule's designated allowlist
// slot for whichever file directly imports `agent-session-runtime` next; a
// still-flat `packages/server` file legitimately doing that would need to be
// added back here.
const ALLOWED_DIRECT_CONSUMER_IMPORTS = new Set<string>([]);
const ALLOWED_REGISTRY_DEFINITIONS = new Set([
	// AU11: provision-registry.ts moved from app-runtime/services/ to the
	// agent-owned services/ home (import-path-only move, no behavior change).
	"packages/server/src/services/provision-registry.ts",
]);

/** AU15 W4: the one file the two new file-scoped rules apply to. */
const ROUTINE_SCHEDULER_FILE = "packages/server/src/services/routine-scheduler.ts";

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

/**
 * Scan every production `.ts`/`.tsx` file under `packages/server/src` (rooted
 * at `root`) for the existing repo-wide agent-run-boundary rules plus the two
 * AU15 rules file-scoped to `ROUTINE_SCHEDULER_FILE`.
 */
export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];

	for (const sourceRoot of SOURCE_ROOTS) {
		for (const abs of walk(join(root, sourceRoot))) {
			const file = relative(root, abs).split("\\").join("/");
			if (isExcluded(file)) continue;
			const text = readFileSync(abs, "utf8");

			if (
				/from\s+["'][^"']*agent-session-runtime(?:\.js)?["']/.test(text) &&
				!ALLOWED_DIRECT_CONSUMER_IMPORTS.has(file)
			) {
				findings.push({
					file,
					message: "agent-session-runtime consumer imports must stay behind agent-run-boundary",
				});
			}

			if (!ALLOWED_REGISTRY_DEFINITIONS.has(file)) {
				if (/\bgetAgentSessionRequestConsumerFn\b/.test(text)) {
					findings.push({
						file,
						message: "production code must not resolve request consumers from provision-registry",
					});
				}
				if (/\bsetAgentSessionRequestConsumerFn\b/.test(text)) {
					findings.push({
						file,
						message: "agent request consumer registry is test-only and banned in production code",
					});
				}
				if (/\bsetProvisionSessionFn\b/.test(text) || /\bgetProvisionSessionFn\b/.test(text)) {
					findings.push({
						file,
						message: "legacy provisionSession registry hook is test-only and banned in production code",
					});
				}
			}

			if (/\bconst\s+consumeAgentSessionRequest\b/.test(text)) {
				findings.push({
					file,
					message: "production code must use executeAgentRunRequest boundary naming",
				});
			}

			// AU15 W4: two rules file-scoped to routine-scheduler.ts ONLY.
			if (file === ROUTINE_SCHEDULER_FILE) {
				if (/from\s+["'][^"']*agent-selection(?:\.js)?["']/.test(text)) {
					findings.push({
						file,
						message:
							"routine-scheduler.ts (Core) must not import from agent-owned agent-selection.ts — selection resolves at drain-time (AU15)",
					});
				}
				if (/\.(?:from|insert|update|delete)\(\s*agentWorkIntents\b/.test(text)) {
					findings.push({
						file,
						message:
							"routine-scheduler.ts must not access agentWorkIntents directly — use recordAgentWorkIntent (AU15)",
					});
				}
			}
		}
	}

	return findings;
}

// --- fixtures self-test (AU15 W4, au13-style) ---

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au6-guard-"));
	const sources: Record<string, string> = {
		// (a) positive: routine-scheduler.ts importing agent-selection → finding.
		[ROUTINE_SCHEDULER_FILE]:
			'import { isAgentAtWipLimit } from "./agent-selection.js"; export async function f() { return isAgentAtWipLimit; }',
		// (b) negative: a DIFFERENT (legitimately agent-owned) file importing
		// agent-selection must NOT be flagged — proves file-scoping.
		"packages/server/src/services/agent-work-intent-worker.ts":
			'import { isAgentAtWipLimit } from "./agent-selection.js"; export async function g() { return isAgentAtWipLimit; }',
		"packages/server/src/services/agent-defaults/resolvers.ts":
			'import { selectAgentByAppDefaults } from "../agent-selection.js"; export async function h() { return selectAgentByAppDefaults; }',
	};
	try {
		for (const [path, source] of Object.entries(sources)) {
			const abs = join(root, path);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, source);
		}
		const findings = inspect(root);
		const flaggedFiles = findings.map((f) => f.file);

		if (!flaggedFiles.includes(ROUTINE_SCHEDULER_FILE)) {
			throw new Error("fixture guard missed the agent-selection import in routine-scheduler.ts");
		}
		for (const allowed of [
			"packages/server/src/services/agent-work-intent-worker.ts",
			"packages/server/src/services/agent-defaults/resolvers.ts",
		]) {
			if (flaggedFiles.includes(allowed)) {
				throw new Error(`fixture guard incorrectly flagged file-scoped-exempt file ${allowed}`);
			}
		}

		// (c) positive: raw agentWorkIntents access in routine-scheduler.ts → finding.
		writeFileSync(
			join(root, ROUTINE_SCHEDULER_FILE),
			'import { agentWorkIntents } from "@hyperidle/db"; export async function j(db: unknown) { await (db as { select: () => { from: (t: unknown) => unknown } }).select().from(agentWorkIntents); }',
		);
		const rawAccessFindings = inspect(root).map((f) => f.file);
		if (!rawAccessFindings.includes(ROUTINE_SCHEDULER_FILE)) {
			throw new Error("fixture guard missed the raw agentWorkIntents access in routine-scheduler.ts");
		}

		// (d) negative: routine-scheduler.ts with neither → clean.
		writeFileSync(
			join(root, ROUTINE_SCHEDULER_FILE),
			'export async function k() { return "no agent-owned imports here"; }',
		);
		const cleanFindings = inspect(root).map((f) => f.file);
		if (cleanFindings.includes(ROUTINE_SCHEDULER_FILE)) {
			throw new Error("fixture guard false-positived on a clean routine-scheduler.ts");
		}

		process.stdout.write("au6-agent-boundary-guard fixtures: PASS\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	if (findings.length > 0) {
		for (const finding of findings) {
			process.stderr.write(`${finding.file}: ${finding.message}\n`);
		}
		process.stderr.write(`au6-agent-boundary-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	if (process.argv.includes("--check")) {
		process.stdout.write("au6-agent-boundary-guard: PASS\n");
	}
}
