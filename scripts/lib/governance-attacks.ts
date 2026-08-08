/**
 * AU28 — break-testing as a standing practice.
 *
 * > Founder: "We should always check if the linter works by manually adjusting some things and
 * > trying to break it."
 *
 * That had happened exactly once, by hand, in a review — and it found six working bypasses. This
 * file is that practice turned into a gate. Every case is a piece of real code, written the way
 * someone would plausibly write it, overlaid onto the LIVE repository through the census's injected
 * `readFile` seam. Nothing is written to disk.
 *
 * @lore AU28: the overlay is what makes this honest. `--fixtures` already existed, but its synthetic
 * 40-file tree has no database package, no table owners and no service barrels — which is precisely
 * why the table-alias, raw-SQL and re-export bypasses were invisible to it. Here the tree IS the
 * repository: a real package, real owners, real surfaces, real barrels. The census's injected-I/O
 * design is what makes that free.
 *
 * @lore AU28 — the four anti-rot properties, so this harness does not become `au6` itself:
 *   1. Every attack must produce its expected finding. That is the assertion.
 *   2. Every attack has a CONTROL twin — the same act written the legal way, asserting NO finding at
 *      that path. Without twins a detector that flags everything passes every attack.
 *   3. The overlay must be ADDITIVE and the mutations must land on files that exist. The runner
 *      fails if an overlay path already exists or a mutated path does not. That is what stops the
 *      live tier from silently testing nothing after a rename.
 *   4. A REGISTERED GOVERNANCE RULE WITH NO POSITIVE ATTACK CASE IS A BUILD ERROR. From the commit
 *      this lands, a new rule cannot ship without a break-test that expects it to REPORT something,
 *      and the detectors that had no behavioural test at all are closed permanently rather than once.
 *      "Has a case" alone was not enough: `crossing-event` satisfied it with a control twin, which a
 *      detector reporting nothing forever also satisfies.
 *
 * @lore AU28 — the trap that costs an hour: an overlay filename must NOT start a path segment with
 * `__`. `hasDunderSegment` splits on `/` and a FILENAME is a segment, so `__attack-x.ts` classifies
 * as development and a production attack silently becomes a development one — which changes the
 * verdict and makes the case pass for the wrong reason.
 */

import { type CrossingsResult, type DetectorFloor, detectCrossings } from "./crossings.js";
import { buildDbSurfaceIndex, type DatabasePackageConfig } from "./db-surfaces.js";
import type { Architecture } from "./governance-model.js";
import type { MisplacedFiles, TableOwners } from "./governance-registry.js";
import type { Finding, Rule } from "./governance-rules.js";
import { buildCensus, type Census, type WorkspaceRoleRule } from "./repo-census.js";
import { classificationTotal } from "../rules/classification-total.js";
import { type FloorRecord, floorVerdict } from "../rules/floors-tight.js";
import { misplacementLedger } from "../rules/misplacement-ledger.js";
import { noPerFileAllowances } from "../rules/no-per-file-allowances.js";
import { noStaleBuildArtifacts } from "../rules/no-stale-build-artifacts.js";
import { patternLive } from "../rules/pattern-live.js";

// ---------------------------------------------------------------------------------------------
// The case shape
// ---------------------------------------------------------------------------------------------

export type AttackExpectation =
	/** A violation of the model, at this path, under this group key. */
	| { readonly sort: "violation"; readonly file: string; readonly groupKey: string }
	/** A finding from a named rule, at this path. */
	| { readonly sort: "finding"; readonly file: string; readonly ruleId: string; readonly messageContains: string }
	/** The census refuses to build a verdict at all. */
	| { readonly sort: "throws"; readonly messageContains: string }
	/** The CONTROL twin: the same act, written legally. Nothing may be reported at this path. */
	| { readonly sort: "clean"; readonly file: string };

export interface Attack {
	readonly id: string;
	/** The style someone would plausibly write, in one line. */
	readonly detail: string;
	/** Rule ids this case exercises. Property 4 checks the union against the live registry. */
	readonly rules: readonly string[];
	/** Files ADDED to the tree. Each path must not already exist. */
	readonly overlay?: Readonly<Record<string, string>>;
	/** Files REWRITTEN from their real content. Each path must already exist. */
	readonly mutate?: Readonly<Record<string, (existing: string) => string>>;
	readonly expect: AttackExpectation;
	/**
	 * True when the case cannot share a census with the others — it throws, or it rewrites a file the
	 * rest of the tree depends on. Isolated cases cost one full census each, so use sparingly.
	 */
	readonly isolate?: boolean;
}

/** A case that needs no tree at all: it drives a rule directly with synthetic inputs. */
export interface StandaloneAttack {
	readonly id: string;
	readonly detail: string;
	readonly rules: readonly string[];
	/**
	 * True when this case asserts the rule REPORTS something. Property 4 needs one per registered rule.
	 *
	 * Declared rather than inferred: a tree case announces its polarity in `expect.sort`, and a
	 * standalone case has no equivalent structure to read it off. A control written as a standalone
	 * says `positive: false` and does not count towards coverage.
	 */
	readonly positive: boolean;
	/** Returns null on pass, or a human-readable failure reason. */
	readonly run: () => string | null;
}

export interface AttackResult {
	readonly id: string;
	readonly detail: string;
	readonly failure: string | null;
}

// ---------------------------------------------------------------------------------------------
// The tree the attacks are written against
// ---------------------------------------------------------------------------------------------

/**
 * Paths the attack set writes against, named once.
 *
 * These are REAL paths in the repository and the runner asserts they exist, so a rename fails the
 * build with a clear message rather than quietly making the attacks test nothing.
 */
export const ATTACK_ANCHORS = {
	/** A service in one layer, whose barrel is the laundering vector. */
	serviceDir: "layers/core-api/work/src",
	serviceBarrel: "layers/core-api/work/src/index.ts",
	/** A service in ANOTHER layer, for a cross-layer reach. */
	otherLayerBarrel: "layers/agent-orchestration/src/index.ts",
	/** A layer's own source root. */
	layerDir: "layers/core-api/src",
	/** A development directory inside a production package. */
	developmentDir: "layers/core-api/src/__tests__",
	/** The database schema, for the unowned-table case. */
	schemaModule: "framework/db/src/schema.ts",
	/** The database package's own barrel, for the unmapped-module case. */
	dbBarrel: "framework/db/src/index.ts",
	/** A FRAMEWORK package's source root — the one role the bus host clause forbids from publishing. */
	frameworkDir: "framework/db/src",
	/** A manifest a cross-layer dependency can be added to. */
	serviceManifest: "layers/core-api/work/package.json",
} as const;

