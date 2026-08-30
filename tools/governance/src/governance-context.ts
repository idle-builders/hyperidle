/**
 * AU28 — loading the live repo for the governance CLIs.
 *
 * The one place that touches the filesystem and git. `tools/governance/src/lib/**` takes its inputs
 * injected and `tools/governance/src/rules/**` is banned by ESLint from importing `node:fs`,
 * `node:child_process` or any glob package — that is what makes "one census, many rules, no rule does
 * its own discovery" mechanical rather than a house style.
 *
 * @lore AU28: this module exists so every governance CLI shares one set of live inputs rather than each
 * discovering its own. A CLI whose module load has side effects cannot be composed, which is why every
 * loader here is a plain function the caller invokes, never a script that runs on import.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type CrossingsResult, type DetectorFloor, detectCrossings } from "./lib/crossings.js";
import { buildDbSurfaceIndex, type DatabasePackageConfig } from "./lib/db-surfaces.js";
import type { Architecture, Kind } from "./lib/governance-model.js";
import type { MisplacedFiles, TableOwners } from "./lib/governance-registry.js";
import {
	buildCensus,
	type Census,
	CLASSIFICATION_PATTERNS,
	type WorkspaceRoleRule,
} from "./lib/repo-census.js";
import type { FloorRecord } from "./rules/floors-tight.js";

export const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
);

export type LoadedArchitecture = Architecture & {
	readonly roles: { readonly byWorkspacePattern: readonly WorkspaceRoleRule[] };
	readonly databasePackage: DatabasePackageConfig;
};

export const readJson = <T>(rel: string): T =>
	JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf8")) as T;

export const readRepoFile = (rel: string): string =>
	readFileSync(path.join(REPO_ROOT, rel), "utf8");

/*
 * There is deliberately no floor on the total tracked-file count.
 *
 * @lore AZ7: `census:tracked-files` used to declare one, as a banded `magnitude` floor. It was
 * removed because it measured the wrong thing twice over.
 *
 * Architectural governance asserts ACCESS PATTERNS — who may import what, which service owns a
 * table, which world a file belongs to. A failure has to name an architectural fact. This one could
 * only ever say "748 of slack where 745 is allowed", which names nothing about the architecture and
 * tells no one what to fix except "write a bigger number here".
 *
 * It was also redundant. Its stated job was catching a census that came back near-empty — a wrong
 * cwd, a broken git invocation — so that no rule passes vacuously. But every detector floor already
 * catches that, and harder: on an empty census `detector:import` reports 0 live against a floor of
 * 3637 and fails immediately. The repo-wide count added no detection on top, while `floors-tight`
 * required it to be re-measured every time the repository grew a fifth. That is a maintained number
 * whose only effect was turning ordinary growth red.
 *
 * What survives is the boolean the floor was standing in for: `governance-lint` refuses to report a
 * verdict over an EMPTY census. Empty is the real failure; any other count is architecture's job.
 */

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
	{ kind: "import", min: 2754, floorKind: "magnitude" },
	// Floor re-measured after AU44 B7+fd: factory-defaults dissolved. Live: 3060, suggested: 2754.
	{ kind: "manifest", min: 141, floorKind: "magnitude" },
	// Floor re-measured after AU44 fd: factory-defaults dissolved. Live: 157, suggested: 141.
	// Floor re-measured after the capture machinery was deleted: the workflow port, the review
	// subscriptions and their injected deps went with it. Live: 182, suggested: 163.
	{ kind: "di", min: 163, floorKind: "magnitude" },
	{ kind: "api", min: 167, floorKind: "magnitude" },
	{ kind: "mcp", min: 29, floorKind: "magnitude" },
	{ kind: "event", min: 192, floorKind: "magnitude" },
	// The thinnest detector in the set, and the one most able to lose half its coverage without
	// tripping. Treat it as a tripwire, not a boundary. It is the one floor NOT moved to the middle of
	// its band: the band's `max(…, 5)` term puts the midpoint BELOW where this already sits, and a
	// floor is never lowered — least of all the one with the least to lose before it stops measuring.
	{ kind: "capability", min: 14, floorKind: "magnitude" },
	// Floor re-measured after AU44 B7+fd: factory-defaults dissolved. Live: 1046, suggested: 941.
	{ kind: "table:read", min: 1066, floorKind: "magnitude" },
	// Floor re-measured after AU44 B7+fd. Live: 1711, suggested: 1539.
	{ kind: "table:write", min: 1539, floorKind: "magnitude" },
];

