/**
 * AU28 — turning the repo into crossings the model can judge.
 *
 * The model (`governance-model.ts`) decides `(source, target, kind)`. This module is what produces
 * those triples from the census. It is the measurement layer; the model is the decision layer.
 *
 * @lore AU28: the split matters because the two rot differently. A decision rots loudly — a founder
 * notices a wrong verdict. A measurement rots silently: the retired `au6` guard scanned a directory
 * deleted two tracks earlier and printed PASS over zero files for months. So every detector here
 * declares a floor, and a detector below its floor fails the build rather than reporting nothing.
 *
 * @lore AU28: a detector that under-detects is INVISIBLE to any internal consistency check — a
 * crossing never emitted cannot unbalance anything. Positive fixtures only prove a detector finds
 * what it was written to find. Every detector therefore also carries negative controls in
 * `governance-fixtures.ts`: a near-miss that must NOT be detected.
 */

import { buildCompanionGroups, buildWriteSets, detectAstCrossings } from "./crossing-detectors.js";
import type { DbSurfaceIndex } from "./db-surfaces.js";
import type { Actor, Crossing, Kind, Target } from "./governance-model.js";
import type { TableOwners } from "./governance-registry.js";
import { ownerOf } from "./governance-registry.js";
import type { Census, WorkspacePackage } from "./repo-census.js";

/** One crossing found in the repo, with the place it was found. */
export interface DetectedCrossing {
	readonly crossing: Crossing;
	/** Repo-relative path of the file (or manifest) the crossing was found in. */
	readonly file: string;
	readonly line: number;
	/** `production` or `development`, taken from the file that performs the crossing. */
	readonly world: "production" | "development";
	/** Short human-readable description of what was found, for the finding message. */
	readonly detail: string;
}

export interface DetectorFloor {
	readonly kind: Kind;
	readonly min: number;
}

export interface CrossingsInput {
	readonly census: Census;
	/** Injected, like everywhere else in this library — the AST detectors need file contents. */
	readonly readFile: (path: string) => string;
	/** The layer that hosts the MCP router. */
	readonly mcpRouterHost: string;
	/** Module declaring every event the bus can carry. */
	readonly eventTypesModule: string;
	readonly db: DbSurfaceIndex;
	readonly tableOwners: TableOwners;
	/** Framework package name → the surface label it is named by, e.g. `shared` → `framework/shared`. */
	readonly frameworkSurfaces: ReadonlyMap<string, string>;
}

