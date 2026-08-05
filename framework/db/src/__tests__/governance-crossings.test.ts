/**
 * AU28 — the measurement layer: detectors, database surfaces, and the ratchet.
 *
 * The model decides; these modules measure. A detector that under-detects is invisible to every
 * internal consistency check — a crossing never emitted cannot unbalance anything — so each detector
 * here is tested with a POSITIVE case and a NEGATIVE CONTROL: a near-miss that must not be detected.
 * Positive fixtures alone only prove a detector finds what it was written to find.
 */

import { describe, expect, it } from "vitest";
import {
	buildCompanionGroups,
	buildWriteSets,
	detectAstCrossings,
	layerServing,
	readEventTypes,
} from "../../../../scripts/lib/crossing-detectors.js";
import {
	type Baseline,
	compareBaseline,
	groupKey,
	refuseGrowth,
	targetLabel,
} from "../../../../scripts/lib/crossing-report.js";
import { buildPackageLocator } from "../../../../scripts/lib/crossings.js";
import {
	buildDbSurfaceIndex,
	type DatabasePackageConfig,
} from "../../../../scripts/lib/db-surfaces.js";
import type { Actor } from "../../../../scripts/lib/governance-model.js";
import { buildCensus } from "../../../../scripts/lib/repo-census.js";

const ROLE_RULES = [
	{ pattern: "layers/*", role: "layer" as const },
	{ pattern: "layers/*/*", role: "service" as const },
	{ pattern: "framework/*", role: "framework" as const },
	{ pattern: "applications/*", role: "application" as const },
	{ pattern: "tools/*", role: "tooling" as const },
];

/** A minimal synthetic repo: one of every role, so no role rule is dead. */
function syntheticRepo(extra: Record<string, string>): {
	files: string[];
	readFile: (p: string) => string;
} {
	const base: Record<string, string> = {
		"layers/core-api/package.json": JSON.stringify({ name: "@hyperidle/core-api" }),
		"layers/core-api/work/package.json": JSON.stringify({ name: "@hyperidle/work" }),
		"framework/db/package.json": JSON.stringify({ name: "@hyperidle/db" }),
		"applications/desktop/package.json": JSON.stringify({ name: "@hyperidle/desktop" }),
		"tools/eval/package.json": JSON.stringify({ name: "@hyperidle/eval" }),
		...extra,
	};
	return { files: Object.keys(base), readFile: (p) => base[p] ?? "" };
}

function detect(
	extra: Record<string, string>,
	eventsSource = 'interface E { readonly type: "thing_happened"; }',
) {
	const repo = syntheticRepo({ "framework/shared/events.ts": eventsSource, ...extra });
	const census = buildCensus({ files: repo.files, readFile: repo.readFile, roleRules: ROLE_RULES });
	return detectAstCrossings({
		census,
		readFile: repo.readFile,
		locate: buildPackageLocator(census.packages),
		tables: new Set(["bets", "users"]),
		ownerOf: (t) => (t === "bets" ? "work" : null),
		mcpRouterHost: "agent-execution",
		eventTypesModule: "framework/shared/events.ts",
		companions: new Map(),
		writeSetOf: () => new Set<string>(),
	});
}

const kinds = (found: ReturnType<typeof detect>, kind: string): string[] =>
	found.filter((f) => f.crossing.kind === kind).map((f) => f.detail);

// -------------------------------------------------------------------------------------------

describe("AU28 — the table detector", () => {
	it("tells a read from a write, and names the table", () => {
		const found = detect({
			"layers/core-api/work/src/q.ts": `
				import { bets, users } from "@hyperidle/db";
				export const a = (db: any) => db.select().from(bets);
				export const b = (db: any) => db.insert(users).values({});
				export const c = (db: any) => db.update(bets).set({});
			`,
		});
		expect(kinds(found, "table:read")).toHaveLength(1);
		expect(kinds(found, "table:write")).toHaveLength(2);
		expect(kinds(found, "table:read")[0]).toContain("from(bets)");
	});

	it("negative control — a method with the same name on something that is not a table", () => {
		const found = detect({
			"layers/core-api/work/src/q.ts": `
				export const a = (rows: string[]) => Array.from(rows);
				export const b = (m: Map<string, string>) => m.delete("bets");
				export const c = (list: number[]) => list.from;
			`,
		});
		expect(kinds(found, "table:read")).toEqual([]);
		expect(kinds(found, "table:write")).toEqual([]);
	});

	it("counts a join as a read of the joined table", () => {
		const found = detect({
			"layers/core-api/work/src/q.ts": `
				import { bets } from "@hyperidle/db";
				export const a = (db: any) => db.select().leftJoin(bets, undefined);
			`,
		});
		expect(kinds(found, "table:read")).toHaveLength(1);
	});
});

