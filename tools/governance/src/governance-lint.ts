#!/usr/bin/env npx tsx
/**
 * AU28 step 1 — the architectural governance lint.
 *
 * The thin runner. It does three things and nothing else: source the file list, build the census
 * once, run every registered rule over it.
 *
 * @lore AU28: `governance-context.ts` is the ONE module in the governance stack that touches
 * the filesystem or spawns a process — not this file, which reads everything through it.
 * `src/lib/**` takes its inputs injected and `src/rules/**` is banned by ESLint from
 * importing `node:fs`, `node:child_process` or any glob package. That is what makes "one census,
 * many rules — no rule does its own file discovery" a mechanical property instead of a house style.
 * Twenty inherited guards each had their own scan scope; two of them scanned a directory that had not
 * existed for two tracks and printed PASS.
 *
 * @lore AU28: the file list comes from `git ls-files`, not a filesystem walk. A walk misses the two
 * tracked files under `applications/desktop/build/` (`entitlements.mac.plist`, `icon.icns`) unless it is
 * hand-tuned, and it picks up gitignored build output that is not part of the repository at all.
 * Tracked-by-git is the only definition of "the repo's files" that cannot drift.
 *
 * Usage:
 *   npx tsx tools/governance/src/governance-lint.ts                # check the live tree
 *   npx tsx tools/governance/src/governance-lint.ts --errors-only  # errors only — the gate, without the debt
 *   npx tsx tools/governance/src/governance-lint.ts --fixtures     # self-test the detector on a synthetic tree
 *   npx tsx tools/governance/src/governance-lint.ts --attacks      # break-test every rule against the live tree
 *
 * @lore AU28: warnings are printed ONE LINE PER SITE, never aggregated. The founder ruled on this:
 * the next thing that happens after a rule lands at warn is a work package that clears it, and that
 * work package needs the sites. `--errors-only` exists for the runs that only care about the gate.
 * What is NOT acceptable is an ESLint warning — `npm run lint` runs `eslint . --quiet`, which
 * discards warnings entirely, and that is how `eslint-plugin-design` came to enforce nothing on the
 * product UI while looking like a net.
 */

import {
	buildCrossings,
	buildLiveCensus,
	CROSSING_KINDS,
	loadArchitecture,
	loadTableOwners,
	presentToolingFiles,
	readRepoFile,
	trackedFiles,
} from "./governance-context.js";
import { UnclaimedProductionFileError } from "./lib/crossing-detectors.js";
import { buildPackageLocator, type CrossingsResult } from "./lib/crossings.js";
import { runAttacks } from "./lib/governance-attacks.js";
import { runFixtureSelfTest } from "./lib/governance-fixtures.js";
import {
	DeadRuleError,
	formatFinding,
	hasErrors,
	type Rule,
	runRules,
} from "./lib/governance-rules.js";
import type { Census } from "./lib/repo-census.js";
import { actionsProjected } from "./rules/actions-projected.js";
import { artifactIsNotAStorageConcept } from "./rules/artifact-is-not-a-storage-concept.js";
import { classificationTotal } from "./rules/classification-total.js";
import { crossingRules, violationsOf } from "./rules/crossings.js";
import { dbSymbolsAllPlaced } from "./rules/db-symbols-all-placed.js";
import { deepImportsDieWithTheirEntries } from "./rules/deep-imports-die-with-their-entries.js";
import { frameworkSurfacesDeclared } from "./rules/framework-surfaces-declared.js";
import { layerExportsResolveInsideTheLayer } from "./rules/layer-exports-resolve-inside-the-layer.js";
import { noLaunderedReExports } from "./rules/no-laundered-re-exports.js";
import { noPerFileAllowances } from "./rules/no-per-file-allowances.js";
import { noProductionImportsDevelopment } from "./rules/no-production-imports-development.js";
import { noStaleBuildArtifacts } from "./rules/no-stale-build-artifacts.js";
import { oneWorkPrimitive } from "./rules/one-work-primitive.js";
import { registriesHonest } from "./rules/registries-honest.js";
import { retiredSurfacesAbsent } from "./rules/retired-surfaces-absent.js";
import { serviceValuesDoNotEscapeTheFace } from "./rules/service-values-do-not-escape-the-face.js";