/**
 * A table the ATTACKING package does not own, and one it does.
 *
 * `bets` is owned by `work`; `teams` is owned by `org`. An attack from inside `work` writing `teams`
 * is a foreign write; the same file writing `bets` is the control.
 */
const FOREIGN_TABLE = { symbol: "teams", physical: "teams" } as const;
const OWN_TABLE = { symbol: "bets", physical: "bets" } as const;

const KEY = {
	serviceForeignWrite: "service → db:table (other) [table:write] production",
	serviceForeignRead: "service → db:table (other) [table:read] production",
	serviceRawRuntime: "service → raw runtime [capability] production",
	layerOtherLayer: "layer → layer (other) [import] production",
	serviceOtherLayerManifest: "service → layer (other) [manifest] production",
	serviceOtherLayerDi: "service → layer (other) [di] production",
	serviceMcpRouter: "service → MCP router [mcp] production",
	serviceUnknownSurface: "service → db:unknown [import] production",
	frameworkEventBus: "framework → EventBus [event] production",
} as const;

// ---------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------

const a = ATTACK_ANCHORS;

/**
 * Every attack, each paired with the control that proves the detector is not simply flagging
 * everything. The `at HEAD` note on each RED case records what it was written to catch.
 */
export const ATTACKS: readonly Attack[] = [
	// --- C2: the table resolved through its BINDING, not its spelling ------------------------
	{
		id: "alias-import",
		detail: "a foreign table imported under an alias — `import { teams as T }`, then `insert(T)`",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-alias-import.ts`]:
				`import { ${FOREIGN_TABLE.symbol} as T } from "@hyperidle/db";\n` +
				`export const write = (db: { insert: (t: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(T).values({});\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-alias-import.ts`, groupKey: KEY.serviceForeignWrite },
	},
	{
		id: "alias-import-control",
		detail: "the same alias over the package's OWN table is clean — the alias is not the offence",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-alias-import-control.ts`]:
				`import { ${OWN_TABLE.symbol} as T } from "@hyperidle/db";\n` +
				`export const write = (db: { insert: (t: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(T).values({});\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-alias-import-control.ts` },
	},
	{
		id: "alias-const",
		detail: "a foreign table rebound to a local const — `const t = teams`, then `insert(t)`",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-alias-const.ts`]:
				`import { ${FOREIGN_TABLE.symbol} } from "@hyperidle/db";\n` +
				`const t = ${FOREIGN_TABLE.symbol};\n` +
				`export const write = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(t).values({});\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-alias-const.ts`, groupKey: KEY.serviceForeignWrite },
	},
	{
		id: "alias-foreign-module",
		detail:
			"a local module that happens to export a symbol named like a table is NOT the table — the negative control that keeps the resolver from becoming a name-matcher again",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-lookalike-source.ts`]: `export const ${FOREIGN_TABLE.symbol} = { notATable: true };\n`,
			[`${a.serviceDir}/attack-lookalike-use.ts`]:
				`import { ${FOREIGN_TABLE.symbol} as T } from "./attack-lookalike-source.js";\n` +
				`export const write = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(T).values({});\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-lookalike-use.ts` },
	},

	// --- C3: the table named as a STRING inside a raw SQL template ---------------------------
	{
		id: "raw-sql-foreign-write",
		detail: "a foreign table written through a raw `sql` template, where the name is a string",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-write.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const write = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`insert into ${FOREIGN_TABLE.physical} (id) values ('x')\`);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-raw-sql-write.ts`, groupKey: KEY.serviceForeignWrite },
	},
	{
		id: "raw-sql-foreign-read",
		detail: "the read half — `select … from` a foreign table in a raw template",
		rules: ["crossing-table-read"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-read.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const read = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`select id from ${FOREIGN_TABLE.physical} where id = 'x'\`);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-raw-sql-read.ts`, groupKey: KEY.serviceForeignRead },
	},
	{
		id: "raw-sql-schema-qualified",
		detail: "the same raw write with the schema spelled out — `insert into public.teams`, which the bare-name anchor missed",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-qualified.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const write = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`insert into public.${FOREIGN_TABLE.physical} (id) values ('x')\`);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-raw-sql-qualified.ts`, groupKey: KEY.serviceForeignWrite },
	},
	{
		id: "raw-sql-cte-first-write",
		detail: "a CTE-first statement — `with … as (select …) update teams set …` — whose LEADING verb is not the verb that decides",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-cte.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const write = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`with recent as (select id from ${OWN_TABLE.physical}) update ${FOREIGN_TABLE.physical} set name = 'x'\`);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-raw-sql-cte.ts`, groupKey: KEY.serviceForeignWrite },
	},
	{
		id: "raw-sql-cte-read-control",
		detail:
			"a CTE-first statement that only READS still keys as a read — the control that stops `any write verb anywhere` from calling every template a write",
		rules: ["crossing-table-read"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-cte-read.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const read = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`with recent as (select id from ${FOREIGN_TABLE.physical}) select id from recent\`);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-raw-sql-cte-read.ts`, groupKey: KEY.serviceForeignRead },
	},
	{
		id: "raw-sql-control-prose",
		detail:
			"an unanchored mention of a table name in a comment, and a fragment interpolating a column, produce nothing — the false-positive control",
		rules: ["crossing-table-read", "crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-control.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`// rebuild the ${FOREIGN_TABLE.physical} cache — mentions the name, names no table\n` +
				`export const fragment = (title: string) => sql\`lower(title) = \${title}\`;\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-raw-sql-control.ts` },
	},

	// --- Ruling 14: one door, whichever way the call is spelled ------------------------------
	{
		id: "spawn-agent-cli",
		detail: "an agent CLI spawned outside the one runtime door",
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-spawn-harness.ts`]:
				`import { spawn } from "node:child_process";\n` + `export const go = () => spawn("claude", ["-p", "do the thing"]);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-spawn-harness.ts`, groupKey: KEY.serviceRawRuntime },
	},
	{
		id: "exec-string-harness",
		detail: "the same spawn written as a COMMAND STRING — `execSync(\"claude -p …\")` — a different API, the same act",
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-exec-harness.ts`]:
				`import { execSync } from "node:child_process";\n` + `export const go = () => execSync("claude -p 'do the thing'");\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-exec-harness.ts`, groupKey: KEY.serviceRawRuntime },
	},
	{
		id: "exec-string-control",
		detail: "`execSync(\"git show …\")` is an ordinary CLI, not a model call — the control for the first-token split",
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-exec-control.ts`]:
				`import { execSync } from "node:child_process";\n` + `export const go = () => execSync("git show HEAD:CLAUDE.md");\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-exec-control.ts` },
	},
	{
		id: "const-bound-harness-spawn",
		detail: "the binary name lifted into a named constant — `const AGENT_CLI = \"claude\"; spawn(AGENT_CLI, …)`, one keystroke around the one-door rule",
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-const-spawn.ts`]:
				`import { spawn } from "node:child_process";\n` +
				`const AGENT_CLI = "claude";\n` +
				`export const go = () => spawn(AGENT_CLI, ["-p", "do the thing"]);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-const-spawn.ts`, groupKey: KEY.serviceRawRuntime },
	},
	{
		id: "const-bound-spawn-control",
		detail: "an ordinary CLI behind the same constant is clean — the constant is not the offence, the binary is",
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-const-spawn-control.ts`]:
				`import { spawn } from "node:child_process";\n` +
				`const TOOL = "git";\n` +
				`export const go = () => spawn(TOOL, ["status", "--short"]);\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-const-spawn-control.ts` },
	},
	{
		id: "raw-runtime-in-a-test-is-clean",
		detail:
			"a DEVELOPMENT file spawning the agent CLI directly is clean — the one-runtime-door requirement is production-only; a later founder ruling narrowed it because recording/pricing/replay/provider-agnosticism are shipped-product properties, not development-tooling ones",
		rules: ["crossing-capability"],
		overlay: {
			[`${a.developmentDir}/attack-dev-spawn.test.ts`]:
				`import { spawn } from "node:child_process";\n` + `export const go = () => spawn("codex", ["exec"]);\n`,
		},
		expect: { sort: "clean", file: `${a.developmentDir}/attack-dev-spawn.test.ts` },
	},

	// --- C1: re-export laundering -------------------------------------------------------------
	{
		id: "reexport-table",
		detail: "a service barrel re-exporting its own table, so its layer can obtain it transitively",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-reexport-table.ts`]: `export { ${OWN_TABLE.symbol} as betsTable } from "@hyperidle/db";\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.serviceDir}/attack-reexport-table.ts`,
			ruleId: "no-laundered-re-exports",
			messageContains: "may never be republished across a package boundary",
		},
	},
	{
		id: "reexport-table-as-a-value",
		detail: "the same republication written as a VALUE — `import { bets }; export const betsTable = bets`, which `export … from` detection never sees",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-reexport-table-value.ts`]:
				`import { ${OWN_TABLE.symbol} } from "@hyperidle/db";\n` + `export const betsTable = ${OWN_TABLE.symbol};\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.serviceDir}/attack-reexport-table-value.ts`,
			ruleId: "no-laundered-re-exports",
			messageContains: "may never be republished across a package boundary",
		},
	},
	{
		id: "reexport-table-as-a-value-two-file",
		detail:
			"the two-file spelling — the value alias in one module, a WITHIN-package `export … from` in the barrel. The within-package narrowing waves the second hop through, so the first hop is where it has to be caught.",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-table-exports.ts`]:
				`import { ${OWN_TABLE.symbol} } from "@hyperidle/db";\n` + `export const launderedBets = ${OWN_TABLE.symbol};\n`,
			[`${a.serviceDir}/attack-table-barrel.ts`]: `export { launderedBets } from "./attack-table-exports.js";\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.serviceDir}/attack-table-exports.ts`,
			ruleId: "no-laundered-re-exports",
			messageContains: "may never be republished across a package boundary",
		},
	},
	{
		id: "reexport-table-value-control",
		detail:
			"importing the OWN table and USING it — reading it, and exporting an unrelated value — is not publication. Without this the rule would flag every legitimate consumer of a table.",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-table-value-control.ts`]:
				`import { ${OWN_TABLE.symbol} } from "@hyperidle/db";\n` +
				`export const label = "${OWN_TABLE.symbol}";\n` +
				`export const read = (db: { select: () => { from: (t: unknown) => unknown } }) =>\n` +
				`\tdb.select().from(${OWN_TABLE.symbol});\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-table-value-control.ts` },
	},
	{
		id: "reexport-narrow-surface",
		detail:
			"a layer barrel re-exporting a `framework/api-contract` symbol (reach: [layer]), whose audience is narrower than everyone" +
			" — AU29 re-anchor: `db:util` (the previous anchor, `escapeLikePattern`) no longer exists, its exports having moved to " +
			"`framework/shared` (reach: everyone), so the DB package has no narrow-reach surface left at all",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.layerDir}/attack-reexport-contract.ts`]: `export type { AuthMeResponse } from "@hyperidle/api-contract";\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.layerDir}/attack-reexport-contract.ts`,
			ruleId: "no-laundered-re-exports",
			messageContains: "reachable by a named audience",
		},
	},
	{
		id: "reexport-everyone-control",
		detail:
			"re-exporting a row type (reach `everyone`) launders nothing — any consumer could import it directly. Without this control the rule dies of noise.",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-reexport-rowtype.ts`]: `export type { Bet } from "@hyperidle/db";\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-reexport-rowtype.ts` },
	},
	{
		id: "reexport-import-control",
		detail: "the same narrow symbol IMPORTED and used, rather than re-exported, is not laundering",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.layerDir}/attack-import-contract.ts`]:
				`import type { AuthMeResponse } from "@hyperidle/api-contract";\n` +
				`export type Wrapped = { readonly value: AuthMeResponse };\n`,
		},
		expect: { sort: "clean", file: `${a.layerDir}/attack-import-contract.ts` },
	},

	// --- regression locks on what already worked ----------------------------------------------
	{
		id: "cross-layer-import",
		detail: "a layer naming another layer sideways",
		rules: ["crossing-import"],
		overlay: {
			[`${a.layerDir}/attack-cross-layer.ts`]:
				`import { buildAgentOrchestrationApp } from "@hyperidle/agent-orchestration";\n` +
				`export const reach = buildAgentOrchestrationApp;\n`,
		},
		expect: { sort: "violation", file: `${a.layerDir}/attack-cross-layer.ts`, groupKey: KEY.layerOtherLayer },
	},
	{
		id: "production-imports-development",
		detail: "a production file naming a development file",
		rules: ["no-production-imports-development"],
		overlay: {
			[`${a.developmentDir}/attack-dev-helper.ts`]: "export const helper = 1;\n",
			[`${a.layerDir}/attack-uses-development.ts`]:
				`import { helper } from "./__tests__/attack-dev-helper.js";\nexport const x = helper;\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.layerDir}/attack-uses-development.ts`,
			ruleId: "no-production-imports-development",
			messageContains: "development",
		},
	},
	{
		id: "foreign-table-write",
		detail: "the plain, unaliased foreign write — the case that always worked, locked in",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-plain-foreign-write.ts`]:
				`import { ${FOREIGN_TABLE.symbol} } from "@hyperidle/db";\n` +
				`export const write = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(${FOREIGN_TABLE.symbol}).values({});\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-plain-foreign-write.ts`,
			groupKey: KEY.serviceForeignWrite,
		},
	},
	{
		id: "missing-companion",
		detail: "a test creating a team with no membership row — Ruling 13's companion rule",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.developmentDir}/attack-missing-companion.test.ts`]:
				`import { teams } from "@hyperidle/db";\n` +
				`export const seed = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(teams).values({});\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.developmentDir}/attack-missing-companion.test.ts`,
			groupKey: "layer → db:table (other) [table:write] development",
		},
	},
	{
		id: "missing-companion-control",
		detail: "the same fixture writing BOTH rows, one of them under an alias, is credited and clean",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.developmentDir}/attack-companion-supplied.test.ts`]:
				`import { teams, teamMembers as members } from "@hyperidle/db";\n` +
				`export const seed = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) => {\n` +
				`\tdb.insert(teams).values({});\n` +
				`\treturn db.insert(members).values({});\n` +
				`};\n`,
		},
		expect: { sort: "clean", file: `${a.developmentDir}/attack-companion-supplied.test.ts` },
	},
	{
		id: "cross-layer-di",
		detail: "a value from another layer injected into this package's factory — the crossing invisible to import checks",
		rules: ["crossing-di"],
		overlay: {
			[`${a.serviceDir}/attack-di-target.ts`]: "export const makeAttackThing = (_dep: unknown) => 1;\n",
			[`${a.serviceDir}/attack-di-wiring.ts`]:
				`import { buildAgentOrchestrationApp } from "@hyperidle/agent-orchestration";\n` +
				`import { makeAttackThing } from "./attack-di-target.js";\n` +
				`export const wired = makeAttackThing(buildAgentOrchestrationApp);\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-di-wiring.ts`, groupKey: KEY.serviceOtherLayerDi },
	},
	{
		id: "mcp-register",
		detail: "a tool registered on the MCP router from outside the layer that hosts it",
		rules: ["crossing-mcp"],
		overlay: {
			[`${a.serviceDir}/attack-mcp.ts`]:
				`export const wire = (router: { registerTool: (n: string) => void }) => router.registerTool("attack");\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-mcp.ts`, groupKey: KEY.serviceMcpRouter },
	},
	{
		id: "api-dial",
		detail: "a raw `fetch` at a path served by a layer that publishes NO HTTP API",
		rules: ["crossing-api"],
		overlay: {
			[`${a.serviceDir}/attack-api-dial.ts`]: `export const dial = () => fetch("/api/mcp/token");\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-api-dial.ts`, groupKey: "service → agent-execution [api] production" },
	},
	{
		id: "api-control",
		detail:
			"the same raw fetch at a path a layer DOES publish is allowed — dialling a declared door is the legal act, and the rule is about undeclared ones",
		rules: ["crossing-api"],
		overlay: {
			[`${a.serviceDir}/attack-api-control.ts`]: `export const dial = () => fetch("/api/runs/active-counts");\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-api-control.ts` },
	},
	{
		id: "event-emit-from-the-bus-host",
		detail:
			"the framework that PROVIDES the bus publishing on it — the one event crossing the model forbids, and the positive case `crossing-event` had none of",
		rules: ["crossing-event"],
		overlay: {
			[`${a.frameworkDir}/attack-framework-emit.ts`]:
				`export const fire = (eventBus: { emit: (e: unknown) => void }) => eventBus.emit({ type: "agent_run_lifecycle_changed" });\n`,
		},
		expect: { sort: "violation", file: `${a.frameworkDir}/attack-framework-emit.ts`, groupKey: KEY.frameworkEventBus },
	},
	{
		id: "event-emit-control",
		detail:
			"emitting a declared bus event from a service is ALLOWED — anyone but the bus host may publish. The control for the event detector.",
		rules: ["crossing-event"],
		overlay: {
			[`${a.serviceDir}/attack-event.ts`]:
				`export const fire = (eventBus: { emit: (e: unknown) => void }) => eventBus.emit({ type: "agent_run_lifecycle_changed" });\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-event.ts` },
	},
	{
		id: "undeclared-db-surface",
		detail:
			"a barrel export of a database module `architecture.json` does not name resolves to db:unknown, not to a guess" +
			" — AU29 re-anchor: the previous anchor (`readSystemPromptTemplate`, a real live unplaced symbol) was placed by " +
			"AU29 itself, so this fabricates the same shape — a new module the registry does not name — on the post-AU29 tree",
		rules: ["crossing-import"],
		overlay: {
			[`${a.frameworkDir}/attack-unmapped-module.ts`]: `export function attackUnmapped(): string {\n\treturn "unmapped";\n}\n`,
			[`${a.serviceDir}/attack-deep-db-import.ts`]:
				`import { attackUnmapped } from "@hyperidle/db";\nexport const read = attackUnmapped;\n`,
		},
		mutate: {
			[a.dbBarrel]: (existing) => `${existing}export { attackUnmapped } from "./attack-unmapped-module.js";\n`,
		},
		expect: { sort: "violation", file: `${a.serviceDir}/attack-deep-db-import.ts`, groupKey: KEY.serviceUnknownSurface },
	},
	{
		id: "manifest-cross-layer-dependency",
		detail: "a service declaring another layer as a dependency in its manifest",
		rules: ["crossing-manifest"],
		mutate: {
			[a.serviceManifest]: (existing) => {
				const parsed = JSON.parse(existing) as { dependencies?: Record<string, string> };
				parsed.dependencies = { ...parsed.dependencies, "@hyperidle/agent-orchestration": "*" };
				return JSON.stringify(parsed, null, "\t");
			},
		},
		expect: { sort: "violation", file: a.serviceManifest, groupKey: KEY.serviceOtherLayerManifest },
	},

	// --- Ruling E / D11: the bookkeeping does not come back -----------------------------------
	{
		id: "governance-new-record-file",
		detail: "a new file dropped straight into governance/ — the shape a returning per-file allowance would take",
		rules: ["no-per-file-allowances"],
		overlay: {
			"governance/known-violations.json": `{"note":"looks like a record"}\n`,
		},
		expect: {
			sort: "finding",
			file: "governance/known-violations.json",
			ruleId: "no-per-file-allowances",
			messageContains: "closed set",
		},
	},
	{
		id: "governance-directory-control",
		detail: "the untouched governance/ directory is clean — the control for the closed-set check",
		rules: ["no-per-file-allowances"],
		expect: { sort: "clean", file: "governance/architecture.json" },
	},

	// --- census-level: the misconfiguration that used to fail OPEN ----------------------------
	{
		id: "unclaimed-production-dir",
		detail: "a production directory under `layers/` with no package.json — it used to get composition-root powers",
		rules: [],
		isolate: true,
		overlay: {
			"layers/attack-rogue/src/backdoor.ts":
				`import { buildAgentOrchestrationApp } from "@hyperidle/agent-orchestration";\n` +
				`export const reach = buildAgentOrchestrationApp;\n`,
		},
		expect: { sort: "throws", messageContains: "sits in no workspace package" },
	},
	{
		id: "unowned-new-table",
		detail: "a new table nobody claims in `table-owners.json` — the README promises the build fails, and now it does",
		rules: ["registries-honest"],
		isolate: true,
		mutate: {
			[a.schemaModule]: (existing) =>
				`${existing}\nexport const attackUnclaimedTable = pgTable("attack_unclaimed_table", {});\n`,
		},
		expect: {
			sort: "finding",
			file: "governance/table-owners.json",
			ruleId: "registries-honest",
			messageContains: "claimed by nobody",
		},
	},
];

