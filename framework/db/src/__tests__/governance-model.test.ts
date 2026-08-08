/**
 * AU28 — the compact architecture model reproduces every decided verdict.
 *
 * `governance/decided-rules.json` holds 124 verdicts the founder decided one at a time: every role
 * pair × crossing kind, with a separate answer for the production and development worlds. They are
 * the decision artifact. `scripts/lib/governance-model.ts` is fifteen clauses that must *derive* all
 * 248 answers (124 rows × 2 worlds).
 *
 * The row count moved once, by founder ruling: AU28 Ruling 14 collapsed `raw runtime` and `harness`
 * into one target, merging the two `harness-registry` capability rows that had the same verdict.
 *
 * That is the whole point of this file. Without it, a clause tuned to fix one crossing can silently
 * flip another, and the compact model quietly stops meaning what the founder decided.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	type Architecture,
	CLAUSES,
	type Crossing,
	decide,
	type Kind,
	type Role,
	type Target,
} from "../../../../scripts/lib/governance-model.js";
import {
	ownerOf,
	RegistryError,
	type TableOwners,
	validateArchitecture,
	validateTableOwners,
} from "../../../../scripts/lib/governance-registry.js";
import {
	readWorkspacePackages,
	type WorkspaceRoleRule,
} from "../../../../scripts/lib/repo-census.js";
import * as schema from "../schema.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));

const architecture = readJson("governance/architecture.json") as Architecture & {
	roles: { byWorkspacePattern: readonly WorkspaceRoleRule[] };
};

interface DecidedRow {
	readonly source: string;
	readonly target: string;
	readonly kind: Kind;
	readonly scope: "general" | "named";
	readonly production: "allowed" | "forbidden";
	readonly development: "allowed" | "forbidden";
	readonly instances: { readonly production: number; readonly development: number };
}
const decided = readJson("governance/decided-rules.json") as {
	totals: { rows: number; production: { allowed: number; forbidden: number } };
	rows: readonly DecidedRow[];
};

// -------------------------------------------------------------------------------------------
// Turning a decided row back into a concrete crossing
//
// A row names roles and relationships ("service (other layer)"); the model takes actual packages.
// This builds one representative crossing per row. The named packages below are the real ones the
// founder ruled on by name — core-ui, harness-registry, agent-execution.
// -------------------------------------------------------------------------------------------

const SOURCE_LAYER = "core-api";
const OTHER_LAYER = "agent-orchestration";

/** Named packages carry their real role and home layer; a bare role gets a stand-in package. */
function makeActor(name: string): Crossing["source"] {
	switch (name) {
		case "harness":
			return { sort: "harness" };
		case "repo root":
			return { sort: "repo-root" };
		case "core-ui":
			return { sort: "package", name: "core-ui", role: "layer" };
		case "agent-execution":
			return { sort: "package", name: "agent-execution", role: "layer" };
		case "harness-registry":
			return {
				sort: "package",
				name: "harness-registry",
				role: "service",
				layer: "agent-execution",
			};
		case "layer":
			return { sort: "package", name: SOURCE_LAYER, role: "layer" };
		case "service":
			return { sort: "package", name: "work", role: "service", layer: SOURCE_LAYER };
		default:
			return { sort: "package", name: `a-${name}`, role: name as Role };
	}
}

function makeTarget(label: string, source: Crossing["source"], kind: Kind): Target {
	// Layers that host an HTTP API are dialled by name.
	if (kind === "api") return { sort: "http-api", layer: label };

	switch (label) {
		case "development file":
			return { sort: "development-file" };
		case "EventBus":
			return { sort: "event-bus" };
		case "MCP router":
			return { sort: "mcp-router" };
		// Ruling 14: one act, one target. There is no separate `harness` target sort.
		case "raw runtime":
			return { sort: "raw-runtime" };
		case "repo root":
			return { sort: "repo-root" };

		case "db:table (own)": {
			const owner = source.sort === "package" ? source.name : "work";
			return { sort: "table", table: "bets", owner };
		}
		case "db:table (other)":
			return { sort: "table", table: "bets", owner: "some-other-service" };

		case "layer (own)": {
			const home = source.sort === "package" ? (source.layer ?? source.name) : SOURCE_LAYER;
			return { sort: "package", name: home, role: "layer" };
		}
		case "layer (other)":
			return { sort: "package", name: OTHER_LAYER, role: "layer" };
		case "service (same layer)": {
			const home = source.sort === "package" ? (source.layer ?? source.name) : SOURCE_LAYER;
			return { sort: "package", name: "review", role: "service", layer: home };
		}
		case "service (other layer)":
			return { sort: "package", name: "run-orchestration", role: "service", layer: OTHER_LAYER };

		// A bare role target: an unrelated package of that role.
		case "layer":
			return { sort: "package", name: OTHER_LAYER, role: "layer" };
		case "service":
			return { sort: "package", name: "run-orchestration", role: "service", layer: OTHER_LAYER };
		case "application":
			return { sort: "package", name: "another-application", role: "application" };
		case "tooling":
			return { sort: "package", name: "eval", role: "tooling" };
		case "framework":
			return { sort: "package", name: "shared", role: "framework" };

		default:
			// Everything else is a declared surface: framework/* and db:*.
			return { sort: "surface", surface: label };
	}
}

