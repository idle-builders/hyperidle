import * as crypto from "node:crypto";
import { type HyperIdleDb, agents, items, sessions, teams } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq, inArray, sql } from "drizzle-orm";

export interface CostCapResult {
	allowed: boolean;
	level?: "agent" | "team" | "factory";
	currentSpend?: number;
	cap?: number;
}

export interface CheckCostCapParams {
	agentId: string;
	teamId?: string;
	factoryCap?: number;
	factorySpend?: number;
}

export interface RecordCostAndCheckParams {
	sessionId: string;
	cost: number;
	agentId: string;
	teamId?: string;
	factoryCap?: number;
	factorySpend?: number;
	reviewThreadId?: string;
}

export interface ResetCostsParams {
	level: "agent" | "team" | "factory";
	id?: string;
}

/** Tracks emitted events by sessionId + eventType + capLevel + entityId to prevent duplicates */
const emittedEvents = new Set<string>();

function dedupeKey(
	sessionId: string,
	eventType: string,
	capLevel: string,
	entityId: string,
): string {
	return `${sessionId}:${eventType}:${capLevel}:${entityId}`;
}

function getAgentSpend(db: HyperIdleDb, agentId: string): number {
	const result = db
		.select({ total: sql<number>`coalesce(sum(${sessions.cost}), 0)` })
		.from(sessions)
		.where(eq(sessions.agentId, agentId))
		.get();
	return result?.total ?? 0;
}

function getTeamSpend(db: HyperIdleDb, teamId: string): number {
	// Sum all session costs for agents in this team
	const teamAgents = db
		.select({ id: agents.id })
		.from(agents)
		.where(eq(agents.teamId, teamId))
		.all();

	if (teamAgents.length === 0) return 0;

	const agentIds = teamAgents.map((a) => a.id);
	const result = db
		.select({ total: sql<number>`coalesce(sum(${sessions.cost}), 0)` })
		.from(sessions)
		.where(inArray(sessions.agentId, agentIds))
		.get();
	return result?.total ?? 0;
}

/**
 * Check if a new session is allowed given cost caps.
 * Checks agent -> team -> factory hierarchy, returning the first breach.
 */
export async function checkCostCap(
	db: HyperIdleDb,
	_eventBus: EventBus,
	params: CheckCostCapParams,
): Promise<CostCapResult> {
	// 1. Check agent cap
	const agent = db.select().from(agents).where(eq(agents.id, params.agentId)).get();
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	if (agent.costCap != null) {
		const agentSpend = getAgentSpend(db, params.agentId);
		if (agentSpend >= agent.costCap) {
			return {
				allowed: false,
				level: "agent",
				currentSpend: agentSpend,
				cap: agent.costCap,
			};
		}
	}

	// 2. Check team cap
	if (params.teamId) {
		const team = db.select().from(teams).where(eq(teams.id, params.teamId)).get();
		if (team?.costCap != null) {
			const teamSpend = getTeamSpend(db, params.teamId);
			if (teamSpend >= team.costCap) {
				return {
					allowed: false,
					level: "team",
					currentSpend: teamSpend,
					cap: team.costCap,
				};
			}
		}
	}

	// 3. Check factory cap
	if (params.factoryCap != null && params.factorySpend != null) {
		if (params.factorySpend >= params.factoryCap) {
			return {
				allowed: false,
				level: "factory",
				currentSpend: params.factorySpend,
				cap: params.factoryCap,
			};
		}
	}

	return { allowed: true };
}

/**
 * Record cost for a session and check for warnings/breaches.
 * Updates the session cost, then checks thresholds and emits events.
 */
export async function recordCostAndCheck(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: RecordCostAndCheckParams,
): Promise<void> {
	// Update session cost
	db.update(sessions).set({ cost: params.cost }).where(eq(sessions.id, params.sessionId)).run();

	const agent = db.select().from(agents).where(eq(agents.id, params.agentId)).get();
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	const now = Date.now();

	// Check agent cap
	if (agent.costCap != null) {
		const agentSpend = getAgentSpend(db, params.agentId);
		checkAndEmit(db, eventBus, {
			sessionId: params.sessionId,
			capLevel: "agent",
			entityId: params.agentId,
			spend: agentSpend,
			cap: agent.costCap,
			timestamp: now,
			reviewThreadId: params.reviewThreadId,
		});
	}

	// Check team cap
	if (params.teamId) {
		const team = db.select().from(teams).where(eq(teams.id, params.teamId)).get();
		if (team?.costCap != null) {
			const teamSpend = getTeamSpend(db, params.teamId);
			checkAndEmit(db, eventBus, {
				sessionId: params.sessionId,
				capLevel: "team",
				entityId: params.teamId,
				spend: teamSpend,
				cap: team.costCap,
				timestamp: now,
				reviewThreadId: params.reviewThreadId,
			});
		}
	}

	// Check factory cap
	if (params.factoryCap != null) {
		const factorySpend = (params.factorySpend ?? 0) + params.cost;
		checkAndEmit(db, eventBus, {
			sessionId: params.sessionId,
			capLevel: "factory",
			entityId: "factory",
			spend: factorySpend,
			cap: params.factoryCap,
			timestamp: now,
			reviewThreadId: params.reviewThreadId,
		});
	}
}

