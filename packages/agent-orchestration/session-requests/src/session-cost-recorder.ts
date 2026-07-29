/**
 * AU21 §9 Increment 6 (Decision D) — agent-orchestration's OWN write path
 * that closes the real per-session-cost gap `architecture.md` §6 Decision D
 * traces (there is no cost "mirror" to delete — the cap gate and the
 * `bets`/`routines` display aggregates stay untouched; per-session cost has
 * never been persisted ANYWHERE). `run-orchestration/provisioner.ts` already
 * computes `totalCostCents` live at session end and forwards it as
 * `costInCents` on `session_ended` (Increment 4 Wave C's wiring, widened by
 * this Increment's `transition-run.ts` change to fire for EVERY session, not
 * only routine-sourced ones — see the companion RED file's CONFUSION note).
 *
 * §10's contracts section: "No new SQL tables assumed; any persisted field is
 * an additive column on an orchestration-owned table." `agentSessionRequests`
 * (this Service's own table — `session-requests` per
 * `scripts/table-ownership-guard.ts`'s `TABLE_OWNER`) already represents one
 * request-to-session lifecycle record (`sessionId`/`taskId`/`teamId`/
 * `agentId`) — the natural home for the additive `costCents` column, matched
 * the same way `findRequestSessionInternal` (`service.ts`) already correlates
 * a `session_ended` event back to its owning row: by `sessionId`.
 *
 * This is orchestration's OWN state write — no cross-layer edge, no core-api
 * involvement. `@lore this module mirrors
 * `core-api/src/services/routine-run-session-end-reactions.ts`'s
 * per-eventBus-instance idempotency guard (`registeredBuses`) so booting the
 * production app AND a test requesting the same `eventBus` instance never
 * double-registers, and its write-once ("only if not already set") guard —
 * a session ends exactly once per the AF7 CAS invariant, but the reaction is
 * defensive against event redelivery.
 */

import { agentSessionRequests, type HyperIdleDb } from "@hyperidle/db";
import { createLogger, type EventBus, type SessionEndedEvent } from "@hyperidle/shared";
import { and, eq, isNull } from "drizzle-orm";

const logger = createLogger({ pkg: "session-requests.session-cost-recorder" });
const registeredBuses = new WeakSet<EventBus>();

/**
 * Record `costInCents` onto the `agentSessionRequests` row matching
 * `sessionId`, ONLY if the row's `costCents` is not already set. No matching
 * row (unknown `sessionId`) or a missing `costInCents` on the event is a
 * safe no-op.
 */
async function recordSessionCost(db: HyperIdleDb, event: SessionEndedEvent): Promise<void> {
	if (event.costInCents === undefined) return;
	await db
		.update(agentSessionRequests)
		.set({ costCents: event.costInCents })
		.where(
			and(
				eq(agentSessionRequests.sessionId, event.sessionId),
				isNull(agentSessionRequests.costCents),
			),
		);
}

/**
 * Register agent-orchestration's own `session_ended` → per-session-cost
 * write reaction on `eventBus`. Returns an unsubscribe function. Safe to
 * call more than once with the SAME `eventBus` instance — only the first
 * registration takes effect.
 */
export function registerSessionCostRecorder(db: HyperIdleDb, eventBus: EventBus): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_ended", (event) => {
		void recordSessionCost(db, event).catch((error: unknown) => {
			logger.error("session_ended per-session-cost recording failed", {
				sessionId: event.sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}
