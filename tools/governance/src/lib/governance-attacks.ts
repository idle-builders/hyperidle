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

import { classificationTotal } from "../rules/classification-total.js";
import { type FloorRecord, floorVerdict } from "../rules/floors-tight.js";
import { frameworkSurfacesDeclared } from "../rules/framework-surfaces-declared.js";
import { misplacementLedger } from "../rules/misplacement-ledger.js";
import { noPerFileAllowances } from "../rules/no-per-file-allowances.js";
import { noStaleBuildArtifacts } from "../rules/no-stale-build-artifacts.js";
import { patternLive } from "../rules/pattern-live.js";
import { type CrossingsResult, type DetectorFloor, detectCrossings } from "./crossings.js";
import { buildDbSurfaceIndex, type DatabasePackageConfig } from "./db-surfaces.js";
import { type Architecture, decide, type World } from "./governance-model.js";
import type { MisplacedFiles, TableOwners } from "./governance-registry.js";
import type { Finding, Rule } from "./governance-rules.js";
import { buildCensus, type Census, type WorkspaceRoleRule } from "./repo-census.js";

// ---------------------------------------------------------------------------------------------
// The case shape
// ---------------------------------------------------------------------------------------------

export type AttackExpectation =
	/** A violation of the model, at this path, under this group key. */
	| { readonly sort: "violation"; readonly file: string; readonly groupKey: string }
	/** A finding from a named rule, at this path. */
	| {
			readonly sort: "finding";
			readonly file: string;
			readonly ruleId: string;
			readonly messageContains: string;
	  }
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
	/**
	 * A SECOND framework package's source root — a framework source that is NOT the database package,
	 * so an import of `@hyperidle/db` from it is a real crossing rather than a package naming itself.
	 */
	otherFrameworkDir: "framework/api-contract/src",
	/**
	 * A service that IS in `framework/harness-protocol`'s declared audience — the control twin for the
	 * narrow-audience refusal, which is only a test of the audience if the same import from inside the
	 * audience is clean.
	 */
	harnessAudienceDir: "layers/agent-orchestration/run-orchestration/src",
	/** A manifest a cross-layer dependency can be added to. */
	serviceManifest: "layers/core-api/work/package.json",
	/** A layer's own manifest — R1's `exports` field is mutated against this. */
	layerManifest: "layers/core-api/package.json",
	/** One of the layer's own entry files, reachable from its `exports` map — R2's face-population root. */
	layerEntry: "layers/core-api/src/index.ts",
	/** A second layer entry file, for a control that must not collide with the attack's own mutation. */
	layerEntryControl: "layers/core-api/src/app.ts",
	/** An application's composition root — where the §4 composition-handoff spelling is written. */
	applicationDir: "applications/remote-server/src",
} as const;

/**
 * A table the ATTACKING package does not own, and one it does.
 *
 * `tasks` is owned by `work`; `teams` is owned by `org`. An attack from inside `work` writing `teams`
 * is a foreign write; the same file writing `tasks` is the control.
 *
 * @lore BB1: the own-table example was `bets` until that table was deleted and folded into `tasks`.
 * A fixture naming a table the schema no longer declares is not a neutral placeholder — it made
 * `one-work-primitive` fire on the synthetic files, which polluted the expected findings of the
 * rules these cases actually test. Keep this pointed at a table that really exists.
 */
const FOREIGN_TABLE = { symbol: "teams", physical: "teams" } as const;
const OWN_TABLE = { symbol: "tasks", physical: "tasks" } as const;

