#!/usr/bin/env npx tsx
/**
 * AU28 step 1 — the architectural governance lint.
 *
 * The thin runner. It does three things and nothing else: source the file list, build the census
 * once, run every registered rule over it.
 *
 * @lore AU28: this file is the ONLY place in the governance stack allowed to touch the filesystem or
 * spawn a process. `scripts/lib/repo-census.ts` takes its inputs injected, and `scripts/rules/**` is
 * banned by ESLint from importing `node:fs`, `node:child_process` or any glob package. That is what
 * makes "one census, many rules — no rule does its own file discovery" a mechanical property instead
 * of a house style. Twenty inherited guards each had their own scan scope; two of them scanned a
 * directory that had not existed for two tracks and printed PASS.
 *
 * @lore AU28: the file list comes from `git ls-files`, not a filesystem walk. A walk misses the two
 * tracked files under `packages/desktop/build/` (`entitlements.mac.plist`, `icon.icns`) unless it is
 * hand-tuned, and it picks up gitignored build output that is not part of the repository at all.
 * Tracked-by-git is the only definition of "the repo's files" that cannot drift.
 *
 * Usage:
 *   npx tsx scripts/governance-lint.ts             # check the live tree
 *   npx tsx scripts/governance-lint.ts --fixtures  # self-test the detector on a synthetic tree
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runFixtureSelfTest } from "./lib/governance-fixtures.js";
import { DeadRuleError, formatFinding, hasErrors, type Rule, runRules } from "./lib/governance-rules.js";
import { buildCensus } from "./lib/repo-census.js";
import { classificationTotal } from "./rules/classification-total.js";
import { noProductionImportsDevelopment } from "./rules/no-production-imports-development.js";
import { patternLive } from "./rules/pattern-live.js";

/** The registered rule set. Steps 3 and 4 add layer-access rules here, over the same census. */
const RULES: readonly Rule[] = [classificationTotal, patternLive, noProductionImportsDevelopment];

/**
 * Floor on the census itself. If `git ls-files` ever returns a near-empty set — wrong cwd, a broken
 * git invocation, a shallow checkout — every rule below would pass vacuously.
 */
const MIN_TRACKED_FILES = 1000;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function trackedFiles(): string[] {
	const raw = execFileSync("git", ["ls-files", "-z"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return raw.split("\0").filter((p) => p !== "");
}

function runFixtures(): number {
	const results = runFixtureSelfTest();
	const failures = results.filter((r) => r.failure !== null);
	for (const failure of failures) {
		console.error(`  FAIL  ${failure.id} — ${failure.detail}\n        ${failure.failure}`);
	}
	if (failures.length > 0) {
		console.error(`\ngovernance-lint --fixtures: FAIL — ${failures.length}/${results.length} cases failed.`);
		return 1;
	}
	console.log(`governance-lint --fixtures: PASS — ${results.length} synthetic cases (classification + evasion).`);
	return 0;
}

function runLive(): number {
	const files = trackedFiles();
	if (files.length < MIN_TRACKED_FILES) {
		console.error(
			`governance-lint: git ls-files returned ${files.length} paths, below the floor of ${MIN_TRACKED_FILES}. ` +
				`Refusing to report a verdict over an implausibly small census.`,
		);
		return 1;
	}

	const census = buildCensus({
		files,
		readFile: (p) => readFileSync(path.join(REPO_ROOT, p), "utf8"),
	});

	let result: ReturnType<typeof runRules>;
	try {
		result = runRules(RULES, census);
	} catch (error) {
		if (error instanceof DeadRuleError) {
			console.error(`governance-lint: FAIL — ${error.message}`);
			return 1;
		}
		throw error;
	}

	const errors = result.findings.filter((f) => f.severity === "error");
	const warnings = result.findings.filter((f) => f.severity === "warn");
	for (const finding of [...errors, ...warnings]) console.error(formatFinding(finding));

	const production = census.files.filter((f) => f.kind === "production").length;
	const development = census.files.length - production;
	const summary =
		`${census.files.length} tracked files (${production} production, ${development} development), ` +
		`${census.edges.length} resolved import edges, ${RULES.length} rules`;

	if (hasErrors(result.findings)) {
		console.error(`\ngovernance-lint: FAIL — ${errors.length} error(s). ${summary}.`);
		return 1;
	}
	console.log(`governance-lint: PASS — ${summary}.`);
	return 0;
}

const exitCode = process.argv.includes("--fixtures") ? runFixtures() : runLive();
process.exit(exitCode);