function runFixtures(): number {
	const results = runFixtureSelfTest();
	const failures = results.filter((r) => r.failure !== null);
	for (const failure of failures) {
		console.error(`  FAIL  ${failure.id} — ${failure.detail}\n        ${failure.failure}`);
	}
	if (failures.length > 0) {
		console.error(
			`\ngovernance-lint --fixtures: FAIL — ${failures.length}/${results.length} cases failed.`,
		);
		return 1;
	}
	console.log(
		`governance-lint --fixtures: PASS — ${results.length} synthetic cases (classification + evasion).`,
	);
	return 0;
}

/**
 * Every rule the build registers, over one census.
 *
 * @lore AU28: shared by `runLive` and `--attacks` ON PURPOSE. The break-test harness cross-checks
 * that every registered rule has an attack case, and a hand-maintained second list of rule ids would
 * be the one thing everybody forgets to update — which would turn the coverage gate into decoration.
 */
function buildRules(
	architecture: ReturnType<typeof loadArchitecture>,
	census: Census,
	detected: CrossingsResult,
	readFile: (path: string) => string,
): Rule[] {
	return [
		classificationTotal,
		noProductionImportsDevelopment,
		registriesHonest(architecture, loadTableOwners(), detected.db.tables),
		frameworkSurfacesDeclared(architecture),
		noStaleBuildArtifacts(presentToolingFiles()),
		noLaunderedReExports({
			architecture,
			db: detected.db,
			frameworkSurfaces: detected.frameworkSurfaces,
			locate: buildPackageLocator(census.packages),
			readFile,
		}),
		noPerFileAllowances({ readFile }),
		dbSymbolsAllPlaced({
			unplacedDbSymbols: detected.unplacedDbSymbols,
			dbSourceRoot: architecture.databasePackage.sourceRoot,
			dbBarrel: architecture.databasePackage.barrel,
		}),
		layerExportsResolveInsideTheLayer({ locate: buildPackageLocator(census.packages), readFile }),
		serviceValuesDoNotEscapeTheFace({ locate: buildPackageLocator(census.packages), readFile }),
		deepImportsDieWithTheirEntries({ readFile }),
		oneWorkPrimitive({ readFile }),
		artifactIsNotAStorageConcept({ readFile }),
		retiredSurfacesAbsent({ readFile }),
		actionsProjected({ readFile }),
		...crossingRules({
			architecture,
			crossings: detected.crossings,
			kinds: CROSSING_KINDS,
		}),
	];
}

function runAttackSuite(): number {
	const architecture = loadArchitecture();
	const results = runAttacks({
		files: trackedFiles(),
		readFile: readRepoFile,
		architecture,
		tableOwners: loadTableOwners(),
		kinds: CROSSING_KINDS,
		buildRules: (overlaidCensus, overlaidDetected, overlaidReadFile) =>
			buildRules(architecture, overlaidCensus, overlaidDetected, overlaidReadFile),
		violationsOf,
	});

	const failures = results.filter((r) => r.failure !== null);
	for (const failure of failures) {
		console.error(`  FAIL  ${failure.id} — ${failure.detail}\n        ${failure.failure}`);
	}
	if (failures.length > 0) {
		console.error(
			`\ngovernance-lint --attacks: FAIL — ${failures.length}/${results.length} break-tests failed.`,
		);
		return 1;
	}
	console.log(
		`governance-lint --attacks: PASS — ${results.length} break-tests against the live tree.`,
	);
	return 0;
}

