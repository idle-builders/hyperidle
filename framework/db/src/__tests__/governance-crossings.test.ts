/**
 * AU28 — the measurement layer: detectors and database surfaces.
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
	UnclaimedProductionFileError,
} from "../../../../tools/governance/src/lib/crossing-detectors.js";
import { groupKey, targetLabel } from "../../../../tools/governance/src/lib/crossing-keys.js";
import {
	buildPackageLocator,
	type DetectedCrossing,
} from "../../../../tools/governance/src/lib/crossings.js";
import {
	buildDbSurfaceIndex,
	type DatabasePackageConfig,
} from "../../../../tools/governance/src/lib/db-surfaces.js";
import type {
	Actor,
	Architecture,
	Kind,
} from "../../../../tools/governance/src/lib/governance-model.js";
import { buildCensus } from "../../../../tools/governance/src/lib/repo-census.js";
import { crossingRules } from "../../../../tools/governance/src/rules/crossings.js";
import { noLaunderedReExports } from "../../../../tools/governance/src/rules/no-laundered-re-exports.js";

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
		// `framework/shared/events.ts` is production by classification, so it needs a manifest — a
		// production file in no package is a build error now, and this fixture was one.
		"framework/shared/package.json": JSON.stringify({ name: "@hyperidle/shared" }),
		"applications/desktop/package.json": JSON.stringify({ name: "@hyperidle/desktop" }),
		"tools/eval/package.json": JSON.stringify({ name: "@hyperidle/eval" }),
		...extra,
	};
	return { files: Object.keys(base), readFile: (p) => base[p] ?? "" };
}

/** Physical SQL name → export symbol, mirroring what `buildDbSurfaceIndex` reads off the schema. */
const PHYSICAL_NAMES = new Map([
	["bets", "bets"],
	["users", "users"],
]);

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
		physicalNames: PHYSICAL_NAMES,
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

	it("resolves the table through the import BINDING, not the identifier text", () => {
		// Three spellings of one write. Before this, only the first was visible: the local identifier
		// had to equal the schema export name, so renaming an import was a one-keystroke bypass.
		const found = detect({
			"layers/core-api/work/src/q.ts": `
					import { users, users as U } from "@hyperidle/db";
					const u = users;
					export const a = (db: any) => db.insert(users).values({});
					export const b = (db: any) => db.insert(U).values({});
					export const c = (db: any) => db.insert(u).values({});
				`,
		});
		const writes = kinds(found, "table:write");
		expect(writes).toHaveLength(3);
		// All three name the SAME table — the alias is resolved, not carried through as a label.
		expect(writes.every((detail) => detail.includes("(users)"))).toBe(true);
	});

	it("resolves a const alias of a const alias, to a fixed point", () => {
		const found = detect({
			"layers/core-api/work/src/q.ts": `
					import { bets } from "@hyperidle/db";
					const first = bets;
					const second = first;
					export const a = (db: any) => db.insert(second).values({});
				`,
		});
		expect(kinds(found, "table:write")).toHaveLength(1);
	});

	it("resolves a destructure of the whole-schema namespace", () => {
		const found = detect({
			"layers/core-api/work/src/q.ts": `
					import * as schema from "@hyperidle/db";
					const { bets: b } = schema;
					export const a = (db: any) => db.insert(b).values({});
				`,
		});
		expect(kinds(found, "table:write")).toHaveLength(1);
	});

	it("negative control — an alias of a symbol from a module that is NOT the database package", () => {
		// Without the "must resolve into the database package" requirement, the resolver degrades back
		// into a name-matcher and any local `users` export becomes a table.
		const found = detect({
			"layers/core-api/work/src/lookalike.ts": "export const users = { notATable: true };",
			"layers/core-api/work/src/q.ts": `
					import { users as U } from "./lookalike.js";
					export const a = (db: any) => db.insert(U).values({});
				`,
		});
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

describe("AU28 — raw SQL names the table as a string", () => {
	it("tells a write statement from a read one, and names the export symbol", () => {
		const found = detect({
			"layers/core-api/work/src/raw.ts": `
					import { sql } from "drizzle-orm";
					export const w = (db: any) => db.execute(sql\`insert into users (id) values ('x')\`);
					export const r = (db: any) => db.execute(sql\`select id from bets where id = 'x'\`);
					export const d = (db: any) => db.execute(sql\`delete from users where id = 'x'\`);
				`,
		});
		// `delete from users` is a WRITE and not also a read — the statement verb decides.
		expect(kinds(found, "table:write")).toHaveLength(2);
		expect(kinds(found, "table:read")).toHaveLength(1);
		expect(kinds(found, "table:read")[0]).toContain("bets");
	});

	it("sees the template through an aliased `sql` import and a quoted table name", () => {
		const found = detect({
			"layers/core-api/work/src/raw.ts": `
					import { sql as SQL } from "drizzle-orm";
					export const w = (tx: any) => tx.execute(SQL\`update "users" set name = 'x'\`);
				`,
		});
		expect(kinds(found, "table:write")).toHaveLength(1);
	});

	it("counts DDL against a table as a write", () => {
		const found = detect({
			"layers/core-api/work/src/raw.ts": `
					import { sql } from "drizzle-orm";
					export const w = (db: any) => db.execute(sql\`create index idx on users (id)\`);
				`,
		});
		expect(kinds(found, "table:write")).toHaveLength(1);
	});

	it("negative control — a fragment interpolating a column produces no crossing", () => {
		// This path is already counted by the builder detector; double-counting would inflate every
		// floor and make the two detectors disagree about the same statement.
		const found = detect({
			"layers/core-api/work/src/raw.ts": `
					import { sql } from "drizzle-orm";
					export const f = (title: string) => sql\`lower(title) = \${title}\`;
				`,
		});
		expect(kinds(found, "table:read")).toEqual([]);
		expect(kinds(found, "table:write")).toEqual([]);
	});

	it("negative control — an unanchored mention, a comment, and a lookalike table name", () => {
		const found = detect({
			"layers/core-api/work/src/raw.ts": `
					import { sql } from "drizzle-orm";
					// rebuild the users cache
					export const a = (db: any) => db.execute(sql\`create table users_int_test (id text)\`);
					export const b = (db: any) => db.execute(sql\`select 1 where 'bets' = 'bets'\`);
				`,
		});
		expect(kinds(found, "table:read")).toEqual([]);
		expect(kinds(found, "table:write")).toEqual([]);
	});

	it("negative control — a template tagged by something that is not drizzle's `sql`", () => {
		const found = detect({
			"layers/core-api/work/src/raw.ts": `
					import { sql } from "some-other-library";
					export const a = () => sql\`insert into users (id) values ('x')\`;
				`,
		});
		expect(kinds(found, "table:write")).toEqual([]);
	});
});

describe("AU28 — a production file in no package fails CLOSED", () => {
	const rogue = {
		"layers/rogue/src/backdoor.ts": `
				import { bets } from "@hyperidle/db";
				export const w = (db: any) => db.insert(bets).values({});
			`,
	};

	it("throws rather than acting as the repo root — a declared composition root", () => {
		// `actorFor(undefined)` returned `{sort:"repo-root"}` and `classifyFile` calls anything under
		// `layers/` production, so an unregistered directory got composition-root powers.
		expect(() => detect(rogue)).toThrow(UnclaimedProductionFileError);
		expect(() => detect(rogue)).toThrow(/layers\/rogue\/src\/backdoor\.ts/);
	});

	it("names what to do about it", () => {
		expect(() => detect(rogue)).toThrow(/package\.json/);
	});

	it("negative control — a DEVELOPMENT file outside every package still resolves to the repo root", () => {
		// This is the case that must keep working: legitimate repo-root tooling under `scripts/`.
		expect(() =>
			detect({
				"scripts/build-thing.ts": `
						import { bets } from "@hyperidle/db";
						export const w = (db: any) => db.insert(bets).values({});
					`,
			}),
		).not.toThrow();
	});

	it("negative control — a production file outside every package that parses to nothing does not throw", () => {
		// A future `layers/README.md` is production by classification and harmless.
		expect(() => detect({ "layers/rogue/README.md": "# not code" })).not.toThrow();
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

describe("AU28 — re-export laundering", () => {
	/**
	 * A real-shaped database package plus a service barrel, because the whole bypass lives in the
	 * relationship between the two: both hops are individually legal and the composition is not.
	 */
	const DB_SOURCES: Record<string, string> = {
		// `exports` is load-bearing: without it `@hyperidle/db` resolves to `framework/db/index.js`,
		// no edge is produced, and every case below passes for the wrong reason.
		"framework/db/package.json": JSON.stringify({
			name: "@hyperidle/db",
			exports: { ".": "./src/index.ts" },
		}),
		"framework/db/src/schema.ts": `
				export const bets = pgTable("bets", {});
				export type Bet = typeof bets.$inferSelect;
			`,
		"framework/db/src/zod-schemas.ts": "export const betSchema = createSelectSchema(bets);",
		"framework/db/src/index.ts": `
				export { bets, Bet } from "./schema.js";
				export { escapeLikePattern } from "./like-escape.js";
			`,
		"framework/db/src/like-escape.ts": "export const escapeLikePattern = (s: string) => s;",
		// A legitimate CONSUMER of the database package. Present in every case so the rule's value half
		// — `export const x = <table>` — always has a population to judge; with none it correctly
		// reports itself half-dead, which would drown every case below in the same finding.
		"layers/core-api/work/src/reader.ts": [
			'import { bets } from "@hyperidle/db";',
			"export const read = (db: { select: () => { from: (t: unknown) => unknown } }) => db.select().from(bets);",
		].join("\n"),
	};

	const architecture = {
		containment: { compositionRootRoles: ["application"], repoRootIsCompositionRoot: true },
		surfaces: {
			"db:row-type": { reach: "everyone", why: "a row type is a shape, not an access path" },
			"db:util": {
				reach: ["service"],
				why: "a narrow audience, which is what makes it launderable",
			},
			"framework/shared": { reach: "everyone", why: "the shared substrate every role may name" },
		},
		endpoints: {
			httpApiLayers: { layers: [], why: "not used here" },
			mcpRouter: { host: "agent-execution", alsoDialledBy: [], why: "not used here" },
		},
		eventBus: { host: "framework", typesModule: "", why: "not used here" },
		rawRuntime: { host: "agent-execution", why: "not used here" },
		oneDoorSurfaces: {
			surfaces: [],
			foreignTableWriteMissingCompanion: true,
			why: "not used here",
		},
	} as unknown as Architecture;

	function evaluate(extra: Record<string, string>) {
		const repo = syntheticRepo({ ...DB_SOURCES, ...extra });
		const census = buildCensus({
			files: repo.files,
			readFile: repo.readFile,
			roleRules: ROLE_RULES,
		});
		const rule = noLaunderedReExports({
			architecture,
			db: buildDbSurfaceIndex(
				{
					packageName: "db",
					sourceRoot: "framework/db/src",
					barrel: "framework/db/src/index.ts",
					schemaModule: "framework/db/src/schema.ts",
					zodModule: "framework/db/src/zod-schemas.ts",
					moduleSurface: { "like-escape.ts": "db:util" },
				},
				repo.readFile,
			),
			frameworkSurfaces: new Map([["shared", "framework/shared"]]),
			locate: buildPackageLocator(census.packages),
			readFile: repo.readFile,
		});
		return { rule, census, findings: rule.evaluate(census) };
	}

	it("refuses a table re-exported across a package boundary — even by its owner", () => {
		// `work` OWNS `bets`, and that is exactly the laundering vector: its layer can then import the
		// table from the service barrel and the ownership rule evaporates.
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts": 'export { bets as betsTable } from "@hyperidle/db";',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("may never be republished across a package boundary");
		expect(findings[0]?.path).toBe("layers/core-api/work/src/index.ts");
	});

	it("refuses the same republication written as a VALUE — `export const betsTable = bets`", () => {
		// `export … from` was the only spelling the rule saw. This one is the identical act: the
		// consumer imports `betsTable` from the service and the table resolver on its side binds it
		// straight back to `bets`.
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts":
				'import { bets } from "@hyperidle/db";\nexport const betsTable = bets;',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("may never be republished across a package boundary");
		expect(findings[0]?.message).toContain("betsTable");
		expect(findings[0]?.path).toBe("layers/core-api/work/src/index.ts");
	});

	it("refuses the TWO-FILE value spelling, at the module where the table leaves the package", () => {
		// The barrel hop is a within-package re-export, which narrowing (3) waves through by design.
		// Catching the alias itself closes the spelling without touching that narrowing.
		const { findings } = evaluate({
			"layers/core-api/work/src/table-exports.ts":
				'import { bets } from "@hyperidle/db";\nexport const betsTable = bets;',
			"layers/core-api/work/src/index.ts": 'export { betsTable } from "./table-exports.js";',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toBe("layers/core-api/work/src/table-exports.ts");
	});

	it("refuses a table published through a local `export { … }` clause with no `from`", () => {
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts":
				'import { bets } from "@hyperidle/db";\nconst t = bets;\nexport { t as betsTable };',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("betsTable");
	});

	it("negative control — importing a table and USING it is not publication", () => {
		// The base tree already contains exactly this in `reader.ts`, and it must stay silent: the rule
		// is about handing the table onward, never about touching it.
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts":
				'import { bets } from "@hyperidle/db";\nexport const label = "bets";\nexport const count = (db: { select: () => { from: (t: unknown) => unknown } }) => db.select().from(bets);',
		});
		expect(findings).toEqual([]);
	});

	it("reports itself half-dead when nothing outside the database package names it", () => {
		// The value half has its own population. One `minScope` number cannot tell which half collapsed,
		// so the half that is not the binding floor says so rather than hiding behind the other's size.
		const repo = syntheticRepo(DB_SOURCES);
		const census = buildCensus({
			files: repo.files.filter((f) => f !== "layers/core-api/work/src/reader.ts"),
			readFile: repo.readFile,
			roleRules: ROLE_RULES,
		});
		const { rule } = evaluate({});
		const messages = rule.evaluate(census).map((f) => f.message);
		expect(messages.some((m) => m.includes("measuring nothing"))).toBe(true);
	});

	it("refuses a surface whose audience is narrower than everyone", () => {
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts": 'export { escapeLikePattern } from "@hyperidle/db";',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("reachable by a named audience");
	});

	it("refuses `export *` from another package — it republishes every surface behind it", () => {
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts": 'export * from "@hyperidle/db";',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("whole of");
	});

	it("negative control — a reach-`everyone` surface launders nothing", () => {
		// Most of the live cross-package re-exports are exactly this. Without the narrowing the rule
		// would land on day one with a pile of findings nobody can act on, and die of noise.
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts": 'export type { Bet } from "@hyperidle/db";',
		});
		expect(findings).toEqual([]);
	});

	it("negative control — a WITHIN-package re-export is the surface's own publication", () => {
		const { findings } = evaluate({
			"layers/core-api/work/src/store.ts": "export const x = 1;",
			"layers/core-api/work/src/index.ts": 'export { x } from "./store.js";',
		});
		expect(findings).toEqual([]);
	});

	it("negative control — IMPORTING the narrow symbol and using it is not laundering", () => {
		const { findings } = evaluate({
			"layers/core-api/work/src/index.ts":
				'import { escapeLikePattern } from "@hyperidle/db";\nexport const use = (s: string) => escapeLikePattern(s);',
		});
		expect(findings).toEqual([]);
	});

	it("counts every `export … from` as its population, not just the violating subset", () => {
		// Keying the floor to the violations would kill the rule the day someone tidies up the last
		// legitimate cross-package re-export.
		const { rule, census } = evaluate({
			"layers/core-api/work/src/store.ts": "export const x = 1;",
			"layers/core-api/work/src/index.ts":
				'export { x } from "./store.js";\nexport type { Bet } from "@hyperidle/db";',
		});
		// Six: the four `export … from` statements — two in the database package's own barrel, two in
		// the service barrel, of which only one crosses a package boundary and none is a violation —
		// plus the two files outside the database package that name it, which is the value half's
		// population.
		expect(rule.scope(census)).toHaveLength(6);
		expect(rule.evaluate(census)).toEqual([]);
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
			locate: buildPackageLocator(census.packages),
			tables: new Set(["teams", "teamMembers"]),
			physicalNames: new Map([
				["teams", "teams"],
				["team_members", "teamMembers"],
			]),
		});
		expect([...writeSetOf("layers/core-api/src/__tests__/a.test.ts")].sort()).toEqual([
			"teamMembers",
			"teams",
		]);
		expect([...writeSetOf("layers/core-api/src/__tests__/b.test.ts")]).toEqual(["teams"]);
	});

	it("derivation direction — an owner writing only one table yields no companion group", () => {
		// The pair only exists because an owner writes BOTH rows together. An owner with a single
		// table in its write set has nothing to pair it with, so the group must not appear at all —
		// not "a group of one", not "paired with itself".
		const repo = syntheticRepo({
			"framework/shared/events.ts": "",
			"layers/core-api/org/package.json": JSON.stringify({ name: "@hyperidle/org" }),
			"layers/core-api/org/src/store.ts": `
				import { teams } from "@hyperidle/db";
				export async function createTeam(db: any, v: any) {
					await db.insert(teams).values(v);
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
				tables: new Set(["teams"]),
			},
			() => "org",
		);
		expect(groups.has("teams")).toBe(false);
		expect(groups.size).toBe(0);
	});

	it("crossingRules — a violation is reported at error, unconditionally", () => {
		// AU31 removed the severity dial (`governance/rule-severity.json`, `severityOf`) entirely — a
		// new architectural rule now lands with its violations already fixed, so every crossing
		// `decide()` calls forbidden reports at `error`. No declaration to consult, no flip to prove.
		const architecture = {
			containment: { compositionRootRoles: ["application"], repoRootIsCompositionRoot: true },
			surfaces: {},
			endpoints: {
				httpApiLayers: { layers: [], why: "not used here" },
				mcpRouter: { host: "agent-execution", alsoDialledBy: [], why: "not used here" },
			},
			eventBus: { host: "framework", typesModule: "", why: "not used here" },
			rawRuntime: { host: "agent-execution", why: "not used here" },
			oneDoorSurfaces: {
				surfaces: [],
				foreignTableWriteMissingCompanion: true,
				why: "not used here",
			},
		} as unknown as Architecture;

		const crossing: DetectedCrossing = {
			crossing: {
				kind: "table:write",
				source: { sort: "package", name: "other", role: "service" },
				target: {
					sort: "table",
					table: "knowledgeItems",
					owner: "knowledge",
					missingCompanions: ["knowledgeAppProjection"],
				},
			},
			file: "layers/core-api/other/src/__tests__/x.integration.test.ts",
			line: 12,
			world: "development",
			detail: "writes knowledgeItems without knowledgeAppProjection",
		};

		const floors = new Map<Kind, number>([["table:write", 1]]);

		// `Rule.evaluate` is typed to take a Census — these rules never read it (the violations are
		// already closed over), but the call site still has to pass one.
		const unusedCensus = buildCensus({ files: [], readFile: () => "" });

		const findings = crossingRules({
			architecture,
			crossings: [crossing],
			floors,
		}).flatMap((rule) => rule.evaluate(unusedCensus));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("error");
	});
});
