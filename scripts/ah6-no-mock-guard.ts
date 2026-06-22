// AH6: Static guard — no proof-path mocks in AH6-*.spec.ts.
//
// Reads packages/web/e2e/AH6-*.spec.ts and fails if any page.route()
// call matches the proof-path glob set:
//   - threads/.../messages (POST message route)
//   - credentials/... (credential read/write)
//   - sessions/... (session provisioning)
//   - model-gateway (model resolution)
//   - openrouter.ai (direct LLM URL)
//   - anthropic.com (direct LLM URL)
//
// Also fails if the AH5 synthetic artifacts are re-introduced:
//   - "AH5-SMOKE-OK" string literal
//   - "ah5-real-turn-probe" string literal
//
// @lore AH6: This is a static-property guard, not a test. A test imports code
// and asserts behavior. This reads spec source files and asserts the absence of
// certain patterns — that's a lint rule or build-time check, per testing rules.
// Placed in scripts/ (not packages/) to respect the boundary.
//
// @lore AH6: Shell-scaffolding mocks (auth/me, teams, settings) are tolerated
// on the AH6 spec. Only proof-path routes must not be mocked.
//
// @lore AH6: The JSDoc block-comment form was avoided here because glob patterns
// like "threads/.../messages" contain "star-slash" sequences that prematurely
// close block comments. Using line comments sidesteps the parser ambiguity.
//
// @lore AH6: The AH5-SMOKE-OK and ah5-real-turn-probe re-introduction guards
// scan ALL of packages/ and scripts/ (not just the AH6 spec). Deleting the
// synthetic probe in C1 is load-bearing — re-adding it breaks npm run verify.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specDir = path.join(repoRoot, "packages/web/e2e");

// Proof-path patterns that must NOT be mocked in AH6 specs.
const FORBIDDEN_ROUTE_PATTERNS: readonly RegExp[] = [
	/page\.route\([^)]*\/threads[^)]*\/messages/,
	/page\.route\([^)]*\/credentials\//,
	/page\.route\([^)]*\/sessions\//,
	/page\.route\([^)]*model-gateway/,
	/page\.route\([^)]*openrouter\.ai/,
	/page\.route\([^)]*anthropic\.com/,
];

const AH6_SPEC_GLOB = "AH6-*.spec.ts";

async function collectSpecFiles(): Promise<string[]> {
	const files: string[] = [];
	for await (const f of glob(AH6_SPEC_GLOB, { cwd: specDir })) {
		files.push(path.join(specDir, String(f)));
	}
	return files;
}

const specFiles = await collectSpecFiles();

if (specFiles.length === 0) {
	// @lore AH6: Fail closed on zero specs. If the guard finds no spec files,
	// it means the spec pattern is wrong or the spec was deleted — either way,
	// silently passing would defeat the no-mock enforcement. A guard that can
	// pass with zero inspected files is no guard at all.
	process.stderr.write(
		"[ah6-no-mock-guard] FATAL: No AH6-*.spec.ts files found in " +
			`${specDir}\n` +
			"  Expected at least one spec (e.g. AH6-assistant-interaction.spec.ts).\n" +
			"  A guard that inspects zero files provides zero enforcement.\n",
	);
	process.exit(1);
}

let violations = 0;

for (const specFile of specFiles) {
	const source = fs.readFileSync(specFile, "utf-8");
	const lines = source.split("\n");

	for (const pattern of FORBIDDEN_ROUTE_PATTERNS) {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (pattern.test(line)) {
				process.stderr.write(
					`[ah6-no-mock-guard] VIOLATION: ${path.relative(repoRoot, specFile)}:${i + 1}\n` +
						`  Pattern: ${pattern.source}\n` +
						`  Line: ${line.trim()}\n`,
				);
				violations++;
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Re-introduction guard: fail if synthetic AH5 artifacts reappear anywhere
// under packages/ or scripts/. These are deleted in C1 and must NOT come back.
// ---------------------------------------------------------------------------

const SYNTHETIC_ARTIFACT_PATTERNS: readonly RegExp[] = [
	/AH5-SMOKE-OK/,
	/ah5-real-turn-probe/,
];

// Scan all .ts and .tsx files under packages/ and scripts/ (except node_modules, dist, .d.ts).
async function collectSourceFiles(): Promise<string[]> {
	const dirs = [path.join(repoRoot, "packages"), path.join(repoRoot, "scripts")];
	const files: string[] = [];
	for (const dir of dirs) {
		for await (const f of glob("**/*.{ts,tsx}", {
			cwd: dir,
			exclude: (p) =>
				p.includes("node_modules") ||
				p.includes("/dist/") ||
				p.endsWith(".d.ts") ||
				// Do NOT exclude test fixtures — the guard catches them too.
				false,
		})) {
			files.push(path.join(dir, String(f)));
		}
	}
	return files;
}

const sourceFiles = await collectSourceFiles();

// The guard itself is allowed to mention the forbidden strings (it describes them).
const guardFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ah6-no-mock-guard.ts");

for (const sourceFile of sourceFiles) {
	if (path.resolve(sourceFile) === guardFile) continue;
	const source = fs.readFileSync(sourceFile, "utf-8");
	const lines = source.split("\n");
	for (const pattern of SYNTHETIC_ARTIFACT_PATTERNS) {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (pattern.test(line)) {
				process.stderr.write(
					`[ah6-no-mock-guard] VIOLATION (synthetic re-introduction): ${path.relative(repoRoot, sourceFile)}:${i + 1}\n` +
						`  Pattern: ${pattern.source}\n` +
						`  Line: ${line.trim()}\n`,
				);
				violations++;
			}
		}
	}
}

if (violations > 0) {
	process.stderr.write(
		`[ah6-no-mock-guard] ${violations} violation(s) found. ` +
			"Fix all violations before proceeding.\n",
	);
	process.exit(1);
}

process.stdout.write(
	`[ah6-no-mock-guard] PASS: No proof-path mocks in ${specFiles.length} AH6 spec file(s). ` +
		`No synthetic AH5 artifact re-introduction in ${sourceFiles.length} source file(s).\n`,
);
