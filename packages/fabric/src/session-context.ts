import { bets, type HyperIdleDb, products, tasks, users } from "@hyperidle/db";
import type { UserRole } from "@hyperidle/shared";
import { encode } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

export interface SessionContextConfig {
	sessionId: string;
	taskId: string;
	agentId: string;
	agentRole: UserRole;
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
		pitch: string;
		appetite: string;
		doneCondition: string | null;
	};
	agent: {
		id: string;
		name: string;
		role: string;
	};
	product: {
		id: string;
		name: string;
	};
}

/** Build session.toon content from DB state. */
export async function buildSessionContext(
	db: HyperIdleDb,
	config: SessionContextConfig,
): Promise<string> {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, config.taskId)).limit(1);
	if (!task) {
		throw new Error(`Task ${config.taskId} not found`);
	}

	const [bet] = await db.select().from(bets).where(eq(bets.id, task.betId)).limit(1);
	if (!bet) {
		throw new Error(`Bet ${task.betId} not found`);
	}

	const [agent] = await db.select().from(users).where(eq(users.id, config.agentId)).limit(1);
	if (!agent) {
		throw new Error(`Agent ${config.agentId} not found`);
	}

	const [product] = await db
		.select()
		.from(products)
		.where(eq(products.id, config.productId))
		.limit(1);
	if (!product) {
		throw new Error(`Product ${config.productId} not found`);
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
			pitch: bet.pitch,
			appetite: bet.appetite,
			doneCondition: bet.doneCondition,
		},
		agent: {
			id: agent.id,
			name: agent.name,
			role: agent.role,
		},
		product: {
			id: product.id,
			name: product.name,
		},
	};

	return encode(data as unknown as Record<string, unknown>);
}