interface CheckAndEmitParams {
	sessionId: string;
	capLevel: "agent" | "team" | "factory";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
	reviewThreadId?: string;
}

function checkAndEmit(db: HyperIdleDb, eventBus: EventBus, params: CheckAndEmitParams): void {
	const ratio = params.spend / params.cap;

	// Breach at 100%
	if (ratio >= 1) {
		const key = dedupeKey(params.sessionId, "cost_cap_breached", params.capLevel, params.entityId);
		if (!emittedEvents.has(key)) {
			emittedEvents.add(key);
			eventBus.emit({
				type: "cost_cap_breached",
				streamId: params.sessionId,
				level: "hard",
				capLevel: params.capLevel,
				entityId: params.entityId,
				spend: params.spend,
				cap: params.cap,
				timestamp: params.timestamp,
			});

			// Create review item on breach (AC8)
			if (params.reviewThreadId) {
				createReviewItem(db, eventBus, params);
			}
		}
	}

	// Warning at 80%
	if (ratio >= 0.8) {
		const key = dedupeKey(params.sessionId, "cost_cap_warning", params.capLevel, params.entityId);
		if (!emittedEvents.has(key)) {
			emittedEvents.add(key);
			eventBus.emit({
				type: "cost_cap_warning",
				streamId: params.sessionId,
				level: ratio >= 1 ? "critical" : "warning",
				capLevel: params.capLevel,
				entityId: params.entityId,
				spend: params.spend,
				cap: params.cap,
				timestamp: params.timestamp,
			});
		}
	}
}

function createReviewItem(db: HyperIdleDb, _eventBus: EventBus, params: CheckAndEmitParams): void {
	if (!params.reviewThreadId) return;

	const itemId = crypto.randomUUID();
	const now = new Date().toISOString();

	db.insert(items)
		.values({
			id: itemId,
			sourceAgentId: params.entityId !== "factory" ? params.entityId : null,
			kind: "cost_cap_breach",
			title: `Cost cap breached: ${params.capLevel} ${params.entityId} (${params.spend}/${params.cap})`,
			body: `The ${params.capLevel}-level cost cap has been breached. Entity: ${params.entityId}, Spend: ${params.spend} cents, Cap: ${params.cap} cents.`,
			threadId: params.reviewThreadId,
			riskTier: "high",
			blocking: 1,
			createdAt: now,
		})
		.run();
}

/**
 * Reset costs for a new billing cycle.
 * For agent/team: zeroes session costs for that entity's sessions.
 * For factory: zeroes all session costs.
 */
export async function resetCosts(db: HyperIdleDb, params: ResetCostsParams): Promise<void> {
	// Clear the deduplication set on reset
	emittedEvents.clear();

	switch (params.level) {
		case "agent": {
			if (!params.id) throw new Error("Agent ID required for agent reset");
			db.update(sessions).set({ cost: 0 }).where(eq(sessions.agentId, params.id)).run();
			db.update(agents).set({ costActual: 0 }).where(eq(agents.id, params.id)).run();
			break;
		}
		case "team": {
			if (!params.id) throw new Error("Team ID required for team reset");
			// Reset all sessions for agents in this team
			const teamAgents = db
				.select({ id: agents.id })
				.from(agents)
				.where(eq(agents.teamId, params.id))
				.all();
			if (teamAgents.length > 0) {
				const agentIds = teamAgents.map((a) => a.id);
				db.update(sessions).set({ cost: 0 }).where(inArray(sessions.agentId, agentIds)).run();
			}
			db.update(teams).set({ costActual: 0 }).where(eq(teams.id, params.id)).run();
			break;
		}
		case "factory": {
			// eslint-disable-next-line drizzle/enforce-update-with-where -- intentional: factory reset clears ALL rows
			db.update(sessions).set({ cost: 0 }).run();
			// eslint-disable-next-line drizzle/enforce-update-with-where -- intentional: factory reset clears ALL rows
			db.update(agents).set({ costActual: 0 }).run();
			// eslint-disable-next-line drizzle/enforce-update-with-where -- intentional: factory reset clears ALL rows
			db.update(teams).set({ costActual: 0 }).run();
			break;
		}
	}
}

/**
 * Clear the in-memory deduplication set.
 * Exposed for testing purposes only.
 */
export function clearDeduplicationCache(): void {
	emittedEvents.clear();
}
