/**
 * @lore AU19 Increment 3b: `@hyperidle/session-requests`'s
 * Composition root for the durable agent queue.
 * Durable queue transitions need injected
 * `routine`/`work`/`conversation`/`users`/`org`/`review`/
 * `trigger-resolution` ports (Mechanism C — `session-requests` never imports
 * another Service). `@hyperidle/session-requests` is the current owner of lifecycle projection.
 * This module builds
 * each bound singleton ONCE, at the composition root, so every real call
 * site (`agent-layer-boot.ts`, `session-lifecycle.ts`, `agent-session-runtime.ts`,
 * `routes/threads.ts`, `routes/sessions-routes.ts`, `routes/tasks.ts`,
 * `routes/bets.ts`, `routes/knowledge.ts`, `routes/routines-routes.ts`,
 * `routine-scheduler.ts`, `session-provisioning.ts`, `policy-bindings.ts`,
 * `app.ts`, `server-factory.ts`) imports the already-wired function — same
 * factory-curry idiom as `policy-bindings.ts`'s `handoff`/`computeApprovalRate`
 * (Increment 2a).
 *
 * @lore AU21 §6 Decision F1: the `agentSelection` field this module used to
 * wire (`agentSelectionService.isAtCapacity`/`.selectAgent`) is REMOVED — it
 * was vestigial, a leftover from Increment 4's drain-time-selection deletion
 * with zero real call sites left in `@hyperidle/session-requests`'s own
 * `service.ts` (confirmed by grep before removal). The retired
 * `agent-selection` Service's real capabilities folded elsewhere:
 * `work`'s `bet_task`/`bet_decomposer` selection into `@hyperidle/work`'s own
 * `agent-assignment.ts`; `routine_delegate` into `@hyperidle/routine`'s
 * `agent-delegation.ts`; capacity into `@hyperidle/run-orchestration`'s
 * `concurrency.ts` — none of which this durable-queue composition root ever
 * needed injected.
 *
 * The AC-9 (§11) cross-Layer `agentWorkIntentRecorder`/`agentWorkIntentReader`
 * singletons at the bottom are the concrete `@hyperidle/shared`-typed ports
 * `createApp`/`createServer` inject into `routes/threads.ts`/
 * `routes/sessions-routes.ts` — the only two accessors that needed the
 * Application-injection treatment (raw table access bypassing the canonical
 * writer/reader); every other consumer above just imports
 * `enqueueWorkIntent` from this module directly (an ordinary same-process
 * `packages/server` composition-root import, not a route→Service import).
 *
 * @lore AU20: this composition root supplies dependencies to the unified
 * durable-queue operations; compatibility transition wrappers were deleted.
 *
 * @lore AU21 §9 Increment 9: `conversation`/`review`/`knowledge` groups and
 * `routine`, plus `users.getUserById`/`listUsersByTeam` and
 * `work.getTaskById`/`getBetById`, REMOVED — confirmed dead (zero real call
 * sites in `@hyperidle/session-requests`'s own `service.ts`; grepped before
 * removal, same verification bar as the AU21 §6 Decision F1 `agentSelection`
 * removal above). Each family's real domain read was already deleted by an
 * earlier increment's resolve-at-emit migration (architecture.md §9
 * Increment 3) — this was leftover, unreachable composition wiring nobody
 * cleaned up alongside it, caught by the anti-regrowth guard's forensic pass.
 * The surviving `work`/`users`/`teams`/`config` fields below are genuinely
 * live: `work`'s `taskDispatchAttemptStore` (the AU9 CAS/dedup own-state
 * check) and `lifecycleProjection`'s guarded transition stay; `users.
 * getUserByIdScopedToTeam`/`teams.getTeamMembersByTeamId`/`config.
 * listConfiguration` back `createTriggeredInternal`'s trigger-rule + target-
 * agent resolution — itself a real, NOT-yet-closed `§2 resolve-at-emit` gap
 * (edge-disposition.md), left open and tracked, not silently allowlisted.
 */

import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { getTeamMembers } from "@hyperidle/org";
import { type DurableAgentQueueDeps, transitionSessionRequest } from "@hyperidle/session-requests";
import { listConfiguration } from "@hyperidle/settings";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";

// ---------------------------------------------------------------------------
// DurableAgentQueueDeps — single composition-root deps bundle (AU20 Ag3a).
//
// @lore AU20 Ag3a: previously 4 separate mini-bundle consts were built and
// passed to individual functions. DurableAgentQueueDeps is a structural
// superset of all four: TypeScript structural typing means passing `deps`
// (or `{ lifecycleInbox: deps.lifecycleInbox }` / `{ triggerHistory: deps.triggerHistory }`)
// satisfies every internal function's mini-bundle parameter type without
// runtime wrapping or casting. The individual SessionRequests* port types and
// mini-bundles remain as internal building blocks inside ports.ts.
// ---------------------------------------------------------------------------

const ports = {
	config: { listConfiguration },
	work: {
		getTaskDispatchAttemptById: work.taskDispatchAttemptStore.get,
		reapTerminalTaskDispatchAttempts: work.taskDispatchAttemptStore.reapTerminal,
	},
	users: {
		getUserByIdScopedToTeam: (db: HyperIdleDb, userId: string, teamId?: string) =>
			findUser(db, teamId ? { id: userId, teamIds: [teamId] } : { id: userId }),
	},
	teams: {
		getTeamMembersByTeamId: (db: HyperIdleDb, teamId: string) => getTeamMembers(db, { teamId }),
	},
	lifecycleProjection: {
		work: {
			updateTaskDispatchAttemptIfActive: work.taskDispatchAttemptStore.updateIfActive,
			updateBetDecompositionStatusIfRunning: async (
				exec: WriteExecutor,
				id: string,
				patch: object,
			) => {
				await work.transition(exec, "bet", {
					id,
					guard: { field: "decompositionStatus", equals: "running" },
					patch,
				});
			},
		},
		explicitSessionStarts: {
			projectTerminalState: async (
				exec: WriteExecutor,
				requestId: string,
				patch: {
					readonly status: "completed" | "failed" | "cancelled";
					readonly sessionId: string | null;
					readonly failureCode: string | null;
				},
			) => {
				await transitionSessionRequest(exec, {
					target: "explicitStart",
					transaction: "existing",
					requestId,
					to: patch.status,
					sessionId: patch.sessionId,
					failureCode: patch.failureCode,
				});
			},
		},
	},
};

export function queueDeps(db: HyperIdleDb): DurableAgentQueueDeps {
	return { db, ...ports };
}
