/**
 * AU26 H1 (§D-M.1) — the run-end write a task handoff performs.
 *
 * `layers/core-api/policy/handoff-protocol.ts` used to write this row itself,
 * inside its own transaction, complete with a comment explaining why
 * `session_ended` must not be emitted. The terminal state is core's need — a
 * handoff must leave no live run — but the WRITE is `run-orchestration`'s state
 * transition, so it lives here and core calls down for it.
 *
 * @lore AU26 H1: this is deliberately a SEPARATE export, not a call into
 * `endSession` (`transition-run.ts`), and the three differences are all
 * load-bearing:
 *
 *  1. **No CAS on `state = "active"`.** `endSession` guards on `active`; a
 *     handoff of a run that is not active would silently no-op and commit with
 *     a live run.
 *  2. **No `session_ended`.** `endSession`'s caller emits it. A handoff that
 *     emitted it would create a spurious review item on EVERY handoff via
 *     `review/session-review-creator.ts`. This function takes no `EventBus`, so
 *     the suppression is structural rather than a rule someone must remember.
 *  3. **No outcome.** A handoff records no session-end disposition — the upward
 *     propagation engine only acts on `completed`, and writing one here would
 *     re-enter it.
 *
 * @lore AU26 H1: there is NO safety net behind this write. `runtime-reapers.ts`
 * carries no stale-session sweep of any kind, so a handed-off run left
 * `active` stays `active` forever. It must therefore be called with the
 * caller's `tx` handle, so the run is terminal at the same commit as the task
 * claim.
 */

import { sessions, type WriteExecutor } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export async function endRunForHandoff(
	exec: WriteExecutor,
	sessionId: string,
	endedAt: string,
): Promise<void> {
	await exec.update(sessions).set({ state: "done", endedAt }).where(eq(sessions.id, sessionId));
}