// ---------------------------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------------------------

export interface AttackTree {
	readonly files: readonly string[];
	readonly readFile: (path: string) => string;
	readonly architecture: Architecture & {
		readonly roles: { readonly byWorkspacePattern: readonly WorkspaceRoleRule[] };
		readonly databasePackage: DatabasePackageConfig;
	};
	readonly tableOwners: TableOwners;
	readonly floors: readonly DetectorFloor[];
	/**
	 * The rules to run over an overlaid tree, and the ids of every rule the build registers.
	 *
	 * The RULES are rebuilt per overlay because most of them close over the detected crossings. The
	 * ID list is what property 4 checks, and it comes from the live registry rather than from here —
	 * a hand-maintained copy would be one more thing to forget.
	 */
	readonly buildRules: (census: Census, detected: CrossingsResult, readFile: (path: string) => string) => readonly Rule[];
	/** How violations are keyed, injected so this module does not import the rule layer. */
	readonly violationsOf: (
		architecture: Architecture,
		crossings: CrossingsResult["crossings"],
	) => { found: { file: string }; key: string }[];
}

interface Overlaid {
	readonly files: string[];
	readonly readFile: (path: string) => string;
}

function applyOverlay(tree: AttackTree, attacks: readonly Attack[]): Overlaid | string {
	const added = new Map<string, string>();
	const present = new Set(tree.files);

	for (const attack of attacks) {
		for (const [path, source] of Object.entries(attack.overlay ?? {})) {
			// Property 3, first half: additive only. A path that already exists means the attack has
			// silently stopped testing what it names.
			if (present.has(path)) return `${attack.id}: overlay path ${path} already exists in the tree — the case is not additive`;
			if (added.has(path)) return `${attack.id}: overlay path ${path} is claimed by another attack`;
			// The FILENAME is the trap. A `__tests__/` directory is a legitimate place to put a case
			// that is MEANT to be development; a filename starting `__` silently reclassifies a case
			// that is meant to be production. Only the second is rejected.
			if ((path.split("/").at(-1) ?? "").startsWith("__")) {
				return `${attack.id}: overlay filename ${path} starts with \`__\`, so it classifies as development whatever directory it sits in — see the lore at the top of this file`;
			}
			added.set(path, source);
		}
		for (const [path, rewrite] of Object.entries(attack.mutate ?? {})) {
			// Property 3, second half: a mutation must land on a file that is really there.
			if (!present.has(path)) return `${attack.id}: mutate path ${path} does not exist — the anchor has moved`;
			added.set(path, rewrite(added.get(path) ?? tree.readFile(path)));
		}
	}

	return {
		files: [...tree.files, ...[...added.keys()].filter((p) => !present.has(p))],
		readFile: (path: string) => added.get(path) ?? tree.readFile(path),
	};
}

