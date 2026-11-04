import type { HyperIdleDb } from "@hyperidle/db";
import { findUser, type UserWithTeams } from "./user-store.js";

// @lore: AgentNotRunnableError.name — explicitly set; cross-package callers identify by error.name without a class import (DOM AbortError idiom)
export class AgentNotRunnableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentNotRunnableError";
	}
}

const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(["active", "idle"]);

/** A runnable agent with its one team — `null` only for a factory-wide agent. */
export type RunnableAgent = UserWithTeams & { readonly teamId: string | null };

export async function requireRunnableAgent(
	db: HyperIdleDb,
	agentId: string,
): Promise<RunnableAgent> {
	const agent = await findUser(db, { id: agentId });
	// The system actor is HyperIdle's voice, never an agent that can be started.
	if (agent?.kind !== "ai" || agent.role === "system" || !RUNNABLE_STATUSES.has(agent.status)) {
		throw new AgentNotRunnableError(`Agent ${agentId} is not a runnable AI agent`);
	}
	return { ...agent, teamId: agent.teamIds[0] ?? null };
}
