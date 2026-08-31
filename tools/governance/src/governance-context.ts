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

import { type CrossingsResult, type DetectorKind, detectCrossings } from "./lib/crossings.js";
import { buildDbSurfaceIndex, type DatabasePackageConfig } from "./lib/db-surfaces.js";
import type { Architecture } from "./lib/governance-model.js";
import type { MisplacedFiles, TableOwners } from "./lib/governance-registry.js";
import { buildCensus, type Census, type WorkspaceRoleRule } from "./lib/repo-census.js";

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
 * cwd, a broken git invocation — so that no rule passes vacuously. But the detectors already catch
 * that, and harder: on an empty census every detector finds zero crossings and `detectCrossings`
 * throws immediately. The repo-wide count added no detection on top, while requiring re-measurement
 * every time the repository grew a fifth — a maintained number whose only effect was turning
 * ordinary growth red.
 *
 * What survives is the boolean the floor was standing in for: `governance-lint` refuses to report a
 * verdict over an EMPTY census. Empty is the real failure; any other count is architecture's job.
 */

/**
 * The crossing kinds the build expects a detector to find — one rule per kind.
 *
 * @lore BB1: this was `DETECTOR_FLOORS`, each kind carrying a hand-measured minimum re-set whenever
 * the tree moved ("Floor re-measured after AU44 B7+fd: live 1046, suggested 941"). Those magnitudes
 * are gone, along with the `floors-tight` band that policed them and the `governance:floors` command
 * that printed the next number to write. What remains is the enumeration and the zero check in
 * `detectCrossings`: a detector that finds NONE of its kind is broken and fails the build, which is
 * the `au6` defect the floors were built for. A detector finding fewer than last week is churn, and
 * a build that goes red on churn teaches people to edit the number rather than read the diff.
 */
export const CROSSING_KINDS: readonly DetectorKind[] = [
	{ kind: "import" },
	{ kind: "manifest" },
	{ kind: "di" },
	{ kind: "api" },
	{ kind: "mcp" },
	{ kind: "event" },
	{ kind: "capability" },
	{ kind: "table:read" },
	{ kind: "table:write" },
];

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
 * gone now, along with every other declared floor, but the staged/unstaged divergence it exposed is
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
		CROSSING_KINDS,
	);
}
