/**
 * @lore U1: `products` table renamed to `teams`. `bet.pitch` renamed to `bet.description`.
 * Interface field `productId` kept for backward compat (value is now a teams.id).
 * `SessionContextData.bet.pitch` renamed to `description`.
 * `SessionContextData.product` renamed to `team`.
 */
import { bets, type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import type { UserRole } from "@hyperidle/shared";
import { encode } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

export interface SessionContextConfig {
	sessionId: string;
	taskId: string;
	agentId: string;
	agentRole: UserRole;
	/** @lore U1: formerly referenced products.id; now references teams.id. */
	productId: string;
}

export interface SessionContextData {
	task: {
		id: string;
		title: string;
		description: string | null;
		state: string;
	};
	bet: {
		id: string;
		/** @lore U1: formerly `pitch`, now `description`. */
		description: string;
		appetite: string;
		doneCondition: string | null;
	};
	agent: {
		id: string;
		name: string;
		role: string;
	};
	/** @lore U1: formerly `product`, now `team` (domain entity). */
	team: {
		id: string;
		name: string;
	};
}

/** Build session.toon content from DB state. */
export function buildSessionContext(db: HyperIdleDb, config: SessionContextConfig): string {
	const task = db.select().from(tasks).where(eq(tasks.id, config.taskId)).get();
	if (!task) {
		throw new Error(`Task ${config.taskId} not found`);
	}

	const bet = db.select().from(bets).where(eq(bets.id, task.betId)).get();
	if (!bet) {
		throw new Error(`Bet ${task.betId} not found`);
	}

	const agent = db.select().from(users).where(eq(users.id, config.agentId)).get();
	if (!agent) {
		throw new Error(`Agent ${config.agentId} not found`);
	}

	// @lore U1: productId now holds a teams.id value (the domain entity id).
	const team = db.select().from(teams).where(eq(teams.id, config.productId)).get();
	if (!team) {
		throw new Error(`Team ${config.productId} not found`);
	}

	const data: SessionContextData = {
		task: {
			id: task.id,
			title: task.title,
			description: task.description,
			state: task.state,
		},
		bet: {
			id: bet.id,
			// @lore U1: `description` replaces `pitch`.
			description: bet.description,
			appetite: bet.appetite,
			doneCondition: bet.doneCondition,
		},
		agent: {
			id: agent.id,
			name: agent.name,
			role: agent.role,
		},
		// @lore U1: `team` replaces `product` in the session context data.
		team: {
			id: team.id,
			name: team.name,
		},
	};

	return encode(data as unknown as Record<string, unknown>);
}
