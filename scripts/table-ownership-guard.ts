#!/usr/bin/env tsx
/**
 * AU19 Mechanism A — Table ACL. ONE general, map-driven guard that replaces the
 * legacy hand-typed `au10`…`au18` per-domain scripts (retired in Increment 5,
 * commit following this one).
 *
 * Two tiers (architecture §7.1):
 *  1. Barrel discipline — a nested Service barrel (`packages/<layer>/<service>/
 *     src/index.ts`) MUST NOT re-export a raw `pgTable` object, whether by name
 *     (`export { knowledgeItems }`) or via a wildcard (`export * from "@hyperidle/db"`
 *     / `export * as ns from "@hyperidle/db"`, which re-exports every table
 *     transitively). That would let a consumer obtain the table transitively
 *     through the Service and defeat the ACL.
 *  2. Ownership ACL — for every table in `TABLE_OWNER`, any Drizzle access
 *     (`.from/.insert/.update/.delete/.leftJoin/.innerJoin/.rightJoin/.fullJoin`
 *     of the bare table identifier) OR any value import of that table symbol —
 *     including via a namespace import (`import * as db from "@hyperidle/db"` then
 *     `db.knowledgeItems`) — in a nested-package production file NOT under the
 *     owner path → FAIL. Plus a completeness rule: a known `pgTable` accessed by a
 *     nested package with no `TABLE_OWNER` row → FAIL (forces the map to stay
 *     complete as Services migrate).
 *
 * @lore AU19 Increment 0 scope (SUPERSEDED, kept for history): the ACL/
 * completeness tiers originally scanned the NEW nested Service packages
 * (`packages/<layer>/<service>/`) only — `packages/server` stayed guarded by
 * the legacy `au*` scripts until Increment 5. Barrel discipline + `--fixtures`
 * prove all failure modes now, including the W2 checkpoint-review gaps
 * (fe48f126): `export * from "@hyperidle/db"` and namespace-import
 * (`import * as db`) evasions of both tiers. Test files are exempt from the
 * ACL (they legitimately seed tables). The full `@hyperidle/db` barrel exports every
 * table to everyone, so this guard — not barrel discipline alone — is load-bearing.
 *
 * @lore AU19 Increment 5 item 4 scan-widening (this commit): `packages/server`
 * was dissolved into `@hyperidle/core-api` (commit cee027ab) — its former
 * routes/middleware/auth/schemas/services now live flat under
 * `packages/core-api/src/`, core-api's OWN src, not a further-nested
 * `packages/<layer>/<service>/` package with its own `package.json`. `inspect()`
 * now ALSO Tier-2-scans `packages/core-api/src/` directly (Tier 1 barrel
 * discipline doesn't apply — `core-api` itself owns zero tables, every
 * `TABLE_OWNER` row points at one of its nested Service subpackages). This is
 * what finally closes every deferred direct-table-access site this WP carried
 * forward from `packages/server` (`teamMembers`/`teams` in the old
 * routes/tools, etc. — architecture.md §12 Increment 5). Verified clean on the
 * real repo: every real site was already converted during the org/knowledge/
 * work/connections/review/session-requests/hintProgress sub-items, which
 * manually widened their grep scope to `packages/core-api/src` ahead of this
 * mechanical scan-widening landing; a deliberate sanity-break (a raw
 * `teamMembers` accessor re-added to `routes/bets.ts`) proved the widened
 * scan genuinely fails before being reverted.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

/** The single source of truth for table ownership. One row per owned table. */
const TABLE_OWNER: Record<string, string> = {
	knowledgeItems: "packages/core-api/knowledge",
	knowledgeEditLog: "packages/core-api/knowledge",
	knowledgeAccessLog: "packages/core-api/knowledge",
	knowledgeConflicts: "packages/core-api/knowledge",
	knowledgeAppProjection: "packages/core-api/knowledge",
	bets: "packages/core-api/work",
	tasks: "packages/core-api/work",
	items: "packages/core-api/work",
	// AU19 Increment 4: `artifacts` — always `work`'s owned table per
	// architecture.md §4 but never had a TABLE_OWNER row (the tool that wrote
	// it, `create-artifact.ts`, stayed a flat `packages/server` file until
	// this increment moved it into the guarded `tool-handlers` package,
	// surfacing the gap for real — `artifact-store.ts`'s `createArtifact` is
	// the concrete closure).
	artifacts: "packages/core-api/work",
	// AU19 Increment 1c: `org` migrated — closes the W2 `teamMembers` exemption
	// (removed from UNOWNED_SHARED_TABLES below). `orgEdges` is `org`'s other
	// owned table (never accessed from a foreign nested package today, but
	// mapped now so any future access is completeness-checked, not silently
	// exempt).
	teamMembers: "packages/core-api/org",
	orgEdges: "packages/core-api/org",
	// AU19 Increment 3 (teams table-ownership remediation, 2026-07-15 founder
	// ruling): `teams` REMOVED from `UNOWNED_SHARED_TABLES` — `org` is its real
	// owner per architecture.md §4 line 69, not a genuinely ownerless table.
	// `org` gained a new `getTeamById`/`listTeamsByIds` export pair
	// (`team-lookup.ts`) as the concrete implementation of `context-assembly`'s
	// `TeamReader` DI port, mirroring `TeamCapacityReader` (Increment 1c) and
	// `CostTeamAccessor` (Increment 3g).
	teams: "packages/core-api/org",
	// AU19 Increment 1d: `users` migrated. `loginSessions`/`inviteCodes` are
	// `users`' other two owned tables (login-session.ts/invite-code.ts moved
	// alongside user-store.ts unchanged) — mapped now so any future foreign
	// access is completeness-checked, not silently exempt.
	users: "packages/core-api/users",
	loginSessions: "packages/core-api/users",
	inviteCodes: "packages/core-api/users",
	// AU19 Increment 1e: `conversation` migrated — `threads`+`messages` are its
	// two owned tables (`conversation-store.ts` moved unchanged). Neither table
	// was ever in `UNOWNED_SHARED_TABLES` (that Set is unrelated, exactly
	// `{sessions, propagationLog, taskDispatchAttempts}`), so this is a clean
	// new-owner addition — no exemption to close.
	threads: "packages/core-api/conversation",
	messages: "packages/core-api/conversation",
	// AU19 Increment 1f: `settings` migrated — `serverConfig` (server-config.ts),
	// `plugins`/`pluginConfigurationDefaults`/`configurationOverrides`
	// (plugin-configuration.ts) are its four owned tables (moved unchanged).
	// Never in `UNOWNED_SHARED_TABLES` — a clean new-owner addition, no
	// exemption to close.
	serverConfig: "packages/core-api/settings",
	plugins: "packages/core-api/settings",
	pluginConfigurationDefaults: "packages/core-api/settings",
	configurationOverrides: "packages/core-api/settings",
	// AU19 Increment 1g: `notifications` migrated — `notificationQueue` is its
	// one owned table (`notification-queue.ts` moved unchanged, the sole
	// module touching the table per its own `@lore` header). Never in
	// `UNOWNED_SHARED_TABLES` — a clean new-owner addition, no exemption to
	// close.
	notificationQueue: "packages/core-api/notifications",
	// AU19 Increment 1h: `connections` migrated — `serverCredentials` +
	// `serviceConnections` are its two owned tables (`credential-resolver.ts`/
	// `connection-provisioning.ts`/`service-connection-resolver.ts` moved
	// unchanged). Neither table was ever in `UNOWNED_SHARED_TABLES` — a clean
	// new-owner addition, no exemption to close. `packages/server`'s own
	// direct accesses (routes/connections.ts, routes/credentials.ts,
	// server-factory.ts/app.ts's still-interim notifications credential ports)
	// are unaffected — this guard's ACL/completeness tiers scan only the new
	// nested Service packages, not `packages/server` (see this file's
	// top-level `@lore`).
	serverCredentials: "packages/core-api/connections",
	serviceConnections: "packages/core-api/connections",
	// AU19 Increment 1i: `routine` migrated — `routines`/`routineRuns` are its
	// two owned tables (`routine-service.ts` moved unchanged, the sole module
	// touching either table per its own top-level `@lore`). Neither table was
	// ever in `UNOWNED_SHARED_TABLES` — a clean new-owner addition, no
	// exemption to close.
	routines: "packages/core-api/routine",
	routineRuns: "packages/core-api/routine",
	// AU19 Increment 1j: `review` migrated — closes Increment 1. The AL7
	// trust-first proposed-call/tailored-grant/operation-outcome trio
	// (`proposed-call-workflow.ts`, moved unchanged) is `review`'s real
	// owned table set — `review` ⛁* is now confirmed, not "reviews" (no such
	// table exists; the §4 "reviews / proposed-calls" candidate resolved to
	// proposed-calls).
	proposedCalls: "packages/core-api/review",
	operationOutcomes: "packages/core-api/review",
	tailoredGrants: "packages/core-api/review",
	// AU19 Increment 1k: `taskPlanningSignals` (O2's `riskTier` extension
	// table, physical name `task_planning_signals`) is owned by `work`, not
	// `review` — `riskTier` is data moved off `tasks` (which `work` owns),
	// same domain, same owner. Finishing AU3's half-done Strategy-vocabulary
	// rename made the `pgTable` declaration itself the canonical name (no
	// more legacy `taskStrategyFabric` alias to evade this guard's
	// name-based `knownTables()` AST scan through). `review`'s one read
	// site (`session-review-creator.ts`) now goes through the
	// `TaskRiskTierReader` DI port instead of direct table access.
	taskPlanningSignals: "packages/core-api/work",
	// AU19 Increment 3a: `trigger-resolution` migrated — closes Increment 3's
	// first agent-orchestration Service. Its roster `⛁` column showed plain
	// `—` (not `⛁*` "confirm at migration" like `policy`/`filesystems`), but
	// the codebase reality is `trigger-resolution.ts` is the sole
	// reader/writer of `triggerResolutionHistory` (`persistResolution`/
	// `findPersistedResolution`) — a genuine owned table the roster
	// undercounted, same "confirm during migration" shape as `policy`'s/
	// `filesystems`' `⛁*` findings just for a Service the roster marked
	// plain `—` instead. `agentSessionRequests`/`agentWorkIntents` are NOT
	// owned here — `session-requests` is the real owner (§4, mapped below,
	// migrated Increment 3b); `trigger-resolution`'s access to
	// `agentSessionRequests` is a DI port (`TriggerResolutionSessionRequestPort`,
	// wired to `@hyperidle/session-requests`'s real exports since Increment
	// 3b), never a raw table read.
	// @lore AU20 B1b: trigger-resolution folded into session-requests; ownership
	// moves with the code — session-requests is now the sole writer of this table.
	triggerResolutionHistory: "packages/agent-orchestration/session-requests",
	// AU19 Increment 3b: `session-requests` migrated — the real owner (§4)
	// `agentSessionRequests`/`agentWorkIntents` were forward-referenced above
	// as "UNOWNED here" pending this migration; now real. `explicitSessionStarts`
	// is a roster-undercounted sibling table this Service (+ its worker/reaper)
	// is the sole nested-package accessor of — same "confirm at migration"
	// shape as `trigger-resolution`'s `triggerResolutionHistory` finding.
	// `taskDispatchAttempts` stays in `UNOWNED_SHARED_TABLES` (unchanged, still
	// genuinely multi-owner-touched). `agentLifecycleInbox` (roster-assigned to
	// `lifecycle-projection`, §4) was NOT added at this Increment — it migrated
	// later, in Increment 3d (see below) — `session-requests` was its durable
	// writer at 3b through an INTERIM `SessionRequestsLifecycleInboxWriter`/
	// `Reaper` port wired to `packages/server`'s raw table ops.
	agentWorkIntents: "packages/agent-orchestration/session-requests",
	agentSessionRequests: "packages/agent-orchestration/session-requests",
	explicitSessionStarts: "packages/agent-orchestration/session-requests",
	// AU26 G1 (architecture §D-L): the two run-config tables the six `users` and
	// three `teams` run-config columns relocated into. Neither was ever in
	// `UNOWNED_SHARED_TABLES` — a clean new-owner addition, no exemption to
	// justify. Core-api still HOSTS the write routes (`routes/agents.ts`,
	// `routes/assistant.ts`, `routes/teams-routes.ts` gate on `users`/`teams`,
	// core tables, so they have exactly one legal host) and calls DOWN into this
	// Service's exported writers — it never touches either table itself.
	agentRunConfig: "packages/agent-orchestration/agent-run-config",
	teamRunConfigDefaults: "packages/agent-orchestration/agent-run-config",
	// AU19 Increment 3d: `lifecycle-projection` migrated — its `⛁` "confirm"
	// column (§4) resolves to ONE owned table, `agentLifecycleInbox`
	// (`agent-lifecycle-projectors.ts`'s claim/project/ack drain loop, moved
	// unchanged). Closes the `session-requests`-forward-reference above:
	// `session-requests-bindings.ts`'s writer/reaper now call this Service's
	// real exports (`insertLifecycleInboxFactIfAbsent`/
	// `listProjectedLifecycleInboxBefore`/`deleteLifecycleInboxByRequestIds`,
	// `agent-lifecycle-inbox.ts`) instead of raw table ops — a genuinely NEW
	// `session-requests → lifecycle-projection` edge (§10.2). This migration
	// also surfaced a NEW `lifecycle-projection → session-requests` edge
	// (`projectExplicitStart`'s `explicitSessionStarts` write, previously an
	// inline `packages/server` raw update) — converted to
	// `LifecycleProjectionExplicitSessionStartWriter`, wired to
	// `@hyperidle/session-requests`'s new `projectExplicitSessionStartTerminalState`
	// export. Both are ORDINARY same-layer DI (both Services are
	// agent-orchestration, neither above the other) — not §10.3 against-grain.
	// @lore AU20 B1a: ownership moved from lifecycle-projection to session-requests
	// (fold removes the dependency cycle; session-requests was already the sole
	// writer+reaper of this table).
	agentLifecycleInbox: "packages/agent-orchestration/session-requests",
	// AU19 Increment 2a: `policy` migrated — its `⛁*` ownership question
	// (architecture §4/§79) resolves to ZERO owned tables. `policy-engine.ts`/
	// `approval-rate.ts` never touched a raw table at all; `handoff-protocol.ts`
	// (`agentSessionRequests`, `teamMembers`) and `lifecycle-propagation.ts`
	// (`propagationLog`, `sessions`) touched only OTHER Services' tables — all
	// four converted to injected DI ports (`agentSessionRequests`/`teamMembers`,
	// §10.3 against-grain + ordinary respectively) except `propagationLog`/
	// `sessions`, which stay direct `@hyperidle/db` reads because both are
	// already in `UNOWNED_SHARED_TABLES` below (genuinely multi-owner-touched,
	// confirmed still true after this migration — no new row added here).
	// AU19 Increment 2b: `filesystems` migrated — its `⛁*` ownership question
	// resolves to THREE owned tables (contrast `policy`'s zero): `filesystems`/
	// `filesystemInjections` (the registry CRUD, previously inline in
	// `routes/filesystems.ts` — never a seed file, a §4 gap not a new edge;
	// now `filesystem-registry.ts`) and `filesystemCaptures` (already
	// `capture-store.ts`'s sole concern). Every foreign consumer
	// (`routes/filesystems.ts`, `routes/knowledge.ts`,
	// `services/session-provisioning.ts`) now calls the real exported
	// registry functions instead of querying the tables raw.
	filesystems: "packages/core-api/filesystems",
	filesystemInjections: "packages/core-api/filesystems",
	filesystemCaptures: "packages/core-api/filesystems",
	// AU26 C1: `git-export` DELETED. It always resolved to ZERO owned tables,
	// which is why nothing here needs replacing: the exporter read `knowledge`'s
	// tables through an injected port and `server_config.gitExport` through
	// another, owning neither. The `gitExport` config section goes with it; the
	// git runner itself moved to `@hyperidle/shared/git` in A2 and never touched
	// the DB at all (pure subprocess spawning).
	// AU26 C2: `observability` DISSOLVED. It always resolved to ZERO owned
	// tables — the ring buffer and the console sink never touched the DB, and
	// `config.ts` only read/wrote `server_config.observability`, a section
	// `settings` owns. That zero is why nothing here needs replacing: the
	// translator + adapter went to `@hyperidle/shared/observability`, the config
	// pair went home to `@hyperidle/settings`, and no ownership row moved.
	// …one row per table, populated as each Service migrates (Increments 1–4).
	// AU19 Increment 5 item 4 (guard-retirement full-sweep, hintProgress —
	// LAST sub-item, 2026-07-15 ruling): `hintProgress` cascades from
	// `users.id` and had exactly one real accessor anywhere in the codebase,
	// `packages/core-api/src/routes/hints.ts` — a clear FK-anchored domain
	// home never previously mapped (found during the scan-widening that
	// surfaced 119 findings, not a pre-existing `UNOWNED_SHARED_TABLES`
	// exemption to close). Ruled owned by `users`, same shape as
	// `teamMembers`/`taskPlanningSignals` before their owner was assigned.
	// `hint-progress.ts` (new file, `users` package) is the real
	// implementation; `routes/hints.ts` now calls its exported functions
	// instead of querying `hintProgress` directly.
	hintProgress: "packages/core-api/users",
};

