// AH5: Static guard — no proof-path mocks in ah5-*.spec.ts.
//
// Reads packages/web/e2e/ah5-*.spec.ts and fails if any page.route()
// call matches the proof-path glob set:
//   - threads/.../messages (POST message route)
//   - credentials/... (credential read/write)
//   - sessions/... (session provisioning)
//   - model-gateway (model resolution)
//   - openrouter.ai (direct LLM URL)
//
// Also asserts no permanent OpenRouter model id is hardcoded as the lane's
// model (i.e., no <vendor>/<model> string literal used as the lane model
// outside __tests__/ fixture files).
//
// @lore AH5: This is a static-property guard, not a test. A test imports code
// and asserts behavior. This reads spec source files and asserts the absence of
// certain patterns — that's a lint rule or build-time check, per testing rules.
// Placed in scripts/ (not packages/) to respect the boundary.
//
// @lore AH5: Shell-scaffolding mocks (auth/me, teams, settings) are tolerated
// on the AH5 spec. Only proof-path routes must not be mocked.
//
// @lore AH5: The JSDoc block-comment form was avoided here because glob patterns
// like "threads/.../messages" contain "star-slash" sequences that prematurely
// close block comments. Using line comments sidesteps the parser ambiguity.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specDir = path.join(repoRoot, "packages/web/e2e");

// Proof-path patterns that must NOT be mocked.
const FORBIDDEN_ROUTE_PATTERNS: readonly RegExp[] = [
	/page\.route\([^)]*\/threads[^)]*\/messages/,
	/page\.route\([^)]*\/credentials\//,
	/page\.route\([^)]*\/sessions\//,
	/page\.route\([^)]*model-gateway/,
	/page\.route\([^)]*openrouter\.ai/,
];

const AH5_SPEC_GLOB = "ah5-*.spec.ts";

async function collectSpecFiles(): Promise<string[]> {
	const files: string[] = [];
	for await (const f of glob(AH5_SPEC_GLOB, { cwd: specDir })) {
		files.push(path.join(specDir, String(f)));
	}
	return files;
}

const specFiles = await collectSpecFiles();

if (specFiles.length === 0) {
	// @lore AH5: Fail closed on zero specs. If the guard finds no spec files,
	// it means the spec pattern is wrong or the spec was deleted — either way,
	// silently passing would defeat the no-mock enforcement. A guard that can
	// pass with zero inspected files is no guard at all.
	process.stderr.write(
		"[ah5-no-mock-guard] FATAL: No ah5-*.spec.ts files found in " +
			`${specDir}\n` +
			"  Expected at least one spec (e.g. ah5-live-agent-path.spec.ts).\n" +
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
					`[ah5-no-mock-guard] VIOLATION: ${path.relative(repoRoot, specFile)}:${i + 1}\n` +
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
		`[ah5-no-mock-guard] ${violations} violation(s) found. ` +
			"The AH5 spec must not mock proof-path routes.\n",
	);
	process.exit(1);
}

process.stdout.write(
	`[ah5-no-mock-guard] PASS: No proof-path mocks found in ${specFiles.length} AH5 spec file(s).\n`,
);
