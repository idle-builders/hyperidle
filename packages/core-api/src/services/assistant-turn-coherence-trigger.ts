/**
 * AU21 §9 Increment 11 (Decision H2 "Coherence — reconciled via Decision B‴,
 * NOT via an agent pull") — the NEW B‴ supersede trigger this wave wires onto
 * the EXISTING `superseded`-status + drain-supersede machinery (Increment 3,
 * `agent-work-intent-supersede.integration.test.ts`, untouched here).
 *
 * When a thread reply lands (`thread_message_appended`, ANY message type —
 * @lore correction, see below) while another `assistant_turn` intent for that
 * SAME thread is still `pending`/`claimed` (a second message queued behind
 * the in-flight turn), that pending intent was baked with a transcript that
 * does not yet include the just-posted reply — stale. This re-bakes +
 * re-emits it (a fresh row for the SAME `(kind, sourceId)` identity, a bumped
 * `idempotencyKey`) via the EXACT SAME emit-time resolver
 * (`resolveAssistantTurnRequest`, `@hyperidle/conversation`) the real
 * `POST /threads/:id/messages` route already calls at emit time — reused, not
 * duplicated. The drain's existing "newer pending sibling wins" check
 * (`findNewerPendingSiblingInternal`) then marks the stale version
 * `superseded` and hands off the fresh one — zero orchestration read,
 * coherent.
 *
 * @lore this composition-root file (like `durable-agent-queue.ts`,
 * `routine-run-session-end-reactions.ts`, `work-session-end-reactions.ts`)
 * imports `@hyperidle/session-requests` and `@hyperidle/conversation` and
 * `@hyperidle/users` directly — legal: it is core-api Layer code, not a
 * nested Service (Mechanism C's "a Service depends on at most db+shared"
 * restriction applies to `@hyperidle/conversation`/`@hyperidle/session-requests`
 * themselves, not to this Layer's own composition roots).
 *
 * @lore no `threadId` column exists on `agent_work_intents` (Decision B‴'s
 * identity is `(kind, sourceId)` only). Since `sourceId` for `assistant_turn`
 * IS the triggering message id, this resolves "which pending intents belong
 * to this thread" by loading each pending `assistant_turn` intent's message
 * via `@hyperidle/conversation`'s `findMessage` and comparing `threadId` —
 * the CONFUSION the RED-phase report flagged, resolved as option (b).
 *
 * @lore the trigger reacts to EVERY `thread_message_appended` on the thread
 * (not just assistant-authored ones), guarded only by "is there a pending
 * sibling for THIS thread" — re-baking is a no-op-safe, idempotent action (a
 * fresh baked row that will itself immediately supersede if yet another
 * reply lands before the drain runs), and restricting the react-guard to
 * `ast-`-prefixed senders would miss the equally-stale case of a SECOND human
 * message landing in the same thread before the drain claims the first
 * pending intent. Every real call site of `insertMessage` already emits this
 * event exactly once per persisted message (`routes/threads.ts`), so this
 * reaction cannot run more than once per message either.
 */

import { findMessage, resolveAssistantTurnRequest } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import { enqueueWorkIntent, listPendingIntentsByKind } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import { createLogger, type EventBus, type ThreadMessageAppendedEvent } from "@hyperidle/shared";
import { requireRunnableAgent } from "@hyperidle/users";

const logger = createLogger({ pkg: "core-api.assistant-turn-coherence-trigger" });
const registeredBuses = new WeakSet<EventBus>();

async function rebakePendingSiblingsForThread(
	db: HyperIdleDb,
	event: ThreadMessageAppendedEvent,
): Promise<void> {
	const pending = await listPendingIntentsByKind(db, "assistant_turn");
	for (const intent of pending) {
		// The intent that this very message just created (recorded atomically
		// with the insert, `routes/threads.ts`'s `recordsAssistantIntent`
		// branch) is itself freshly baked — never a stale sibling of itself.
		if (intent.sourceId === event.messageId) continue;

		const message = await findMessage(db, { id: intent.sourceId });
		if (!message || message.threadId !== event.threadId) continue;

		const bakedRequest = await resolveAssistantTurnRequest(db, intent.sourceId, {
			requireRunnableAgent,
			// AU21 §9 Increment 12 (Decision H3): forward the same optional
			// contextBundle deps the real `POST /threads/:id/messages` route
			// bakes (threads.ts:1372-1375) so a re-baked stale sibling still
			// carries harnessDisabled + the agent's injected filesystems —
			// consistent with the "granted" reengagement path's forwarding.
			readServerConfig,
			resolveInjectedFilesystemsForAgent,
		});
		await enqueueWorkIntent(db, {
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: intent.sourceId,
			requestedBy: intent.requestedBy ?? undefined,
			idempotencyKey: `assistant:${intent.sourceId}:rebake-${crypto.randomUUID()}`,
			bakedRequest,
		});
	}
}

/**
 * Register the B‴ coherence re-bake trigger on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect (same per-eventBus
 * idempotency guard shape as the other core-api reaction modules).
 */
export function registerAssistantTurnCoherenceTrigger(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("thread_message_appended", (event) => {
		if (event.messageType !== "plain") return;
		void rebakePendingSiblingsForThread(db, event).catch((error: unknown) => {
			logger.error("assistant_turn B‴ coherence re-bake reaction failed", {
				threadId: event.threadId,
				messageId: event.messageId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}
