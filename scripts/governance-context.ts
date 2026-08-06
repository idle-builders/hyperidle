/**
 * AU28 — loading the live repo for the governance CLIs.
 *
 * The one place that touches the filesystem and git. `scripts/lib/**` takes its inputs injected and
 * `scripts/rules/**` is banned by ESLint from importing `node:fs`, `node:child_process` or any glob
 * package — that is what makes "one census, many rules, no rule does its own discovery" mechanical
 * rather than a house style.
 *
 * @lore AU28: this module exists because BOTH `governance-lint.ts` and `governance-baseline.ts` need
 * the same live inputs. Having the baseline generator import the lint made importing the lint *run*
 * it — a CLI whose module load has side effects cannot be composed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Baseline } from "./lib/crossing-report.js";
import { type CrossingsResult, type DetectorFloor, detectCrossings } from "./lib/crossings.js";
import { buildDbSurfaceIndex, type DatabasePackageConfig } from "./lib/db-surfaces.js";
import type { Architecture, Kind } from "./lib/governance-model.js";
import type { FloorRecord } from "./rules/floors-tight.js";
import { buildCensus, type Census, CLASSIFICATION_PATTERNS, type WorkspaceRoleRule } from "./lib/repo-census.js";
import type { TableOwners } from "./lib/governance-registry.js";

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
 * Live 3,296. Held inside the `floors-tight` band, which is why this is 2,636 and not the 1,000 it
 * sat at: a floor with 70% slack cannot fail until two thirds of the repository has disappeared.
 */
export const MIN_TRACKED_FILES = 2636;

/**
 * Minimum crossings each detector must find, MEASURED against the live tree and set inside the
 * `floors-tight` band — close enough to fail on a real loss, loose enough to survive churn.
 *
 * @lore AU28: this is the direct `au6` fix, one level up from where it was applied — `au6` scanned a
 * deleted directory and printed PASS over zero files for months. A floor is never lowered to make a
 * run go green: a drop means the detector broke, not that the repo got cleaner.
 *
 * @lore AU28: RECOMPUTE these whenever the tree moves under them, and do it in the same commit —
 * `npm run governance:floors` prints the live count, the slack, the allowed slack and the value to
 * write for every floor in the build. A stale floor is not a harmless leftover: it still passes, so
 * nobody notices it has stopped measuring anything, which is exactly how `di` sat at 200 against a
 * live 245 while twelve crossings went missing.
 *
 * Measured live at the commit that recomputed them:
 *   import 3665 · manifest 124 · di 245 · api 140 · mcp 25 · event 240 · capability 10 ·
 *   table:read 1324 · table:write 2317   (3,296 tracked files, 789 production, 2,507 development)
 *
 * `di` was recorded as 257 here and had fallen to 245. ATTRIBUTED, not assumed: all twelve missing
 * crossings came from `framework/db/src/__tests__/AK6-factory-roster.integration.test.ts`, deleted
 * by this branch's own strategy purge along with the `roster?` parameter it exercised. Real code
 * deletion, not a detector regression — verified by counting `di` at 874a6c27 (257, every one of the
 * twelve present) and diffing the crossing set against live.
 */
export const DETECTOR_FLOORS: readonly DetectorFloor[] = [
	{ kind: "import", min: 3300, floorKind: "magnitude" },
	{ kind: "manifest", min: 110, floorKind: "magnitude" },
	{ kind: "di", min: 200, floorKind: "magnitude" },
	{ kind: "api", min: 112, floorKind: "magnitude" },
	{ kind: "mcp", min: 20, floorKind: "magnitude" },
	{ kind: "event", min: 192, floorKind: "magnitude" },
	// The thinnest detector in the set, and the one most able to lose half its coverage without
	// tripping. Treat it as a tripwire, not a boundary — the band's `max(…, 5)` term is what keeps
	// this at 8 rather than demanding a number two sites of churn away from failing.
	{ kind: "capability", min: 8, floorKind: "magnitude" },
	{ kind: "table:read", min: 1059, floorKind: "magnitude" },
	{ kind: "table:write", min: 1853, floorKind: "magnitude" },
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

export function trackedFiles(): string[] {
	const raw = execFileSync("git", ["ls-files", "-z"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return raw.split("\0").filter((p) => p !== "");
}

export const loadArchitecture = (): LoadedArchitecture => readJson<LoadedArchitecture>("governance/architecture.json");
export const loadBaseline = (): Baseline => readJson<Baseline>("governance/baseline.json");
export const loadTableOwners = (): TableOwners => readJson<TableOwners>("governance/table-owners.json");

export function buildLiveCensus(architecture: LoadedArchitecture, files: readonly string[]): Census {
	return buildCensus({ files, readFile: readRepoFile, roleRules: architecture.roles.byWorkspacePattern });
}

/** Framework package name → the surface label it is named by. Derived from the packages that exist. */
function frameworkSurfacesOf(architecture: Architecture, census: Census): Map<string, string> {
	const out = new Map<string, string>();
	for (const pkg of census.packages) {
		if (pkg.role !== "framework") continue;
		const label = `framework/${pkg.name}`;
		if (label in architecture.surfaces) out.set(pkg.name, label);
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
			frameworkSurfaces: frameworkSurfacesOf(architecture, census),
		},
		DETECTOR_FLOORS,
	);
}
