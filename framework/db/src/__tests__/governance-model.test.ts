/**
 * AU28 — the compact architecture model reproduces every decided verdict.
 *
 * `tools/governance/decided-rules.json` holds 179 verdicts the founder decided one at a time: every
 * role pair × crossing kind, with a separate answer for the production and development worlds. They
 * are the decision artifact. `tools/governance/src/lib/governance-model.ts` is fifteen clauses that
 * must *derive* all 358 answers (179 rows × 2 worlds).
 *
 * AU44 B3 dissolved `framework/cron` into `layers/core-api/routine`. Its four decided rows (two
 * import + two manifest, across core-api and tooling) are removed.
 *
 * The row count moved four times, by founder ruling: AU28 Ruling 14 collapsed `raw runtime` and
 * `harness` into one target, merging the two `harness-registry` capability rows that had the same
 * verdict. AU29 deleted the `db:util` and `db:bootstrap` surfaces (Ruling 12.3) along with their six
 * rows — their exports left `framework/db` entirely, so the surfaces no longer exist to have a
 * verdict. The substrate split added the three `framework → db:*` rows that bound the framework-to-
 * framework widening: they are the only rows whose verdict differs between the scoped reading of that
 * ruling and the literal one, so they are what stops a later edit widening it back by accident. The
 * same change retired the twelve `framework/shared` rows with the surface itself — the substrate split into
 * eighteen packages, each with its own decided audience, so the blanket those twelve recorded has no
 * target left to name — and recorded eighty-six in their place, one set per new surface: the roles it
 * grants, the first package it names, and a `tooling` contrast that no surface admits. That contrast
 * is the row that discriminates; without it a surface's audience could be widened to everyone and
 * every remaining row would still reproduce.
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
} from "../../../../tools/governance/src/lib/governance-model.js";
import {
	ownerOf,
	RegistryError,
	type TableOwners,
	validateArchitecture,
	validateTableOwners,
} from "../../../../tools/governance/src/lib/governance-registry.js";
import {
	readWorkspacePackages,
	type WorkspaceRoleRule,
} from "../../../../tools/governance/src/lib/repo-census.js";
import * as schema from "../schema.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));

const architecture = readJson("tools/governance/architecture.json") as Architecture & {
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
const decided = readJson("tools/governance/decided-rules.json") as {
	totals: { rows: number; production: { allowed: number; forbidden: number } };
	rows: readonly DecidedRow[];
};

// -------------------------------------------------------------------------------------------
// Turning a decided row back into a concrete crossing
//
// A row names roles and relationships ("service (other layer)"); the model takes actual packages.
// This builds one representative crossing per row. `NAMED_PACKAGES` below carries every package a
// row may name by name, with the role and home layer the workspace declares for it.
// -------------------------------------------------------------------------------------------

const SOURCE_LAYER = "core-api";
const OTHER_LAYER = "agent-orchestration";

const ROLES: readonly Role[] = [
	"layer",
	"service",
	"framework",
	"application",
	"tooling",
	"deployment",
];

/**
 * Every package a decided row may name as a source, with the role and home layer the workspace
 * declares for it.
 *
 * Kept as data rather than switch arms because a `scope: "named"` row is only as good as the actor it
 * builds: `{ role: "harness-registry" }` is not a role, and a crossing built from it is decided by
 * whichever clause happens to catch it first. That is what the `default` arm used to produce for
 * every package name it did not know.
 */
