// Package-level impact analysis for smart verify gating.
// Derives the dependency graph from workspace package.json files at runtime,
// then computes which packages are transitively impacted by a git diff.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HYPERIDLE_SCOPE = "@hyperidle/";
const PACKAGES_DIR = "packages";

// Files outside packages/ that force a full verify when changed.
const FORCE_FULL_PATTERNS = [
	"tsconfig.json",
	"tsconfig.base.json",
	"vitest.config.ts",
	"package.json",
	"package-lock.json",
	"biome.json",
	"tailwind.config.ts",
	"postcss.config.js",
	".github/",
	"scripts/",
];

export interface PackageGraph {
	/** package dir name → set of package dir names it depends on */
	dependencies: Map<string, Set<string>>;
	/** package dir name → set of package dir names that depend on it */
	dependents: Map<string, Set<string>>;
	/** all known package dir names */
	allPackages: Set<string>;
}

export interface ImpactAnalysis {
	/** packages with direct file changes */
	changedPackages: Set<string>;
	/** changedPackages + all transitive dependents */
	impactedPackages: Set<string>;
	/** true when root configs/scripts changed — all tools must run */
	forceFull: boolean;
	/** changed files that triggered forceFull */
	forceFullFiles: string[];
	/** changed files outside any package and not in force-full patterns */
	changedRootFiles: string[];
}

