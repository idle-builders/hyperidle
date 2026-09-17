/**
 * The wake bake — generalised from `@hyperidle/conversation`'s
 * `resolveAssistantTurnRequest` (architecture.md §5 B5). Everything about
 * the bake was already general (the transcript, `callingThreadId`,
 * `requireRunnableAgent`, `getAgentIdentity`, `readServerConfig`,
 * `bakeAgentRunnableConfig`); the one assistant-specific line —
 * `ast-${message.senderId}` as the target agent — is replaced by an
 * explicit `agentId` parameter, because the caller (the wake rule,
 * architecture.md §3.10) already knows which agent it is waking.
 *
 * `sourceCorrelation.assistantAgentId` is renamed to `agentId` — the only
 * shape change from the deleted `BakedAssistantTurnRequest`.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { bakeAgentRunnableConfig, type BakedAgentRunnableConfig } from "@hyperidle/domain-model";
import { findMessage, listMessages } from "./thread-service.js";

export interface ThreadTurnResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null>;
	readServerConfig(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
}

export interface BakedTranscriptRow {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

export interface BakedThreadTurnRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "assistant";
	readonly sourceId: string;
	readonly streamId: string;
	readonly userId: string;
	readonly sourceCorrelation: {
		readonly threadId: string;
		readonly messageId: string;
		readonly userId: string;
		readonly agentId: string;
	};
	/** Every message in the thread, `createdAt` ascending, including the triggering message. */
	readonly transcript: ReadonlyArray<BakedTranscriptRow>;
	readonly callingThreadId: string;
	readonly agentConfig: BakedAgentRunnableConfig;
	readonly harnessDisabled: readonly string[];
}

export async function resolveThreadTurnRequest(
	db: HyperIdleDb,
	messageId: string,
	agentId: string,
	deps: ThreadTurnResolverDeps,
): Promise<BakedThreadTurnRequest> {
	const message = await findMessage(db, { id: messageId });
	if (!message) {
		throw new Error("Thread turn source message is unavailable");
	}
	const agent = await deps.requireRunnableAgent(db, agentId);
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
	const agentPersona = await deps.getAgentIdentity(db, agent.id);
	return {
		defaultAgentId: agentId,
		sourceKind: "assistant",
		sourceId: message.id,
		streamId: `thread:${message.threadId}`,
		userId: message.senderId,
		sourceCorrelation: {
			threadId: message.threadId,
			messageId: message.id,
			userId: message.senderId,
			agentId,
		},
		transcript,
		callingThreadId: message.threadId,
		agentConfig: bakeAgentRunnableConfig(agent, agentPersona),
		harnessDisabled,
	};
}
