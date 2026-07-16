/**
 * L13 — Team lookup service: application-layer enforcement of the 1:1
 * Team = TeamMembers invariant.
 *
 * @lore L13: The schema allows multiple team_members per team (no UNIQUE index on
 * team_members.team_id). The application contract is: exactly one active TeamMember per
 * Team. loadTeamMembers throws 500 (not 404) when the invariant is broken
 * because a missing team_members row is a programming bug, not a user error.
 *
 * @lore U1: Renamed from product-team.ts. `loadProductTeam` renamed to `loadTeamMembers`.
 * Queries `teamMembers` table (formerly `teams`). Returns `TeamMember` (formerly `Team`).
 */

import type { Team, TeamMember, WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { eq, inArray, isNull, sql } from "drizzle-orm";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * Load the single team_members row for a team, enforcing the 1:1 invariant.
 *
 * @throws ApiError(500, 'team_members_missing') if no team_members row exists for the team.
 * @throws ApiError(500, 'invariant_broken') if more than one team_members row exists.
 */
export async function loadTeamMembers(db: HyperIdleDb, teamId: string): Promise<TeamMember> {
	const rows = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
	if (rows.length === 0) {
		throw new ApiError(500, "team_members_missing", `Team ${teamId} has no team_members row`);
	}
	if (rows.length > 1) {
		throw new ApiError(
			500,
			"invariant_broken",
			`Team ${teamId} has ${rows.length} team_members rows — invariant broken`,
		);
	}
	const [row] = rows;
	if (!row) {
		// Unreachable: the length checks above guarantee exactly one row. The guard
		// re-narrows from `Row | undefined` for noUncheckedIndexedAccess.
		throw new ApiError(500, "team_members_missing", `Team ${teamId} has no team_members row`);
	}
	return row;
}

/**
 * Read the single team_members row for a team, or `undefined` if none exists.
 *
 * @lore AU19 Increment 1c: this is the concrete implementation `work`'s
 * `TeamCapacityReader` port (Mechanism C) wires to. `bet-state-machine.ts`/
 * `bet-decomposition.ts` used to import the `teamMembers` table directly for
 * capacity tracking (an interim `UNOWNED_SHARED_TABLES` exemption in
 * `table-ownership-guard.ts` — closed by this Increment, `org` is now the
 * real table owner). Unlike `loadTeamMembers` (throws `ApiError` on
 * missing/duplicate — an HTTP-route invariant), this returns `undefined` on
 * missing so `work`'s existing generic-`Error`-throwing behavior at each call
 * site is preserved byte-for-byte (no behavior change). Accepts `WriteExecutor`
 * (not just `HyperIdleDb`) so callers can pass a `tx` handle from inside their
 * own `db.transaction(...)` — `transitionBet`'s capacity re-check runs inside
 * its own tx to serialize concurrent commits.
 */
export async function getTeamMembersByTeamId(
	db: WriteExecutor,
	teamId: string,
): Promise<TeamMember | undefined> {
	const [row] = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
	return row;
}

/**
 * Read the single team_members row by its OWN `id` (not `teamId`), or
 * `undefined` if none exists.
 *
 * @lore AU19 Increment 1g: this is the concrete implementation `notifications`'
 * `NotificationsTeamReader` port (Mechanism C) wires to. `silence-policy.ts`
 * used to import the `teamMembers` table directly to resolve
 * `agent.teamId -> teamMembers.id -> teamMembers.teamId` for per-team silence
 * — a table-ownership-guard completeness finding (`teamMembers` is `org`-owned
 * since Increment 1c, but no accessor keyed on the row's own `id` existed yet;
 * `getTeamMembersByTeamId` queries the OTHER column, `teamMembers.teamId`).
 * Added here rather than reusing `getTeamMembersByTeamId` because the two
 * queries are genuinely different WHERE clauses, not a naming accident.
 */
export async function getTeamMembersById(
	db: HyperIdleDb,
	id: string,
): Promise<TeamMember | undefined> {
	const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
	return row;
}

/**
 * Set `team_members.active_bets` to an absolute value.
 *
 * @lore AU19 Increment 1c: the concrete write-side counterpart to
 * `getTeamMembersByTeamId` — `work`'s `TeamCapacityReader.setActiveBets` port
 * wires to this. `work` computes the new value (increment on activate,
 * decrement on complete/kill, clamped at 0) and passes it here; `org` owns
 * only the write mechanics, not the bet-capacity business rule.
 */
export async function setTeamMembersActiveBets(
	db: WriteExecutor,
	teamMembersId: string,
	activeBets: number,
): Promise<void> {
	await db.update(teamMembers).set({ activeBets }).where(eq(teamMembers.id, teamMembersId));
}

/**
 * Atomically add `deltaMinor` to a `team_members` row's `costActual` via
 * `coalesce(costActual, 0) + delta`. Owns the coalesce SQL so the
 * `teamMembers.costActual` column ref never leaves this store.
 *
 * @lore AU19 Increment 3g: the concrete write-side counterpart to
 * `getTeamMembersById` — `cost`'s `CostTeamAccessor` port (Mechanism C) wires
 * to this. `cost-cap.ts`'s `recordCostAndCheck` used to `db.update(teamMembers)`
 * directly (an ownership violation once `cost-cap.ts` becomes its own Service
 * package — `teamMembers` is `org`'s `TABLE_OWNER` since Increment 1c). Mirrors
 * `@hyperidle/users`' `incrementUserCost`.
 */
export async function incrementTeamMembersCost(
	db: WriteExecutor,
	teamMembersId: string,
	deltaMinor: number,
): Promise<void> {
	await db
		.update(teamMembers)
		.set({ costActual: sql`coalesce(${teamMembers.costActual}, 0) + ${deltaMinor}` })
		.where(eq(teamMembers.id, teamMembersId));
}

/**
 * Reset a single `team_members` row's `costActual` to zero.
 *
 * @lore AU19 Increment 3g: closes `cost`'s per-team billing-cycle reset
 * (`resetCosts({level:"team"})`) — same ownership-violation closure as
 * `incrementTeamMembersCost` above.
 */
export async function resetTeamMembersCost(
	db: WriteExecutor,
	teamMembersId: string,
): Promise<void> {
	await db.update(teamMembers).set({ costActual: 0 }).where(eq(teamMembers.id, teamMembersId));
}

/**
 * Bulk reset EVERY `team_members` row's `costActual` to zero (factory-wide
 * billing-cycle reset). Deliberate no-WHERE update, mirrors
 * `@hyperidle/users`' `resetAllUserCost`.
 *
 * @lore AU19 Increment 3g: closes `cost`'s factory-level reset
 * (`resetCosts({level:"factory"})`) — same ownership-violation closure as
 * `incrementTeamMembersCost` above.
 */
export async function resetAllTeamMembersCost(db: WriteExecutor): Promise<void> {
	// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
	await db.update(teamMembers).set({ costActual: 0 }).where(sql`true`);
}

/**
 * Read a single `teams` row (the domain-entity table — distinct from
 * `team_members`, the membership-group table the rest of this file's
 * functions operate on) by its own `id`, or `undefined` if none exists.
 *
 * @lore AU19 Increment 3 (teams table-ownership remediation, 2026-07-15
 * founder ruling): the concrete implementation `context-assembly`'s
 * `TeamReader` DI port (Mechanism C) wires to — `session-context.ts` used to
 * `.from(teams)` directly, citing a stale pre-AU19 `@lore` ("`teams` is not
 * one of the five owned tables, so any file may query it") that predates
 * `org` existing as a real, guarded Table-ACL package. Mirrors
 * `getTeamMembersById`'s shape one column over (`teams.id` vs
 * `teamMembers.id`).
 */
export async function getTeamById(db: HyperIdleDb, teamId: string): Promise<Team | undefined> {
	const [row] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
	return row;
}

/**
 * Batch-read `teams` rows by id — mirrors `@hyperidle/work`'s
 * `listBetsByIds`' empty-ids short-circuit (an empty `inArray` errors in some
 * dialects).
 *
 * @lore AU19 Increment 3 (teams table-ownership remediation): closes
 * `routes/search.ts`'s batch team-name lookup for a page of bet results —
 * the other named stale-`@lore` site (alongside `work-service.ts`) the
 * founder ruling identified as evidence of the same unconverted `teams`
 * access pattern.
 */
export async function listTeamsByIds(db: HyperIdleDb, ids: readonly string[]): Promise<Team[]> {
	if (ids.length === 0) return [];
	return db
		.select()
		.from(teams)
		.where(inArray(teams.id, Array.from(ids)));
}

/**
 * List every `teamMembers` row (unfiltered, all columns).
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, work sub-item
 * org-cleanup addendum): closes `routes/bets.ts`'s GET /bets/canvas capacity
 * aggregate (`.from(teamMembers)`, no filter, summed client-side) and
 * `routes/knowledge.ts`'s `createTeamMembersRoutes` GET / (same unfiltered
 * scan, narrower column projection applied by the caller) — both were raw
 * `teamMembers` reads left in place by the org sub-item (which converted
 * `routes/teams-routes.ts` but not these two call sites) and the knowledge
 * sub-item (which didn't own `teamMembers` and correctly left it alone).
 */
export async function listAllTeamMembers(db: HyperIdleDb): Promise<TeamMember[]> {
	return db.select().from(teamMembers);
}

/**
 * List every `teams` row (unfiltered).
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org` sub-item):
 * closes `routes/settings.ts`'s `buildSettingsResponse` — the settings panel's
 * team list has no filter (unlike `listTeamsByIds`, which is a batch id-keyed
 * lookup for a page of bet results), so it needs its own unfiltered export
 * rather than reusing that one with a contrived "all ids" call.
 */
export async function listAllTeams(db: HyperIdleDb): Promise<Team[]> {
	return db.select().from(teams);
}

/** Row shape for {@link listActiveTeamMembersWithTeamNames}. */
export interface ActiveTeamMembersWithTeamName {
	readonly id: string;
	readonly name: string;
	readonly teamActualId: string;
}

/**
 * List every non-dissolved `teamMembers` row joined to its `teams.name` —
 * `{ id: teamMembers.id, name: teams.name, teamActualId: teams.id }`.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org` sub-item):
 * closes `routes/org.ts`'s `GET /` org-chart response's team-select
 * denormalization (AF15/AO1) — `teamMembers.id` is the value the UI submits
 * for `mechanism:"team"` edges, `teams.name` is the label, `teams.id`
 * (`teamActualId`) lets the UI fetch team-scoped resources keyed on the
 * domain-entity id rather than the membership-group id.
 */
export async function listActiveTeamMembersWithTeamNames(
	db: HyperIdleDb,
): Promise<ActiveTeamMembersWithTeamName[]> {
	return db
		.select({ id: teamMembers.id, name: teams.name, teamActualId: teams.id })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(isNull(teamMembers.dissolvedAt));
}

/** Input for {@link createTeam}. */
export interface CreateTeamInput {
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly functions: string | null;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	/**
	 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org`
	 * sub-item): the AV1 primary-harness team-default triple, optional so
	 * `tool-handlers`' `create-team.ts` (which never sets a primary harness at
	 * creation) keeps its existing 6-field call unchanged — `routes/
	 * teams-routes.ts`'s POST /teams passes all three explicitly (`?? null`).
	 */
	readonly defaultHarnessType?: string | null;
	readonly defaultModelId?: string | null;
	readonly defaultModelProvider?: string | null;
}

/**
 * Read a single `teams` row by its exact (trimmed) `name`, or `undefined` if
 * none exists.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org`
 * sub-item): closes `routes/teams-routes.ts`'s POST /teams idempotency guard
 * (AF15 AC-4 — re-running setup with the same name returns the existing team
 * rather than duplicating it).
 */
export async function getTeamByName(db: HyperIdleDb, name: string): Promise<Team | undefined> {
	const [row] = await db.select().from(teams).where(eq(teams.name, name)).limit(1);
	return row;
}

/**
 * Insert a `teams` row.
 *
 * @lore AU19 Increment 4: closes `tools/create-team.ts`'s direct `teams`
 * insert — the same forcing function as `getTeamById` above, now for the
 * write side (`create-team.ts` moves into the guarded `tool-handlers`
 * package this increment).
 */
export async function createTeam(db: HyperIdleDb, input: CreateTeamInput): Promise<void> {
	await db.insert(teams).values(input);
}

/** Input for {@link createTeamMembersGroup}. */
export interface CreateTeamMembersGroupInput {
	readonly id: string;
	readonly teamId: string;
	readonly capacity: number;
	readonly activeBets: number;
	readonly formedAt: string;
}

/**
 * Insert a `teamMembers` (membership-group) row.
 *
 * @lore AU19 Increment 4: closes `tools/create-team.ts`'s direct
 * `teamMembers` insert — same forcing function as `createTeam` above.
 */
export async function createTeamMembersGroup(
	db: HyperIdleDb,
	input: CreateTeamMembersGroupInput,
): Promise<void> {
	await db.insert(teamMembers).values(input);
}

/**
 * Set the lead agent on a `teamMembers` row.
 *
 * @lore AU19 Increment 4: closes `tools/create-team.ts`'s direct
 * `teamMembers` update.
 */
export async function setTeamMembersLeadAgent(
	db: HyperIdleDb,
	teamMembersId: string,
	leadAgentId: string,
): Promise<void> {
	await db.update(teamMembers).set({ leadAgentId }).where(eq(teamMembers.id, teamMembersId));
}

/**
 * Delete a single `teamMembers` row by its own `id`.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org` sub-item):
 * closes `routes/teams-routes.ts`'s POST /teams AE2 AC-1h rollback path — when
 * app-owned scaffolding produces zero agent specs, the already-inserted
 * `teamMembers` + `teams` rows for the rejected team must be rolled back.
 */
export async function deleteTeamMembersGroupById(db: HyperIdleDb, id: string): Promise<void> {
	await db.delete(teamMembers).where(eq(teamMembers.id, id));
}

/**
 * Delete a single `teams` row by its own `id`.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org` sub-item):
 * write-side counterpart to {@link deleteTeamMembersGroupById} — closes the
 * same POST /teams rollback path's `teams` deletion.
 */
export async function deleteTeamById(db: HyperIdleDb, id: string): Promise<void> {
	await db.delete(teams).where(eq(teams.id, id));
}

/**
 * Set a `teams` row's `phase`.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org`
 * sub-item): closes `routes/teams-routes.ts`'s PATCH /:teamId phase-update
 * write (P4 AC-18 — SettingsTeams active/archived toggle). `phase` is a plain
 * `text` column (no Drizzle enum) — the route's own `VALID_PHASES` literal
 * union is validated at the HTTP boundary, this function just persists the
 * already-validated string.
 */
export async function updateTeamPhase(
	db: HyperIdleDb,
	teamId: string,
	phase: string,
): Promise<void> {
	await db.update(teams).set({ phase }).where(eq(teams.id, teamId));
}