/**
 * Tables genuinely accessed today from many present-and-future Services with
 * no single owner assigned anywhere in architecture §4's roster (unlike
 * `bets`/`tasks`/`items`, none of §4's per-Service "Owns" columns name
 * `sessions`/`propagationLog`/`taskDispatchAttempts`). This mirrors the
 * recurring "not one of the owned tables → any file may query it directly"
 * idiom already established in the codebase — NOT an architecture.md §6
 * citation (§6 there is the file-disposition table, not this idiom):
 * `scripts/au18-notification-ownership-guard.ts` (~line 156,
 * `legalPropagationWrite` treats `propagationLog` as "legal — unrelated
 * table"), `scripts/au13-work-routine-ownership-guard.ts` ("`threads` is not
 * one of the five owned tables"). Completeness is intentionally NOT
 * enforced for this short, explicit, reviewed list, rather than forcing a
 * false single-owner assignment onto a real cross-cutting table.
 *
 * @lore AU19 Increment 3 (teams remediation, 2026-07-15): `teams` is NOT an
 * example of this idiom, despite `packages/server/src/routes/search.ts` and
 * `packages/core-api/work/src/work-service.ts` historically carrying the
 * verbatim phrase "`teams` is not one of the five owned tables, so any file
 * may query it directly." Those two `@lore` comments predate `org` existing
 * as a real, guarded Table-ACL package and were themselves the false-exemption
 * claim this remediation corrects — see `TABLE_OWNER`'s `teams` row.
 *
 * @lore AU19 Increment 1b: surfaced migrating `work` — `bet-kill-cascade.ts`
 * reads/writes `sessions` + `propagationLog` (cascade); `task-state-machine.ts`/
 * `bet-decomposition.ts` write `taskDispatchAttempts`. Grepping the wider
 * codebase (pre-AU19, still true today) shows 10+ files across `policy`/
 * `session-lifecycle`/`dispatch`/`session-requests`/`lifecycle-projection`-
 * destined modules touching each of these directly — none is `work`-exclusive,
 * so assigning any of them a `TABLE_OWNER` row pointing at `packages/core-api/
 * work` would be a false-ownership claim the zero-exceptions ACL principle
 * forbids just as much as a silent allowlist would. Revisit per-table as each
 * real owner migrates (§4's `⛁*` "confirm at migration" callouts apply here too).
 *
 * @lore AU19 Increment 1c (W2 closure): `teamMembers` REMOVED from this Set —
 * `org` migrated this Increment and is now its real `TABLE_OWNER`. `work`'s
 * two accessors (`bet-state-machine.ts`'s capacity read/write,
 * `bet-decomposition.ts`'s membership-group read) were converted to `work`'s
 * `TeamCapacityReader` DI port (Mechanism C), wired to `@hyperidle/org`'s real
 * exported functions — closing the exemption this Set existed to grant it.
 *
 * @lore AU19 Increment 1b checkpoint-review follow-up: this Set and
 * `TABLE_OWNER` must stay disjoint — `consider()` below checks
 * `UNOWNED_SHARED_TABLES` BEFORE the `TABLE_OWNER` lookup, so a future edit
 * that accidentally added an already-owned table here would silently
 * disable that table's ACL enforcement (a foreign `.from(ownedTable)` would
 * wrongly short-circuit as exempt). `assertDisjointOwnership` below enforces
 * this at load time.
 *
 * @lore AU19 Increment 1f: `userSkills` ADDED — surfaced migrating `settings`
 * (`plugin-configuration.ts`'s legacy-backfill reads it for per-agent
 * skill/autonomy seeds). No `⛁`/table column anywhere in architecture §4
 * names `userSkills` for any Service, and it is accessed today from
 * `settings`, `@hyperidle/routine`'s `agent-delegation.ts` +
 * `routine-scheduler-bindings.ts` (AU21 §6 Decision F1 — the retired
 * `agent-selection` package's `findDelegateVerbatim` read relocated here),
 * and two remaining still-monolithic `packages/server` files destined for
 * future Services (`routes/users.ts`, `services/policy-engine.ts`) — the same
 * "no single owner, genuinely cross-cutting" shape as
 * `sessions`/`propagationLog`/`taskDispatchAttempts`, not a candidate for a
 * false single-owner `TABLE_OWNER` claim.
 *
 * @lore AU19 Increment 3 (context-assembly finalize) — REVERTED by the
 * 2026-07-15 founder ruling (`teams` table ownership) and this Increment's
 * remediation: `teams` was WRONGLY added here — architecture.md §4 line 69
 * (`| org | ⛁ | teams, org edges | ...`) already names `teams` as `org`-owned.
 * The "not one of the five owned tables" @lore in `routes/search.ts` and
 * `packages/core-api/work/src/work-service.ts` predates `org` existing as a
 * real, guarded Table-ACL package (AU13-era) and is exactly the
 * foreign-import-ceiling carve-out pattern this project has a standing
 * zero-exceptions rule against, not a competing architectural decision. See
 * `TABLE_OWNER`'s `teams` row below for the real ownership entry.
 */