describe("AU28 — the event detector", () => {
	it("counts an emit and a subscribe of a declared event", () => {
		const found = detect({
			"layers/core-api/work/src/e.ts": `
				export const a = (eventBus: any) => eventBus.emit({ type: "thing_happened" });
				export const b = (eventBus: any) => eventBus.on("thing_happened", () => {});
			`,
		});
		expect(kinds(found, "event")).toHaveLength(2);
	});

	it("negative control — .emit/.on of something the bus does not declare", () => {
		const found = detect({
			"layers/core-api/work/src/e.ts": `
				export const a = (emitter: any) => emitter.emit({ type: "not_a_bus_event" });
				export const b = (socket: any) => socket.on("close", () => {});
			`,
		});
		expect(kinds(found, "event")).toEqual([]);
	});

	it("refuses to build an index when the events module declares nothing", () => {
		expect(() => readEventTypes("e.ts", () => "export const nothing = 1;")).toThrow(
			/declared no event types/,
		);
	});
});

describe("AU28 — the capability detector", () => {
	it("catches a vendor SDK import and an agent CLI spawn", () => {
		const found = detect({
			"layers/core-api/work/src/c.ts": `
				import Anthropic from "@anthropic-ai/sdk";
				import { spawn } from "node:child_process";
				export const go = () => spawn("claude", []);
				export const x = Anthropic;
			`,
		});
		expect(kinds(found, "capability")).toHaveLength(2);
	});

	it("negative control — a differently named binary and a non-SDK package", () => {
		const found = detect({
			"layers/core-api/work/src/c.ts": `
				import { spawn } from "node:child_process";
				import something from "openai-adjacent-but-not-openai";
				export const go = () => spawn("git", ["status"]);
				export const x = something;
			`,
		});
		expect(kinds(found, "capability")).toEqual([]);
	});
});

describe("AU28 — the dependency-injection detector", () => {
	it("records the crossing between the CALLED package and the package the value came from", () => {
		const found = detect({
			"layers/core-api/work/src/thing.ts": "export const makeThing = (_dep: unknown) => 1;",
			"framework/db/src/index.ts": "export const dbClient = {};",
			"applications/desktop/src/boot.ts": `
				import { makeThing } from "../../../layers/core-api/work/src/thing.js";
				import { dbClient } from "../../../framework/db/src/index.js";
				export const wired = makeThing(dbClient);
			`,
		});
		const di = found.filter((f) => f.crossing.kind === "di");
		expect(di).toHaveLength(1);
		// The source is `work` — whose factory receives the dependency — not `desktop`, which wires it.
		expect(di[0]?.crossing.source).toMatchObject({ name: "work" });
		expect(di[0]?.crossing.target).toMatchObject({ name: "db" });
	});

	it("negative control — an exported constant handed to a call is an import, not an injection", () => {
		const found = detect({
			"layers/core-api/work/src/thing.ts": "export const makeThing = (_dep: unknown) => 1;",
			"framework/db/src/index.ts": 'export const MODES = ["a", "b"];',
			"applications/desktop/src/boot.ts": `
				import { makeThing } from "../../../layers/core-api/work/src/thing.js";
				import { MODES } from "../../../framework/db/src/index.js";
				export const wired = makeThing(MODES);
			`,
		});
		expect(kinds(found, "di")).toEqual([]);
	});

	it("negative control — a table symbol passed as an argument is a table access, not an injection", () => {
		const found = detect({
			"layers/core-api/work/src/thing.ts": "export const makeThing = (_dep: unknown) => 1;",
			"applications/desktop/src/boot.ts": `
				import { makeThing } from "../../../layers/core-api/work/src/thing.js";
				import { bets } from "@hyperidle/db";
				export const wired = makeThing(bets);
			`,
		});
		expect(kinds(found, "di")).toEqual([]);
	});
});