function assertAnchors(tree: AttackTree): string | null {
	const present = new Set(tree.files);
	const missing = Object.entries(ATTACK_ANCHORS)
		.filter(([, path]) => !present.has(path) && ![...present].some((p) => p.startsWith(`${path}/`)))
		.map(([name, path]) => `${name} (${path})`);
	return missing.length === 0
		? null
		: `attack anchors no longer exist: ${missing.join(", ")}. Re-root them — an attack against a path that is gone tests nothing.`;
}

/**
 * Property 4: every registered rule must be attacked BY A POSITIVE CASE, and every named rule must be
 * registered.
 *
 * @lore AU28: "has an attack case" was not enough, and the gap was live. `crossing-event` had exactly
 * one case — a CONTROL, expecting `clean` — so a detector that reported nothing forever satisfied the
 * coverage gate. It was worse than vacuous: the control named an event type the bus does not declare,
 * so it was clean for the wrong reason and would have stayed clean if the event detector were deleted
 * outright. A control twin proves a detector is not flagging everything; only a positive case proves
 * it is flagging anything. Both are required, and only the positive one counts here.
 */
export function coverageGaps(attacks: readonly Attack[], standalone: readonly StandaloneAttack[], registered: readonly string[]): string[] {
	const named = new Set([...attacks.flatMap((c) => c.rules), ...standalone.flatMap((c) => c.rules)]);
	const provenToReport = new Set([
		...attacks.filter((c) => c.expect.sort !== "clean").flatMap((c) => c.rules),
		...standalone.filter((c) => c.positive).flatMap((c) => c.rules),
	]);
	const gaps: string[] = [];
	for (const id of registered) {
		if (!named.has(id)) {
			gaps.push(
				`rule "${id}" has no attack case. A registered rule with no break-test is a rule nobody has ` +
					"proved works — add a case to scripts/lib/governance-attacks.ts.",
			);
			continue;
		}
		if (!provenToReport.has(id)) {
			gaps.push(
				`rule "${id}" has only CONTROL cases — every one of them expects nothing to be reported. A rule ` +
					"that reports nothing forever passes those, which is exactly the failure this harness exists to " +
					"catch. Add a case that expects a violation or a finding.",
			);
		}
	}
	const known = new Set(registered);
	for (const id of named) {
		if (!known.has(id)) gaps.push(`attack case names rule "${id}", which the lint does not register.`);
	}
	return gaps;
}