function runLive(errorsOnly: boolean): number {
	const files = trackedFiles();
	// @lore AZ7: an EMPTY census, not a small one. This used to compare against a maintained
	// repo-wide file count; that floor was removed because it named a number instead of an
	// architectural fact, and because every detector floor already fails on an empty tree. What is
	// left is the one case where no rule can say anything true: git returned nothing at all.
	if (files.length === 0) {
		console.error(
			"governance-lint: git ls-files returned no paths at all — wrong cwd, or a broken git " +
				"invocation. Refusing to report a verdict over an empty census.",
		);
		return 1;
	}

	const architecture = loadArchitecture();
	const census = buildLiveCensus(architecture, files);

	/**
	 * @lore AU28: `UnclaimedProductionFileError` is a VERDICT, not a crash. It is thrown from deep
	 * inside the detectors — the only way to refuse a verdict over a file the census cannot place — and
	 * it escaped `runLive` uncaught, so the one census misconfiguration that fails OPEN presented as a
	 * Node stack trace with a `throw` frame at the top and the actual message four lines down. Every
	 * other failure in this command prints one formatted finding; this one has a path and a message
	 * already, so it prints as one too.
	 */
	let detected: CrossingsResult;
	try {
		detected = buildCrossings(census, architecture);
	} catch (error) {
		if (!(error instanceof UnclaimedProductionFileError)) throw error;
		console.error(
			`\n  ── production · 1 finding(s)\n${formatFinding({
				ruleId: "census-claims-every-production-file",
				severity: "error",
				message: error.message,
				path: error.file,
				world: "production",
			})}`,
		);
		console.error(
			"\ngovernance-lint: FAIL — 1 error(s). The census refused a verdict, so no rule ran.",
		);
		return 1;
	}
	const ruleInput = {
		architecture,
		crossings: detected.crossings,
		kinds: CROSSING_KINDS,
	};

	const RULES: readonly Rule[] = [
		classificationTotal,
		noProductionImportsDevelopment,
		registriesHonest(architecture, loadTableOwners(), detected.db.tables),
		frameworkSurfacesDeclared(architecture),
		noStaleBuildArtifacts(presentToolingFiles()),
		noLaunderedReExports({
			architecture,
			db: detected.db,
			frameworkSurfaces: detected.frameworkSurfaces,
			locate: buildPackageLocator(census.packages),
			readFile: readRepoFile,
		}),
		noPerFileAllowances({ readFile: readRepoFile }),
		dbSymbolsAllPlaced({
			unplacedDbSymbols: detected.unplacedDbSymbols,
			dbSourceRoot: architecture.databasePackage.sourceRoot,
			dbBarrel: architecture.databasePackage.barrel,
		}),
		layerExportsResolveInsideTheLayer({
			locate: buildPackageLocator(census.packages),
			readFile: readRepoFile,
		}),
		serviceValuesDoNotEscapeTheFace({
			locate: buildPackageLocator(census.packages),
			readFile: readRepoFile,
		}),
		deepImportsDieWithTheirEntries({ readFile: readRepoFile }),
		oneWorkPrimitive({ readFile: readRepoFile }),
		artifactIsNotAStorageConcept({ readFile: readRepoFile }),
		retiredSurfacesAbsent({ readFile: readRepoFile }),
		actionsProjected({ readFile: readRepoFile }),
		...crossingRules(ruleInput),
	];

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
	// Grouped by world, production first. The two are different kinds of debt and one total hides
	// the smaller, more serious half behind the larger one.
	const shown = errorsOnly ? errors : [...errors, ...warnings];
	for (const world of ["production", "development", undefined] as const) {
		const inWorld = shown.filter((f) => f.world === world);
		if (inWorld.length === 0) continue;
		console.error(`\n  ── ${world ?? "not world-specific"} · ${inWorld.length} finding(s)`);
		for (const finding of inWorld) console.error(formatFinding(finding));
	}
	if (errorsOnly && warnings.length > 0) {
		console.error(`  (${warnings.length} warning(s) hidden by --errors-only)`);
	}

	// AU29: the unplaced-db-symbol NOTE that used to print here is gone — `db-symbols-all-placed`
	// (registered above) escalates the same condition to a hard error naming the symbol.

	const production = census.files.filter((f) => f.kind === "production").length;
	const development = census.files.length - production;
	const summary =
		`${census.files.length} tracked files (${production} production, ${development} development), ` +
		`${census.packages.length} packages, ${detected.crossings.length} crossings, ${RULES.length} rules, ` +
		`${warnings.filter((f) => f.world === "production").length} production + ` +
		`${warnings.filter((f) => f.world === "development").length} development known violation(s) at warn`;

	if (hasErrors(result.findings)) {
		console.error(`\ngovernance-lint: FAIL — ${errors.length} error(s). ${summary}.`);
		return 1;
	}
	console.log(`governance-lint: PASS — ${summary}.`);
	return 0;
}

const exitCode = process.argv.includes("--fixtures")
	? runFixtures()
	: process.argv.includes("--attacks")
		? runAttackSuite()
		: runLive(process.argv.includes("--errors-only"));
process.exit(exitCode);
