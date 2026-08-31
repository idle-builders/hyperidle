/**
 * `work` Service (core-api) — outbound composition-boundary (Mechanism C) DI
 * ports, per architecture §10.2's census: `work`'s remaining real outbound
 * edges (`session-requests`, `org`, `users`) become injected ports here,
 * wired by the caller in `packages/server` (the not-yet-split
 * `agent-orchestration`/Application composition root) until those Services
 * migrate.
 *
 * Structural ports, same idiom as `@hyperidle/knowledge`'s
 * `AttentionServiceDeps` (`ReasoningMarkerFinder`/`KnowledgeReviewWriter`,
 * Increment 1a): each port mirrors the real target function's signature so
 * the concrete caller (still in `packages/server`) can pass its existing
 * function reference unchanged — zero behavior change.
 *
 * @lore AU19 Increment 1b — §10.3 "against-grain" classification:
 * `AgentWorkIntentRecorder` (→ session-requests) is `core-api →
 * agent-orchestration`, which runs AGAINST the downward dependency grain
 * (orchestration is meant to depend on core-api, not the reverse). Two
 * siblings this classification used to apply to are gone: `CostCapChecker`
 * (→ cost) was REMOVED outright at Increment 8, Decision D2 (see below); the
 * `AgentSelectionDefaults` (→ agent-selection) port covering `bet_task`/
 * `bet_decomposer` selection was likewise removed at Increment 8, Decision
 * F1 — traced to only ever read `work`'s OWN already-injected
 * `teamCapacity`/`users` ports (ordinary same-layer edges), so the standalone
 * Service added no real capability; the algorithm relocated in place as
 * `agent-assignment.ts`, an ordinary intra-package module, not a port. The
 * fourth original port (`UserStoreReader` → `users`) is an ordinary
 * same-layer core-api→core-api edge (`users` just hasn't migrated yet) — no
 * event-bus rewrite is needed for it, only a straight DI-target swap once
 * `users` exists.
 *
 * @lore AU19 Increment 1c — `TeamCapacityReader` (→ `org`, now a REAL migrated
 * package, not an interim stub) closes W2: `bet-state-machine.ts`/
 * `bet-decomposition.ts` used to import the `teamMembers` table directly
 * (an interim `table-ownership-guard.ts` `UNOWNED_SHARED_TABLES` exemption,
 * now removed — `org` is the real `TABLE_OWNER`). This is also an ordinary
 * same-layer core-api→core-api edge, NOT against-grain — wired directly to
 * `@hyperidle/org`'s real exported functions (`getTeamMembersByTeamId`/
 * `setTeamMembersActiveBets`), no interim indirection needed since `org`
 * migrated in the same Increment this port was introduced.
 *
 * @lore AU19 Increment 1d — `UserStoreReader` (→ `users`, now a REAL migrated
 * package): the straight DI-target swap anticipated above landed. Every real
 * call site (`server-factory.ts`, `__tests__/bet-decomposition.test.ts`)
 * now wires it to `@hyperidle/users`' real exported `getUserById`/
 * `listActiveAiUsersByTeams` instead of `packages/server`'s (now-deleted)
 * `user-store.ts` copy. Still an ordinary same-layer core-api→core-api edge,
 * no EventBus rewrite needed.
 *
 * @lore AU21 §6 Decision F1 (Increment 8, closing the AU19 Increment 3e/3f
 * deferral): `AgentSelectionDefaults` — the `bet_task`/`bet_decomposer` half
 * of the retired `agent-selection` Service — is REMOVED, not inverted to an
 * EventBus. It was never genuinely against-grain in the first place: its
 * only real callers (`bet-decomposition.ts`'s `runBetDecomposition`/
 * `insertProposedBetTasks`) only ever read `teamCapacity`/`users`, both
 * ordinary ports this file already declares. `agent-assignment.ts` is the
 * mechanical relocation — same algorithm, called directly (no DI port), zero
 * behavior change. `routine_delegate` (the third `selectAgent` surface) was
 * never `work`'s concern — it's `@hyperidle/routine`'s own
 * `agent-delegation.ts`.
 *
 * @lore AU21 §6 Decision D2 (founder ruling, 2026-07-27): the founder ruled
 * decomposition must never stop for cost reasons at all — "we always need
 * to compose, we cannot stop working because of costs, there is no way to
 * recover otherwise." So the `CostCapChecker` port isn't inverted to an
 * EventBus either — it's DELETED outright: `CostCapChecker`,
 * `WorkCostCapResult`, and `WorkCheckCostCapParams` are removed from this
 * file, `BetDecompositionDeps.costCap`/`WorkDeps.costCap` are gone, and
 * `runBetDecomposition`'s pre-flight block is deleted, not rewired.
 * Decomposition now proceeds unconditionally regardless of cap status. At
 * the time of this ruling the cost-cap MECHANISM itself (`checkCostCap` in
 * `@hyperidle/cost`) was untouched — only bet-decomposition's use of it as a
 * hard-blocking gate was removed. @lore AU21 Increment 14a (founder,
 * 2026-08-03): the cost-cap mechanism itself is since HARD-DELETED in full
 * (`@hyperidle/cost`, `cost-bindings.ts`, `routine-scheduler.ts`'s monthly-cap
 * check, every DB column) — no replacement of any kind. D2's ruling here is
 * now moot rather than merely still-correct: there is no cost-cap gate left
 * anywhere for decomposition (or anything else) to bypass.
 *
 * @lore AU19 (closing ruling, 2026-07-16 — this was left open through
 * Increments 3e/3g and never explicitly closed; caught by a post-ship audit
 * sweep) — `AgentWorkIntentRecorder` (→ `session-requests`, real since
 * Increment 3b) is **RULED PERMANENT**, not inverted. `bet-decomposition.ts`
 * calls `deps.workIntents.record(tx, {...})` **inside the same
 * `db.transaction`** as `work.claimBetDecomposition(tx, betId)` — the literal
 * same-transaction-write shape §10.3's amendment names first.
 * An EventBus emit-after-commit
 * would split the bet claim and the intent record into two transactions — a
 * crash between them leaves a bet marked "claimed for decomposition" with no
 * recorded intent anywhere, silently stuck forever. This port's shape is
 * unchanged; only its permanence is now settled.
 */

