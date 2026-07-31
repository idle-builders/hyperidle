/**
 * AU21 §6 Decision B placement ruling — the `assistant_turn` emit-time
 * resolver, paired with its real emit site (`routes/threads.ts`). Does
 * exactly what `resolveIntentInputInternal`'s "assistant_turn" case does
 * today (`session-requests/src/service.ts`), reading only `conversation`'s
 * own tables, plus the shared ast-`<userId>` runnability invariant
 * (`@hyperidle/users`' `requireRunnableAgent`) — so the emitting route can
 * bake the full request at emit time instead of leaving it for the drain to
 * resolve later.
 *
 * @lore Mechanism C (composition-boundary-guard): a nested Service package
 * (`conversation`) may depend ONLY on `@hyperidle/db` + `@hyperidle/shared` —
 * never on another Service (`@hyperidle/users`) directly, even for the one
 * genuinely cross-cutting invariant §6 Decision B carves out. This resolver
 * therefore takes `requireRunnableAgent` as an INJECTED dependency
 * (`AssistantTurnResolverDeps`), not a static import; the real emit site
 * (`routes/threads.ts`, core-api Layer code — not a nested Service, so it may
 * legitimately import both `@hyperidle/conversation` and `@hyperidle/users`)
 * wires the real `requireRunnableAgent` in at the call site. Same
 * ordinary-DI shape `cost-cap.ts` (`CostDeps`) already uses for its own
 * cross-Service reads.
 *
 * @lore naming: no export name is pinned in the architecture doc for this
 * resolver; `resolveAssistantTurnRequest` matches the RED-phase test's
 * best-guess interpretation.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { findMessage, listMessages } from "./conversation-store.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface AssistantTurnResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
}

/** Thrown when the source message does not exist, is deleted, or is redacted. */
export class AssistantTurnSourceUnavailableError extends Error {}

/** One raw transcript row — matches `dispatch`'s `loadRawTranscript` return shape verbatim. */
export interface BakedTranscriptRow {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

/**
 * The baked `assistant_turn` request shape, matching `resolveIntentInputInternal`'s
 * current return, PLUS (AU21 §9 Increment 11, Decision H2) the thread's full
 * conversational transcript — the same content `dispatch`'s `loadRawTranscript`
 * used to read live at execution time. Baking it here (core-api's own
 * `conversation` state, at emit time) lets `dispatch` build the harness input
 * from this payload with ZERO reads back into core.
 */
export interface BakedAssistantTurnRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "assistant";
	readonly sourceId: string;
	readonly streamId: string;
	readonly userId: string;
	readonly sourceCorrelation: {
		readonly threadId: string;
		readonly messageId: string;
		readonly userId: string;
		readonly assistantAgentId: string;
	};
	/** Every message in the thread, `createdAt` ascending, including the triggering message. */
	readonly transcript: ReadonlyArray<BakedTranscriptRow>;
}

function resolveAssistantAgentIdForSender(senderId: string): string {
	return `ast-${senderId}`;
}

/**
 * Resolve + validate an `assistant_turn` run at emit time: load the message,
 * reject if unavailable (missing/deleted/redacted), resolve the target
 * `ast-<senderId>` assistant agent, and validate its runnability (never the
 * human sender) via the shared core-api invariant.
 */
export async function resolveAssistantTurnRequest(
	db: HyperIdleDb,
	messageId: string,
	deps: AssistantTurnResolverDeps,
): Promise<BakedAssistantTurnRequest> {
	const message = await findMessage(db, { id: messageId });
	if (!message || message.deletedAt || message.redactedAt) {
		throw new AssistantTurnSourceUnavailableError("Assistant source message is unavailable");
	}
	const targetAgentId = resolveAssistantAgentIdForSender(message.senderId);
	await deps.requireRunnableAgent(db, targetAgentId);
	const transcriptRows = await listMessages(db, {
		threadId: message.threadId,
		order: "createdAt",
		dir: "asc",
	});
	const transcript: BakedTranscriptRow[] = transcriptRows.map((row) => ({
		senderId: row.senderId,
		payload: row.payload,
		type: row.type,
	}));
	return {
		defaultAgentId: targetAgentId,
		sourceKind: "assistant",
		sourceId: message.id,
		streamId: `thread:${message.threadId}`,
		userId: message.senderId,
		sourceCorrelation: {
			threadId: message.threadId,
			messageId: message.id,
			userId: message.senderId,
			assistantAgentId: targetAgentId,
		},
		transcript,
	};
}