const UNOWNED_SHARED_TABLES = new Set([
	"sessions",
	"propagationLog",
	"taskDispatchAttempts",
	"userSkills",
]);

/**
 * Startup invariant: `UNOWNED_SHARED_TABLES` and `TABLE_OWNER` must never
 * overlap. Throws (rather than silently passing) so an accidental overlap
 * fails loudly at load time — including under `--fixtures`, before any file
 * scan runs.
 */
export function assertDisjointOwnership(
	owner: Record<string, string>,
	unowned: ReadonlySet<string>,
): void {
	const overlap = Object.keys(owner).filter((name) => unowned.has(name));
	if (overlap.length > 0) {
		throw new Error(
			`table-ownership-guard: UNOWNED_SHARED_TABLES and TABLE_OWNER overlap on ${JSON.stringify(overlap)} — a table cannot be both exempt and owned (this would silently disable ACL enforcement for it)`,
		);
	}
}

assertDisjointOwnership(TABLE_OWNER, UNOWNED_SHARED_TABLES);

const DIRECT_ACCESS_METHODS = new Set(["from", "insert", "update", "delete"]);
const JOIN_METHODS = new Set(["leftJoin", "innerJoin", "rightJoin", "fullJoin"]);
const ACCESS_METHODS = new Set([...DIRECT_ACCESS_METHODS, ...JOIN_METHODS]);