describe("AU28 — resolving a dialled path to the layer that serves it", () => {
	const routes = [
		{ path: "/ws/worker", layer: "agent-orchestration" },
		{ path: "/ws", layer: "core-api" },
		{ path: "/mcp/:token", layer: "agent-execution" },
		{ path: "/bets", layer: "core-api" },
	].sort((a, b) => b.path.length - a.path.length);

	it("prefers the longest match", () => {
		expect(layerServing(routes, "/api/ws/worker")).toBe("agent-orchestration");
		expect(layerServing(routes, "/api/ws")).toBe("core-api");
	});

	it("matches a :param against any one segment", () => {
		expect(layerServing(routes, "/api/mcp/abc123")).toBe("agent-execution");
	});

	it("negative control — a third-party URL is not our API", () => {
		expect(layerServing(routes, "/api/v1/auth/key")).toBeNull();
	});
});

describe("AU28 — database surfaces", () => {
	const config: DatabasePackageConfig = {
		packageName: "db",
		sourceRoot: "db/src",
		barrel: "db/src/index.ts",
		schemaModule: "db/src/schema.ts",
		zodModule: "db/src/zod-schemas.ts",
		moduleSurface: { "connection.ts": "db:client", "like-escape.ts": "db:util" },
	};
	const sources: Record<string, string> = {
		"db/src/schema.ts": `
			export const bets = pgTable("bets", {});
			export type Bet = typeof bets.$inferSelect;
			export const notATable = 5;
		`,
		"db/src/zod-schemas.ts": "export const betSchema = createSelectSchema(bets);",
		"db/src/index.ts": `
			export { bets, Bet, notATable } from "./schema.js";
			export { createPgliteDb } from "./connection.js";
			export { escapeLikePattern } from "./like-escape.js";
			export * as schema from "./schema.js";
		`,
	};
	const index = buildDbSurfaceIndex(config, (p) => sources[p] ?? "");

	it("reads tables and row types from the schema rather than a list", () => {
		expect(index.tables.has("bets")).toBe(true);
		expect(index.rowTypes.has("Bet")).toBe(true);
		expect(index.tables.has("notATable")).toBe(false);
	});

	it("classifies each barrel symbol by the module it came from", () => {
		expect(index.resolve("db/src/index.ts", "bets", false)).toMatchObject({
			surface: "db:table",
			table: "bets",
		});
		expect(index.resolve("db/src/index.ts", "Bet", false).surface).toBe("db:row-type");
		expect(index.resolve("db/src/index.ts", "createPgliteDb", false).surface).toBe("db:client");
		expect(index.resolve("db/src/index.ts", "escapeLikePattern", false).surface).toBe("db:util");
	});

	it("treats a generated zod schema as a reach into the table it came from", () => {
		expect(index.resolve("db/src/zod-schemas.ts", "betSchema", false)).toMatchObject({
			surface: "db:table",
			table: "bets",
		});
	});

	it("treats taking the module whole as the schema namespace", () => {
		expect(index.resolve("db/src/index.ts", "", true).surface).toBe("db:schema-ns");
	});

	it("reports an unplaceable symbol instead of guessing a surface for it", () => {
		expect(index.resolve("db/src/index.ts", "mysteryExport", false).surface).toBe("db:unknown");
		expect(index.unplaced.has("mysteryExport")).toBe(true);
	});

	it("refuses to build an index over a schema with no tables", () => {
		expect(() => buildDbSurfaceIndex(config, () => "export const nothing = 1;")).toThrow(
			/declared no pgTable/,
		);
	});
});