const KEY = {
	serviceForeignWrite: "service → db:table (other) [table:write] production",
	serviceForeignRead: "service → db:table (other) [table:read] production",
	serviceRawRuntime: "service → raw runtime [capability] production",
	layerOtherLayer: "layer → layer (other) [import] production",
	serviceOtherLayerManifest: "service → layer (other) [manifest] production",
	serviceOtherLayerDi: "service → layer (other) [di] production",
	layerOtherLayerDi: "layer → layer (other) [di] production",
	serviceMcpRouter: "service → MCP router [mcp] production",
	serviceUnknownSurface: "service → db:unknown [import] production",
	frameworkEventBus: "framework → EventBus [event] production",
	frameworkSchemaNamespace: "framework → db:schema-ns [import] production",
	frameworkUnknownSurface: "framework → db:unknown [import] production",
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
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-alias-import.ts`,
			groupKey: KEY.serviceForeignWrite,
		},
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
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-alias-const.ts`,
			groupKey: KEY.serviceForeignWrite,
		},
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
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-raw-sql-write.ts`,
			groupKey: KEY.serviceForeignWrite,
		},
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
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-raw-sql-read.ts`,
			groupKey: KEY.serviceForeignRead,
		},
	},
	{
		id: "raw-sql-schema-qualified",
		detail:
			"the same raw write with the schema spelled out — `insert into public.teams`, which the bare-name anchor missed",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-qualified.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const write = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`insert into public.${FOREIGN_TABLE.physical} (id) values ('x')\`);\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-raw-sql-qualified.ts`,
			groupKey: KEY.serviceForeignWrite,
		},
	},
	{
		id: "raw-sql-cte-first-write",
		detail:
			"a CTE-first statement — `with … as (select …) update teams set …` — whose LEADING verb is not the verb that decides",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.serviceDir}/attack-raw-sql-cte.ts`]:
				`import { sql } from "drizzle-orm";\n` +
				`export const write = (db: { execute: (q: unknown) => unknown }) =>\n` +
				`\tdb.execute(sql\`with recent as (select id from ${OWN_TABLE.physical}) update ${FOREIGN_TABLE.physical} set name = 'x'\`);\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-raw-sql-cte.ts`,
			groupKey: KEY.serviceForeignWrite,
		},
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
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-raw-sql-cte-read.ts`,
			groupKey: KEY.serviceForeignRead,
		},
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
				`import { spawn } from "node:child_process";\n` +
				`export const go = () => spawn("claude", ["-p", "do the thing"]);\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-spawn-harness.ts`,
			groupKey: KEY.serviceRawRuntime,
		},
	},
	{
		id: "exec-string-harness",
		detail:
			'the same spawn written as a COMMAND STRING — `execSync("claude -p …")` — a different API, the same act',
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-exec-harness.ts`]:
				`import { execSync } from "node:child_process";\n` +
				`export const go = () => execSync("claude -p 'do the thing'");\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-exec-harness.ts`,
			groupKey: KEY.serviceRawRuntime,
		},
	},
	{
		id: "exec-string-control",
		detail:
			'`execSync("git show …")` is an ordinary CLI, not a model call — the control for the first-token split',
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-exec-control.ts`]:
				`import { execSync } from "node:child_process";\n` +
				`export const go = () => execSync("git show HEAD:CLAUDE.md");\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-exec-control.ts` },
	},
	{
		id: "const-bound-harness-spawn",
		detail:
			'the binary name lifted into a named constant — `const AGENT_CLI = "claude"; spawn(AGENT_CLI, …)`, one keystroke around the one-door rule',
		rules: ["crossing-capability"],
		overlay: {
			[`${a.serviceDir}/attack-const-spawn.ts`]:
				`import { spawn } from "node:child_process";\n` +
				`const AGENT_CLI = "claude";\n` +
				`export const go = () => spawn(AGENT_CLI, ["-p", "do the thing"]);\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-const-spawn.ts`,
			groupKey: KEY.serviceRawRuntime,
		},
	},
	{
		id: "const-bound-spawn-control",
		detail:
			"an ordinary CLI behind the same constant is clean — the constant is not the offence, the binary is",
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
				`import { spawn } from "node:child_process";\n` +
				`export const go = () => spawn("codex", ["exec"]);\n`,
		},
		expect: { sort: "clean", file: `${a.developmentDir}/attack-dev-spawn.test.ts` },
	},

	// --- C1: re-export laundering -------------------------------------------------------------
	{
		/**
		 * BB1 — the bet vocabulary must not creep back into production code.
		 *
		 * The rule scans the PRODUCTION world with comments stripped, so the
		 * attack is a live reference in a shipping file. The control below proves
		 * it does not simply match the word anywhere: the same token inside a
		 * comment is the historical record of why the merge happened, and must
		 * stay legal.
		 */
		id: "one-work-primitive-live-reference",
		detail: "a production file reintroducing the deleted bet vocabulary as live code",
		rules: ["one-work-primitive"],
		overlay: {
			[`${a.serviceDir}/attack-bet-vocabulary.ts`]: `export function findBet(betId: string): string {\n\treturn betId;\n}\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.serviceDir}/attack-bet-vocabulary.ts`,
			ruleId: "one-work-primitive",
			messageContains: "parentTaskId",
		},
	},
	{
		id: "one-work-primitive-comment-control",
		detail:
			"the same token inside a COMMENT — the record of what a bet was — is prose, not a live reference, and must stay legal",
		rules: ["one-work-primitive"],
		overlay: {
			[`${a.serviceDir}/attack-bet-comment.ts`]: `// A task with no parent is what used to be called a bet (betId is gone).\nexport const parentIsRoot = null;\n`,
		},
		// Scoped to the file, like every other control here: adding any synthetic
		// file shifts a declared population floor, and an unscoped "clean" would
		// be asserting something this case is not about.
		expect: { sort: "clean", file: `${a.serviceDir}/attack-bet-comment.ts` },
	},
	{
		id: "reexport-table",
		detail: "a service barrel re-exporting its own table, so its layer can obtain it transitively",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-reexport-table.ts`]: `export { ${OWN_TABLE.symbol} as tasksTable } from "@hyperidle/db";\n`,
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
		detail:
			"the same republication written as a VALUE — `import { tasks }; export const tasksTable = tasks`, which `export … from` detection never sees",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.serviceDir}/attack-reexport-table-value.ts`]:
				`import { ${OWN_TABLE.symbol} } from "@hyperidle/db";\n` +
				`export const tasksTable = ${OWN_TABLE.symbol};\n`,
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
				`import { ${OWN_TABLE.symbol} } from "@hyperidle/db";\n` +
				`export const launderedBets = ${OWN_TABLE.symbol};\n`,
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
			" — AU29 re-anchor: `db:util` (the previous anchor, `escapeLikePattern`) no longer exists, its exports having left " +
			"`framework/db` altogether, so the DB package has no narrow-reach surface left at all",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.layerDir}/attack-reexport-contract.ts`]: `export type { CoreApiPort } from "@hyperidle/api-contract";\n`,
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
			// @lore BB1: was `Bet`, a row type deleted with the bets table. A fixture
			// naming a symbol the database package no longer exports resolves to
			// `db:unknown`, which made this control report the very finding it
			// exists to prove absent.
			[`${a.serviceDir}/attack-reexport-rowtype.ts`]: `export type { Task } from "@hyperidle/db";\n`,
		},
		expect: { sort: "clean", file: `${a.serviceDir}/attack-reexport-rowtype.ts` },
	},
	{
		id: "reexport-import-control",
		detail: "the same narrow symbol IMPORTED and used, rather than re-exported, is not laundering",
		rules: ["no-laundered-re-exports"],
		overlay: {
			[`${a.layerDir}/attack-import-contract.ts`]:
				`import type { CoreApiPort } from "@hyperidle/api-contract";\n` +
				`export type Wrapped = { readonly value: CoreApiPort };\n`,
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
		expect: {
			sort: "violation",
			file: `${a.layerDir}/attack-cross-layer.ts`,
			groupKey: KEY.layerOtherLayer,
		},
	},
	{
		id: "production-imports-development",
		detail: "a production file naming a development file",
		rules: ["no-production-imports-development"],
		overlay: {
			[`${a.developmentDir}/attack-dev-helper.ts`]: "export const helper = 1;\n",
			[`${a.layerDir}/attack-uses-development.ts`]: `import { helper } from "./__tests__/attack-dev-helper.js";\nexport const x = helper;\n`,
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
	// --- Ruling 13 companion rule — surviving pair after AU44 B1 removed teamMembers --------
	// knowledgeItems and knowledgeAppProjection are both owned by @hyperidle/knowledge and
	// are unconditionally inserted together in its exported `create` function — the
	// companion group that replaced the old teams/teamMembers pair.
	{
		id: "missing-companion",
		detail:
			"a test inserting knowledgeItems without its companion knowledgeAppProjection — Ruling 13's companion rule",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.developmentDir}/attack-missing-companion.test.ts`]:
				`import { knowledgeItems } from "@hyperidle/db";\n` +
				`export const seed = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) =>\n` +
				`\tdb.insert(knowledgeItems).values({});\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.developmentDir}/attack-missing-companion.test.ts`,
			groupKey: "layer → db:table (other) [table:write] development",
		},
	},
	{
		id: "missing-companion-control",
		detail:
			"the same fixture writing BOTH knowledgeItems AND knowledgeAppProjection (under an alias) is credited and clean",
		rules: ["crossing-table-write"],
		overlay: {
			[`${a.developmentDir}/attack-companion-supplied.test.ts`]:
				`import { knowledgeItems, knowledgeAppProjection as proj } from "@hyperidle/db";\n` +
				`export const seed = (db: { insert: (x: unknown) => { values: (v: unknown) => unknown } }) => {\n` +
				`\tdb.insert(knowledgeItems).values({});\n` +
				`\treturn db.insert(proj).values({});\n` +
				`};\n`,
		},
		expect: { sort: "clean", file: `${a.developmentDir}/attack-companion-supplied.test.ts` },
	},

	{
		id: "cross-layer-di",
		detail:
			"a value from another layer injected into this package's factory — the crossing invisible to import checks",
		rules: ["crossing-di"],
		overlay: {
			[`${a.serviceDir}/attack-di-target.ts`]:
				"export const makeAttackThing = (_dep: unknown) => 1;\n",
			[`${a.serviceDir}/attack-di-wiring.ts`]:
				`import { buildAgentOrchestrationApp } from "@hyperidle/agent-orchestration";\n` +
				`import { makeAttackThing } from "./attack-di-target.js";\n` +
				`export const wired = makeAttackThing(buildAgentOrchestrationApp);\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-di-wiring.ts`,
			groupKey: KEY.serviceOtherLayerDi,
		},
	},

	// --- AU31 §4 / §13.3: the composition-handoff spelling law, on the `crossing-di` rule ------
	{
		id: "composition-handoff-inline",
		detail:
			"a composition root calling one layer's boot INLINE, as an argument into another layer's boot — the identifier-spelled crossing the census's DI provenance model catches",
		rules: ["crossing-di"],
		overlay: {
			[`${a.applicationDir}/attack-composition-inline.ts`]:
				`import { bootAgentExecution } from "@hyperidle/agent-execution";\n` +
				`import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";\n` +
				`export const composeInline = () =>\n` +
				`\tbootAgentOrchestration({\n` +
				`\t\tdb: undefined as never,\n` +
				`\t\teventBus: undefined as never,\n` +
				`\t\truntime: { adapterPool: bootAgentExecution(undefined as never) } as never,\n` +
				`\t});\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.applicationDir}/attack-composition-inline.ts`,
			groupKey: KEY.layerOtherLayerDi,
		},
	},
	{
		id: "composition-handoff-mediated-control",
		detail:
			"the SAME handoff, bound to a local first — a face-boot-produced value passed onward by the composition root is composition, not injection (§4); the control this predicate's own design says must stay clean",
		rules: ["crossing-di"],
		overlay: {
			[`${a.applicationDir}/attack-composition-mediated.ts`]:
				`import { bootAgentExecution } from "@hyperidle/agent-execution";\n` +
				`import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";\n` +
				`export const composeMediated = async () => {\n` +
				`\tconst execution = await bootAgentExecution(undefined as never);\n` +
				`\treturn bootAgentOrchestration({\n` +
				`\t\tdb: undefined as never,\n` +
				`\t\teventBus: undefined as never,\n` +
				`\t\truntime: { adapterPool: execution } as never,\n` +
				`\t});\n` +
				`};\n`,
		},
		expect: { sort: "clean", file: `${a.applicationDir}/attack-composition-mediated.ts` },
	},

	// --- AU31 §7, R1: layer-exports-resolve-inside-the-layer -----------------------------------
	{
		id: "layer-export-into-nested-service",
		detail:
			"a layer manifest gains an `exports` entry that resolves straight into one of its own nested Service packages",
		rules: ["layer-exports-resolve-inside-the-layer"],
		mutate: {
			[a.layerManifest]: (existing) => {
				const parsed = JSON.parse(existing) as { exports?: Record<string, string> };
				parsed.exports = { ...parsed.exports, "./attack-r1-nested-service": "./work/src/index.ts" };
				return JSON.stringify(parsed, null, "\t");
			},
		},
		expect: {
			sort: "finding",
			file: a.layerManifest,
			ruleId: "layer-exports-resolve-inside-the-layer",
			messageContains: "nested service package",
		},
	},
	{
		id: "layer-export-into-own-src-control",
		detail:
			"a layer manifest entry that resolves into the layer's OWN `src/` is legal — the control for R1's boundary",
		rules: ["layer-exports-resolve-inside-the-layer"],
		// Isolated: the positive case above also mutates `a.layerManifest`, and this control's whole
		// point is that an entry landing back inside the layer's own source is clean on its own.
		isolate: true,
		mutate: {
			[a.layerManifest]: (existing) => {
				const parsed = JSON.parse(existing) as { exports?: Record<string, string> };
				parsed.exports = { ...parsed.exports, "./attack-r1-own-src": "./src/app.ts" };
				return JSON.stringify(parsed, null, "\t");
			},
		},
		expect: { sort: "clean", file: a.layerManifest },
	},

	// --- AU31 §7.2, R2: service-values-do-not-escape-the-face ----------------------------------
	{
		id: "service-value-escapes-the-face",
		detail:
			"a layer's own module, reachable from its `exports` map, plainly re-exports a Service-imported value — the founding shape this rule exists to catch",
		rules: ["service-values-do-not-escape-the-face"],
		overlay: {
			[`${a.layerDir}/attack-r2-escape.ts`]:
				`import { list } from "@hyperidle/knowledge";\n` +
				`export { list as attackEscapedList };\n`,
		},
		mutate: {
			// Reachable from the `.` entry via an own-module re-export — R2 does not flag THIS line
			// (the specifier names no Service), it makes the overlaid file part of the face population.
			[a.layerEntry]: (existing) => `${existing}\nexport * from "./attack-r2-escape.js";\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.layerDir}/attack-r2-escape.ts`,
			ruleId: "service-values-do-not-escape-the-face",
			messageContains: "@hyperidle/knowledge",
		},
	},
	{
		id: "service-value-produced-by-a-call-control",
		detail:
			"the positional exemption: a bare Service identifier in direct CALLEE position produces a value — calling a Service factory is composition, not laundering",
		rules: ["service-values-do-not-escape-the-face"],
		overlay: {
			[`${a.layerDir}/attack-r2-control.ts`]:
				`import { list } from "@hyperidle/knowledge";\n` +
				`export const attackR2ControlResult = list();\n`,
		},
		mutate: {
			[a.layerEntryControl]: (existing) => `${existing}\nexport * from "./attack-r2-control.js";\n`,
		},
		expect: { sort: "clean", file: `${a.layerDir}/attack-r2-control.ts` },
	},

	// --- AU31 §7, R3: deep-imports-die-with-their-entries ---------------------------------------
	{
		id: "deep-import-of-a-deleted-entry",
		detail:
			"the deep path that used to resolve before the face shrank — `@hyperidle/core-api/service-bootstrap` is no longer a declared `exports` entry",
		rules: ["deep-imports-die-with-their-entries"],
		overlay: {
			[`${a.serviceDir}/attack-r3-deep-import.ts`]:
				`import { registerCoreDomainServices } from "@hyperidle/core-api/service-bootstrap";\n` +
				`export const attackR3 = registerCoreDomainServices;\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.serviceDir}/attack-r3-deep-import.ts`,
			ruleId: "deep-imports-die-with-their-entries",
			messageContains: "service-bootstrap",
		},
	},
	{
		id: "declared-entry-import-control",
		detail:
			"importing a DECLARED entry (`@hyperidle/core-api/boot`) resolves cleanly — the control for R3, written from a composition root (an application), the one role legally allowed to name a layer's face at all",
		rules: ["deep-imports-die-with-their-entries"],
		overlay: {
			[`${a.applicationDir}/attack-r3-declared-import.ts`]:
				`import { bootCoreApi } from "@hyperidle/core-api/boot";\n` +
				`export const attackR3Control = bootCoreApi;\n`,
		},
		expect: { sort: "clean", file: `${a.applicationDir}/attack-r3-declared-import.ts` },
	},

	{
		id: "mcp-register",
		detail: "a tool registered on the MCP router from outside the layer that hosts it",
		rules: ["crossing-mcp"],
		overlay: {
			[`${a.serviceDir}/attack-mcp.ts`]: `export const wire = (router: { registerTool: (n: string) => void }) => router.registerTool("attack");\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-mcp.ts`,
			groupKey: KEY.serviceMcpRouter,
		},
	},
	{
		id: "api-dial",
		detail: "a raw `fetch` at a path served by a layer that publishes NO HTTP API",
		rules: ["crossing-api"],
		overlay: {
			[`${a.serviceDir}/attack-api-dial.ts`]: `export const dial = () => fetch("/api/mcp/token");\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-api-dial.ts`,
			groupKey: "service → agent-execution [api] production",
		},
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
			[`${a.frameworkDir}/attack-framework-emit.ts`]: `export const fire = (eventBus: { emit: (e: unknown) => void }) => eventBus.emit({ type: "agent_run_lifecycle_changed" });\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.frameworkDir}/attack-framework-emit.ts`,
			groupKey: KEY.frameworkEventBus,
		},
	},
	{
		id: "event-emit-control",
		detail:
			"emitting a declared bus event from a service is ALLOWED — anyone but the bus host may publish. The control for the event detector.",
		rules: ["crossing-event"],
		overlay: {
			[`${a.serviceDir}/attack-event.ts`]: `export const fire = (eventBus: { emit: (e: unknown) => void }) => eventBus.emit({ type: "agent_run_lifecycle_changed" });\n`,
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
			[`${a.serviceDir}/attack-deep-db-import.ts`]: `import { attackUnmapped } from "@hyperidle/db";\nexport const read = attackUnmapped;\n`,
		},
		mutate: {
			[a.dbBarrel]: (existing) =>
				`${existing}export { attackUnmapped } from "./attack-unmapped-module.js";\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.serviceDir}/attack-deep-db-import.ts`,
			groupKey: KEY.serviceUnknownSurface,
		},
	},
	{
		id: "db-symbols-all-placed-scenario3",
		detail:
			"AU29 §4.5 / plan validation scenario 3 — a new no-database export appended to the db barrel, re-exported " +
			"from a module `architecture.json` does not name, must fail the build naming the symbol",
		rules: ["db-symbols-all-placed"],
		overlay: {
			[`${a.frameworkDir}/attack-unplaced-symbol.ts`]: `export function attackUnplacedSymbol(): string {\n\treturn "unplaced";\n}\n`,
		},
		mutate: {
			[a.dbBarrel]: (existing) =>
				`${existing}export { attackUnplacedSymbol } from "./attack-unplaced-symbol.js";\n`,
		},
		expect: {
			sort: "finding",
			file: a.dbBarrel,
			ruleId: "db-symbols-all-placed",
			messageContains: "attackUnplacedSymbol",
		},
	},
	{
		id: "db-symbols-all-placed-control",
		detail:
			"re-exporting a NEW binding from a module `architecture.json` DOES name places cleanly — no finding",
		rules: ["db-symbols-all-placed"],
		// Isolated: the positive case above also mutates `a.dbBarrel`, and this control's whole point is
		// that a barrel with ONLY a mapped-module re-export added is clean — sharing a pass with the
		// positive case's own error at the same path would make this control fail for the wrong reason.
		isolate: true,
		mutate: {
			[a.dbBarrel]: (existing) =>
				`${existing}export { DEFAULT_PG_POOL_SIZE as attackMappedAlias } from "./connection.js";\n`,
		},
		expect: { sort: "clean", file: a.dbBarrel },
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
		detail:
			"a new file dropped straight into the root of tools/governance/ — the shape a returning per-file allowance would take",
		rules: ["no-per-file-allowances"],
		overlay: {
			"tools/governance/known-violations.json": `{"note":"looks like a record"}\n`,
		},
		expect: {
			sort: "finding",
			file: "tools/governance/known-violations.json",
			ruleId: "no-per-file-allowances",
			messageContains: "closed set",
		},
	},
	{
		id: "governance-directory-control",
		detail: "the untouched tools/governance/ root is clean — the control for the closed-set check",
		rules: ["no-per-file-allowances"],
		expect: { sort: "clean", file: "tools/governance/architecture.json" },
	},
	{
		id: "governance-new-source-file-under-src",
		detail:
			"a new rule module under tools/governance/src/ is real engine source, not a record — the closed set is scoped to the package root only",
		rules: ["no-per-file-allowances"],
		overlay: {
			"tools/governance/src/rules/new-attack-rule.ts": "export const newAttackRule = 1;\n",
		},
		expect: { sort: "clean", file: "tools/governance/src/rules/new-attack-rule.ts" },
	},

	// --- census-level: the misconfiguration that used to fail OPEN ----------------------------
	{
		id: "unclaimed-production-dir",
		detail:
			"a production directory under `layers/` with no package.json — it used to get composition-root powers",
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
		detail:
			"a new table nobody claims in `table-owners.json` — the README promises the build fails, and now it does",
		rules: ["registries-honest"],
		isolate: true,
		mutate: {
			[a.schemaModule]: (existing) =>
				`${existing}\nexport const attackUnclaimedTable = pgTable("attack_unclaimed_table", {});\n`,
		},
		expect: {
			sort: "finding",
			file: "tools/governance/table-owners.json",
			ruleId: "registries-honest",
			messageContains: "claimed by nobody",
		},
	},

	// --- a framework package may name another framework package, and nothing else it could not ----
	{
		id: "framework-names-another-framework-package",
		detail:
			"a framework package importing a NARROW-audience framework surface — legal as a property of the model: a reach list says who OUTSIDE the framework role may name the surface",
		rules: ["crossing-import"],
		overlay: {
			[`${a.frameworkDir}/attack-framework-names-framework.ts`]:
				`import type { CoreApiPort } from "@hyperidle/api-contract";\n` +
				`export type AttackWrapped = { readonly value: CoreApiPort };\n`,
		},
		expect: { sort: "clean", file: `${a.frameworkDir}/attack-framework-names-framework.ts` },
	},
	{
		id: "framework-names-schema-namespace",
		detail:
			"the same framework role reaching the whole-schema door — the case that tells the scoped clause from the broad one: `framework/<name>` opened, `db:*` audiences untouched",
		rules: ["crossing-import"],
		overlay: {
			[`${a.otherFrameworkDir}/attack-framework-schema-ns.ts`]:
				`import * as db from "@hyperidle/db";\n` + `export const everyTable = db;\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.otherFrameworkDir}/attack-framework-schema-ns.ts`,
			groupKey: KEY.frameworkSchemaNamespace,
		},
	},
	{
		id: "framework-names-undecided-db-surface",
		detail:
			"the same framework role reaching a database export that belongs to no named surface — the catch-all twin, so widening cannot arrive through an undecided door",
		rules: ["crossing-import"],
		overlay: {
			[`${a.otherFrameworkDir}/attack-framework-db-unknown.ts`]:
				`import { attackSymbolTheBarrelNeverPublished } from "@hyperidle/db";\n` +
				`export const reach = attackSymbolTheBarrelNeverPublished;\n`,
		},
		expect: {
			sort: "violation",
			file: `${a.otherFrameworkDir}/attack-framework-db-unknown.ts`,
			groupKey: KEY.frameworkUnknownSurface,
		},
	},
	{
		id: "harness-protocol-named-from-outside-its-audience",
		detail:
			"a package outside `framework/harness-protocol`'s stated audience importing the adapter interface — the refusal must name the file AND the audience it is not in, or the reader cannot tell whether to move the import or ask for the audience to be widened",
		rules: ["crossing-import"],
		overlay: {
			[`${a.serviceDir}/attack-outside-harness-audience.ts`]:
				`import type { HarnessAdapter } from "@hyperidle/harness-protocol";\n` +
				`export type AttackAdapter = { readonly adapter: HarnessAdapter };\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.serviceDir}/attack-outside-harness-audience.ts`,
			ruleId: "crossing-import",
			messageContains: "reachable only by harness-registry",
		},
	},
	{
		id: "harness-protocol-named-from-inside-its-audience",
		detail:
			"the identical import from a service the audience DOES name — the twin that makes the case above a test of the audience rather than of the package's name",
		rules: ["crossing-import"],
		overlay: {
			[`${a.harnessAudienceDir}/attack-inside-harness-audience.ts`]:
				`import type { HarnessAdapter } from "@hyperidle/harness-protocol";\n` +
				`export type AttackAdapter = { readonly adapter: HarnessAdapter };\n`,
		},
		expect: { sort: "clean", file: `${a.harnessAudienceDir}/attack-inside-harness-audience.ts` },
	},
	{
		id: "import-of-a-framework-package-with-no-declared-audience",
		detail:
			"importing a framework package that `architecture.json` declares no surface for must fail as an UNDECLARED SURFACE, not as a sideways reach — the two failures send a reader to different files",
		rules: ["crossing-import"],
		overlay: {
			"framework/attack-nameless/package.json": `${JSON.stringify(
				{
					name: "@hyperidle/attack-nameless",
					private: true,
					type: "module",
					exports: { ".": "./src/index.ts" },
				},
				null,
				"\t",
			)}\n`,
			"framework/attack-nameless/src/index.ts": "export const attackNameless = 1;\n",
			[`${a.layerDir}/attack-names-nameless.ts`]:
				`import { attackNameless } from "@hyperidle/attack-nameless";\n` +
				`export const reach = attackNameless;\n`,
		},
		expect: {
			sort: "finding",
			file: `${a.layerDir}/attack-names-nameless.ts`,
			ruleId: "crossing-import",
			messageContains: "not a declared surface",
		},
	},
	{
		id: "framework-package-with-no-decided-audience",
		detail:
			"a new framework package added with no `reach` entry — nothing imports it, so no crossing exists to judge, and the build must still fail naming the package",
		rules: ["framework-surfaces-declared"],
		overlay: {
			"framework/attack-unaudienced/package.json": `${JSON.stringify(
				{
					name: "@hyperidle/attack-unaudienced",
					private: true,
					type: "module",
					exports: { ".": "./src/index.ts" },
				},
				null,
				"\t",
			)}\n`,
			"framework/attack-unaudienced/src/index.ts": "export const attackUnaudienced = 1;\n",
		},
		expect: {
			sort: "finding",
			file: "framework/attack-unaudienced/package.json",
			ruleId: "framework-surfaces-declared",
			messageContains: "attack-unaudienced",
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
	readonly buildRules: (
		census: Census,
		detected: CrossingsResult,
		readFile: (path: string) => string,
	) => readonly Rule[];
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
			if (present.has(path))
				return `${attack.id}: overlay path ${path} already exists in the tree — the case is not additive`;
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
			if (!present.has(path))
				return `${attack.id}: mutate path ${path} does not exist — the anchor has moved`;
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
		.filter(
			([, path]) => !(present.has(path) || [...present].some((p) => p.startsWith(`${path}/`))),
		)
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
export function coverageGaps(
	attacks: readonly Attack[],
	standalone: readonly StandaloneAttack[],
	registered: readonly string[],
): string[] {
	const named = new Set([
		...attacks.flatMap((c) => c.rules),
		...standalone.flatMap((c) => c.rules),
	]);
	const provenToReport = new Set([
		...attacks.filter((c) => c.expect.sort !== "clean").flatMap((c) => c.rules),
		...standalone.filter((c) => c.positive).flatMap((c) => c.rules),
	]);
	const gaps: string[] = [];
	for (const id of registered) {
		if (!named.has(id)) {
			gaps.push(
				`rule "${id}" has no attack case. A registered rule with no break-test is a rule nobody has ` +
					"proved works — add a case to tools/governance/src/lib/governance-attacks.ts.",
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
		if (!known.has(id))
			gaps.push(`attack case names rule "${id}", which the lint does not register.`);
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
			results: attacks.map((attack) => ({
				id: attack.id,
				detail: attack.detail,
				failure: overlaid,
			})),
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
				frameworkSurfaces: frameworkSurfacesOf(census),
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
					if (hit.length === 0)
						return `no violation reported for ${expected.file} — this evasion is invisible`;
					return hit.some((v) => v.key === expected.groupKey)
						? null
						: `reported ${hit.map((v) => v.key).join(", ")}, expected ${JSON.stringify(expected.groupKey)}`;
				}
				case "finding": {
					const hit = findings.filter(
						(f) => f.path === expected.file && f.ruleId === expected.ruleId,
					);
					if (hit.length === 0) return `no ${expected.ruleId} finding at ${expected.file}`;
					return hit.some((f) => f.message.includes(expected.messageContains))
						? null
						: `reported ${hit.map((f) => f.message).join(" | ")}, expected one containing ${JSON.stringify(expected.messageContains)}`;
				}
				case "clean": {
					const reported = [
						...violations.filter((v) => v.found.file === expected.file).map((v) => v.key),
						...findings
							.filter((f) => f.path === expected.file && f.severity === "error")
							.map((f) => f.ruleId),
					];
					return reported.length === 0 ? null : `the control was reported: ${reported.join(", ")}`;
				}
			}
		};
		return { id: attack.id, detail: attack.detail, failure: judge() };
	});
	return { results, ruleIds };
}