const NAMED_PACKAGES: Readonly<Record<string, { readonly role: Role; readonly layer?: string }>> = {
	"agent-execution": { role: "layer" },
	"agent-orchestration": { role: "layer" },
	"agent-run-config": { role: "service", layer: "agent-orchestration" },
	connections: { role: "service", layer: "agent-orchestration" },
	conversation: { role: "service", layer: "core-api" },
	"core-api": { role: "layer" },
	"core-ui": { role: "layer" },
	credentials: { role: "service", layer: "core-api" },
	"design-system": { role: "framework" },
	desktop: { role: "application" },
	"filesystem-mounting": { role: "service", layer: "agent-orchestration" },
	filesystems: { role: "service", layer: "agent-orchestration" },
	"harness-registry": { role: "service", layer: "agent-execution" },
	knowledge: { role: "service", layer: "core-api" },
	notifications: { role: "service", layer: "core-api" },
	policy: { role: "service", layer: "core-api" },
	"remote-server": { role: "application" },
	"remote-worker": { role: "application" },
	review: { role: "service", layer: "core-api" },
	routine: { role: "service", layer: "core-api" },
	"run-orchestration": { role: "service", layer: "agent-orchestration" },
	"session-requests": { role: "service", layer: "agent-orchestration" },
	settings: { role: "service", layer: "core-api" },
	"tool-handlers": { role: "service", layer: "agent-orchestration" },
	users: { role: "service", layer: "core-api" },
	work: { role: "service", layer: "core-api" },
};

/**
 * The workspace path a named package's manifest sits at, from the role the fixture declares for it.
 * The role globs in `tools/governance/architecture.json` are what decide it, so this is the same derivation
 * `readWorkspacePackages` runs, in reverse.
 */
function manifestPathOf(name: string): string {
	const named = NAMED_PACKAGES[name];
	if (named === undefined) {
		throw new Error(
			`tools/governance/architecture.json grants reach to "${name}", which this fixture does not know. ` +
				"Add it to NAMED_PACKAGES with its declared role and home layer.",
		);
	}
	switch (named.role) {
		case "layer":
			return `layers/${name}/package.json`;
		case "service":
			return `layers/${named.layer}/${name}/package.json`;
		case "framework":
			return `framework/${name}/package.json`;
		case "application":
			return `applications/${name}/package.json`;
		default:
			return `tools/${name}/package.json`;
	}
}

