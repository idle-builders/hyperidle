import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildPackageGraph,
	fileToPackage,
	getImpactedVitestProjects,
	getTransitiveDependents,
	isForceFullFile,
	shouldRunTool,
	formatSkipMessage,
	type ImpactAnalysis,
} from "../lib/package-impact.js";

// ---------------------------------------------------------------------------
// Fixtures: minimal workspace with known dependency structure
// ---------------------------------------------------------------------------

let fixtureDir: string;

function writePkgJson(
	dir: string,
	name: string,
	deps: Record<string, string> = {},
	devDeps: Record<string, string> = {},
): void {
	const pkgDir = join(dir, "packages", name);
	mkdirSync(pkgDir, { recursive: true });
	writeFileSync(
		join(pkgDir, "package.json"),
		JSON.stringify({
			name: `@hyperidle/${name}`,
			dependencies: deps,
			devDependencies: devDeps,
		}),
	);
}

beforeEach(() => {
	fixtureDir = join(tmpdir(), `pkg-impact-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(fixtureDir, "packages"), { recursive: true });

	// Build a realistic mini-graph:
	//   shared → (no deps)
	//   db → shared
	//   fabric → db, shared
	//   server → db, fabric, shared
	//   web → server, shared, design-system
	//   design-system → shared
	//   desktop → server, shared
	writePkgJson(fixtureDir, "shared");
	writePkgJson(fixtureDir, "db", { "@hyperidle/shared": "*" });
	writePkgJson(fixtureDir, "fabric", {
		"@hyperidle/db": "*",
		"@hyperidle/shared": "*",
	});
	writePkgJson(fixtureDir, "server", {
		"@hyperidle/db": "*",
		"@hyperidle/fabric": "*",
		"@hyperidle/shared": "*",
	});
	writePkgJson(fixtureDir, "design-system", { "@hyperidle/shared": "*" });
	writePkgJson(fixtureDir, "web", {
		"@hyperidle/server": "*",
		"@hyperidle/shared": "*",
		"@hyperidle/design-system": "*",
	});
	writePkgJson(fixtureDir, "desktop", {
		"@hyperidle/server": "*",
		"@hyperidle/shared": "*",
	});
});

afterEach(() => {
	rmSync(fixtureDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// buildPackageGraph
// ---------------------------------------------------------------------------

describe("buildPackageGraph", () => {
	it("discovers all packages", () => {
		const graph = buildPackageGraph(fixtureDir);
		expect(graph.allPackages).toEqual(
			new Set(["shared", "db", "fabric", "server", "design-system", "web", "desktop"]),
		);
	});

	it("builds correct forward dependencies", () => {
		const graph = buildPackageGraph(fixtureDir);
		expect(graph.dependencies.get("shared")).toEqual(new Set());
		expect(graph.dependencies.get("db")).toEqual(new Set(["shared"]));
		expect(graph.dependencies.get("server")).toEqual(new Set(["db", "fabric", "shared"]));
		expect(graph.dependencies.get("web")).toEqual(
			new Set(["server", "shared", "design-system"]),
		);
	});

	it("builds correct reverse dependents", () => {
		const graph = buildPackageGraph(fixtureDir);
		expect(graph.dependents.get("shared")).toEqual(
			new Set(["db", "fabric", "server", "design-system", "web", "desktop"]),
		);
		expect(graph.dependents.get("db")).toEqual(new Set(["fabric", "server"]));
		expect(graph.dependents.get("fabric")).toEqual(new Set(["server"]));
	});

	it("includes devDependencies in the graph", () => {
		writePkgJson(fixtureDir, "tools", {}, { "@hyperidle/shared": "*" });
		const graph = buildPackageGraph(fixtureDir);
		expect(graph.dependencies.get("tools")).toEqual(new Set(["shared"]));
		expect(graph.dependents.get("shared")!.has("tools")).toBe(true);
	});

	it("ignores non-hyperidle dependencies", () => {
		const graph = buildPackageGraph(fixtureDir);
		// db depends on drizzle-orm in the real world, but we only track @hyperidle/*
		expect(graph.dependencies.get("db")).toEqual(new Set(["shared"]));
	});

	it("skips directories without package.json", () => {
		mkdirSync(join(fixtureDir, "packages", "no-pkg-json"), { recursive: true });
		const graph = buildPackageGraph(fixtureDir);
		expect(graph.allPackages.has("no-pkg-json")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getTransitiveDependents
// ---------------------------------------------------------------------------

describe("getTransitiveDependents", () => {
	it("returns empty set for leaf package", () => {
		const graph = buildPackageGraph(fixtureDir);
		expect(getTransitiveDependents("web", graph)).toEqual(new Set());
	});

	it("returns direct dependents", () => {
		const graph = buildPackageGraph(fixtureDir);
		const deps = getTransitiveDependents("design-system", graph);
		expect(deps.has("web")).toBe(true);
	});

	it("returns transitive dependents through chain", () => {
		const graph = buildPackageGraph(fixtureDir);
		// shared → db → fabric → server → web, desktop
		const deps = getTransitiveDependents("shared", graph);
		expect(deps).toEqual(
			new Set(["db", "fabric", "server", "design-system", "web", "desktop"]),
		);
	});

	it("handles diamond dependencies (db → server, db → fabric → server)", () => {
		const graph = buildPackageGraph(fixtureDir);
		const deps = getTransitiveDependents("db", graph);
		expect(deps.has("fabric")).toBe(true);
		expect(deps.has("server")).toBe(true);
		expect(deps.has("web")).toBe(true);
		expect(deps.has("desktop")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// fileToPackage
// ---------------------------------------------------------------------------

describe("fileToPackage", () => {
	it("extracts package name from path", () => {
		expect(fileToPackage("packages/web/src/App.tsx")).toBe("web");
		expect(fileToPackage("packages/server/src/routes/health.ts")).toBe("server");
	});

	it("returns null for non-package paths", () => {
		expect(fileToPackage("scripts/verify.ts")).toBeNull();
		expect(fileToPackage("tsconfig.json")).toBeNull();
		expect(fileToPackage(".github/workflows/ci.yml")).toBeNull();
	});

	it("returns null for too-short paths", () => {
		expect(fileToPackage("packages/")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// isForceFullFile
// ---------------------------------------------------------------------------

describe("isForceFullFile", () => {
	it("triggers on root config files", () => {
		expect(isForceFullFile("tsconfig.json")).toBe(true);
		expect(isForceFullFile("package.json")).toBe(true);
		expect(isForceFullFile("package-lock.json")).toBe(true);
		expect(isForceFullFile("vitest.config.ts")).toBe(true);
		expect(isForceFullFile("biome.json")).toBe(true);
	});

	it("triggers on scripts/ directory", () => {
		expect(isForceFullFile("scripts/verify.ts")).toBe(true);
		expect(isForceFullFile("scripts/lib/package-impact.ts")).toBe(true);
	});

	it("triggers on .github/ directory", () => {
		expect(isForceFullFile(".github/workflows/ci.yml")).toBe(true);
	});

	it("does not trigger on package files", () => {
		expect(isForceFullFile("packages/web/src/App.tsx")).toBe(false);
		expect(isForceFullFile("packages/server/package.json")).toBe(false);
	});

	it("does not trigger on docs", () => {
		expect(isForceFullFile("docs/architecture/index.md")).toBe(false);
		expect(isForceFullFile("CLAUDE.md")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// shouldRunTool
// ---------------------------------------------------------------------------

describe("shouldRunTool", () => {
	const makeImpact = (
		impacted: string[],
		forceFull = false,
	): ImpactAnalysis => ({
		changedPackages: new Set(impacted),
		impactedPackages: new Set(impacted),
		forceFull,
		forceFullFiles: [],
		changedRootFiles: [],
	});

	it("always runs phase-1 tools regardless of impact", () => {
		const impact = makeImpact([]);
		expect(shouldRunTool("check", impact)).toBe(true);
		expect(shouldRunTool("lint:biome", impact)).toBe(true);
		expect(shouldRunTool("lint:eslint", impact)).toBe(true);
		expect(shouldRunTool("knip", impact)).toBe(true);
		expect(shouldRunTool("test-coverage", impact)).toBe(true);
		expect(shouldRunTool("mock-inventory", impact)).toBe(true);
	});

	it("skips build when web/shared not impacted", () => {
		const impact = makeImpact(["desktop"]);
		expect(shouldRunTool("build", impact)).toBe(false);
	});

	it("runs build when web is impacted", () => {
		const impact = makeImpact(["web"]);
		expect(shouldRunTool("build", impact)).toBe(true);
	});

	it("runs build when shared is impacted (transitive)", () => {
		const impact = makeImpact(["shared"]);
		expect(shouldRunTool("build", impact)).toBe(true);
	});

	it("skips build:desktop when only web changes", () => {
		const impact = makeImpact(["web"]);
		expect(shouldRunTool("build:desktop", impact)).toBe(false);
	});

	it("runs build:desktop when desktop is impacted", () => {
		const impact = makeImpact(["desktop"]);
		expect(shouldRunTool("build:desktop", impact)).toBe(true);
	});

	it("skips server:load when only web changes", () => {
		const impact = makeImpact(["web", "design-system"]);
		expect(shouldRunTool("server:load", impact)).toBe(false);
	});

	it("runs server:load when server is impacted", () => {
		const impact = makeImpact(["server"]);
		expect(shouldRunTool("server:load", impact)).toBe(true);
	});

	it("runs all tools when forceFull is true", () => {
		const impact = makeImpact([], true);
		expect(shouldRunTool("build", impact)).toBe(true);
		expect(shouldRunTool("build:desktop", impact)).toBe(true);
		expect(shouldRunTool("server:load", impact)).toBe(true);
		expect(shouldRunTool("e2e", impact)).toBe(true);
	});

	it("runs unknown tools (no trigger mapping)", () => {
		const impact = makeImpact([]);
		expect(shouldRunTool("unknown-tool", impact)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getImpactedVitestProjects
// ---------------------------------------------------------------------------

describe("getImpactedVitestProjects", () => {
	const makeImpact = (
		impacted: string[],
		forceFull = false,
	): ImpactAnalysis => ({
		changedPackages: new Set(impacted),
		impactedPackages: new Set(impacted),
		forceFull,
		forceFullFiles: [],
		changedRootFiles: [],
	});

	it("returns null on forceFull (run all projects)", () => {
		const impact = makeImpact(["web"], true);
		expect(getImpactedVitestProjects(impact)).toBeNull();
	});

	it("returns null when no packages impacted", () => {
		const impact = makeImpact([]);
		expect(getImpactedVitestProjects(impact)).toBeNull();
	});

	it("maps impacted packages to vitest project paths", () => {
		const impact = makeImpact(["web", "server"]);
		const projects = getImpactedVitestProjects(impact);
		expect(projects).toEqual(
			expect.arrayContaining(["packages/web", "packages/server"]),
		);
		expect(projects).toHaveLength(2);
	});

	it("ignores packages without vitest projects", () => {
		const impact = makeImpact(["nonexistent"]);
		const projects = getImpactedVitestProjects(impact);
		expect(projects).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// formatSkipMessage
// ---------------------------------------------------------------------------

describe("formatSkipMessage", () => {
	it("lists the unimpacted trigger packages", () => {
		const impact: ImpactAnalysis = {
			changedPackages: new Set(["desktop"]),
			impactedPackages: new Set(["desktop"]),
			forceFull: false,
			forceFullFiles: [],
			changedRootFiles: [],
		};
		const msg = formatSkipMessage("build", impact);
		expect(msg).toContain("[smart] skipping build");
		expect(msg).toContain("web");
		expect(msg).toContain("shared");
	});

	it("returns empty string for always-run tools", () => {
		const impact: ImpactAnalysis = {
			changedPackages: new Set(),
			impactedPackages: new Set(),
			forceFull: false,
			forceFullFiles: [],
			changedRootFiles: [],
		};
		expect(formatSkipMessage("check", impact)).toBe("");
	});
});

// ---------------------------------------------------------------------------
// Integration: buildPackageGraph against real workspace
// ---------------------------------------------------------------------------

describe("real workspace graph", () => {
	it("builds a graph from the actual workspace", () => {
		const graph = buildPackageGraph(process.cwd());
		expect(graph.allPackages.has("web")).toBe(true);
		expect(graph.allPackages.has("server")).toBe(true);
		expect(graph.allPackages.has("shared")).toBe(true);
		expect(graph.allPackages.has("db")).toBe(true);

		// shared should have dependents (everything depends on it)
		expect(graph.dependents.get("shared")!.size).toBeGreaterThan(0);

		// web depends on server, shared, design-system
		const webDeps = graph.dependencies.get("web")!;
		expect(webDeps.has("server")).toBe(true);
		expect(webDeps.has("shared")).toBe(true);
		expect(webDeps.has("design-system")).toBe(true);
	});

	it("transitive dependents of shared includes everything", () => {
		const graph = buildPackageGraph(process.cwd());
		const deps = getTransitiveDependents("shared", graph);
		expect(deps.has("web")).toBe(true);
		expect(deps.has("server")).toBe(true);
		expect(deps.has("db")).toBe(true);
	});
});