export interface CrossingsResult {
	readonly crossings: readonly DetectedCrossing[];
	/** Instances found per kind, for the floors. */
	readonly countsByKind: ReadonlyMap<Kind, number>;
	/** Database symbols that could not be placed. Reported, never absorbed. */
	readonly unplacedDbSymbols: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Locating a file
// ---------------------------------------------------------------------------------------------

/** Index from a file path to the package that owns it, longest directory first. */
export function buildPackageLocator(packages: readonly WorkspacePackage[]): (file: string) => WorkspacePackage | undefined {
	const sorted = [...packages].sort((a, b) => b.dir.length - a.dir.length);
	return (file: string) => sorted.find((p) => file === p.dir || file.startsWith(`${p.dir}/`));
}

/** The actor performing a crossing from this file. A file in no package acts as the repo root. */
const actorFor = (pkg: WorkspacePackage | undefined): Actor =>
	pkg === undefined ? { sort: "repo-root" } : { sort: "package", name: pkg.name, role: pkg.role, layer: pkg.layer };

const targetForPackage = (pkg: WorkspacePackage): Target => ({
	sort: "package",
	name: pkg.name,
	role: pkg.role,
	layer: pkg.layer,
});

// ---------------------------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------------------------

/**
 * `import` — every resolved edge between two files, classified by what the target actually is.
 *
 * An edge into the database package is split per SYMBOL: one statement naming a row type and a table
 * is two crossings, because it is two different acts.
 */
function detectImports(input: CrossingsInput, locate: (f: string) => WorkspacePackage | undefined): DetectedCrossing[] {
	const { census, db, tableOwners, frameworkSurfaces } = input;
	const out: DetectedCrossing[] = [];

	for (const edge of census.edges) {
		const fromRecord = census.byPath.get(edge.from);
		if (fromRecord === undefined) continue;
		const fromPkg = locate(edge.from);
		const toPkg = locate(edge.to);

		// Inside one package is not a boundary crossing.
		if (fromPkg !== undefined && toPkg !== undefined && fromPkg.dir === toPkg.dir) continue;
		// A file outside every package naming another such file is not a crossing either.
		if (fromPkg === undefined && toPkg === undefined) continue;

		const source = actorFor(fromPkg);
		const world = fromRecord.kind;
		const toRecord = census.byPath.get(edge.to);
		const push = (target: Target, detail: string): void => {
			out.push({ crossing: { kind: "import", source, target }, file: edge.from, line: edge.line, world, detail });
		};

		// A production file naming a development file is its own rule, whatever package it is in.
		if (toRecord !== undefined && toRecord.kind === "development" && world === "production") {
			push({ sort: "development-file" }, `imports the development file ${edge.to}`);
			continue;
		}

		if (toPkg === undefined) {
			push({ sort: "repo-root" }, `imports ${edge.to}, which is outside every package`);
			continue;
		}

		// The database package: split per symbol.
		if (toPkg.name === "db") {
			const symbols = edge.namespace || edge.symbols.length === 0 ? [""] : edge.symbols;
			for (const symbol of symbols) {
				const resolved = db.resolve(edge.to, symbol, edge.namespace || symbol === "");
				if (resolved.surface === "db:table") {
					const table = resolved.table ?? symbol;
					push(
						{ sort: "table", table, owner: ownerOf(tableOwners, table) },
						`imports the table symbol \`${table}\` from ${edge.specifier}`,
					);
				} else {
					push(
						{ sort: "surface", surface: resolved.surface },
						`imports ${symbol === "" ? "the whole module" : `\`${symbol}\``} from ${edge.specifier} (${resolved.surface})`,
					);
				}
			}
			continue;
		}

		// Another framework package is named by its surface, not as a package.
		const surface = frameworkSurfaces.get(toPkg.name);
		if (surface !== undefined) {
			push({ sort: "surface", surface }, `imports ${edge.specifier}`);
			continue;
		}

		push(targetForPackage(toPkg), `imports ${edge.specifier}`);
	}

	return out;
}

/**
 * `manifest` — every workspace dependency a package declares.
 *
 * @lore AU28: the dependency BLOCK decides the world, not the file the manifest sits in. A
 * `package.json` under `layers/` is a production file, so before this rule every `devDependencies`
 * row counted as a production crossing — 28 rows, 25 of them landing on a rule production forbids,
 * every one of them serving a test. Attributing them correctly is a census-correctness fix, not a
 * migration, and it removes the last production→tooling breach on its own.
 */
function detectManifests(input: CrossingsInput): DetectedCrossing[] {
	const { census, frameworkSurfaces } = input;
	const out: DetectedCrossing[] = [];
	const byScopedName = new Map(census.packages.map((p) => [p.scopedName, p]));

	for (const pkg of census.packages) {
		const manifestPath = `${pkg.dir}/package.json`;
		// A wholly-development package has no production rows at all — every dependency it declares
		// serves development, whichever block it sits in. Only a package that ships can have the
		// two blocks mean two different worlds.
		const shipping = census.byPath.get(manifestPath)?.kind === "production";
		const blocks = [
			{ deps: pkg.dependencies, world: shipping ? ("production" as const) : ("development" as const), label: "dependencies" },
			{ deps: pkg.devDependencies, world: "development" as const, label: "devDependencies" },
		];

		for (const block of blocks) {
			for (const declared of block.deps) {
				const target = byScopedName.get(declared);
				if (target === undefined) continue; // an external dependency is not a boundary crossing
				if (target.dir === pkg.dir) continue;

				const surface = target.name === "db" ? "framework/db" : frameworkSurfaces.get(target.name);
				out.push({
					crossing: {
						kind: "manifest",
						source: actorFor(pkg),
						target: surface === undefined ? targetForPackage(target) : { sort: "surface", surface },
					},
					file: manifestPath,
					line: 1,
					world: block.world,
					detail: `declares ${declared} in ${block.label}`,
				});
			}
		}
	}

	return out;
}

/**
 * Run every detector.
 *
 * @throws when a detector finds fewer crossings than its floor. A detector that finds nothing is the
 * `au6` failure mode and must never read as a clean result.
 */
export function detectCrossings(input: CrossingsInput, floors: readonly DetectorFloor[]): CrossingsResult {
	const locate = buildPackageLocator(input.census.packages);
	const crossings = [
		...detectImports(input, locate),
		...detectManifests(input),
		...detectAstCrossings({
			census: input.census,
			readFile: input.readFile,
			locate,
			tables: input.db.tables,
			ownerOf: (table) => ownerOf(input.tableOwners, table),
			mcpRouterHost: input.mcpRouterHost,
			eventTypesModule: input.eventTypesModule,
			companions: buildCompanionGroups(
				{ census: input.census, readFile: input.readFile, locate, tables: input.db.tables },
				(table) => ownerOf(input.tableOwners, table),
			),
			writeSetOf: buildWriteSets({ census: input.census, readFile: input.readFile, tables: input.db.tables }),
		}),
	];

	const countsByKind = new Map<Kind, number>();
	for (const found of crossings) {
		countsByKind.set(found.crossing.kind, (countsByKind.get(found.crossing.kind) ?? 0) + 1);
	}

	for (const floor of floors) {
		const found = countsByKind.get(floor.kind) ?? 0;
		if (found < floor.min) {
			throw new Error(
				`crossings: the "${floor.kind}" detector found ${found} crossing(s) but declares a floor of ${floor.min}. ` +
					"A detector that finds nothing reads as clean forever — fix the detector, never lower the floor to match.",
			);
		}
	}

	return { crossings, countsByKind, unplacedDbSymbols: input.db.unplaced };
}
