/**
 * AU28 — loading the live repo for the governance CLIs.
 *
 * The one place that touches the filesystem and git. `scripts/lib/**` takes its inputs injected and
 * `scripts/rules/**` is banned by ESLint from importing `node:fs`, `node:child_process` or any glob
 * package — that is what makes "one census, many rules, no rule does its own discovery" mechanical
 * rather than a house style.
 *
 * @lore AU28: this module exists so every governance CLI shares one set of live inputs rather than each
 * discovering its own. A CLI whose module load has side effects cannot be composed, which is why every
 * loader here is a plain function the caller invokes, never a script that runs on import.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type CrossingsResult, type DetectorFloor, detectCrossings } from "./lib/crossings.js";
import { buildDbSurfaceIndex, type DatabasePackageConfig } from "./lib/db-surfaces.js";
import type { Architecture, Kind } from "./lib/governance-model.js";
import type { FloorRecord } from "./rules/floors-tight.js";
import { buildCensus, type Census, CLASSIFICATION_PATTERNS, type WorkspaceRoleRule } from "./lib/repo-census.js";
import type { MisplacedFiles, RuleSeverity, TableOwners } from "./lib/governance-registry.js";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type LoadedArchitecture = Architecture & {
	readonly roles: { readonly byWorkspacePattern: readonly WorkspaceRoleRule[] };
	readonly databasePackage: DatabasePackageConfig;
};

export const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf8")) as T;

export const readRepoFile = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), "utf8");

/**
 * Floor on the census itself. If `git ls-files` ever returns a near-empty set — wrong cwd, a broken
 * git invocation, a shallow checkout — every rule would pass vacuously.
 *
 * Held in the middle of the `floors-tight` band rather than near zero: a floor with 70% slack, which
 * is where this started, cannot fail until two thirds of the repository has disappeared.
 */
export const MIN_TRACKED_FILES = 2976;

/**
 * Minimum crossings each detector must find, MEASURED against the live tree and set in the MIDDLE of
 * the `floors-tight` band — close enough to fail on a real loss, loose enough to survive churn.
 *
 * @lore AU28: this is the direct `au6` fix, one level up from where it was applied — `au6` scanned a
 * deleted directory and printed PASS over zero files for months. A floor is never lowered to make a
 * run go green: a drop means the detector broke, not that the repo got cleaner.
 *
 * @lore AU28: RECOMPUTE these whenever the tree moves under them, and do it in the same commit —
 * `npm run governance:floors` prints the live count, the slack, the allowed slack, the band verdict
 * and the value to write for every floor in the build. A stale floor is not a harmless leftover: it
 * still passes, so nobody notices it has stopped measuring anything. That is exactly how one detector
 * floor sat far enough below live for a dozen deleted crossings to go unremarked.
 *
 * @lore AU28 — THIS COMMENT CARRIES NO MEASURED COUNTS, ON PURPOSE, AND NEITHER SHOULD ITS
 * REPLACEMENT. Three separate commits transcribed the live census and detector totals into prose
 * here and in `repo-census.ts`; all three were stale within days, and the third was written by the
 * commit that fixed the second. A number in prose has no gate — nothing recomputes it, nothing fails
 * when it drifts, and the next reader trusts it precisely because it looks measured. The floors below
 * ARE the record: they are enforced, they are recomputed by one command, and `floors-tight` fails the
 * build when they stop matching the tree. Keep the reasoning here; get the numbers from
 * `npm run governance:floors`.
 */
// @lore AU34: `import` and `manifest` are the two floors the substrate split moved, and they moved
// for a reason that has to be said out loud before a floor is ever raised: the POPULATION grew and no
// violation was absorbed. One framework package with thirty declarers became eighteen with the same
// consumers declaring a subset each, so both counts rise mechanically. Floors are magnitude trackers
// — violations are reported separately, by the `crossing-<kind>` rules — so raising one cannot hide
// one. The value written is the tool's `write` column (the middle of the band), never the live count:
// a floor at the edge is one removed crossing from red. Only these two were touched; every other
// floor stayed inside its band, and one going red is a finding rather than a bump.
export const DETECTOR_FLOORS: readonly DetectorFloor[] = [
	{ kind: "import", min: 3637, floorKind: "magnitude" },
	{ kind: "manifest", min: 223, floorKind: "magnitude" },
	{ kind: "di", min: 220, floorKind: "magnitude" },
	{ kind: "api", min: 184, floorKind: "magnitude" },
	{ kind: "mcp", min: 22, floorKind: "magnitude" },
	{ kind: "event", min: 216, floorKind: "magnitude" },
	// The thinnest detector in the set, and the one most able to lose half its coverage without
	// tripping. Treat it as a tripwire, not a boundary. It is the one floor NOT moved to the middle of
	// its band: the band's `max(…, 5)` term puts the midpoint BELOW where this already sits, and a
	// floor is never lowered — least of all the one with the least to lose before it stops measuring.
	{ kind: "capability", min: 8, floorKind: "magnitude" },
	{ kind: "table:read", min: 1191, floorKind: "magnitude" },
	{ kind: "table:write", min: 2085, floorKind: "magnitude" },
];

