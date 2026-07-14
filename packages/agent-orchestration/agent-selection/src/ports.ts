/**
 * `agent-selection` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (as
 * refined during this migration — the census is "a floor, refinable during
 * migration", §14).
 *
 * @lore AU19 Increment 3e: `agent-selection.ts`'s `isAgentAtWipLimit` and
 * `select-agent.ts`'s `enumerateTeamCandidates`/`selectOwner` called
 * `@hyperidle/users`' `getUserById`/`listActiveAiUsersByTeams` directly —
 * architecture §10.1's census-listed `agent-selection → users` edge (2
 * calls). Converted to `AgentSelectionUserReader`, wired by the caller
 * (`packages/server`, the composition root — Services haven't physically
 * moved into their Layer packages yet, Increment 5).
 *
 * Census correction: the real call count is 3, not 2 — `select-agent.ts`'s
 * `enumerateTeamCandidates` (`listActiveAiUsersByTeams`) and `selectOwner`
 * (`getUserById`) plus `agent-selection.ts`'s `isAgentAtWipLimit`
 * (`getUserById`) are three distinct call sites; the original census counted
 * two. §10.1/§10.2 updated to 3.
 *
 * Census addition (a genuinely NEW edge, not in the original census):
 * `select-agent.ts`'s `enumerateTeamCandidates` also read `teamMembers`
 * directly via a raw `.select(...).where(eq(teamMembers.teamId, ...))` for
 * the membership-group read — `teamMembers` is `org`'s `TABLE_OWNER`. Same
 * shape as `trigger-resolution`'s and `session-requests`' own census
 * corrections for the identical query: converted to `AgentSelectionTeamReader`,
 * wired to `org`'s real `getTeamMembersByTeamId`, relying on the same
 * 1:1 Team=TeamMembers invariant (`team-lookup.ts`'s own doc comment) those
 * two prior corrections already established — a team has at most one
 * `team_members` row in practice, so `getTeamMembersByTeamId`'s single-row
 * read is behaviorally equivalent to the original multi-row scan wrapped in
 * an array. §10.1/§10.2 gain a new `agent-selection → org` row (1 call).
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or typed directly off `@hyperidle/db` row types per §7.3 W4) rather
 * than imported from the target package — a Service NEVER imports another
 * Service, even for a type-only reference.
 */

import type { HyperIdleDb, TeamMember, User } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// users — AgentSelectionUserReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface this Service calls directly today. */
export interface AgentSelectionUserReader {
	getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
	listActiveAiUsersByTeams(db: HyperIdleDb, teamMembersIds: string[]): Promise<User[]>;
}

// ---------------------------------------------------------------------------
// org — AgentSelectionTeamReader (census correction, ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `org`'s `teamMembers`-by-`teamId` read (census correction, see this file's top `@lore`). */
export interface AgentSelectionTeamReader {
	getTeamMembersByTeamId(db: HyperIdleDb, teamId: string): Promise<TeamMember | undefined>;
}

/** Aggregate deps this Service's DB-touching functions need. */
export interface AgentSelectionDeps {
	readonly users: AgentSelectionUserReader;
	readonly teams: AgentSelectionTeamReader;
}
