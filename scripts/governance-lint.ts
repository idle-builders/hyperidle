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
 * tracked files under `applications/desktop/build/` (`entitlements.mac.plist`, `icon.icns`) unless it is
 * hand-tuned, and it picks up gitignored build output that is not part of the repository at all.
 * Tracked-by-git is the only definition of "the repo's files" that cannot drift.
 *
 * Usage:
 *   npx tsx scripts/governance-lint.ts                # check the live tree
 *   npx tsx scripts/governance-lint.ts --errors-only  # errors only — the gate, without the debt
 *   npx tsx scripts/governance-lint.ts --fixtures     # self-test the detector on a synthetic tree
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
	DETECTOR_FLOORS,
	loadArchitecture,
	loadBaseline,
	MIN_TRACKED_FILES,
	trackedFiles,
} from "./governance-context.js";
import { runFixtureSelfTest } from "./lib/governance-fixtures.js";
import type { Kind } from "./lib/governance-model.js";
import { DeadRuleError, type Finding, formatFinding, hasErrors, type Rule, runRules } from "./lib/governance-rules.js";
import { classificationTotal } from "./rules/classification-total.js";
import { baselineRatchet, crossingRules } from "./rules/crossings.js";
import { noProductionImportsDevelopment } from "./rules/no-production-imports-development.js";
import { patternLive } from "./rules/pattern-live.js";
import { registriesHonest } from "./rules/registries-honest.js";

/**
 * The known-violation summary: one line per rule group, split by world.
 *
 * @lore AU28: this is the goal metric and it is on screen every run, so progress is visible without
 * anyone having to ask for a report. Production and development are totalled SEPARATELY on purpose —
 * 221 production violations and 2,022 development ones are not 2,243 of the same thing, and a single
 * number would let the serious half shrink or grow unnoticed behind the bulk.
 */
function printKnownDebt(findings: readonly Finding[]): void {
	const warnings = findings.filter((f) => f.severity === "warn" && f.group !== undefined);
	if (warnings.length === 0) return;

	const byGroup = new Map<string, { count: number; files: Set<string>; world: string }>();
	for (const finding of warnings) {
		const key = finding.group ?? "";
		const entry = byGroup.get(key) ?? { count: 0, files: new Set<string>(), world: finding.world ?? "?" };
		entry.count += 1;
		if (finding.path !== undefined) entry.files.add(finding.path);
		byGroup.set(key, entry);
	}

	console.error("\n  known violations — the migration surface, by world\n");
	for (const world of ["production", "development"]) {
		const groups = [...byGroup].filter(([, g]) => g.world === world).sort((a, b) => b[1].count - a[1].count);
		if (groups.length === 0) continue;
		const total = groups.reduce((n, [, g]) => n + g.count, 0);
		const files = new Set(groups.flatMap(([, g]) => [...g.files])).size;
		console.error(`  ${world.toUpperCase()} — ${total} violation(s) across ${files} file(s), ${groups.length} rule group(s)`);
		for (const [key, group] of groups) {
			const label = key.replace(new RegExp(` ${world}$`), "");
			console.error(`    ${String(group.count).padStart(5)}  ${String(group.files.size).padStart(3)} file(s)  ${label}`);
		}
		console.error("");
	}
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

function runLive(errorsOnly: boolean): number {
	const files = trackedFiles();
	if (files.length < MIN_TRACKED_FILES) {
		console.error(
			`governance-lint: git ls-files returned ${files.length} paths, below the floor of ${MIN_TRACKED_FILES}. ` +
				`Refusing to report a verdict over an implausibly small census.`,
		);
		return 1;
	}

	const architecture = loadArchitecture();
	const census = buildLiveCensus(architecture, files);

	const detected = buildCrossings(census, architecture);
	const baseline = loadBaseline();
	const ruleInput = {
		architecture,
		crossings: detected.crossings,
		baseline,
		floors: new Map<Kind, number>(DETECTOR_FLOORS.map((f) => [f.kind, f.min])),
	};

	const RULES: readonly Rule[] = [
		classificationTotal,
		patternLive,
		noProductionImportsDevelopment,
		registriesHonest(architecture),
		...crossingRules(ruleInput),
		baselineRatchet(ruleInput),
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

	printKnownDebt(result.findings);

	if (detected.unplacedDbSymbols.size > 0) {
		console.error(`  NOTE  ${detected.unplacedDbSymbols.size} database symbol(s) fall to db:unknown:`);
		for (const [symbol, why] of detected.unplacedDbSymbols) console.error(`          ${symbol} — ${why}`);
	}

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
	: runLive(process.argv.includes("--errors-only"));
process.exit(exitCode);