interface PassOutcome {
	readonly results: AttackResult[];
	/** Rule ids the pass actually registered, or null when the pass could not get that far. */
	readonly ruleIds: string[] | null;
}

function runOnePass(tree: AttackTree, attacks: readonly Attack[]): PassOutcome {
	const overlaid = applyOverlay(tree, attacks);
	if (typeof overlaid === "string") {
		return {
			results: attacks.map((attack) => ({ id: attack.id, detail: attack.detail, failure: overlaid })),
			ruleIds: null,
		};
	}

	let census: Census;
	let detected: CrossingsResult;
	let findings: readonly Finding[];
	let ruleIds: string[] = [];
	try {
		census = buildCensus({
			files: overlaid.files,
			readFile: overlaid.readFile,
			roleRules: tree.architecture.roles.byWorkspacePattern,
		});
		detected = detectCrossings(
			{
				census,
				readFile: overlaid.readFile,
				mcpRouterHost: tree.architecture.endpoints.mcpRouter.host,
				eventTypesModule: tree.architecture.eventBus.typesModule,
				db: buildDbSurfaceIndex(tree.architecture.databasePackage, overlaid.readFile),
				tableOwners: tree.tableOwners,
				frameworkSurfaces: frameworkSurfacesOf(tree.architecture, census),
			},
			tree.floors,
		);
		const rules = tree.buildRules(census, detected, overlaid.readFile);
		ruleIds = rules.map((rule) => rule.id);
		findings = rules.flatMap((rule) => rule.evaluate(census));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			results: attacks.map((attack) => ({
				id: attack.id,
				detail: attack.detail,
				failure:
					attack.expect.sort === "throws"
						? message.includes(attack.expect.messageContains)
							? null
							: `expected a throw containing ${JSON.stringify(attack.expect.messageContains)}, got: ${message}`
						: `the pass threw before this case could be judged: ${message}`,
			})),
			ruleIds: null,
		};
	}

	const violations = tree.violationsOf(tree.architecture, detected.crossings);

	const results = attacks.map((attack): AttackResult => {
		const expected = attack.expect;
		const judge = (): string | null => {
			switch (expected.sort) {
				case "throws":
					return "expected the census to refuse a verdict, and it built one";
				case "violation": {
					const hit = violations.filter((v) => v.found.file === expected.file);
					if (hit.length === 0) return `no violation reported for ${expected.file} — this evasion is invisible`;
					return hit.some((v) => v.key === expected.groupKey)
						? null
						: `reported ${hit.map((v) => v.key).join(", ")}, expected ${JSON.stringify(expected.groupKey)}`;
				}
				case "finding": {
					const hit = findings.filter((f) => f.path === expected.file && f.ruleId === expected.ruleId);
					if (hit.length === 0) return `no ${expected.ruleId} finding at ${expected.file}`;
					return hit.some((f) => f.message.includes(expected.messageContains))
						? null
						: `reported ${hit.map((f) => f.message).join(" | ")}, expected one containing ${JSON.stringify(expected.messageContains)}`;
				}
				case "clean": {
					const reported = [
						...violations.filter((v) => v.found.file === expected.file).map((v) => v.key),
						...findings.filter((f) => f.path === expected.file && f.severity === "error").map((f) => f.ruleId),
					];
					return reported.length === 0 ? null : `the control was reported: ${reported.join(", ")}`;
				}
			}
		};
		return { id: attack.id, detail: attack.detail, failure: judge() };
	});
	return { results, ruleIds };
}