describe("AU28 — the ratchet", () => {
	const baseline: Baseline = {
		governanceBaseline: true,
		note: "",
		groups: {
			"layer → service (other layer) [import] production": {
				sites: { "a.ts": 2, "b.ts": 1 },
			},
		},
	};
	const key = "layer → service (other layer) [import] production";

	it("passes when the live violations match exactly", () => {
		const result = compareBaseline(baseline, [
			{
				key,
				sites: new Map([
					["a.ts", 2],
					["b.ts", 1],
				]),
			},
		]);
		expect(result.newDebt).toEqual([]);
		expect(result.stale).toEqual([]);
	});

	it("fails when a site grows", () => {
		const result = compareBaseline(baseline, [
			{
				key,
				sites: new Map([
					["a.ts", 3],
					["b.ts", 1],
				]),
			},
		]);
		expect(result.newDebt).toHaveLength(1);
		expect(result.stale).toEqual([]);
	});

	it("fails when a site is fixed but the shrink is not committed", () => {
		const result = compareBaseline(baseline, [{ key, sites: new Map([["a.ts", 2]]) }]);
		expect(result.newDebt).toEqual([]);
		expect(result.stale).toHaveLength(1);
	});

	it("fails on a rule with no baseline entry at all", () => {
		const result = compareBaseline(baseline, [
			{ key: "service → raw runtime [capability] production", sites: new Map([["x.ts", 1]]) },
		]);
		expect(result.newDebt).toHaveLength(1);
	});

	/**
	 * THE test that proves the design. A count-only ratchet passes every case above and fails this
	 * one: fix a violation in one file, add one in another, total unchanged, build green.
	 */
	it("catches the swap — one site fixed, one added, total unchanged", () => {
		const result = compareBaseline(baseline, [
			{
				key,
				sites: new Map([
					["a.ts", 2],
					["c.ts", 1],
				]),
			},
		]);
		expect(result.newDebt, "the new site must register as new debt").toHaveLength(1);
		expect(result.stale, "the fixed site must register as a stale baseline").toHaveLength(1);
	});

	/**
	 * The generator half. `compareBaseline` above is what the LINT does; these are what the
	 * REGENERATOR does. Without them the ratchet has a hole you can drive a commit through: introduce
	 * a violation, re-run the generator, commit the bigger file, green.
	 */
	describe("the baseline may only shrink", () => {
		it("accepts a shrink", () => {
			expect(refuseGrowth([{ key, sites: new Map([["a.ts", 1]]) }], baseline, [])).toEqual([]);
		});

		it("accepts a group clearing completely", () => {
			expect(refuseGrowth([], baseline, [])).toEqual([]);
		});

		it("refuses a site growing past what the baseline allows", () => {
			const refusals = refuseGrowth([{ key, sites: new Map([["a.ts", 3]]) }], baseline, []);
			expect(refusals).toHaveLength(1);
			expect(refusals[0]).toContain("may only shrink");
		});

		it("refuses a brand-new file inside an existing group", () => {
			const refusals = refuseGrowth(
				[
					{
						key,
						sites: new Map([
							["a.ts", 2],
							["b.ts", 1],
							["new.ts", 1],
						]),
					},
				],
				baseline,
				[],
			);
			expect(refusals).toHaveLength(1);
			expect(refusals[0]).toContain("new.ts");
		});

		it("refuses a group the baseline does not have — the rule is already at error", () => {
			const refusals = refuseGrowth(
				[{ key: "service → raw runtime [capability] production", sites: new Map([["x.ts", 1]]) }],
				baseline,
				[],
			);
			expect(refusals).toHaveLength(1);
			expect(refusals[0]).toContain("at error today");
		});

		/**
		 * The one legitimate growth: a new rule landing over debt that already existed. It has to be
		 * named explicitly, so it cannot happen as a side effect of running the generator.
		 */
		it("admits a new group only when it is adopted by name", () => {
			const newGroup = "service → raw runtime [capability] production";
			expect(
				refuseGrowth([{ key: newGroup, sites: new Map([["x.ts", 1]]) }], baseline, [newGroup]),
			).toEqual([]);
			expect(
				refuseGrowth([{ key: newGroup, sites: new Map([["x.ts", 1]]) }], baseline, [
					"some other group",
				]),
			).toHaveLength(1);
		});

		/**
		 * Adopting one group must not open the door for every other. A blanket `--adopt` would be the
		 * exemption apparatus this whole design exists to avoid.
		 */
		it("adopting one group does not admit another", () => {
			const refusals = refuseGrowth(
				[
					{ key: "service → raw runtime [capability] production", sites: new Map([["x.ts", 1]]) },
					{ key: "framework → EventBus [event] production", sites: new Map([["y.ts", 1]]) },
				],
				baseline,
				["service → raw runtime [capability] production"],
			);
			expect(refusals).toHaveLength(1);
			expect(refusals[0]).toContain("EventBus");
		});
	});
});

