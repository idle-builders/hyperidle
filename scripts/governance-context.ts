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
import type { Architecture } from "./lib/governance-model.js";
import { buildCensus, type Census, type WorkspaceRoleRule } from "./lib/repo-census.js";
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
 */
export const MIN_TRACKED_FILES = 1000;

/**
 * Minimum crossings each detector must find, MEASURED against the live tree and set below it with
 * headroom for ordinary churn.
 *
 * @lore AU28: this is the direct `au6` fix, one level up from where it was applied — `au6` scanned a
 * deleted directory and printed PASS over zero files for months. A floor is never lowered to make a
 * run go green: a drop means the detector broke, not that the repo got cleaner.
 */
export const DETECTOR_FLOORS: readonly DetectorFloor[] = [
	{ kind: "import", min: 3300 },
	{ kind: "manifest", min: 100 },
];

/**
 * The files the repo actually consists of.
 *
 * @lore AU28: `git ls-files`, not a filesystem walk. A walk misses tracked files under build
 * directories unless it is hand-tuned, and picks up gitignored output that is not part of the
 * repository at all. Tracked-by-git is the only definition that cannot drift.
 */
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
			db: buildDbSurfaceIndex(architecture.databasePackage, readRepoFile),
			tableOwners: readJson<TableOwners>("governance/table-owners.json"),
			frameworkSurfaces: frameworkSurfacesOf(architecture, census),
		},
		DETECTOR_FLOORS,
	);
}