export interface Finding {
	readonly file: string;
	readonly reason: string;
}

/** Extract every `export const <name> = pgTable(...)` name from the db schema. */
function knownTables(root: string): Set<string> {
	const schema = join(root, "packages/db/src/schema.ts");
	const names = new Set<string>();
	if (!existsSync(schema)) return names;
	const text = readFileSync(schema, "utf8");
	const re = /export const (\w+)\s*=\s*pgTable\b/g;
	for (let m = re.exec(text); m !== null; m = re.exec(text)) {
		if (m[1]) names.add(m[1]);
	}
	return names;
}

/** Recursively collect production `.ts`/`.tsx` files under a dir (skip tests/dist). */
function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") {
				continue;
			}
			out.push(...collectSourceFiles(abs));
		} else if (
			/\.tsx?$/.test(entry.name) &&
			!/\.test\.tsx?$/.test(entry.name) &&
			!/\.integration\.test\.tsx?$/.test(entry.name)
		) {
			out.push(abs);
		}
	}
	return out;
}

/** All nested Service package roots: `packages/<layer>/<service>/`. */
function nestedServiceRoots(root: string): string[] {
	const packagesDir = join(root, "packages");
	const roots: string[] = [];
	if (!existsSync(packagesDir)) return roots;
	for (const layer of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!layer.isDirectory()) continue;
		const layerDir = join(packagesDir, layer.name);
		for (const svc of readdirSync(layerDir, { withFileTypes: true })) {
			if (!svc.isDirectory()) continue;
			if (existsSync(join(layerDir, svc.name, "package.json"))) {
				roots.push(join(layerDir, svc.name));
			}
		}
	}
	return roots;
}