/** Framework package name → its surface label. Mirrors the live loader, over the overlaid census. */
function frameworkSurfacesOf(architecture: Architecture, census: Census): Map<string, string> {
	const out = new Map<string, string>();
	for (const pkg of census.packages) {
		if (pkg.role !== "framework") continue;
		const label = `framework/${pkg.name}`;
		if (label in architecture.surfaces) out.set(pkg.name, label);
	}
	return out;
}

/**
 * Run every attack against the tree.
 *
 * @lore AU28: the shared cases run in ONE census pass — one build, one detect, every overlay applied
 * at once — because a census over the live repository costs about five seconds and thirty of them
 * would put the break-tests outside the default gate, which is where checks go to be ignored. Cases
 * marked `isolate` cost a pass each and are kept to the two that genuinely need one.
 *
 * @lore AU32: every crossing rule judges an overlaid tree with `severityOf: () => "error"` (Ruling E) —
 * an overlay is never debt, so nothing here needs a severity declaration of its own.
 */
export function runAttacks(
	tree: AttackTree,
	attacks: readonly Attack[] = ATTACKS,
	standalone: readonly StandaloneAttack[] = STANDALONE_ATTACKS,
): AttackResult[] {
	const anchorFailure = assertAnchors(tree);
	if (anchorFailure !== null) {
		return [{ id: "anchors", detail: "every attack anchor still exists in the tree", failure: anchorFailure }];
	}
	if (standalone.length === 0) {
		return [{ id: "standalone", detail: "the tree-free cases exist", failure: "STANDALONE_ATTACKS is empty" }];
	}

	const shared = attacks.filter((c) => c.isolate !== true);
	const sharedPass = runOnePass(tree, shared);
	const results = [...sharedPass.results];
	for (const isolated of attacks.filter((c) => c.isolate === true)) {
		results.push(...runOnePass(tree, [isolated]).results);
	}

	for (const attack of standalone) {
		let failure: string | null;
		try {
			failure = attack.run();
		} catch (error) {
			failure = `threw: ${String(error)}`;
		}
		results.push({ id: attack.id, detail: attack.detail, failure });
	}

	// Property 4, over the registry the shared pass actually built — never a second hand-kept copy.
	const registered = sharedPass.ruleIds ?? [];
	for (const gap of coverageGaps(attacks, standalone, registered)) {
		results.push({ id: "coverage", detail: "every registered rule is attacked", failure: gap });
	}

	return results;
}

