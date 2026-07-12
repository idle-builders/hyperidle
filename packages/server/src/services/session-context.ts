/**
 * @lore U1: `products` table renamed to `teams`. `bet.pitch` renamed to `bet.description`.
 * Interface field `productId` kept for backward compat (value is now a teams.id).
 * `SessionContextData.bet.pitch` renamed to `description`.
 * `SessionContextData.product` renamed to `team`.
 */
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import type { UserRole } from "@hyperidle/shared";
import { encodeTyped } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import * as routineService from "../routine-service.js";
import * as work from "../work-service.js";

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

/**
 * Query the DB and assemble structured SessionContextData without encoding.
 * X1: extracted from buildSessionContext so context assembly can use the
 * typed data directly without a second DB query or TOON decoding.
 */
export async function buildSessionContextData(
	db: HyperIdleDb,
	config: SessionContextConfig,
): Promise<SessionContextData> {
	const task = await work.getTaskById(db, config.taskId);
	if (!task) {
		throw new Error(`Task ${config.taskId} not found`);
	}

	const bet = await work.getBetById(db, task.betId);
	if (!bet) {
		throw new Error(`Bet ${task.betId} not found`);
	}

	const [agent] = await db.select().from(users).where(eq(users.id, config.agentId)).limit(1);
	if (!agent) {
		throw new Error(`Agent ${config.agentId} not found`);
	}

	// @lore U1: productId now holds a teams.id value (the domain entity id).
	const [team] = await db.select().from(teams).where(eq(teams.id, config.productId)).limit(1);
	if (!team) {
		throw new Error(`Team ${config.productId} not found`);
	}

	return {
		task: {
			id: task.id,
			title: task.title,
			description: task.description,
			state: task.state,
		},
		bet: {
			id: bet.id,
			// @lore U1: `description` replaces `pitch`.
			// @lore AF3 C12: bet.description is string | null in the DB; coerce to
			// empty string for the context interface (which requires non-null string).
			// @lore AF3 W2: the previous string | null assignment would flow `null`
			// through to string interpolation, rendering the literal text "null" into
			// the composed prompt (e.g. "**Bet:** null"). `?? ""` intentionally corrects
			// that to an empty string — a safe content fix, not merely a strictness fix.
			description: bet.description ?? "",
			// @lore AF3: appetite is nullable in DB but non-null in SessionContextData;
			// coerce null to empty string to satisfy the interface.
			appetite: bet.appetite ?? "",
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
}

// ─────────────────────────────────────────────────────────────────────────────
// AA2: Routine session context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Config for building a routine session context (AA2).
 * Unlike task sessions, routines do not require a taskId for context assembly.
 */
export interface RoutineSessionContextConfig {
	sessionId: string;
	routineId: string;
	agentId: string;
	agentRole: UserRole;
	teamId: string;
}

/**
 * Context data for a routine session (AA2).
 * Contains routine + agent + team — no task or bet fields.
 *
 * @lore AA2/AU1: Routine sessions MUST NOT read task/bet context. They are
 * task-free sessions; buildRoutineSessionContextData reads directly from the
 * routines table.
 */
export interface RoutineSessionContextData {
	routine: {
		id: string;
		name: string;
		description: string | null;
		lastRunSummary: string | null;
	};
	agent: {
		id: string;
		name: string;
		role: string;
	};
	team: {
		id: string;
		name: string;
	};
}

/**
 * Query the DB and assemble RoutineSessionContextData for a routine session.
 * Does NOT read task or bet data — routine context is self-contained.
 */
export async function buildRoutineSessionContextData(
	db: HyperIdleDb,
	config: RoutineSessionContextConfig,
): Promise<RoutineSessionContextData> {
	const routine = await routineService.getRoutineById(db, config.routineId);
	if (!routine) {
		throw new Error(`Routine ${config.routineId} not found`);
	}

	const [agent] = await db.select().from(users).where(eq(users.id, config.agentId)).limit(1);
	if (!agent) {
		throw new Error(`Agent ${config.agentId} not found`);
	}

	const [team] = await db.select().from(teams).where(eq(teams.id, config.teamId)).limit(1);
	if (!team) {
		throw new Error(`Team ${config.teamId} not found`);
	}

	return {
		routine: {
			id: routine.id,
			name: routine.name,
			description: routine.description ?? null,
			lastRunSummary: routine.lastRunSummary ?? null,
		},
		agent: {
			id: agent.id,
			name: agent.name,
			role: agent.role,
		},
		team: {
			id: team.id,
			name: team.name,
		},
	};
}

/** Build session.toon content from DB state. */
export async function buildSessionContext(
	db: HyperIdleDb,
	config: SessionContextConfig,
): Promise<string> {
	const data = await buildSessionContextData(db, config);
	return encodeTyped(data);
}