/** Named packages carry their real role and home layer; a bare role gets a stand-in package. */
function makeActor(name: string): Crossing["source"] {
	if (name === "harness") return { sort: "harness" };
	if (name === "repo root") return { sort: "repo-root" };

	const named = NAMED_PACKAGES[name];
	if (named !== undefined) return { sort: "package", name, role: named.role, layer: named.layer };

	// A bare ROLE gets a stand-in package of that role. The layer and service stand-ins are named
	// because other rows relate to them — `layer (own)` and `service (same layer)` need a home.
	if (name === "layer") return { sort: "package", name: SOURCE_LAYER, role: "layer" };
	if (name === "service")
		return { sort: "package", name: "work", role: "service", layer: SOURCE_LAYER };
	if (ROLES.includes(name as Role))
		return { sort: "package", name: `a-${name}`, role: name as Role };

	throw new Error(
		`decided-rules.json names "${name}" as a source, which is neither a role nor a package this fixture ` +
			"knows. Add it to NAMED_PACKAGES with its declared role and home layer — a stand-in with an " +
			"invented role decides the row under whichever clause catches it first, which is not a test.",
	);
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
		// A bare `framework` TARGET is a framework package that is not the source — never a real one.
		// It used to be spelled `shared`, which tied a row about the role to a package that exists.
		case "framework":
			return { sort: "package", name: "another-framework", role: "framework" };

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
	it("holds exactly the 167 decided rows with the decided totals", () => {
		expect(decided.rows).toHaveLength(167);
		expect(decided.totals.rows).toBe(167);
		const count = (world: "production" | "development", verdict: string): number =>
			decided.rows.filter((r) => r[world] === verdict).length;
		// These four numbers are the founder's decisions. A regeneration that moves any of them has
		// re-derived what was decided instead of reading it — that happened once and cost hours.
		expect(count("production", "allowed")).toBe(91);
		expect(count("production", "forbidden")).toBe(76);
		// Ruling 13 moved the two `db:table (other) [table:write]` rows from forbidden to allowed:
		// the flat rule is replaced by the companion clause, which no row can express.
		// AU32 Ruling A (ruling14narrowing) moved two more, `service -> raw runtime [capability]` and
		// `tooling -> raw runtime [capability]`, from development forbidden to allowed (the AI
		// one-seam requirement narrows to production-only; production stays untouched): +2 allowed,
		// -2 forbidden. AU29 (Ruling 12.3) separately deleted the six `db:util`/`db:bootstrap` rows —
		// one development-allowed and two development-forbidden `db:util` row, plus all three
		// `db:bootstrap` rows development-allowed: -4 allowed, -2 forbidden. Combined against the
		// pre-AU29/AU32 baseline (114 allowed / 10 forbidden): 114 + 2 - 4 = 112 allowed;
		// 10 - 2 - 2 = 6 forbidden.
		// The substrate split's three `framework → db:*` rows are all production-forbidden (53 + 3 = 56)
		// and split in development: `db:schema-ns` and `db:unknown` are one-door surfaces and stay
		// forbidden (6 + 2 = 8), `db:testing` is not one and relaxes (112 + 1 = 113). It then retired the
		// twelve `framework/shared` rows, every one of them allowed in both worlds: 65 - 12 = 53
		// production allowed, 113 - 12 = 101 development allowed; neither forbidden count moves.
		// AU44-b2 dissolved framework/credential-access + framework/filesystem-contract, removing 8 rows:
		// prod: -4 allowed (105→101), -4 forbidden (90→86); dev: -8 allowed (179→179), 0 forbidden.
		expect(count("development", "allowed")).toBe(159);
		expect(count("development", "forbidden")).toBe(8);
	});

	it("has no duplicate rows", () => {
		const keys = decided.rows.map((r) => `${r.source}|${r.target}|${r.kind}`);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe("AU28 — fifteen clauses derive all 358 decided verdicts", () => {
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
		expect(checked, "the loop must actually iterate every decided row").toBe(167);
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
		expect(checked, "the loop must actually iterate every decided row").toBe(167);
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
			{ sort: "surface", surface: "framework/domain-model" },
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

const tableOwners = readJson("tools/governance/table-owners.json") as TableOwners;

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
		// Every package a `reach` list names has to exist here, or `validateArchitecture` reports the
		// audience as naming nobody. Derived from the registry rather than listed by hand, so a new
		// surface cannot be declared with an audience this tree happens not to cover.
		...Object.values(architecture.surfaces)
			.flatMap((entry) =>
				typeof entry !== "string" && Array.isArray(entry.reach) ? entry.reach : [],
			)
			.filter((name) => !ROLES.includes(name as Role))
			.map(manifestPathOf),
		// One of every role: `readWorkspacePackages` refuses a role rule that claims nothing.
		// `framework/*` is listed here rather than arriving through a `reach` list, because a reach
		// list names who may reach a surface from OUTSIDE the framework role — so no reach list
		// carries a framework package's name, and this tree cannot borrow one from them.
		"applications/desktop/package.json",
		"framework/db/package.json",
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
		// A collapse guard, not a census: the next two assertions are what prove the
		// registry honest. The pass that dropped five unused tables took this from 44 to 39.
		expect(liveTables.size).toBeGreaterThan(30);
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
		// The live registry has no unowned tables any more, so the unowned branch
		// is exercised against a registry that does. Pinning it to whichever real
		// table happened to be unowned is what made this case go stale the moment
		// that table got an owner.
		const withUnowned: TableOwners = {
			...tableOwners,
			unowned: { ...tableOwners.unowned, tables: { aTableNobodyClaimed: "example" } },
		};
		expect(ownerOf(withUnowned, "aTableNobodyClaimed")).toBeNull();
		expect(ownerOf(tableOwners, "bets")).toBe("work");
		expect(() => ownerOf(tableOwners, "notATable")).toThrow(RegistryError);
	});

	it("has no unowned tables left — every live table names an owner", () => {
		expect(Object.keys(tableOwners.unowned.tables)).toEqual([]);
		expect(tableOwners.totals.unowned).toBe(0);
		for (const table of liveTables) {
			expect(ownerOf(tableOwners, table)).not.toBeNull();
		}
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
