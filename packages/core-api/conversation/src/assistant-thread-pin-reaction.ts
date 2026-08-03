/**
 * AU21 §9 Increment 11 (Decision H2 / F4) — the "pin the assistant thread
 * after its first AI reply" decision, moved ENTIRELY core-side from
 * `dispatch`'s `registerAssistantTriggerInternal` (an `agent-orchestration ->
 * core-api` READ — `ports.conversation.getThreadById` + `ports.users.getUserById`
 * — now deleted, see `@hyperidle/dispatch`'s own `service.ts`).
 *
 * This module physically IS `@hyperidle/conversation`, the Service that owns
 * `threads` — so the write (`updateThread`) is an ordinary INTRA-package call,
 * no seam needed (the seam existed only because `dispatch` was a different
 * package/Layer). The one genuinely cross-cutting need — the sender's `kind`
 * (an `@hyperidle/users` row) — is INJECTED (`AssistantThreadPinReactionDeps`),
 * the same Mechanism C shape `assistant-turn-resolver.ts`'s
 * `AssistantTurnResolverDeps` already uses for `requireRunnableAgent`: this
 * package never statically imports another Service. The real emit site
 * (composition roots `test-fixtures.ts`/`server-factory.ts`, core-api Layer
 * code — not a nested Service) wires the real `@hyperidle/users` `findUser`
 * in at the call site.
 *
 * Behavior-preserving move: same guard `registerAssistantTriggerInternal` used
 * (`hostKind === "user"`, sender `kind === "ai"`, not already `pinned`) — only
 * the ownership/location changed.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { createLogger, type EventBus, type ThreadMessageAppendedEvent } from "@hyperidle/shared";
import { findThread, updateThread } from "./conversation-store.js";

const logger = createLogger({ pkg: "core-api.assistant-thread-pin-reaction" });
const registeredBuses = new WeakSet<EventBus>();

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface AssistantThreadPinReactionDeps {
	findUserById(db: HyperIdleDb, id: string): Promise<Pick<User, "kind"> | undefined>;
}

async function reactToThreadMessageAppended(
	db: HyperIdleDb,
	event: ThreadMessageAppendedEvent,
	deps: AssistantThreadPinReactionDeps,
): Promise<void> {
	if (event.messageType !== "plain") return;

	const sender = await deps.findUserById(db, event.senderId);
	if (sender?.kind !== "ai") return;

	const thread = await findThread(db, { id: event.threadId });
	if (!thread || thread.hostKind !== "user" || thread.pinned) return;

	await updateThread(db, event.threadId, { pinned: true });
}

/**
 * Register core-api's "pin the assistant thread after its first AI reply"
 * reaction on `eventBus`. Returns an unsubscribe function. Safe to call more
 * than once with the SAME `eventBus` instance — only the first registration
 * takes effect (same per-eventBus-instance idempotency guard shape as
 * `routine-run-session-end-reactions.ts`/`work-session-end-reactions.ts`).
 */
export function registerAssistantThreadPinReaction(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: AssistantThreadPinReactionDeps,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("thread_message_appended", (event) => {
		void reactToThreadMessageAppended(db, event, deps).catch((error: unknown) => {
			logger.error("assistant thread pin reaction failed", {
				threadId: event.threadId,
				senderId: event.senderId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}
