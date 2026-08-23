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
 * (`conversation`) may depend ONLY on `@hyperidle/db` + framework packages —
 * never on another Service (`@hyperidle/users`) directly, even for the one
 * genuinely cross-cutting invariant §6 Decision B carves out. This resolver
 * therefore takes `requireRunnableAgent` as an INJECTED dependency
 * (`AssistantTurnResolverDeps`), not a static import; the real emit site
 * (`routes/threads.ts`, core-api Layer code — not a nested Service, so it may
 * legitimately import both `@hyperidle/conversation` and `@hyperidle/users`)
 * wires the real `requireRunnableAgent` in at the call site — the same
 * ordinary-DI shape used elsewhere in this codebase for injected
 * cross-Service reads.
 *
 * @lore naming: no export name is pinned in the architecture doc for this
 * resolver; `resolveAssistantTurnRequest` matches the RED-phase test's
 * best-guess interpretation.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import type { BakedAgentRunnableConfig } from "@hyperidle/work-intent-port";
import { bakeAgentRunnableConfig } from "@hyperidle/work-intent-port";
import { findMessage, listMessages } from "./conversation-store.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface AssistantTurnResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * `@hyperidle/settings`'s `readServerConfig`, injected (Mechanism C —
	 * `@hyperidle/conversation` cannot import `@hyperidle/settings` directly)
	 * for the `harnessDisabled` bake.
	 */
	readServerConfig(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
}

/** One raw transcript row. */
export interface BakedTranscriptRow {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

/**
 * The baked `assistant_turn` request shape, matching `resolveIntentInputInternal`'s
 * current return, PLUS (AU21 §9 Increment 11, Decision H2) the thread's full
 * conversation transcript. Baking it here (core-api's own `conversation`
 * state, at emit time) lets `run-orchestration`'s generic drain build the
 * harness input from this payload with ZERO reads back into core.
 *
 * @lore AU26 G1 (architecture §D-L): the `modelId`/`modelProvider` fields this
 * shape carried from AU21 Increment 11 are GONE. AU21 baked them because the
 * per-agent override lived on `users` — core state `dispatch` was forbidden to
 * read. AU26 moved those columns into `agent_run_config`, which
 * agent-orchestration owns, so `dispatch` reads the override live through
 * `ports.agentRunConfig` instead. Nothing is dropped: the same founder-
 * configurable Settings → Agents value still applies to every assistant turn,
 * and it is now read at execution time rather than snapshotted at emit, so an
 * edit between emit and drain takes effect. Do not re-bake it.
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
	/**
	 * AU27 Increment 1 (Decision 1) — the assistant's calling thread, always
	 * present (an `assistant_turn` always has a triggering thread message).
	 * Baked from the SAME `message` this resolver already loaded — no extra
	 * read.
	 */
	readonly callingThreadId: string;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
	 * runnable-config snapshot, baked from the SAME already-`requireRunnableAgent`
	 * -validated `agent: User` row.
	 */
	readonly agentConfig: BakedAgentRunnableConfig;
	/** The server's disabled-harness-types list. */
	readonly harnessDisabled: readonly string[];
}

function resolveAssistantAgentIdForSender(senderId: string): string {
	return `ast-${senderId}`;
}

/**
 * Resolve + validate an `assistant_turn` run at emit time: load the message,
 * reject if unavailable (missing), resolve the target
 * `ast-<senderId>` assistant agent, and validate its runnability (never the
 * human sender) via the shared core-api invariant.
 */
export async function resolveAssistantTurnRequest(
	db: HyperIdleDb,
	messageId: string,
	deps: AssistantTurnResolverDeps,
): Promise<BakedAssistantTurnRequest> {
	const message = await findMessage(db, { id: messageId });
	if (!message) {
		throw new Error("Assistant source message is unavailable");
	}
	const targetAgentId = resolveAssistantAgentIdForSender(message.senderId);
	const agent = await deps.requireRunnableAgent(db, targetAgentId);
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
	const { harnessDisabled } = await deps.readServerConfig(db);
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
		callingThreadId: message.threadId,
		agentConfig: bakeAgentRunnableConfig(agent),
		harnessDisabled,
	};
}