function isUnder(fileRel: string, ownerRel: string): boolean {
	return fileRel === ownerRel || fileRel.startsWith(`${ownerRel}/`);
}

/** Tier 1 — barrel re-exports a raw pgTable name. */
function checkBarrel(root: string, serviceRoot: string, tables: Set<string>): Finding[] {
	const barrel = join(serviceRoot, "src/index.ts");
	if (!existsSync(barrel)) return [];
	const rel = relative(root, barrel);
	const text = readFileSync(barrel, "utf8");
	const ast = ts.createSourceFile(barrel, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	const flag = (name: string): void => {
		if (tables.has(name)) {
			findings.push({
				file: rel,
				reason: `barrel re-exports raw table "${name}" — export typed functions only (Table ACL, Mechanism A)`,
			});
		}
	};
	const visit = (node: ts.Node): void => {
		// export { knowledgeItems } / export { knowledgeItems } from "@hyperidle/db"
		if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
			if (!node.isTypeOnly) {
				for (const el of node.exportClause.elements) {
					if (!el.isTypeOnly) flag((el.propertyName ?? el.name).text);
				}
			}
		}
		// export * from "@hyperidle/db" — wildcard re-export of the WHOLE raw db
		// module. Re-exports every table transitively; W2 checkpoint-review gap —
		// no per-name detection possible so flag the barrel itself.
		if (
			ts.isExportDeclaration(node) &&
			!node.exportClause &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "@hyperidle/db"
		) {
			findings.push({
				file: rel,
				reason:
					'barrel re-exports export * from "@hyperidle/db" — re-exports every raw table transitively; export typed functions only (Table ACL, Mechanism A)',
			});
		}
		// export * as ns from "@hyperidle/db" — same wildcard hazard under a
		// namespace binding.
		if (
			ts.isExportDeclaration(node) &&
			node.exportClause &&
			ts.isNamespaceExport(node.exportClause) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "@hyperidle/db"
		) {
			findings.push({
				file: rel,
				reason: `barrel re-exports export * as ${node.exportClause.name.text} from "@hyperidle/db" — re-exports every raw table transitively; export typed functions only (Table ACL, Mechanism A)`,
			});
		}
		// export const knowledgeItems = ...
		if (
			ts.isVariableStatement(node) &&
			node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
		) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) flag(decl.name.text);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

/** Tier 2 — ownership ACL + completeness, over a nested prod file. */
function checkAccess(
	root: string,
	abs: string,
	tables: Set<string>,
): Finding[] {
	const rel = relative(root, abs);
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];

	// W2 checkpoint-review gap: `import * as db from "@hyperidle/db"` evades the
	// named-import check below. Collect namespace-import local names (imports are
	// module-top-level statements, so a single pass over ast.statements suffices)
	// so any `db.<table>` property access can be attributed regardless of order.
	const dbNamespaces = new Set<string>();
	for (const stmt of ast.statements) {
		if (
			ts.isImportDeclaration(stmt) &&
			ts.isStringLiteral(stmt.moduleSpecifier) &&
			stmt.moduleSpecifier.text === "@hyperidle/db" &&
			stmt.importClause &&
			!stmt.importClause.isTypeOnly &&
			stmt.importClause.namedBindings &&
			ts.isNamespaceImport(stmt.importClause.namedBindings)
		) {
			dbNamespaces.add(stmt.importClause.namedBindings.name.text);
		}
	}

	const consider = (name: string, kind: string): void => {
		if (!tables.has(name)) return; // not a table object
		if (UNOWNED_SHARED_TABLES.has(name)) return; // genuinely cross-cutting, no single owner (see comment above)
		const owner = TABLE_OWNER[name];
		if (owner === undefined) {
			findings.push({
				file: rel,
				reason: `${kind} touches table "${name}" which has no TABLE_OWNER row — add it (completeness)`,
			});
			return;
		}
		if (!isUnder(rel, owner)) {
			findings.push({
				file: rel,
				reason: `${kind} touches "${name}" owned by ${owner} — route through that Service (Table ACL)`,
			});
		}
	};

	const visit = (node: ts.Node): void => {
		// Drizzle access: db.from/insert/…(bareTable)
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ACCESS_METHODS.has(node.expression.name.text)
		) {
			const arg = node.arguments[0];
			if (arg && ts.isIdentifier(arg)) {
				consider(arg.text, `.${node.expression.name.text}(...)`);
			}
		}
		// Value import of a table symbol from @hyperidle/db
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "@hyperidle/db" &&
			node.importClause &&
			!node.importClause.isTypeOnly &&
			node.importClause.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings)
		) {
			for (const el of node.importClause.namedBindings.elements) {
				if (!el.isTypeOnly) consider(el.name.text, "value import");
			}
		}
		// Namespace-import property access: `import * as db from "@hyperidle/db"`
		// then `db.knowledgeItems` — as a bare reference or as a `.from(db.x)` arg
		// (the property-access node is visited as a child of the call expression).
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.expression) &&
			dbNamespaces.has(node.expression.text)
		) {
			consider(node.name.text, "namespace property access");
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

export function inspect(root: string): Finding[] {
	const tables = knownTables(root);
	const findings: Finding[] = [];
	for (const serviceRoot of nestedServiceRoots(root)) {
		findings.push(...checkBarrel(root, serviceRoot, tables));
		for (const abs of collectSourceFiles(join(serviceRoot, "src"))) {
			findings.push(...checkAccess(root, abs, tables));
		}
	}
	// AU19 Increment 5 item 4 scan-widening: `packages/core-api/src` is the
	// former `packages/server` composition root (routes/middleware/auth/
	// schemas/services, dissolved into `core-api` in Increment 5 item 2,
	// commit cee027ab) — it is core-api's OWN `src/`, not a further-nested
	// `packages/<layer>/<service>/` package with its own `package.json`, so
	// `nestedServiceRoots()` structurally never walks into it. `core-api`
	// itself owns zero tables (every TABLE_OWNER row points at one of its
	// nested Service subpackages), so only Tier 2 (ownership ACL +
	// completeness) applies here — there is no barrel for Tier 1 to check.
	// This is what finally closes every deferred direct-table-access site
	// this WP carried forward from `packages/server` (teamMembers/teams in
	// the old routes/tools, etc.) per architecture.md §12 Increment 5.
	const coreApiSrc = join(root, "packages/core-api/src");
	for (const abs of collectSourceFiles(coreApiSrc)) {
		findings.push(...checkAccess(root, abs, tables));
	}
	return findings;
}

// -- fixtures self-test --

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

/** Minimal schema so knownTables() sees the tables the fixtures reference. */
const FIXTURE_SCHEMA =
	'export const knowledgeItems = pgTable("knowledge_items", {});\n' +
	'export const bets = pgTable("bets", {});\n' +
	// `orders` is deliberately absent from the real TABLE_OWNER map AND from
	// UNOWNED_SHARED_TABLES — the completeness fixture below needs a table
	// that is genuinely unmapped (unlike `bets`, which now has a real
	// TABLE_OWNER row per AU19 Increment 1b, so it no longer proves this).
	'export const orders = pgTable("orders", {});\n' +
	'export const sessions = pgTable("sessions", {});\n';

function fixtureCheck(): void {
	// (1) Owner-legal + one foreign access + completeness, in one realistic tree.
	const root = mkdtempSync(join(tmpdir(), "au19-table-guard-"));
	try {
		writeFixture(root, "packages/db/src/schema.ts", FIXTURE_SCHEMA);
		writeFixture(
			root,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge" }',
		);
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/package.json",
			'{ "name": "@hyperidle/context-assembly" }',
		);
		// Owner file legally accesses knowledgeItems → no finding.
		writeFixture(
			root,
			"packages/core-api/knowledge/src/knowledge-reader.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: any) => db.select().from(knowledgeItems);',
		);
		// Clean owner barrel → no finding.
		writeFixture(
			root,
			"packages/core-api/knowledge/src/index.ts",
			'export { list } from "./knowledge-reader.js";',
		);
		// Foreign nested file accesses knowledgeItems → 1 ACL finding.
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: any) => db.select().from(knowledgeItems);',
		);
		// Nested file touches an UNMAPPED known table (orders) → 1 completeness finding.
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/src/orders.ts",
			'import { orders } from "@hyperidle/db"; export const q = (db: any) => db.insert(orders);',
		);
		// A table in UNOWNED_SHARED_TABLES (sessions) is exempt from BOTH the ACL
		// and the completeness check, even accessed from a foreign nested package
		// (AU19 Increment 1b finding — see UNOWNED_SHARED_TABLES's comment).
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/src/sessions-ok.ts",
			'import { sessions } from "@hyperidle/db"; export const q = (db: any) => db.select().from(sessions);',
		);
		// AU19 Increment 5 item 4 scan-widening: `packages/core-api/src` is
		// core-api's OWN src (the former `packages/server` composition root),
		// not a further-nested `packages/<layer>/<service>/` package — a raw
		// accessor there must still be caught as a foreign ACL violation
		// against `knowledge`'s real TABLE_OWNER row.
		writeFixture(
			root,
			"packages/core-api/src/routes/leak.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: any) => db.select().from(knowledgeItems);',
		);
		const findings = inspect(root);
		// leak.ts (nested): 1 (foreign .from) + 1 (value import) = 2;
		// orders.ts: 1 + 1 = 2; routes/leak.ts (core-api/src): 1 + 1 = 2 → 6 total.
		// sessions-ok.ts contributes 0 (UNOWNED_SHARED_TABLES exemption).
		if (findings.length !== 6) {
			throw new Error(
				`table-ownership-guard: expected 6 findings (2x foreign access+import across two nested/core-api-src leaks + 2 completeness), got ${findings.length}: ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	// (2) Barrel re-export of a raw table → finding.
	const barrelRoot = mkdtempSync(join(tmpdir(), "au19-table-guard-barrel-"));
	try {
		writeFixture(barrelRoot, "packages/db/src/schema.ts", FIXTURE_SCHEMA);
		writeFixture(
			barrelRoot,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge" }',
		);
		writeFixture(
			barrelRoot,
			"packages/core-api/knowledge/src/index.ts",
			'export { knowledgeItems } from "@hyperidle/db";',
		);
		const findings = inspect(barrelRoot);
		if (!findings.some((f) => f.reason.includes("barrel re-exports raw table"))) {
			throw new Error("table-ownership-guard: barrel re-export of a raw table was not caught");
		}
	} finally {
		rmSync(barrelRoot, { recursive: true, force: true });
	}

	// (3) W2 gap A — `export * from "@hyperidle/db"` wildcard barrel re-export.
	const wildcardRoot = mkdtempSync(join(tmpdir(), "au19-table-guard-wildcard-"));
	try {
		writeFixture(wildcardRoot, "packages/db/src/schema.ts", FIXTURE_SCHEMA);
		writeFixture(
			wildcardRoot,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge" }',
		);
		writeFixture(
			wildcardRoot,
			"packages/core-api/knowledge/src/index.ts",
			'export * from "@hyperidle/db";',
		);
		const findings = inspect(wildcardRoot);
		if (!findings.some((f) => f.reason.includes('export * from "@hyperidle/db"'))) {
			throw new Error(
				`table-ownership-guard: export * from "@hyperidle/db" was not caught, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(wildcardRoot, { recursive: true, force: true });
	}

	// (4) W2 gap B — namespace import (`import * as db from "@hyperidle/db"`)
	// evading Tier 2's bare-identifier `.from(table)` matcher.
	const namespaceRoot = mkdtempSync(join(tmpdir(), "au19-table-guard-namespace-"));
	try {
		writeFixture(namespaceRoot, "packages/db/src/schema.ts", FIXTURE_SCHEMA);
		writeFixture(
			namespaceRoot,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge" }',
		);
		writeFixture(
			namespaceRoot,
			"packages/agent-orchestration/context-assembly/package.json",
			'{ "name": "@hyperidle/context-assembly" }',
		);
		writeFixture(
			namespaceRoot,
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import * as db from "@hyperidle/db"; export const q = (h: any) => h.select().from(db.knowledgeItems);',
		);
		const findings = inspect(namespaceRoot);
		if (!findings.some((f) => f.reason.includes("namespace property access"))) {
			throw new Error(
				`table-ownership-guard: namespace-import access to db.knowledgeItems was not caught, got ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(namespaceRoot, { recursive: true, force: true });
	}

	// (5) Checkpoint-review follow-up — disjointness invariant. A table that
	// appears in BOTH `UNOWNED_SHARED_TABLES` and `TABLE_OWNER` (e.g. a future
	// edit mistakenly adding an already-owned table like "bets" to the exempt
	// set) must make `assertDisjointOwnership` throw with a clear message, not
	// silently pass — proving the guard is self-defending against the exact
	// mistake this fix closes.
	let threwOnOverlap = false;
	try {
		assertDisjointOwnership({ bets: "packages/core-api/work" }, new Set(["bets"]));
	} catch (err) {
		threwOnOverlap = true;
		if (!(err instanceof Error) || !err.message.includes("overlap")) {
			throw new Error(
				`table-ownership-guard: disjointness error message missing detail, got: ${String(err)}`,
			);
		}
	}
	if (!threwOnOverlap) {
		throw new Error(
			'table-ownership-guard: assertDisjointOwnership did not throw on a deliberately-overlapping fixture ("bets" in both TABLE_OWNER and UNOWNED_SHARED_TABLES) — disjointness is not enforced',
		);
	}
	// The real maps must themselves stay disjoint — re-assert here so a
	// regression fails the fixture run loudly, not just at module load.
	assertDisjointOwnership(TABLE_OWNER, UNOWNED_SHARED_TABLES);

	process.stdout.write("table-ownership-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const f of findings) process.stderr.write(`${f.file}: ${f.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`table-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("table-ownership-guard: PASS\n");
}