const crossingFor = (row: DecidedRow): Crossing => {
	const source = makeActor(row.source);
	return { kind: row.kind, source, target: makeTarget(row.target, source, row.kind) };
};

const label = (row: DecidedRow): string => `${row.source} → ${row.target} [${row.kind}]`;

// -------------------------------------------------------------------------------------------

describe("AU28 — the decided rule set is intact", () => {
	it("holds exactly the 124 decided rows with the decided totals", () => {
		expect(decided.rows).toHaveLength(124);
		expect(decided.totals.rows).toBe(124);
		const count = (world: "production" | "development", verdict: string): number =>
			decided.rows.filter((r) => r[world] === verdict).length;
		// These four numbers are the founder's decisions. A regeneration that moves any of them has
		// re-derived what was decided instead of reading it — that happened once and cost hours.
		expect(count("production", "allowed")).toBe(68);
		expect(count("production", "forbidden")).toBe(56);
		// Ruling 13 moved the two `db:table (other) [table:write]` rows from forbidden to allowed:
		// the flat rule is replaced by the companion clause, which no row can express.
		expect(count("development", "allowed")).toBe(114);
		expect(count("development", "forbidden")).toBe(10);
	});

	it("has no duplicate rows", () => {
		const keys = decided.rows.map((r) => `${r.source}|${r.target}|${r.kind}`);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe("AU28 — fifteen clauses derive all 248 decided verdicts", () => {
	// W-TEST-2: `expect(wrong).toEqual([])` over a `.filter()` passes vacuously when `rows` is empty
	// — a mis-parsed or emptied decided-rules.json would read as a total green. The counter is what
	// makes the loop assert that it RAN, and it is the reason the row count is stated twice.
	it("reproduces every production verdict", () => {
		let checked = 0;
		const wrong = decided.rows
			.filter((row) => {
				checked += 1;
				return decide(architecture, crossingFor(row), "production").verdict !== row.production;
			})
			.map((row) => {
				const got = decide(architecture, crossingFor(row), "production");
				return `${label(row)} — decided ${row.production}, model says ${got.verdict} via ${got.clause}`;
			});
		expect(wrong).toEqual([]);
		expect(checked, "the loop must actually iterate every decided row").toBe(124);
	});

	it("reproduces every development verdict", () => {
		let checked = 0;
		const wrong = decided.rows
			.filter((row) => {
				checked += 1;
				return decide(architecture, crossingFor(row), "development").verdict !== row.development;
			})
			.map((row) => {
				const got = decide(architecture, crossingFor(row), "development");
				return `${label(row)} — decided ${row.development}, model says ${got.verdict} via ${got.clause}`;
			});
		expect(wrong).toEqual([]);
		expect(checked, "the loop must actually iterate every decided row").toBe(124);
	});

	it("names a clause and a reason for every decision — no unexplained verdict", () => {
		for (const row of decided.rows) {
			for (const world of ["production", "development"] as const) {
				const d = decide(architecture, crossingFor(row), world);
				expect(d.clause, label(row)).toBeTruthy();
				expect(d.why.length, label(row)).toBeGreaterThan(10);
			}
		}
	});

	it("uses every clause it declares — a clause nothing reaches is dead", () => {
		const used = new Set<string>();
		for (const row of decided.rows) {
			for (const world of ["production", "development"] as const) {
				used.add(
					decide(architecture, crossingFor(row), world).clause.replace(" (held: one door)", ""),
				);
			}
		}
		// One clause cannot be reached from the decided rows: a row names a role pair and a kind, and
		// `write-the-whole-row-set` fires on a property of the individual write — which companion row
		// the writer left out. It is covered by its own scenario below.
		const beyondTheRows: Crossing = {
			kind: "table:write",
			source: { sort: "package", name: "review", role: "service", layer: "core-api" },
			target: { sort: "table", table: "teams", owner: "org", missingCompanions: ["teamMembers"] },
		};
		used.add(decide(architecture, beyondTheRows, "development").clause);

		expect([...CLAUSES].filter((c) => !used.has(c))).toEqual([]);
	});
});

describe("AU28 — the clauses hold beyond the decided rows", () => {
	const layerPkg = (name: string): Crossing["source"] => ({ sort: "package", name, role: "layer" });
	const servicePkg = (name: string, layer: string): Crossing["source"] => ({
		sort: "package",
		name,
		role: "service",
		layer,
	});

	it("dependency injection is legal only within one layer — Ruling 1", () => {
		const within = decide(
			architecture,
			{
				kind: "di",
				source: servicePkg("work", "core-api"),
				target: { sort: "package", name: "review", role: "service", layer: "core-api" },
			},
			"production",
		);
		const across = decide(
			architecture,
			{
				kind: "di",
				source: servicePkg("work", "core-api"),
				target: {
					sort: "package",
					name: "run-orchestration",
					role: "service",
					layer: "agent-orchestration",
				},
			},
			"production",
		);
		expect(within.verdict).toBe("allowed");
		expect(across.verdict).toBe("forbidden");
		// Both worlds: a test may wire across layers to stand the system up.
		expect(
			decide(
				architecture,
				{
					kind: "di",
					source: servicePkg("work", "core-api"),
					target: {
						sort: "package",
						name: "run-orchestration",
						role: "service",
						layer: "agent-orchestration",
					},
				},
				"development",
			).verdict,
		).toBe("allowed");
	});

	it("a composition root reaches a layer's public face but never inside it", () => {
		const app: Crossing["source"] = { sort: "package", name: "desktop", role: "application" };
		expect(
			decide(
				architecture,
				{
					kind: "import",
					source: app,
					target: { sort: "package", name: "core-api", role: "layer" },
				},
				"production",
			).verdict,
		).toBe("allowed");
		expect(
			decide(
				architecture,
				{
					kind: "import",
					source: app,
					target: { sort: "package", name: "work", role: "service", layer: "core-api" },
				},
				"production",
			).verdict,
		).toBe("forbidden");
	});

	it("a layer never reaches sideways, even to another layer's public face", () => {
		expect(
			decide(
				architecture,
				{
					kind: "import",
					source: layerPkg("core-api"),
					target: { sort: "package", name: "agent-orchestration", role: "layer" },
				},
				"production",
			).verdict,
		).toBe("forbidden");
	});

	it("an unowned table has no legal accessor at all", () => {
		const d = decide(
			architecture,
			{
				kind: "table:read",
				source: servicePkg("work", "core-api"),
				target: { sort: "table", table: "sessions", owner: null },
			},
			"production",
		);
		expect(d.verdict).toBe("forbidden");
		expect(d.why).toContain("no service owns");
	});

	it("lets a test write a foreign table, but not leave a companion row unwritten — Ruling 13", () => {
		const src = servicePkg("review", "core-api");
		const plain = { sort: "table", table: "bets", owner: "work" } as const;
		const orphaned = {
			sort: "table",
			table: "teams",
			owner: "org",
			missingCompanions: ["teamMembers"],
		} as const;

		expect(
			decide(architecture, { kind: "table:read", source: src, target: plain }, "development")
				.verdict,
		).toBe("allowed");
		// A plain foreign write is fine — the owner's writer adds nothing a direct insert misses.
		expect(
			decide(architecture, { kind: "table:write", source: src, target: plain }, "development")
				.verdict,
		).toBe("allowed");

		// Leaving the companion unwritten builds a state production cannot produce.
		const held = decide(
			architecture,
			{ kind: "table:write", source: src, target: orphaned },
			"development",
		);
		expect(held.verdict).toBe("forbidden");
		expect(held.clause).toBe("write-the-whole-row-set");
		expect(held.why).toContain("teamMembers");

		// Production is unchanged: the owner and nobody else.
		expect(
			decide(architecture, { kind: "table:write", source: src, target: plain }, "production")
				.verdict,
		).toBe("forbidden");
	});

	it("holds the one runtime door in production only — the door relaxes for development", () => {
		const outsider = servicePkg("work", "core-api");
		const owner = servicePkg("harness-registry", "agent-execution");
		const door = { sort: "raw-runtime" } as const;

		// Production: the door still has exactly one owner.
		expect(
			decide(architecture, { kind: "capability", source: outsider, target: door }, "production")
				.verdict,
		).toBe("forbidden");
		expect(
			decide(architecture, { kind: "capability", source: owner, target: door }, "production")
				.verdict,
		).toBe("allowed");

		// Development: calls being recorded, priced, replayed and provider-agnostic are properties
		// the shipped product must have, not development tooling — a development file may construct
		// a vendor SDK or spawn an agent CLI directly to build the world it needs.
		const outsiderDev = decide(
			architecture,
			{ kind: "capability", source: outsider, target: door },
			"development",
		);
		expect(outsiderDev.verdict).toBe("allowed");
		expect(outsiderDev.clause).toBe("development-may-arrange-the-world");
		expect(
			decide(architecture, { kind: "capability", source: owner, target: door }, "development")
				.verdict,
		).toBe("allowed");
	});

	it("an undeclared surface is forbidden rather than silently permitted", () => {
		const d = decide(
			architecture,
			{
				kind: "import",
				source: layerPkg("core-api"),
				target: { sort: "surface", surface: "db:brand-new-thing" },
			},
			"production",
		);
		expect(d.verdict).toBe("forbidden");
		expect(d.why).toContain("not a declared surface");
	});

	it("is total — every kind against every target sort returns a verdict", () => {
		const kinds: readonly Kind[] = [
			"import",
			"manifest",
			"di",
			"api",
			"mcp",
			"event",
			"table:read",
			"table:write",
			"capability",
		];
		const targets: readonly Target[] = [
			{ sort: "package", name: "other", role: "layer" },
			{ sort: "surface", surface: "framework/shared" },
			{ sort: "table", table: "bets", owner: "work" },
			{ sort: "http-api", layer: "core-api" },
			{ sort: "mcp-router" },
			{ sort: "event-bus" },
			{ sort: "raw-runtime" },
			{ sort: "development-file" },
			{ sort: "repo-root" },
		];
		for (const kind of kinds) {
			for (const target of targets) {
				for (const world of ["production", "development"] as const) {
					const d = decide(architecture, { kind, source: layerPkg("core-api"), target }, world);
					expect(["allowed", "forbidden"], `${kind} → ${target.sort}`).toContain(d.verdict);
				}
			}
		}
	});
});

// -------------------------------------------------------------------------------------------
// The registries
// -------------------------------------------------------------------------------------------

const tableOwners = readJson("governance/table-owners.json") as TableOwners;

/** Every table the schema actually declares, by export name — read from the module, not the file. */
const liveTables = new Set(
	Object.entries(schema)
		.filter(([, value]) => is(value, PgTable))
		.map(([name]) => name),
);

/**
 * The package names the validators are exercised against.
 *
 * Derived from `readWorkspacePackages` over a synthetic tree, not from the live filesystem. Whether
 * the registries match the *live* repo is a static property of the tree, so it is enforced by
 * `registries-honest` in `npm run lint` — not here. This file tests behaviour.
 */
const syntheticTree = [
	...new Set([
		...Object.values(tableOwners.owners).map((owner) => `layers/core-api/${owner}/package.json`),
		...(architecture.endpoints.httpApiLayers.layers as string[]).map(
			(l) => `layers/${l}/package.json`,
		),
		`layers/${architecture.endpoints.mcpRouter.host}/package.json`,
		`layers/${architecture.rawRuntime.host}/package.json`,
		"layers/core-ui/package.json",
		"framework/shared/package.json",
		// One of every role: `readWorkspacePackages` refuses a role rule that claims nothing.
		"applications/desktop/package.json",
		"tools/eval/package.json",
	]),
];
const packageNames = new Set(
	readWorkspacePackages(
		syntheticTree,
		(p) => JSON.stringify({ name: `@hyperidle/${p.split("/").at(-2)}` }),
		architecture.roles.byWorkspacePattern,
	).map((p) => p.name),
);

describe("AU28 — the registries are honest", () => {
	it("claims every table the schema declares, and no phantom ones", () => {
		expect(liveTables.size).toBeGreaterThan(40);
		expect(() => validateTableOwners(tableOwners, liveTables, packageNames)).not.toThrow();
		expect(tableOwners.totals.tables).toBe(liveTables.size);
	});

	it("fails loudly when a new table has no owner — the completeness property", () => {
		const withNewTable = new Set([...liveTables, "aBrandNewTableNobodyClaimed"]);
		expect(() => validateTableOwners(tableOwners, withNewTable, packageNames)).toThrow(
			RegistryError,
		);
		expect(() => validateTableOwners(tableOwners, withNewTable, packageNames)).toThrow(
			/claimed by nobody/,
		);
	});

	it("fails when an owner names a package that does not exist", () => {
		const broken = {
			...tableOwners,
			owners: { ...tableOwners.owners, bets: "a-package-that-was-deleted" },
		};
		expect(() => validateTableOwners(broken as TableOwners, liveTables, packageNames)).toThrow(
			/not a package/,
		);
	});

	it("reports an unowned table as unowned rather than throwing, and an unknown table as an error", () => {
		expect(ownerOf(tableOwners, "sessions")).toBeNull();
		expect(ownerOf(tableOwners, "bets")).toBe("work");
		expect(() => ownerOf(tableOwners, "notATable")).toThrow(RegistryError);
	});

	it("accepts the architecture registry and rejects a surface reachable by a non-existent package", () => {
		expect(() => validateArchitecture(architecture, packageNames)).not.toThrow();
		const broken = {
			...architecture,
			surfaces: {
				...architecture.surfaces,
				"framework/design-system": {
					reach: ["a-package-that-was-deleted"],
					why: "there is exactly one user interface and this is it",
				},
			},
		};
		expect(() => validateArchitecture(broken as unknown as Architecture, packageNames)).toThrow(
			/neither a role nor a package/,
		);
	});

	it("rejects a one-door surface that is not a declared surface", () => {
		const broken = {
			...architecture,
			oneDoorSurfaces: { ...architecture.oneDoorSurfaces, surfaces: ["db:imaginary"] },
		};
		expect(() => validateArchitecture(broken as Architecture, packageNames)).toThrow(
			/not declared as a surface/,
		);
	});
});

describe("AU28 — the model reads the real table registry", () => {
	it("lets the owner in and keeps everyone else out, for every owned table", () => {
		const wrong: string[] = [];
		for (const [table, owner] of Object.entries(tableOwners.owners)) {
			const asOwner = decide(
				architecture,
				{
					kind: "table:write",
					source: { sort: "package", name: owner, role: "service", layer: "core-api" },
					target: { sort: "table", table, owner },
				},
				"production",
			);
			const asStranger = decide(
				architecture,
				{
					kind: "table:write",
					source: {
						sort: "package",
						name: "some-other-service",
						role: "service",
						layer: "core-api",
					},
					target: { sort: "table", table, owner },
				},
				"production",
			);
			if (asOwner.verdict !== "allowed") wrong.push(`${owner} may not write its own ${table}`);
			if (asStranger.verdict !== "forbidden") wrong.push(`a stranger may write ${table}`);
		}
		expect(wrong).toEqual([]);
	});

	it("keeps all six unowned tables closed to everyone", () => {
		for (const table of Object.keys(tableOwners.unowned.tables)) {
			const d = decide(
				architecture,
				{
					kind: "table:read",
					source: { sort: "package", name: "work", role: "service", layer: "core-api" },
					target: { sort: "table", table, owner: ownerOf(tableOwners, table) },
				},
				"production",
			);
			expect(d.verdict, table).toBe("forbidden");
		}
	});
});

describe("AU28 — a package's role comes from the workspace declaration, never its path", () => {
	const rules = architecture.roles.byWorkspacePattern;
	const read = (p: string): string => JSON.stringify({ name: `@hyperidle/${p.split("/").at(-2)}` });

	it("gives a layer, its services and a tool their declared roles", () => {
		const packages = readWorkspacePackages(
			[
				"layers/core-api/package.json",
				"layers/core-api/work/package.json",
				"tools/eval/package.json",
				"framework/db/package.json",
				"applications/desktop/package.json",
			],
			read,
			rules,
		);
		expect(packages.map((p) => `${p.name}:${p.role}:${p.layer ?? "-"}`).sort()).toEqual([
			"core-api:layer:core-api",
			"db:framework:-",
			"desktop:application:-",
			"eval:tooling:-",
			"work:service:core-api",
		]);
	});

	it("refuses a package no glob claims rather than leaving it ungoverned", () => {
		expect(() =>
			readWorkspacePackages(
				[
					"somewhere-else/thing/package.json",
					"layers/core-api/package.json",
					"layers/core-api/work/package.json",
					"tools/eval/package.json",
					"framework/db/package.json",
					"applications/desktop/package.json",
				],
				read,
				rules,
			),
		).toThrow(/no role rule claims/);
	});

	it("refuses a role rule that claims nothing — a rule matching zero packages reads as clean forever", () => {
		expect(() => readWorkspacePackages(["layers/core-api/package.json"], read, rules)).toThrow(
			/matched zero packages/,
		);
	});

	it("refuses a glob shape it does not understand instead of silently mis-roling", () => {
		expect(() =>
			readWorkspacePackages(["layers/core-api/package.json"], read, [
				{ pattern: "layers/**", role: "layer" },
			]),
		).toThrow(/not of the form/);
	});
});