/** Every floor the build declares, live counts attached — the population `floors-tight` checks. */
export function declaredFloors(census: Census, countsByKind: ReadonlyMap<Kind, number>): FloorRecord[] {
	return [
		...DETECTOR_FLOORS.map((floor) => ({
			id: `detector:${floor.kind}`,
			live: countsByKind.get(floor.kind) ?? 0,
			floor: floor.min,
			floorKind: floor.floorKind,
		})),
		...CLASSIFICATION_PATTERNS.map((pattern) => ({
			id: `pattern:${pattern.id}`,
			live: census.patternCounts.get(pattern.id) ?? 0,
			floor: pattern.minFiles,
			floorKind: pattern.floorKind,
		})),
		{
			id: "census:tracked-files",
			live: census.files.length,
			floor: MIN_TRACKED_FILES,
			floorKind: "magnitude" as const,
		},
	];
}

/**
 * The files the repo actually consists of.
 *
 * @lore AU28: `git ls-files`, not a filesystem walk. A walk misses tracked files under build
 * directories unless it is hand-tuned, and picks up gitignored output that is not part of the
 * repository at all. Tracked-by-git is the only definition that cannot drift.
 */
/**
 * Files present in the working tree under the governance source dirs, tracked or not.
 *
 * `git ls-files` deliberately does not see gitignored build output — which is exactly what the
 * stale-artifact rule needs to look at. Narrow on purpose: only where the guard's own source lives.
 */
export function presentGovernanceFiles(): string[] {
	const raw = execFileSync("git", ["ls-files", "-z", "--others", "--cached", "scripts"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return raw.split("\0").filter((p) => p !== "");
}

/**
 * Every file the repository will have once you commit: tracked, plus new files you have not
 * committed yet. Gitignored output is excluded — `--exclude-standard` is what does that.
 *
 * @lore AU28: this used to be a bare `git ls-files`, which sees only what is ALREADY committed or
 * staged. That made the local gate and the CI gate disagree on the same command: you add a file,
 * run `npm run lint`, it passes over a census that does not contain the file you are about to
 * commit — and CI, running on the committed tree, then fails. It is a false green in the loop where
 * it matters most, because the whole point of the local run is to predict CI.
 *
 * It is not hypothetical: it bit this work package. `MIN_TRACKED_FILES` was recomputed against a
 * census missing four not-yet-staged rule files, the run was green, and the commit that followed was
 * red — the floor's slack had gone out of band the moment those files became tracked. The reviewer
 * had already named this exact divergence; the fix was not applied, and then it happened.
 *
 * The cost is that a scratch file you never intend to commit is now linted. That is the correct
 * trade: if it is in the working tree and not gitignored, committing it is one `git add -A` away,
 * and the answer to "I do not want this linted" is to gitignore it — which is also the answer to
 * "I do not want this committed".
 */
export function trackedFiles(): string[] {
	const raw = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	// `--cached --others` can list a path twice when it is both staged and present on disk.
	return [...new Set(raw.split("\0").filter((p) => p !== ""))];
}

export const loadArchitecture = (): LoadedArchitecture => readJson<LoadedArchitecture>("governance/architecture.json");
export const loadTableOwners = (): TableOwners => readJson<TableOwners>("governance/table-owners.json");
export const loadMisplacedFiles = (): MisplacedFiles => readJson<MisplacedFiles>("governance/misplaced-files.json");
export const loadRuleSeverity = (): RuleSeverity => readJson<RuleSeverity>("governance/rule-severity.json");

/**
 * Which `warn` rules are clean right now, reported so a sibling can see it — never enforced.
 *
 * @lore AU32 — Ruling E: a check that a `warn` rule with zero live violations is an ERROR is the
 * stale-baseline check reborn (a red build as the reward for fixing the last violation, naming no
 * architectural fact) and is forbidden. This returns `readonly string[]`, never `Finding[]` — a
 * `Finding` is the only thing this lint can fail the build on, so turning this into a gate means
 * changing the return type and routing it through `runRules`, which is a compile-visible diff in a
 * reviewed file. That signature is the guard, not a runtime check.
 */
export function readyToFlip(severity: RuleSeverity, liveKeys: ReadonlySet<string>): readonly string[] {
	return Object.entries(severity.severity)
		.filter(([key, value]) => value === "warn" && !liveKeys.has(key))
		.map(([key]) => `${key} — clean; this rule can go to error`);
}

export function buildLiveCensus(architecture: LoadedArchitecture, files: readonly string[]): Census {
	return buildCensus({ files, readFile: readRepoFile, roleRules: architecture.roles.byWorkspacePattern });
}

/**
 * Framework package name → the surface label it is named by. Derived from the packages that exist.
 *
 * @lore AU34: the label is mapped whether or not `architecture.surfaces` declares it. It used to be
 * mapped only when the entry already existed, so a framework package with no decided audience never
 * became a `surface` target at all: the crossing fell through to the generic package clauses and the
 * build failed with "only a composition root reaches across" — which sends a reader to the wrong file.
 * An undeclared surface is forbidden, and it has to say so.
 */
function frameworkSurfacesOf(census: Census): Map<string, string> {
	const out = new Map<string, string>();
	for (const pkg of census.packages) {
		if (pkg.role !== "framework") continue;
		out.set(pkg.name, `framework/${pkg.name}`);
	}
	return out;
}

export function buildCrossings(census: Census, architecture: LoadedArchitecture): CrossingsResult {
	return detectCrossings(
		{
			census,
			readFile: readRepoFile,
			mcpRouterHost: architecture.endpoints.mcpRouter.host,
			eventTypesModule: architecture.eventBus.typesModule,
			db: buildDbSurfaceIndex(architecture.databasePackage, readRepoFile),
			tableOwners: loadTableOwners(),
			frameworkSurfaces: frameworkSurfacesOf(census),
		},
		DETECTOR_FLOORS,
	);
}