describe("AU28 — how a crossing is named", () => {
	const service: Actor = { sort: "package", name: "work", role: "service", layer: "core-api" };
	const application: Actor = { sort: "package", name: "desktop", role: "application" };

	it("qualifies a peer by its relationship to the source", () => {
		expect(
			targetLabel({ sort: "package", name: "review", role: "service", layer: "core-api" }, service),
		).toBe("service (same layer)");
		expect(
			targetLabel(
				{
					sort: "package",
					name: "run-orchestration",
					role: "service",
					layer: "agent-orchestration",
				},
				service,
			),
		).toBe("service (other layer)");
	});

	it("does not invent a relationship for a source that lives in no layer", () => {
		expect(
			targetLabel(
				{ sort: "package", name: "work", role: "service", layer: "core-api" },
				application,
			),
		).toBe("service");
	});

	it("names a table by whether the source owns it", () => {
		expect(targetLabel({ sort: "table", table: "bets", owner: "work" }, service)).toBe(
			"db:table (own)",
		);
		expect(targetLabel({ sort: "table", table: "bets", owner: "org" }, service)).toBe(
			"db:table (other)",
		);
		expect(targetLabel({ sort: "table", table: "sessions", owner: null }, service)).toBe(
			"db:table (unowned)",
		);
	});

	it("builds a group key that carries source, target, kind and world", () => {
		expect(
			groupKey(
				{
					kind: "table:write",
					source: service,
					target: { sort: "table", table: "bets", owner: "org" },
				},
				"production",
			),
		).toBe("service → db:table (other) [table:write] production");
	});
});