/**
 * Framework package name → its surface label. Mirrors the live loader, over the overlaid census.
 *
 * Unconditional, exactly like the live one: a framework package with no declared audience must still
 * become a `surface` target, so the crossing fails as an undeclared surface rather than as a sideways
 * reach. A copy that filtered on the registry would make the attack case pass against the wrong twin.
 */
function frameworkSurfacesOf(census: Census): Map<string, string> {
	const out = new Map<string, string>();
	for (const pkg of census.packages) {
		if (pkg.role !== "framework") continue;
		out.set(pkg.name, `framework/${pkg.name}`);
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
 * @lore AU31: every crossing rule judges an overlaid tree at `error`, unconditionally — there is no
 * severity declaration left anywhere in the build for an overlay, or anything else, to consult.
 */
export function runAttacks(
	tree: AttackTree,
	attacks: readonly Attack[] = ATTACKS,
	standalone: readonly StandaloneAttack[] = STANDALONE_ATTACKS,
): AttackResult[] {
	const anchorFailure = assertAnchors(tree);
	if (anchorFailure !== null) {
		return [
			{
				id: "anchors",
				detail: "every attack anchor still exists in the tree",
				failure: anchorFailure,
			},
		];
	}
	if (standalone.length === 0) {
		return [
			{
				id: "standalone",
				detail: "the tree-free cases exist",
				failure: "STANDALONE_ATTACKS is empty",
			},
		];
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

/**
 * A tree-free architecture for the surface clause: one framework surface with a named audience the
 * framework role is NOT in, and the three database surfaces that are also `sort: "surface"` targets.
 *
 * Synthetic on purpose. The live registries hold no `db:testing` crossing a production file can make —
 * `production-never-names-development` claims that edge first — so the only way to state the verdict
 * the decided rules record for it is to drive the model directly.
 */
const SURFACE_CLAUSE_ARCHITECTURE: Architecture = {
	containment: {
		compositionRootRoles: ["application", "tooling", "deployment"],
		repoRootIsCompositionRoot: true,
	},
	surfaces: {
		"framework/pretend": {
			reach: ["core-ui"],
			why: "one named consumer, and the framework role is not it",
		},
		"db:schema-ns": { reach: [], why: "one import that hands over every table at once" },
		"db:unknown": {
			reach: [],
			why: "an export of the database package that belongs to no named surface",
		},
		"db:testing": {
			reach: [],
			why: "development code, and production naming it is already an error",
		},
	},
	endpoints: {
		httpApiLayers: {
			layers: ["core-api"],
			why: "a layer that publishes an API publishes it to everyone",
		},
		mcpRouter: {
			host: "agent-execution",
			alsoDialledBy: ["harness"],
			why: "the router exists to serve the harness",
		},
	},
	eventBus: {
		host: "framework",
		typesModule: "pretend/events.ts",
		why: "the framework provides the bus",
	},
	rawRuntime: { host: "agent-execution", why: "every model call goes through one door" },
	oneDoorSurfaces: {
		surfaces: ["db:schema-ns", "db:unknown"],
		foreignTableWriteMissingCompanion: true,
		why: "a test may cross any boundary; it may not go around a door production has only one of",
	},
};

/** A floor set the band rule can be driven with, without touching the tree. */
const floorCase = (
	id: string,
	live: number,
	floor: number,
	floorKind: "magnitude" | "existence",
): FloorRecord => ({ id, live, floor, floorKind });

export const STANDALONE_ATTACKS: readonly StandaloneAttack[] = [
	{
		id: "framework-role-opens-framework-surfaces-and-nothing-else",
		detail:
			"the framework role may name a `framework/<name>` surface whatever its audience, and is still refused at every `db:*` surface — the two readings of the clause differ only here",
		rules: ["crossing-import"],
		// Positive: three of its five assertions are that the model REFUSES a crossing, which is exactly
		// what the crossing rules report.
		positive: true,
		run: () => {
			const verdict = (surface: string, world: World, source: "framework" | "layer"): string =>
				decide(
					SURFACE_CLAUSE_ARCHITECTURE,
					{
						kind: "import",
						source:
							source === "framework"
								? { sort: "package", name: "pretend-framework", role: "framework" }
								: { sort: "package", name: "core-api", role: "layer" },
						target: { sort: "surface", surface },
					},
					world,
				).verdict;

			if (verdict("framework/pretend", "production", "framework") !== "allowed") {
				return "a framework package was refused at another framework package's surface";
			}
			// The control: opening the door for the framework role is not the same as opening it.
			if (verdict("framework/pretend", "production", "layer") !== "forbidden") {
				return "a layer outside the surface's audience was admitted — the clause widened the surface, not the role";
			}
			for (const surface of ["db:schema-ns", "db:unknown", "db:testing"]) {
				if (verdict(surface, "production", "framework") !== "forbidden") {
					return `a framework package was admitted at ${surface}, whose declared audience is nobody`;
				}
			}
			// `db:testing` is not a one-door surface, so the development world still relaxes it — the one
			// place the three database surfaces do not answer alike.
			return verdict("db:testing", "development", "framework") === "allowed"
				? null
				: "the development world held db:testing, which is not a door production has only one of";
		},
	},
	{
		id: "declared-audience-with-no-package",
		detail:
			"a `framework/<name>` audience left behind after the package is gone, and the package that HAS one reported nothing — the second direction, which no tree overlay can reach because the rules read the real architecture registry",
		rules: ["framework-surfaces-declared"],
		positive: true,
		run: () => {
			const architecture = {
				...SURFACE_CLAUSE_ARCHITECTURE,
				surfaces: {
					"framework/present": { reach: ["core-ui"], why: "one named consumer, written down" },
					"framework/retired": { reach: "everyone" as const, why: "an audience nobody withdrew" },
				},
			};
			const census = buildCensus({
				files: [
					"framework/present/package.json",
					"framework/present/src/index.ts",
					"framework/undecided/package.json",
					"framework/undecided/src/index.ts",
				],
				readFile: (path) =>
					path.endsWith("package.json")
						? JSON.stringify({ name: `@hyperidle/${path.split("/")[1]}` })
						: "",
				roleRules: [{ pattern: "framework/*", role: "framework" }],
			});
			const messages = frameworkSurfacesDeclared(architecture)
				.evaluate(census)
				.map((f) => `${f.path}: ${f.message}`);

			if (
				!messages.some(
					(m) =>
						m.includes("framework/undecided/package.json") && m.includes("no decided audience"),
				)
			) {
				return `a framework package with no surface entry was not reported: ${messages.join(" | ")}`;
			}
			if (
				!messages.some(
					(m) =>
						m.includes("tools/governance/architecture.json") && m.includes("framework/retired"),
				)
			) {
				return `an audience left behind after its package was retired was not reported: ${messages.join(" | ")}`;
			}
			// The control: the package that HAS a decided audience is not reported, or the rule is just
			// flagging every framework package it can see.
			return messages.some((m) => m.includes("framework/present/package.json"))
				? `the package with a decided audience was reported: ${messages.join(" | ")}`
				: null;
		},
	},
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
			return verdict.suggested === 900
				? null
				: `expected the fix to be the band's middle, 900, got ${verdict.suggested}`;
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
			if (edge.sort !== "approaching")
				return `a floor on the edge of its band reported ${edge.sort}, not a warning`;
			if (edge.suggested !== 900)
				return `the warning named ${edge.suggested} to write, not the band's middle, 900`;
			if (!edge.message.includes("governance:floors"))
				return "the warning did not name the command that prints the value to write";
			// One past the edge is an error, and the middle is silent — the band has three states, not two.
			const past = floorVerdict(floorCase("detector:pretend", 1000, 799, "magnitude"));
			if (past.sort !== "slack") return `a floor past the edge reported ${past.sort}, not an error`;
			const middle = floorVerdict(floorCase("detector:pretend", 1000, 900, "magnitude"));
			return middle.sort === "ok"
				? null
				: `a floor at the middle of its band reported ${middle.sort} instead of staying silent`;
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
		detail:
			"declaring `1` on a MAGNITUDE floor is still slack — `floorKind` is not an escape hatch",
		rules: ["floors-tight"],
		positive: true,
		run: () => {
			const verdict = floorVerdict(floorCase("pattern:pretend", 94, 1, "magnitude"));
			return verdict.sort === "slack" ? null : `expected slack, got ${verdict.sort}`;
		},
	},
	{
		id: "dead-classification-pattern",
		detail:
			"a classification pattern that has stopped matching files is reported, and a live one is not",
		rules: ["pattern-live"],
		positive: true,
		run: () => {
			// Sized so `default-production` clears its floor while every development pattern is at zero:
			// without a pattern that is genuinely ALIVE, "reports a dead pattern" is indistinguishable
			// from "reports everything".
			const files = Array.from({ length: 800 }, (_, i) => `layers/a/src/f${i}.ts`);
			const census = buildCensus({ files, readFile: () => "" });
			const reported = patternLive
				.evaluate(census)
				.map((f) => f.message)
				.join("\n");
			if (!reported.includes("dunder-segment"))
				return "a pattern matching zero files was not reported";
			if (reported.includes("default-production"))
				return "reported a pattern that is still matching files";
			return null;
		},
	},
	{
		id: "census-duplicate-path",
		detail: "the same path twice in the census input is a defect in the input, not a silent dedupe",
		rules: ["classification-total"],
		positive: true,
		run: () => {
			const census = buildCensus({
				files: ["layers/a/src/x.ts", "layers/a/src/x.ts"],
				readFile: () => "",
			});
			const reported = classificationTotal
				.evaluate(census)
				.map((f) => f.message)
				.join("\n");
			if (!reported.includes("duplicate paths")) return "a duplicated census path was not reported";
			const clean = buildCensus({ files: ["layers/a/src/x.ts", "docs/y.md"], readFile: () => "" });
			return classificationTotal.evaluate(clean).length === 0
				? null
				: "a well-formed census was reported";
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
				files: [
					"layers/a/src/one.ts",
					"layers/a/src/two.ts",
					"layers/a/src/three.ts",
					"layers/a/src/four.test.ts",
				],
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
			if (exact.some((f) => f.severity === "error"))
				return `a ledger that matches its committed count was reported: ${exact[0]?.message}`;
			// Property: every entry is reported on every run, or the ledger is invisible.
			if (exact.filter((f) => f.severity === "warn").length !== 2)
				return "the ledger's entries were not reported as warnings";

			const grown = errorsOf(ledger(2, { ...two, "layers/a/src/three.ts": reason }));
			if (!grown.some((m) => m.includes("may only shrink")))
				return `a ledger grown past its committed count was not refused: ${grown.join(" | ")}`;

			const shrunk = errorsOf(ledger(2, { "layers/a/src/one.ts": reason }));
			if (!shrunk.some((m) => m.includes("without committing the shrink"))) {
				return `a cleared misplacement with a stale count was not reported: ${shrunk.join(" | ")}`;
			}

			// Integrity: an entry must resolve to a tracked file, and must still be classified production.
			const gone = errorsOf(ledger(2, { ...two, "layers/a/src/renamed-away.ts": reason }));
			if (!gone.some((m) => m.includes("is not a tracked file")))
				return `an entry naming a path that does not exist was accepted: ${gone.join(" | ")}`;

			const moved = errorsOf(
				ledger(2, { "layers/a/src/one.ts": reason, "layers/a/src/four.test.ts": reason }),
			);
			if (!moved.some((m) => m.includes("calls it development")))
				return `an entry whose file is now development was accepted: ${moved.join(" | ")}`;

			const thin = errorsOf(
				ledger(2, { "layers/a/src/one.ts": reason, "layers/a/src/two.ts": "later" }),
			);
			return thin.some((m) => m.includes("no real reason"))
				? null
				: `an entry with no reason was accepted: ${thin.join(" | ")}`;
		},
	},
	{
		id: "stale-build-artifact",
		detail:
			"a compiled `.js` beside its `.ts` source in the guard tree is reported, and the `.ts` alone is not",
		rules: ["no-stale-build-artifacts"],
		positive: true,
		run: () => {
			const census = buildCensus({ files: ["scripts/lib/thing.ts"], readFile: () => "" });
			const dirty = noStaleBuildArtifacts([
				"scripts/lib/thing.ts",
				"scripts/lib/thing.js",
			]).evaluate(census);
			if (dirty.length === 0) return "a stale build artifact was not reported";
			const clean = noStaleBuildArtifacts(["scripts/lib/thing.ts"]).evaluate(census);
			return clean.length === 0 ? null : "a source file with no artifact beside it was reported";
		},
	},
	{
		id: "no-per-file-allowances-shape",
		detail:
			"a new file at the root of tools/governance/ — including a recreated rule-severity.json, which carries no exception — and an undeclared CLI flag each fail directly; the well-formed equivalents are silent",
		rules: ["no-per-file-allowances"],
		positive: true,
		run: () => {
			const closedSet = [
				"tools/governance/README.md",
				"tools/governance/architecture.json",
				"tools/governance/decided-rules.json",
				"tools/governance/table-owners.json",
				"tools/governance/misplaced-files.json",
				"tools/governance/src/governance-lint.ts",
				"tools/governance/src/governance-floors.ts",
				"tools/governance/src/governance-new-cells.ts",
			];
			const cleanCli =
				'process.argv.includes("--fixtures");\nprocess.argv.includes("--attacks");\nprocess.argv.includes("--errors-only");\n';
			const run = (files: readonly string[], cliSource: string): readonly Finding[] => {
				const contents: Record<string, string> = {
					"tools/governance/src/governance-lint.ts": cliSource,
				};
				const census = buildCensus({ files, readFile: (p) => contents[p] ?? "" });
				return noPerFileAllowances({ readFile: (p) => contents[p] ?? "" }).evaluate(census);
			};

			const clean = run(closedSet, cleanCli);
			if (clean.length !== 0)
				return `a well-formed closed set and CLI set were reported: ${clean.map((f) => f.message).join(" | ")}`;

			const recreatedSeverityFile = run(
				[...closedSet, "tools/governance/rule-severity.json"],
				cleanCli,
			);
			if (
				!recreatedSeverityFile.some((f) =>
					f.message.includes("is a new file at the root of tools/governance/"),
				)
			) {
				return "a recreated rule-severity.json was accepted — the mechanism carries no filename exception anymore";
			}

			const otherNewFile = run([...closedSet, "tools/governance/scratch.json"], cleanCli);
			if (
				!otherNewFile.some((f) =>
					f.message.includes("is a new file at the root of tools/governance/"),
				)
			)
				return "an unrelated new file at the root of tools/governance/ was accepted";

			const newSourceFile = run([...closedSet, "tools/governance/src/rules/scratch.ts"], cleanCli);
			if (newSourceFile.length !== 0) {
				return `a new file under tools/governance/src/ was wrongly treated as a record: ${newSourceFile.map((f) => f.message).join(" | ")}`;
			}

			const undeclaredFlag = run(closedSet, 'process.argv.includes("--grandfather");\n');
			if (!undeclaredFlag.some((f) => f.message.includes("not one of the declared flags")))
				return "an undeclared CLI flag was accepted";

			return null;
		},
	},
];
