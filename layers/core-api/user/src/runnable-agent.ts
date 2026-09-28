import type { HyperIdleDb, User } from "@hyperidle/db";
import { findUser } from "./user-store.js";

// @lore: AgentNotRunnableError.name — explicitly set; cross-package callers identify by error.name without a class import (DOM AbortError idiom)
export class AgentNotRunnableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentNotRunnableError";
	}
}

const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(["active", "idle"]);

export async function requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User> {
	const agent = await findUser(db, { id: agentId });
	if (agent?.kind !== "ai" || !RUNNABLE_STATUSES.has(agent.status)) {
		throw new AgentNotRunnableError(`Agent ${agentId} is not a runnable AI agent`);
	}
	return agent;
}