/** Every floor the build declares, live counts attached — the population `floors-tight` checks. */
export function declaredFloors(
	census: Census,
	countsByKind: ReadonlyMap<Kind, number>,
): FloorRecord[] {
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
 * Files present in the working tree under every relocated tooling source dir, tracked or not.
 *
 * `git ls-files` deliberately does not see gitignored build output — which is exactly what the
 * stale-artifact rule needs to look at. Narrow on purpose: only where a composite build can emit
 * a stale `.js`/`.d.ts` beside its `.ts` — every tooling package's `src/` (scanned, never hardcoded —
 * CLAUDE.md's monorepo rule) plus `layers/core-ui/__scripts__` and `layers/core-ui/__e2e__`, the two in-package
 * homes AU37 gave the tools that moved into the package they serve rather than into `tools/`.
 *
 * @lore AU37: renamed from `presentGovernanceFiles` — before this work package `tools/governance`
 * was the ONLY tooling package a composite build could emit into, because it was the only thing that
 * had moved out of `scripts/` (which had its own `tsconfig.json` with `composite: false`, so it never
 * emitted anywhere). Once `tools/repo-gates` existed with the same composite template, a `.js` planted
 * there was invisible to both this guard and to `.gitignore`'s ignore patterns — strictly worse than
 * `scripts/` was. The invariant this function and `.gitignore`'s compiled-artifact block must both
 * satisfy: every directory whose compiled artifacts are gitignored is in this scan.
 */
export function presentToolingFiles(): string[] {
	const toolsRoot = path.join(REPO_ROOT, "tools");
	const pathspecs = readdirSync(toolsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `tools/${entry.name}/src`)
		.filter((relative) => existsSync(path.join(REPO_ROOT, relative)));
	// Tested BEFORE the two in-package homes are appended below — appending first would make
	// pathspecs.length >= 2 always, so the scan going to zero (a tools/ root rename, a
	// restructure moving sources out of src/, any future tools/ layout change) would silently
	// narrow the census to just the two core-ui directories and report every tooling package
	// clean, forever. CLAUDE.md's monorepo rule: hard-fail when a scan finds nothing.
	if (pathspecs.length === 0) {
		throw new Error("presentToolingFiles: scanned zero source directories under tools/");
	}
	pathspecs.push("layers/core-ui/__scripts__", "layers/core-ui/__e2e__");
	const raw = execFileSync("git", ["ls-files", "-z", "--others", "--cached", ...pathspecs], {
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
 * It is not hypothetical: it bit AU28. A repo-wide file-count floor was recomputed against a census
 * missing four not-yet-staged rule files, the run was green, and the commit that followed was red —
 * the floor's slack had gone out of band the moment those files became tracked. The reviewer had
 * already named this exact divergence; the fix was not applied, and then it happened. That floor is
 * gone now (see the note above `declaredFloors`), but the staged/unstaged divergence it exposed is
 * real for every rule, which is why this reads the working tree and not just the index.
 *
 * The cost is that a scratch file you never intend to commit is now linted. That is the correct
 * trade: if it is in the working tree and not gitignored, committing it is one `git add -A` away,
 * and the answer to "I do not want this linted" is to gitignore it — which is also the answer to
 * "I do not want this committed".
 */
export function trackedFiles(): string[] {
	const raw = execFileSync(
		"git",
		["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
		{
			cwd: REPO_ROOT,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		},
	);
	// `--cached --others` can list a path twice when it is both staged and present on disk.
	return [...new Set(raw.split("\0").filter((p) => p !== ""))];
}

export const loadArchitecture = (): LoadedArchitecture =>
	readJson<LoadedArchitecture>("tools/governance/architecture.json");
export const loadTableOwners = (): TableOwners =>
	readJson<TableOwners>("tools/governance/table-owners.json");
export const loadMisplacedFiles = (): MisplacedFiles =>
	readJson<MisplacedFiles>("tools/governance/misplaced-files.json");

export function buildLiveCensus(
	architecture: LoadedArchitecture,
	files: readonly string[],
): Census {
	return buildCensus({
		files,
		readFile: readRepoFile,
		roleRules: architecture.roles.byWorkspacePattern,
	});
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