// ---------------------------------------------------------------------------------------------
// Cases that need no tree
// ---------------------------------------------------------------------------------------------

/** A floor set the band rule can be driven with, without touching the tree. */
const floorCase = (
	id: string,
	live: number,
	floor: number,
	floorKind: "magnitude" | "existence",
): FloorRecord => ({ id, live, floor, floorKind });

export const STANDALONE_ATTACKS: readonly StandaloneAttack[] = [
	{
		id: "slack-floor",
		detail: "a magnitude floor sitting at half its live count no longer measures anything",
		rules: ["floors-tight"],
		positive: true,
		run: () => {
			const verdict = floorVerdict(floorCase("detector:pretend", 1000, 500, "magnitude"));
			if (verdict.sort !== "slack") return `expected a slack verdict, got ${verdict.sort}`;
			// The MIDDLE of the band (1000 - 200/2), never its edge (1000 - 200). A floor written at the
			// edge is one added file from red, which is how the whole floor set came to sit there at once.
			return verdict.suggested === 900 ? null : `expected the fix to be the band's middle, 900, got ${verdict.suggested}`;
		},
	},
	{
		id: "floor-on-the-edge-warns-before-it-errors",
		detail:
			"a floor sitting exactly ON the allowed edge WARNS rather than erroring — the state the whole floor set was in, one file from a red build",
		rules: ["floors-tight"],
		positive: true,
		run: () => {
			// live 1000, allowed 200. A floor of 800 is exactly on the edge.
			const edge = floorVerdict(floorCase("detector:pretend", 1000, 800, "magnitude"));
			if (edge.sort !== "approaching") return `a floor on the edge of its band reported ${edge.sort}, not a warning`;
			if (edge.suggested !== 900) return `the warning named ${edge.suggested} to write, not the band's middle, 900`;
			if (!edge.message.includes("governance:floors")) return "the warning did not name the command that prints the value to write";
			// One past the edge is an error, and the middle is silent — the band has three states, not two.
			const past = floorVerdict(floorCase("detector:pretend", 1000, 799, "magnitude"));
			if (past.sort !== "slack") return `a floor past the edge reported ${past.sort}, not an error`;
			const middle = floorVerdict(floorCase("detector:pretend", 1000, 900, "magnitude"));
			return middle.sort === "ok" ? null : `a floor at the middle of its band reported ${middle.sort} instead of staying silent`;
		},
	},
	{
		id: "existence-floor-exempt",
		detail:
			"an existence floor of 1 against 94 live files is NOT slack — without this the band would demand a nonsensical floor. A control: it asserts nothing is reported.",
		rules: ["floors-tight"],
		positive: false,
		run: () => {
			const verdict = floorVerdict(floorCase("pattern:pretend", 94, 1, "existence"));
			return verdict.sort === "ok" ? null : `an existence floor was reported as ${verdict.sort}`;
		},
	},
	{
		id: "magnitude-floor-of-one-cannot-dodge",
		detail: "declaring `1` on a MAGNITUDE floor is still slack — `floorKind` is not an escape hatch",
		rules: ["floors-tight"],
		positive: true,
		run: () => {
			const verdict = floorVerdict(floorCase("pattern:pretend", 94, 1, "magnitude"));
			return verdict.sort === "slack" ? null : `expected slack, got ${verdict.sort}`;
		},
	},
	{
		id: "dead-classification-pattern",
		detail: "a classification pattern that has stopped matching files is reported, and a live one is not",
		rules: ["pattern-live"],
		positive: true,
		run: () => {
			// Sized so `default-production` clears its floor while every development pattern is at zero:
			// without a pattern that is genuinely ALIVE, "reports a dead pattern" is indistinguishable
			// from "reports everything".
			const files = Array.from({ length: 800 }, (_, i) => `layers/a/src/f${i}.ts`);
			const census = buildCensus({ files, readFile: () => "" });
			const reported = patternLive.evaluate(census).map((f) => f.message).join("\n");
			if (!reported.includes("dunder-segment")) return "a pattern matching zero files was not reported";
			if (reported.includes("default-production")) return "reported a pattern that is still matching files";
			return null;
		},
	},
	{
		id: "census-duplicate-path",
		detail: "the same path twice in the census input is a defect in the input, not a silent dedupe",
		rules: ["classification-total"],
		positive: true,
		run: () => {
			const census = buildCensus({ files: ["layers/a/src/x.ts", "layers/a/src/x.ts"], readFile: () => "" });
			const reported = classificationTotal.evaluate(census).map((f) => f.message).join("\n");
			if (!reported.includes("duplicate paths")) return "a duplicated census path was not reported";
			const clean = buildCensus({ files: ["layers/a/src/x.ts", "docs/y.md"], readFile: () => "" });
			return classificationTotal.evaluate(clean).length === 0 ? null : "a well-formed census was reported";
		},
	},
	{
		id: "misplacement-ledger-count",
		detail:
			"the misplacement ledger grown by one entry, and shrunk by one fix that was never committed — both fail, and the exact match does not",
		rules: ["misplacement-ledger"],
		positive: true,
		run: () => {
			// A ledger has no live source to derive from, so it is driven directly: the tree is two
			// production files, the ledger records both, and the committed count says two.
			const reason = "a preview surface pinned to a production path until the real route lands";
			const census = buildCensus({
				files: ["layers/a/src/one.ts", "layers/a/src/two.ts", "layers/a/src/three.ts", "layers/a/src/four.test.ts"],
				readFile: () => "",
			});
			const ledger = (resolvedFiles: number, files: Record<string, string>): MisplacedFiles => ({
				misplacedFiles: true,
				note: "",
				resolvedFiles,
				files,
			});
			const errorsOf = (l: MisplacedFiles): string[] =>
				misplacementLedger(l)
					.evaluate(census)
					.filter((f) => f.severity === "error")
					.map((f) => f.message);

			const two = { "layers/a/src/one.ts": reason, "layers/a/src/two.ts": reason };

			const exact = misplacementLedger(ledger(2, two)).evaluate(census);
			if (exact.some((f) => f.severity === "error")) return `a ledger that matches its committed count was reported: ${exact[0]?.message}`;
			// Property: every entry is reported on every run, or the ledger is invisible.
			if (exact.filter((f) => f.severity === "warn").length !== 2) return "the ledger's entries were not reported as warnings";

			const grown = errorsOf(ledger(2, { ...two, "layers/a/src/three.ts": reason }));
			if (!grown.some((m) => m.includes("may only shrink"))) return `a ledger grown past its committed count was not refused: ${grown.join(" | ")}`;

			const shrunk = errorsOf(ledger(2, { "layers/a/src/one.ts": reason }));
			if (!shrunk.some((m) => m.includes("without committing the shrink"))) {
				return `a cleared misplacement with a stale count was not reported: ${shrunk.join(" | ")}`;
			}

			// Integrity: an entry must resolve to a tracked file, and must still be classified production.
			const gone = errorsOf(ledger(2, { ...two, "layers/a/src/renamed-away.ts": reason }));
			if (!gone.some((m) => m.includes("is not a tracked file"))) return `an entry naming a path that does not exist was accepted: ${gone.join(" | ")}`;

			const moved = errorsOf(ledger(2, { "layers/a/src/one.ts": reason, "layers/a/src/four.test.ts": reason }));
			if (!moved.some((m) => m.includes("calls it development"))) return `an entry whose file is now development was accepted: ${moved.join(" | ")}`;

			const thin = errorsOf(ledger(2, { "layers/a/src/one.ts": reason, "layers/a/src/two.ts": "later" }));
			return thin.some((m) => m.includes("no real reason")) ? null : `an entry with no reason was accepted: ${thin.join(" | ")}`;
		},
	},
	{
		id: "stale-build-artifact",
		detail: "a compiled `.js` beside its `.ts` source in the guard tree is reported, and the `.ts` alone is not",
		rules: ["no-stale-build-artifacts"],
		positive: true,
		run: () => {
			const census = buildCensus({ files: ["scripts/lib/thing.ts"], readFile: () => "" });
			const dirty = noStaleBuildArtifacts(["scripts/lib/thing.ts", "scripts/lib/thing.js"]).evaluate(census);
			if (dirty.length === 0) return "a stale build artifact was not reported";
			const clean = noStaleBuildArtifacts(["scripts/lib/thing.ts"]).evaluate(census);
			return clean.length === 0 ? null : "a source file with no artifact beside it was reported";
		},
	},
	{
		id: "no-per-file-allowances-shape",
		detail:
			"a nested severity value, a path-shaped severity key, and an undeclared CLI flag each fail the shape checks directly — the well-formed equivalents are silent",
		rules: ["no-per-file-allowances"],
		positive: true,
		run: () => {
			const files = [
				"governance/README.md",
				"governance/architecture.json",
				"governance/decided-rules.json",
				"governance/table-owners.json",
				"governance/rule-severity.json",
				"governance/misplaced-files.json",
				"scripts/governance-lint.ts",
				"scripts/governance-floors.ts",
				"scripts/governance-new-cells.ts",
			];
			const floors: DetectorFloor[] = [
				{ kind: "import", min: 1, floorKind: "magnitude" },
				{ kind: "manifest", min: 1, floorKind: "magnitude" },
				{ kind: "di", min: 1, floorKind: "magnitude" },
				{ kind: "api", min: 1, floorKind: "magnitude" },
				{ kind: "mcp", min: 1, floorKind: "magnitude" },
				{ kind: "event", min: 1, floorKind: "magnitude" },
				{ kind: "capability", min: 1, floorKind: "magnitude" },
				{ kind: "table:read", min: 1, floorKind: "magnitude" },
				{ kind: "table:write", min: 1, floorKind: "magnitude" },
			];
			const cleanKey = "layer → service (other layer) [import] production";
			const cleanCli = 'process.argv.includes("--fixtures");\nprocess.argv.includes("--attacks");\nprocess.argv.includes("--errors-only");\n';
			const run = (severityJson: string, cliSource: string): readonly Finding[] => {
				const contents: Record<string, string> = {
					"governance/rule-severity.json": severityJson,
					"scripts/governance-lint.ts": cliSource,
				};
				const census = buildCensus({ files, readFile: (p) => contents[p] ?? "" });
				return noPerFileAllowances({ floors, readFile: (p) => contents[p] ?? "" }).evaluate(census);
			};
			const wellFormedSeverity = JSON.stringify({ governanceRuleSeverity: true, note: "", severity: { [cleanKey]: "warn" } });

			const clean = run(wellFormedSeverity, cleanCli);
			if (clean.length !== 0) return `a well-formed severity file and CLI set were reported: ${clean.map((f) => f.message).join(" | ")}`;

			const nested = run(
				JSON.stringify({ governanceRuleSeverity: true, note: "", severity: { [cleanKey]: { warn: 1 } } }),
				cleanCli,
			);
			if (!nested.some((f) => f.message.includes("not the string"))) return "a nested severity value was accepted";

			const pathKey = run(
				JSON.stringify({ governanceRuleSeverity: true, note: "", severity: { "scripts/rules/crossings.ts": "warn" } }),
				cleanCli,
			);
			if (!pathKey.some((f) => f.message.includes("does not parse"))) return "a path-shaped severity key was accepted";

			const undeclaredFlag = run(wellFormedSeverity, 'process.argv.includes("--grandfather");\n');
			if (!undeclaredFlag.some((f) => f.message.includes("not one of the declared flags"))) return "an undeclared CLI flag was accepted";

			return null;
		},
	},
];