import type { Team, WriteExecutor } from "@hyperidle/db";
import type { AgentWorkIntentRecorderFn } from "@hyperidle/domain-model";

// ---------------------------------------------------------------------------
// session-requests — workIntents (§10.3 against-grain — RULED PERMANENT, see top @lore)
// ---------------------------------------------------------------------------

/** Plain function type replacing the former `AgentWorkIntentRecorder<WriteExecutor>` interface. */
type AgentWorkIntentRecorder = AgentWorkIntentRecorderFn;

// ---------------------------------------------------------------------------
// org — TeamCapacityReader (ordinary downward core-api edge, NOT against-grain)
// ---------------------------------------------------------------------------

/**
 * Port for `org`'s team-capacity read/write surface `work` calls directly
 * today (`team-lookup.ts`'s `getTeamMembers`/`updateTeam`).
 * Types off `@hyperidle/db`'s `TeamMember` row directly (`work` keeps
 * `@hyperidle/db` — architecture §7.3 W4, core-api Services may type ports
 * off `@hyperidle/db` row types directly) — no narrower `Work*` row type is
 * needed since `org` already owns the canonical row shape.
 *
 * @lore AU20 Am7: `setActiveBets` signature changed from `(db, teamMembersId, activeBets)`
 * to `(db, teamId, activeBets)` — the 1:1 invariant lets `org`'s new
 * `updateTeam(db, teamId, { activeBets })` address the row by `teamId`
 * (WHERE teamMembers.teamId = teamId), eliminating the need to pass
 * `teamMembers.id` to the write side. `bet-state-machine.ts` passes
 * `freshMemberGroup.teamId` instead of `freshMemberGroup.id` unchanged in semantics.
 */
interface TeamCapacityReader {
	getByTeamId(db: WriteExecutor, teamId: string): Promise<Team | undefined>;
	setActiveBets(db: WriteExecutor, teamId: string, activeBets: number): Promise<void>;
}

export type { AgentWorkIntentRecorder, TeamCapacityReader };
