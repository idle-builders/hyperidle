/**
 * @lore AU31 B2 (§5, §12 lifecycle-drain cluster): relocated from
 * `layers/core-api/src/services/durable-agent-queue.ts` — `@hyperidle/session-
 * requests` is this Layer's own Service now that `agent-orchestration` owns
 * its own boot, so this composition root's `@hyperidle/session-requests`
 * import is in-layer, not a crossing. `bootAgentOrchestration` is the sole
 * production caller (the lifecycle-projection drain, `boot.ts`); every other
 * call site named below is `core-api`-side test-support wiring that rebuilds
 * the same deps shape from `@hyperidle/session-requests`'s own public
 * `transitionSessionRequest` (`core-api/src/__testing__/
 * durable-agent-queue-test-deps.ts`), not a leftover production caller.
 *
 * @lore AU19 Increment 3b: `@hyperidle/session-requests`'s
 * Composition root for the durable agent queue.
 * Durable queue transitions need the `work` port (Mechanism C —
 * `session-requests` never imports another Service). `@hyperidle/session-
 * requests` is the current owner of lifecycle projection. This module builds
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
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): `conversation`/
 * `review`/`knowledge` groups and `routine`, plus `users.getUserById`/
 * `listUsersByTeam` and `work.getTaskById`/`getBetById`, REMOVED — confirmed
 * dead (zero real call sites in `@hyperidle/session-requests`'s own
 * `service.ts`; grepped before removal, same verification bar as the AU21 §6
 * Decision F1 `agentSelection` removal above). Each family's real domain read
 * was already deleted by an earlier increment's resolve-at-emit migration
 * (architecture.md §9 Increment 3) — this was leftover, unreachable
 * composition wiring nobody cleaned up alongside it, caught by the
 * anti-regrowth guard's forensic pass.
 *
 * **Second pass (same wave):** `config`/`teams`/`users` REMOVED in their
 * entirety, and `getTeamMembers`/`listConfiguration`/`findUser` imports with
 * them — their one consumer, `createTriggeredInternal` (the `"triggered"`
 * `CreateSessionRequestInput` kind's drain-time trigger-rule + target-agent
 * resolution), is deleted from `@hyperidle/session-requests` itself: git
 * archaeology (`7b64e8d1^`'s `dispatch/service.ts`, AU20's `d6dcfa2c`) plus a
 * full production call-site grep confirmed ZERO real callers ever existed,
 * in AU21 or before — the only caller anywhere was
 * `trigger-resolution.integration.test.ts` (deleted alongside this), and
 * test-only-reachable code is dead code.
 *
 * @lore AU21 §9 Increment 10 (Decision H1): the `work` field
 * (`reapTerminalTaskDispatchAttempts`) and `lifecycleProjection.work`'s
 * `updateTaskDispatchAttemptIfActive` — flagged by the THIRD forensic-triage
 * pass below as a genuinely open, unmigrated gap, NOT a bounded permanent
 * exception — are now CLOSED: `task`'s post-session writeback moved to
 * core-api's `work-session-end-reactions.ts` (an `agent_run_lifecycle_changed`
 * event subscriber, the same migration `routine` went through in Increment 4),
 * and `reapTerminalTaskDispatchAttempts` relocated to
 * `server-factory.ts`'s generic retention reaper. This composition root no
 * longer wires either — `@hyperidle/session-requests` now holds ZERO `→ work`
 * edge of any kind.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, THIRD pass): this surface
 * was NOT a bounded permanent exception — a prior pass mislabeled it that way
 * in the anti-regrowth guard's `ALLOWLIST`, rejected on review as a builder-
 * ruled carve-out with no founder sign-off. It was tracked as a genuinely
 * open, unmigrated gap in `DEFERRED_FOLLOWUP` (`session-requests::work`) —
 * closed by Increment 10 above.
 */

import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { type DurableAgentQueueDeps, transitionSessionRequest } from "@hyperidle/session-requests";

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
	lifecycleProjection: {
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