export function buildPackageGraph(rootDir: string): PackageGraph {
	const packagesPath = join(rootDir, PACKAGES_DIR);
	const dirs = readdirSync(packagesPath, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	const allPackages = new Set<string>();
	const dependencies = new Map<string, Set<string>>();
	const dependents = new Map<string, Set<string>>();

	const npmNameToDir = new Map<string, string>();

	for (const dir of dirs) {
		const pkgJsonPath = join(packagesPath, dir, "package.json");
		if (!existsSync(pkgJsonPath)) continue;

		const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
		const name = pkgJson.name as string | undefined;
		if (!name) continue;

		allPackages.add(dir);
		npmNameToDir.set(name, dir);
		dependencies.set(dir, new Set());
		dependents.set(dir, new Set());
	}

	for (const dir of allPackages) {
		const pkgJsonPath = join(packagesPath, dir, "package.json");
		const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

		const allDeps: Record<string, string> = {
			...(pkgJson.dependencies ?? {}),
			...(pkgJson.devDependencies ?? {}),
		};

		for (const depName of Object.keys(allDeps)) {
			if (!depName.startsWith(HYPERIDLE_SCOPE)) continue;
			const depDir = npmNameToDir.get(depName);
			if (!depDir) continue;

			dependencies.get(dir)!.add(depDir);
			if (!dependents.has(depDir)) dependents.set(depDir, new Set());
			dependents.get(depDir)!.add(dir);
		}
	}

	return { dependencies, dependents, allPackages };
}

export function getTransitiveDependents(
	pkg: string,
	graph: PackageGraph,
): Set<string> {
	const result = new Set<string>();
	const queue = [pkg];

	while (queue.length > 0) {
		const current = queue.pop()!;
		const deps = graph.dependents.get(current);
		if (!deps) continue;
		for (const dep of deps) {
			if (!result.has(dep)) {
				result.add(dep);
				queue.push(dep);
			}
		}
	}

	return result;
}

export function getChangedFiles(base: string): string[] | null {
	try {
		const output = execSync(`git diff --name-only ${base}`, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		if (!output) return [];
		return output.split("\n").filter(Boolean);
	} catch {
		return null;
	}
}

export function fileToPackage(filePath: string): string | null {
	if (!filePath.startsWith(`${PACKAGES_DIR}/`)) return null;
	const parts = filePath.split("/");
	if (parts.length < 2 || !parts[1]) return null;
	return parts[1];
}

export function isForceFullFile(filePath: string): boolean {
	return FORCE_FULL_PATTERNS.some(
		(pattern) =>
			filePath === pattern || filePath.startsWith(pattern),
	);
}

export function analyzeImpact(
	rootDir: string,
	base: string,
): ImpactAnalysis {
	const graph = buildPackageGraph(rootDir);
	const changedFiles = getChangedFiles(base);

	// Unreachable base (e.g. no origin/main) — force full to be safe.
	if (changedFiles === null) {
		return {
			changedPackages: new Set(),
			impactedPackages: new Set(),
			forceFull: true,
			forceFullFiles: ["(unreachable base)"],
			changedRootFiles: [],
		};
	}

	const changedPackages = new Set<string>();
	const forceFullFiles: string[] = [];
	const changedRootFiles: string[] = [];

	for (const file of changedFiles) {
		if (isForceFullFile(file)) {
			forceFullFiles.push(file);
			continue;
		}

		const pkg = fileToPackage(file);
		if (pkg && graph.allPackages.has(pkg)) {
			changedPackages.add(pkg);
		} else if (!pkg) {
			changedRootFiles.push(file);
		}
	}

	const forceFull = forceFullFiles.length > 0;

	const impactedPackages = new Set(changedPackages);
	for (const pkg of changedPackages) {
		for (const dep of getTransitiveDependents(pkg, graph)) {
			impactedPackages.add(dep);
		}
	}

	return {
		changedPackages,
		impactedPackages,
		forceFull,
		forceFullFiles,
		changedRootFiles,
	};
}

// Tool → which packages must be impacted for this tool to run.
// "always" means the tool runs regardless (cheap enough to never skip).
export type ToolTrigger = "always" | string[];

export const TOOL_TRIGGERS: Record<string, ToolTrigger> = {
	check: "always",
	"lint:biome": "always",
	"lint:eslint": "always",
	knip: "always",
	"test-coverage": "always",
	"mock-inventory": "always",
	test: "always",
	build: ["web", "shared", "design-system", "api-contract", "fabric"],
	"build:desktop": ["desktop", "shared", "server", "db"],
	"server:load": ["server", "db", "shared", "fabric"],
	e2e: ["web", "server", "db", "shared", "design-system", "api-contract", "fabric"],
};

export function shouldRunTool(
	toolName: string,
	impact: ImpactAnalysis,
): boolean {
	if (impact.forceFull) return true;

	const trigger = TOOL_TRIGGERS[toolName];
	if (!trigger || trigger === "always") return true;

	return trigger.some((pkg) => impact.impactedPackages.has(pkg));
}

// Vitest project names (matching test.name in each package's vitest.config.ts)
// that correspond to package dirs.
// @lore: --project flag matches test.name, not the path. Values here must match
// the `test.name` field in each package's vitest.config.ts exactly.
const VITEST_PROJECT_PACKAGES: Record<string, string> = {
	"api-contract": "api-contract",
	db: "db",
	desktop: "desktop",
	server: "server",
	fabric: "fabric",
	shared: "shared",
	web: "web",
	"design-system": "design-system",
	"eslint-plugin-design": "eslint-plugin-design",
	pipeline: "pipeline",
};

export function getImpactedVitestProjects(
	impact: ImpactAnalysis,
): string[] | null {
	if (impact.forceFull) return null;
	if (impact.impactedPackages.size === 0) return null;

	const projects: string[] = [];
	for (const pkg of impact.impactedPackages) {
		const projectPath = VITEST_PROJECT_PACKAGES[pkg];
		if (projectPath) projects.push(projectPath);
	}

	if (projects.length === 0) return null;
	return projects;
}

export function formatSkipMessage(
	toolName: string,
	impact: ImpactAnalysis,
): string {
	const trigger = TOOL_TRIGGERS[toolName];
	if (!trigger || trigger === "always") return "";
	const triggerPkgs = trigger as string[];
	const missing = triggerPkgs.filter(
		(p) => !impact.impactedPackages.has(p),
	);
	return `[smart] skipping ${toolName} — no changes in: ${missing.join(", ")}`;
}
