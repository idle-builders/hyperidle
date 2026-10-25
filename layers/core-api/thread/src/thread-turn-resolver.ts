/**
 * The wake bake: given a triggering message and the agent to wake (the
 * caller — the wake rule already knows which agent
 * that is, so the target is an explicit `agentId` parameter, never derived
 * from the message itself), assembles the thread's full transcript, the
 * agent's runnable config, and the harness-disabled list into one
 * `BakedThreadTurnRequest` ready for the work-intent recorder.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { type BakedAgentRunnableConfig, bakeAgentRunnableConfig } from "@hyperidle/domain-model";
import { findMessage, listMessages } from "./thread-service.js";

export interface ThreadTurnResolverDeps {
	/** The agent with its one team — `null` only for a factory-wide agent. */
	requireRunnableAgent(
		db: HyperIdleDb,
		agentId: string,
	): Promise<User & { readonly teamId: string | null }>;
	getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null>;
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
	};
}
