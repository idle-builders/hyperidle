/**
 * `realtime` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports for `createDbSubscribeAuthorizer`'s real outbound edges. Three
 * are census-listed at architecture §10.2 lines 384-386 (`realtime → work`,
 * `realtime → conversation`, `realtime → users`); all three are ordinary
 * same-layer core-api→core-api edges — no §10.3 against-grain caveat, no
 * Increment-3 EventBus-rewire flag needed.
 *
 * @lore AU19 Increment 2f — census correction (§14 sanctions updating the
 * census as "a floor, refinable during migration", same idiom as
 * `git-export → knowledge` in Increment 2c and `policy → org` in
 * Increment 2a): a FOURTH real edge, `realtime → org`, was missing from the
 * original census. `createDbSubscribeAuthorizer`'s `senderInTeam` helper
 * queried the raw `teamMembers` table directly (`.select({teamId:
 * teamMembers.teamId}).from(teamMembers).where(eq(teamMembers.id,
 * sender.teamId))`) — behaviorally identical to `org`'s own exported
 * `getTeamMembersById` (single-row read by `team_members.id`, the same
 * function `policy`'s `PolicyOrgTeamReader` port and `work`'s
 * `TeamCapacityReader` port already wire to), reused here instead of
 * duplicating the raw query. This is also an ordinary downward
 * core-api→core-api edge, not against-grain. See this Service's `index.ts`
 * top comment for the §10.1/§10.2 aggregate-row update this correction
 * requires.
 *
 * Structural ports, same idiom as `@hyperidle/policy`'s / `@hyperidle/review`'s
 * `ports.ts`: each mirrors the real target function's signature so the
 * concrete caller (still `packages/server`, the not-yet-split composition
 * root) can pass its existing function reference unchanged — zero behavior
 * change. Types are declared locally (structural mirrors of the target
 * Service's own row shapes, narrowed to the fields this Service actually
 * reads) rather than imported from the target package — a Service NEVER
 * imports another Service's type, even a type-only reference.
 *
 * `sessions` (the fifth table `createDbSubscribeAuthorizer` reads, for
 * session-topic authorization) stays a direct `@hyperidle/db` read — it is
 * already in `scripts/table-ownership-guard.ts`'s `UNOWNED_SHARED_TABLES`
 * (genuinely multi-owner-touched, same as `policy`'s Increment 2a reads),
 * so no port is needed for it.
 */

import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// conversation — RealtimeThreadReader (ordinary downward core-api edge)
// Internal: callers satisfy SubscribeAuthorizerDeps structurally; they never
// need to name the leaf port types. @lore AU20 Ab2: collapsed from public
// surface to file-internal per the 12→5 barrel collapse.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/conversation`'s `Thread` row, narrowed to `participants`. */
interface RealtimeThreadRow {
	readonly participants: string;
}

/** Port for `conversation`'s thread read `senderInThread` calls directly today (§10.2 line 385). */
interface RealtimeThreadReader {
	getThreadById(db: HyperIdleDb, id: string): Promise<RealtimeThreadRow | undefined>;
}

// ---------------------------------------------------------------------------
// users — RealtimeUserDirectory (ordinary downward core-api edge)
// Internal: see RealtimeThreadReader note above.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/users`' `User` row, narrowed to `teamId`. */
interface RealtimeUserRow {
	readonly teamId: string | null;
}

/** Port for `users`' read `senderInTeam` calls directly today (§10.2 line 386). */
interface RealtimeUserDirectory {
	getUserById(db: HyperIdleDb, id: string): Promise<RealtimeUserRow | undefined>;
}

// ---------------------------------------------------------------------------
// org — RealtimeOrgTeamReader (ordinary downward core-api edge, NOT
// against-grain — census correction, see this file's top `@lore`)
// Internal: see RealtimeThreadReader note above.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/org`'s `TeamMember` row, narrowed to `teamId`. */
interface RealtimeTeamMembersRow {
	readonly teamId: string;
}

/** Port for `org`'s `getTeamMembersById` read `senderInTeam` calls directly today. */
interface RealtimeOrgTeamReader {
	getTeamMembersById(db: HyperIdleDb, id: string): Promise<RealtimeTeamMembersRow | undefined>;
}

// ---------------------------------------------------------------------------
// work — RealtimeTaskReader (ordinary downward core-api edge)
// Internal: see RealtimeThreadReader note above.
// ---------------------------------------------------------------------------

/** Port for `work`'s task-existence read the session-topic authz check calls directly today (§10.2 line 384). */
interface RealtimeTaskReader {
	getTaskById(db: WriteExecutor, id: string): Promise<{ readonly id: string } | undefined>;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/** Deps `createDbSubscribeAuthorizer` needs — every real outbound edge it has. */
export interface SubscribeAuthorizerDeps {
	readonly conversation: RealtimeThreadReader;
	readonly users: RealtimeUserDirectory;
	readonly org: RealtimeOrgTeamReader;
	readonly work: RealtimeTaskReader;
}