describe("AU28 — companion rows (Ruling 13)", () => {
	/** An owner that writes two rows in one call, and one that dispatches to a single insert. */
	const OWNERS = {
		"layers/core-api/org/src/team-lookup.ts": `
			import { teams, teamMembers } from "@hyperidle/db";
			export async function createTeam(db: any, input: any) {
				await db.insert(teams).values(input);
				await db.insert(teamMembers).values(input);
			}
			// Both rows are REVISED by their owner, which is what makes them state rather than
			// history — see the append-only test below.
			export async function updateTeam(db: any, id: string, patch: any) {
				await db.update(teams).set(patch);
				await db.update(teamMembers).set(patch);
			}
		`,
		"layers/core-api/work/src/work-service.ts": `
			import { bets, users } from "@hyperidle/db";
			export async function create(exec: any, entity: string, values: any) {
				switch (entity) {
					case "bet": await exec.insert(bets).values(values); return;
					case "user": await exec.insert(users).values(values); return;
				}
			}
		`,
	};

	function companions(extra: Record<string, string> = {}) {
		const repo = syntheticRepo({
			"framework/shared/events.ts": "",
			"layers/core-api/org/package.json": JSON.stringify({ name: "@hyperidle/org" }),
			...OWNERS,
			...extra,
		});
		const census = buildCensus({
			files: repo.files,
			readFile: repo.readFile,
			roleRules: ROLE_RULES,
		});
		return buildCompanionGroups(
			{
				census,
				readFile: repo.readFile,
				locate: buildPackageLocator(census.packages),
				tables: new Set(["teams", "teamMembers", "bets", "users"]),
			},
			(t) => (t === "teams" || t === "teamMembers" ? "org" : "work"),
		);
	}

	it("groups the two rows an owner writes together", () => {
		const groups = companions();
		expect([...(groups.get("teams") ?? [])]).toEqual(["teamMembers"]);
		expect([...(groups.get("teamMembers") ?? [])]).toEqual(["teams"]);
	});

	it("negative control — a switch that dispatches to one insert per branch is NOT a group", () => {
		// `work.create()` writes four tables across its cases, but any one call writes exactly one.
		// Treating it as a group is the mistake that would have kept 406 pointless sites in the rule.
		const groups = companions();
		expect(groups.has("bets")).toBe(false);
		expect(groups.has("users")).toBe(false);
	});

	it("negative control — an append-only log is history, not part of the row set", () => {
		// `knowledgeEditLog` is written alongside every knowledge item and NEVER updated. Nothing
		// reads it to decide what the item is, and its foreign key points AT the item. A test that
		// omits it produces the same mutable state production would — so requiring a fabricated audit
		// row in 51 places would have been the same ceremony Ruling 13 removed, one scale smaller.
		const groups = companions({
			"layers/core-api/org/src/audit.ts": `
				import { teams, teamMembers } from "@hyperidle/db";
				export async function logTeamChange(db: any, v: any) {
					await db.insert(teams).values(v);
					await db.insert(teamMembers).values(v);
				}
			`,
		});
		// teamMembers IS updated by its owner, so it stays a companion.
		expect([...(groups.get("teams") ?? [])]).toEqual(["teamMembers"]);
	});

	it("drops a companion the owner never revises", () => {
		const repo = syntheticRepo({
			"framework/shared/events.ts": "",
			"layers/core-api/org/package.json": JSON.stringify({ name: "@hyperidle/org" }),
			"layers/core-api/org/src/store.ts": `
				import { teams, teamMembers, orgEdges } from "@hyperidle/db";
				export async function createTeam(db: any, v: any) {
					await db.insert(teams).values(v);
					await db.insert(teamMembers).values(v);
					await db.insert(orgEdges).values(v);
				}
				export async function rename(db: any, v: any) {
					await db.update(teamMembers).set(v);
				}
			`,
		});
		const census = buildCensus({
			files: repo.files,
			readFile: repo.readFile,
			roleRules: ROLE_RULES,
		});
		const groups = buildCompanionGroups(
			{
				census,
				readFile: repo.readFile,
				locate: buildPackageLocator(census.packages),
				tables: new Set(["teams", "teamMembers", "orgEdges"]),
			},
			() => "org",
		);
		// `orgEdges` is inserted alongside but never updated — append-only, so not a companion.
		// `teams` is never updated here either, so only the revised pair survives... and a pair needs
		// two members, so nothing is required of a writer whose rows are all append-only.
		expect(groups.has("orgEdges")).toBe(false);
	});

	it("negative control — a seeder outside the owning package is not the owner's writer", () => {
		// A demo seeder writes every table in the schema. If it counted, every table would be every
		// other table's companion and the rule would be meaningless.
		const groups = companions({
			"framework/db/src/seed.ts": `
				import { teams, bets, users } from "@hyperidle/db";
				export async function seedDemoWorld(db: any) {
					await db.insert(teams).values({});
					await db.insert(bets).values({});
					await db.insert(users).values({});
				}
			`,
		});
		expect([...(groups.get("teams") ?? [])]).toEqual(["teamMembers"]);
		expect(groups.has("bets")).toBe(false);
	});

	it("counts writes a test makes through a development helper it imports", () => {
		// Judging a file alone would report teamMembers missing when a shared fixture supplies it —
		// and a rule that cries wolf on the shared helper is a rule people switch off.
		const repo = syntheticRepo({
			"framework/shared/events.ts": "",
			"layers/core-api/src/__tests__/_helpers.ts": `
				import { teamMembers } from "@hyperidle/db";
				export const seedBase = (db: any) => db.insert(teamMembers).values({});
			`,
			"layers/core-api/src/__tests__/a.test.ts": `
				import { teams } from "@hyperidle/db";
				import { seedBase } from "./_helpers.js";
				export const t = (db: any) => { seedBase(db); return db.insert(teams).values({}); };
			`,
			"layers/core-api/src/__tests__/b.test.ts": `
				import { teams } from "@hyperidle/db";
				export const t = (db: any) => db.insert(teams).values({});
			`,
		});
		const census = buildCensus({
			files: repo.files,
			readFile: repo.readFile,
			roleRules: ROLE_RULES,
		});
		const writeSetOf = buildWriteSets({
			census,
			readFile: repo.readFile,
			tables: new Set(["teams", "teamMembers"]),
		});
		expect([...writeSetOf("layers/core-api/src/__tests__/a.test.ts")].sort()).toEqual([
			"teamMembers",
			"teams",
		]);
		expect([...writeSetOf("layers/core-api/src/__tests__/b.test.ts")]).toEqual(["teams"]);
	});
});
