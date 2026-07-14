/**
 * `trigger-resolution` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census:
 * `trigger-resolution`'s three real outbound edges are `session-requests`
 * (`agent-session-requests.ts`'s idempotency-keyed lookup + create),
 * `settings` (`plugin-configuration.ts`'s `listResolvedConfiguration`), and
 * `users` (`user-store.ts`'s `getUserByIdScopedToTeam`) — all ORDINARY
 * downward edges (NOT §10.3 against-grain; no Increment-3 EventBus-rewire
 * caveat applies to any of the three).
 *
 * A FOURTH edge the function-level census missed (raw-table access, not a
 * function call): `isEligibleAgent`'s membership check queried the
 * `teamMembers` table (owned by `org` since Increment 1c) directly —
 * converted here to `TriggerResolutionTeamReader`, wired to `org`'s real
 * `getTeamMembersByTeamId` export. Appended as a new row to architecture
 * §10.1/§10.2's composition census (ground-rule #10), same shape as the
 * `git-export → knowledge`/`realtime → org`/`retention → users` census
 * corrections landed in prior Increment-2 sub-increments.
 *
 * `session-requests` is scheduled to migrate the NEXT Increment-3 item, not
 * this one — `TriggerResolutionSessionRequestPort` is wired INTERIM (real
 * behavior, just not yet packaged) to `packages/server`'s still-unmigrated
 * `services/agent-session-requests.ts` functions. This needs no `@lore`
 * EventBus-rewire caveat (unlike `policy`'s/`work`'s Increment-1b/2a interim
 * ports): this is an ORDINARY downward edge, not against-grain — once
 * `session-requests` migrates, only the concrete wiring target changes
 * (the consumer swaps its import to `@hyperidle/session-requests`), the port
 * shape itself is permanent.
 *
 * `triggerResolutionHistory` — this Service's own table — is a genuine table
 * this Service owns (roster's "—" `⛁` column undercounted it; same "confirm
 * at migration" shape as `policy`'s/`filesystems`' `⛁*` findings, just for a
 * Service the roster marked plain `—` instead of `⛁*`). See `TABLE_OWNER` in
 * `scripts/table-ownership-guard.ts`.
 */

import type {
	AgentSessionRequest,
	HyperIdleDb,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type {
	AgentSessionRequestInput,
	AgentSessionSourceKind,
	ConfigurationKind,
	ResolvedConfigurationItem,
} from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// session-requests — TriggerResolutionSessionRequestPort (ordinary downward
// edge, interim target — session-requests migrates next in Increment 3)
// ---------------------------------------------------------------------------

/**
 * Port for `session-requests`' idempotency-keyed lookup + create surface this
 * Service calls directly today: `createAgentSessionRequest`, plus a
 * dedicated dedupe-lookup this migration extracts as
 * `findAgentSessionRequestByIdempotencyKey` (previously an inline raw
 * `agentSessionRequests` table query in this module).
 */
export interface TriggerResolutionSessionRequestPort {
	findByIdempotencyKey(
		db: HyperIdleDb,
		key: { sourceKind: AgentSessionSourceKind; sourceId: string; idempotencyKey: string },
	): Promise<AgentSessionRequest | undefined>;
	create(db: HyperIdleDb, input: AgentSessionRequestInput): Promise<AgentSessionRequest>;
}

// ---------------------------------------------------------------------------
// settings — TriggerResolutionConfigReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `settings`' resolved-configuration read surface this Service calls directly today (`listResolvedConfiguration`). */
export interface TriggerResolutionConfigReader {
	listResolvedConfiguration(
		db: HyperIdleDb,
		kind: ConfigurationKind,
	): Promise<ResolvedConfigurationItem[]>;
}

// ---------------------------------------------------------------------------
// users — TriggerResolutionUserReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' team-scoped read surface this Service calls directly today (`getUserByIdScopedToTeam`). */
export interface TriggerResolutionUserReader {
	getUserByIdScopedToTeam(
		db: HyperIdleDb,
		id: string,
		teamMembersId?: string,
	): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// org — TriggerResolutionTeamReader (census correction, ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `org`'s `teamMembers`-by-`teamId` read surface this Service calls directly today (`getTeamMembersByTeamId` — census correction, see this file's top `@lore`). */
export interface TriggerResolutionTeamReader {
	getTeamMembersByTeamId(db: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
}

// ---------------------------------------------------------------------------
// Combined deps bag
// ---------------------------------------------------------------------------

/** `trigger-resolution.ts`'s `resolveTriggerForSessionRequest`/`createTriggeredAgentSessionRequest`. */
export interface TriggerResolutionDeps {
	sessionRequests: TriggerResolutionSessionRequestPort;
	config: TriggerResolutionConfigReader;
	users: TriggerResolutionUserReader;
	teams: TriggerResolutionTeamReader;
}
