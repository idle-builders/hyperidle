import * as crypto from "node:crypto";
// @lore U1: `teams` is the domain entity (no costActual/costCap columns).
// Cost tracking uses `teamMembers` (the agent-membership group) which has costActual/costCap.
// params.teamId in cost-cap service refers to the teamMembers.id, not teams.id.
// @lore R5: `bets` and `tasks` added for bet cost accumulation via taskId lookup.
import { bets, type HyperIdleDb, teamMembers } from "@hyperidle/db";
import type { EventBus, SessionEndedEvent } from "@hyperidle/shared";
import { eq, sql } from "drizzle-orm";
import { work } from "@hyperidle/core-app";
import {
	getUserById,
	incrementUserCost,
	resetAllUserCost,
	sumAllUserCost,
	updateUser,
} from "@hyperidle/core-app";

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
	/**
	 * @deprecated Use costMinor + currency instead (L17). Kept for backward
	 * compatibility with existing callers. If costMinor is provided, cost is ignored.
	 */
	cost?: number;
	/** L17: cost in minor units (e.g. cents for USD). */
	costMinor?: number;
	/** L17: currency code for costMinor. */
	currency?: string;
	agentId: string;
	teamId?: string;
	/**
	 * R5: Optional task id. When provided, cost is also accumulated on the
	 * task's parent bet (via tasks.betId lookup). This keeps bet cost in sync
	 * with every cost_update event, including partial-session crashes.
	 */
	taskId?: string;
	factoryCap?: number;
	factorySpend?: number;
	reviewThreadId?: string;
}

export interface ResetCostsParams {
	level: "agent" | "team" | "factory";
	id?: string;
}

/**
 * Per-session dedup state. Each session has a small Set of dedup keys
 * (eventType:capLevel:entityId). The map entry is dropped when the session
 * ends via `releaseSessionDedup`, preventing the unbounded memory growth
 * the previous module-level Set produced.
 *
 * @lore I3 (TRACK-I.md L156-159): the previous implementation used a
 * module-level `Set<string>` keyed on `sessionId:…`, so dedup keys for
 * dead sessions stayed forever. The fix is per-session scoping with a
 * lifecycle hook called from session-lifecycle.ts AND an EventBus
 * subscription registered from `app.ts` (`registerCostCapDedupReleaser`)
 * so EVERY session-end path (graceful end, crash, PATCH /sessions/:id
 * to done/crashed) reclaims the entry.
 *
 * @lore I3 review C2 / arch H-2: this Map is module-level state. Any
 * test that imports `recordCostAndCheck` MUST call
 * `clearDeduplicationCache()` in `beforeEach` to avoid bleeding state
 * across tests in the same Vitest worker. Long-term this belongs on a
 * `CostCapService` instance constructed by `createApp` — see
 * I3-architecture-review.md H-2.
 */
interface SessionDedupEntry {
	readonly agentId?: string;
	readonly teamId?: string;
	readonly keys: Set<string>;
}

const dedupBySession = new Map<string, SessionDedupEntry>();

function dedupKeyPart(eventType: string, capLevel: string, entityId: string): string {
	return `${eventType}:${capLevel}:${entityId}`;
}

function tryRecordDedupKey(
	sessionId: string,
	eventType: string,
	capLevel: string,
	entityId: string,
	agentId?: string,
	teamId?: string,
): boolean {
	// Lazy registration: only create the per-session entry when we
	// actually have a key to record. Sessions that never breach a cap
	// produce zero entries (I3 review C2). Cleanup-on-reset still works
	// because a session with no keys has no entries to clear.
	let entry = dedupBySession.get(sessionId);
	const key = dedupKeyPart(eventType, capLevel, entityId);
	if (entry?.keys.has(key)) {
		return false;
	}
	if (!entry) {
		entry = { agentId, teamId, keys: new Set() };
		dedupBySession.set(sessionId, entry);
	}
	entry.keys.add(key);
	return true;
}

/**
 * Sum session costs for an agent.
 *
 * @lore O2: session cost columns (cost, costMinor, costCurrency) stripped from
 * the kernel sessions table as part of canonical/projection split. Cost is now
 * accumulated on users.costActual (integer minor units). This column is the
 * authoritative running total for an agent's spend within the current cycle.
 */
async function getAgentSpend(db: HyperIdleDb, agentId: string): Promise<number> {
	const row = await getUserById(db, agentId);
	return row?.costActual ?? 0;
}

/**
 * Sum session costs for all users in a team.
 *
 * @lore O2: reads teamMembers.costActual, which is the running minor-unit total
 * accumulated across all users in the team for the current billing cycle.
 * @lore U1: teamId here refers to teamMembers.id (the membership group), not teams.id (domain entity).
 */
async function getTeamSpend(db: HyperIdleDb, teamId: string): Promise<number> {
	const [row] = await db
		.select({ costActual: teamMembers.costActual })
		.from(teamMembers)
		.where(eq(teamMembers.id, teamId))
		.limit(1);
	return row?.costActual ?? 0;
}

/**
 * Check if a new session is allowed given cost caps.
 * Checks agent -> team -> factory hierarchy, returning the first breach.
 *
 * @lore L17: Currency mismatch is NOT enforced at this boundary. The factory
 * is single-currency in v1 — all users, teams, and sessions are assumed to
 * operate in the same currency (USD by default). The comparison is always
 * minor-unit integers regardless of currency. If a future multi-currency
 * factory is introduced, this function must validate that agent cap currency
 * matches session currency before comparing spend vs cap. Until then,
 * addMoney()'s currency-mismatch guard is not invoked here because we operate
 * directly on integer minor units for efficiency.
 */
export async function checkCostCap(
	db: HyperIdleDb,
	_eventBus: EventBus,
	params: CheckCostCapParams,
): Promise<CostCapResult> {
	// 1. Check agent cap
	const agent = await getUserById(db, params.agentId);
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	// L17: prefer costCapMinor (new column) over costCap (legacy)
	const agentCap = agent.costCapMinor ?? agent.costCap;
	if (agentCap != null) {
		const agentSpend = await getAgentSpend(db, params.agentId);
		if (agentSpend >= agentCap) {
			return {
				allowed: false,
				level: "agent",
				currentSpend: agentSpend,
				cap: agentCap,
			};
		}
	}

	// 2. Check team cap
	// @lore U1: params.teamId is a teamMembers.id (membership group), not teams.id (domain entity).
	if (params.teamId) {
		const [team] = await db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.id, params.teamId))
			.limit(1);
		// L17: prefer costCapMinor (new column) over costCap (legacy)
		const teamCap = team?.costCapMinor ?? team?.costCap;
		if (teamCap != null) {
			const teamSpend = await getTeamSpend(db, params.teamId);
			if (teamSpend >= teamCap) {
				return {
					allowed: false,
					level: "team",
					currentSpend: teamSpend,
					cap: teamCap,
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
	// @lore O2: session cost columns stripped from the kernel sessions table.
	// Cost is accumulated on users.costActual and teams.costActual (minor units).
	// recordCostAndCheck increments these counters atomically so checkCostCap
	// can read the authoritative running total without scanning sessions.
	const effectiveCostMinor = params.costMinor ?? params.cost ?? 0;

	if (effectiveCostMinor > 0) {
		// Accumulate on agent
		await incrementUserCost(db, params.agentId, effectiveCostMinor);

		// Accumulate on team if provided
		// @lore U1: params.teamId is a teamMembers.id (membership group), not teams.id (domain entity).
		if (params.teamId) {
			await db
				.update(teamMembers)
				.set({ costActual: sql`coalesce(${teamMembers.costActual}, 0) + ${effectiveCostMinor}` })
				.where(eq(teamMembers.id, params.teamId));
		}

		// R5: Accumulate on bet (via task.betId lookup) if taskId is provided.
		// Uses the same atomic SQL pattern as agent/team accumulation to prevent
		// lost updates under concurrent sessions on the same bet.
		if (params.taskId) {
			const task = await work.getTaskById(db, params.taskId);
			if (task?.betId) {
				await work.updateBetById(db, task.betId, {
					costActualMinor: sql`coalesce(${bets.costActualMinor}, 0) + ${effectiveCostMinor}`,
					costActualCurrency: params.currency ?? "USD",
				});
			}
		}
	}

	const agent = await getUserById(db, params.agentId);
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	const now = Date.now();

	// L17: prefer costCapMinor (new column) over costCap (legacy)
	const agentCap = agent.costCapMinor ?? agent.costCap;

	// Check agent cap
	if (agentCap != null) {
		const agentSpend = await getAgentSpend(db, params.agentId);
		await checkAndEmit(db, eventBus, {
			sessionId: params.sessionId,
			capLevel: "agent",
			entityId: params.agentId,
			spend: agentSpend,
			cap: agentCap,
			timestamp: now,
			reviewThreadId: params.reviewThreadId,
			agentId: params.agentId,
			teamId: params.teamId,
		});
	}

	// Check team cap
	// @lore U1: params.teamId is a teamMembers.id (membership group), not teams.id (domain entity).
	if (params.teamId) {
		const [team] = await db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.id, params.teamId))
			.limit(1);
		// L17: prefer costCapMinor (new column) over costCap (legacy)
		const teamCap = team?.costCapMinor ?? team?.costCap;
		if (teamCap != null) {
			const teamSpend = await getTeamSpend(db, params.teamId);
			await checkAndEmit(db, eventBus, {
				sessionId: params.sessionId,
				capLevel: "team",
				entityId: params.teamId,
				spend: teamSpend,
				cap: teamCap,
				timestamp: now,
				reviewThreadId: params.reviewThreadId,
				agentId: params.agentId,
				teamId: params.teamId,
			});
		}
	}

	// Check factory cap
	if (params.factoryCap != null) {
		const factorySpend = (params.factorySpend ?? 0) + effectiveCostMinor;
		await checkAndEmit(db, eventBus, {
			sessionId: params.sessionId,
			capLevel: "factory",
			entityId: "factory",
			spend: factorySpend,
			cap: params.factoryCap,
			timestamp: now,
			reviewThreadId: params.reviewThreadId,
			agentId: params.agentId,
			teamId: params.teamId,
		});
	}
}

/**
 * AU18: `cost-cap.ts` is the sole owner of factory-cost accumulation.
 *
 * Factory cost = SUM(users.costActual) — the authoritative per-agent running
 * totals accumulated by recordCostAndCheck. Both consumers (cost-sentinel.ts
 * and routine-scheduler.ts) call this function instead of reading
 * `factory_settings.cost_actual` (retired): the value is derived LIVE, never
 * cached, so it is always exactly current — no separate write step needed.
 *
 * @lore AU18: replaces `recordFactoryCost`, which wrote the same SUM into
 * `factory_settings.cost_actual` after every cost event (AF8/AF10 contract).
 * Since `recordCostAndCheck` already recomputed and wrote this value on every
 * call, a live read produces the exact same value the table used to hold —
 * equal-or-fresher, never staler. No caller needs the write step anymore.
 *
 * @lore AF8 INFLATION RESOLVED (AF10): The quadratic delta-accumulation bug in
 * session-provisioning.ts (Z8-002) has been fixed. The caller now passes per-event
 * deltas (not running totals), so users.costActual is correct (10+5+5=20, not 45).
 * The SUM here is accurate.
 */
export async function getFactoryCostActual(db: HyperIdleDb): Promise<number> {
	return sumAllUserCost(db);
}

interface CheckAndEmitParams {
	sessionId: string;
	capLevel: "agent" | "team" | "factory";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
	reviewThreadId?: string;
	/** Required so dedup-map entries can be cleared by `resetCosts({level:"agent"|"team"})`. */
	agentId?: string;
	teamId?: string;
}

async function checkAndEmit(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CheckAndEmitParams,
): Promise<void> {
	const ratio = params.spend / params.cap;

	// Breach at 100%
	if (ratio >= 1) {
		if (
			tryRecordDedupKey(
				params.sessionId,
				"cost_cap_breached",
				params.capLevel,
				params.entityId,
				params.agentId,
				params.teamId,
			)
		) {
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
				await createReviewItem(db, eventBus, params);
			}
		}
	}

	// Warning at 80%
	if (ratio >= 0.8) {
		if (
			tryRecordDedupKey(
				params.sessionId,
				"cost_cap_warning",
				params.capLevel,
				params.entityId,
				params.agentId,
				params.teamId,
			)
		) {
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

async function createReviewItem(
	db: HyperIdleDb,
	_eventBus: EventBus,
	params: CheckAndEmitParams,
): Promise<void> {
	if (!params.reviewThreadId) return;

	const itemId = crypto.randomUUID();
	const now = new Date().toISOString();

	await work.createItem(db, {
		id: itemId,
		sourceAgentId: params.entityId !== "factory" ? params.entityId : null,
		kind: "cost_cap_breach",
		title: `Cost cap breached: ${params.capLevel} ${params.entityId} (${params.spend}/${params.cap})`,
		body: `The ${params.capLevel}-level cost cap has been breached. Entity: ${params.entityId}, Spend: ${params.spend} cents, Cap: ${params.cap} cents.`,
		threadId: params.reviewThreadId,
		riskTier: "high",
		blocking: true,
		createdAt: now,
	});
}

/**
 * Reset costs for a new billing cycle.
 * For agent/team: zeroes session costs for that entity's sessions.
 * For factory: zeroes all session costs.
 *
 * @lore L17: accepts either a `ResetCostsParams` object (old API) or a bare
 * teamId string (new simplified API). The string form is equivalent to
 * `{ level: "team", id: teamId }` and resets both costMinor and cost columns.
 */
export async function resetCosts(
	db: HyperIdleDb,
	params: ResetCostsParams | string,
): Promise<void> {
	// Normalize the string form to the object form
	const normalizedParams: ResetCostsParams =
		typeof params === "string" ? { level: "team", id: params } : params;
	// Clear the deduplication state on reset (factory reset clears all,
	// agent/team reset clears entries belonging to those scopes).
	if (normalizedParams.level === "factory") {
		dedupBySession.clear();
	} else if (normalizedParams.level === "agent" && normalizedParams.id) {
		// I3 review W7: collect-then-delete to avoid mutating the Map mid-iteration.
		const toDelete: string[] = [];
		for (const [sid, entry] of dedupBySession) {
			if (entry.agentId === normalizedParams.id) toDelete.push(sid);
		}
		for (const sid of toDelete) dedupBySession.delete(sid);
	} else if (normalizedParams.level === "team" && normalizedParams.id) {
		const toDelete: string[] = [];
		for (const [sid, entry] of dedupBySession) {
			if (entry.teamId === normalizedParams.id) toDelete.push(sid);
		}
		for (const sid of toDelete) dedupBySession.delete(sid);
	}

	// @lore O2: session cost columns (cost, costMinor, costCurrency) stripped from
	// the kernel sessions table. resetCosts no longer zeroes session cost columns;
	// it only resets agent/team running cost counters. Cost aggregation is now a
	// app-runtime concern.
	switch (normalizedParams.level) {
		case "agent": {
			if (!normalizedParams.id) throw new Error("Agent ID required for agent reset");
			await updateUser(db, normalizedParams.id, { costActual: 0 });
			break;
		}
		case "team": {
			if (!normalizedParams.id) throw new Error("Team ID required for team reset");
			// @lore U1: teamId here is a teamMembers.id (membership group), not teams.id (domain entity).
			await db
				.update(teamMembers)
				.set({ costActual: 0 })
				.where(eq(teamMembers.id, normalizedParams.id));
			break;
		}
		case "factory": {
			// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
			await resetAllUserCost(db);
			// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
			await db.update(teamMembers).set({ costActual: 0 }).where(sql`true`);
			break;
		}
	}
}

/**
 * Clear the in-memory deduplication map.
 * Exposed for testing purposes only.
 */
export function clearDeduplicationCache(): void {
	dedupBySession.clear();
}

/**
 * Drop all dedup state for a single session. Call this from session
 * lifecycle code when a session ends (done / crashed / cancelled) so the
 * map doesn't grow unboundedly across the factory's lifetime.
 */
export function releaseSessionDedup(sessionId: string): void {
	dedupBySession.delete(sessionId);
}

/**
 * Test-only inspection hook. Returns the total count of distinct sessions
 * currently tracked in the dedup map (NOT the per-session key count).
 */
export function getDedupCacheSize(): number {
	return dedupBySession.size;
}

/**
 * Subscribe the cost-cap dedup releaser to the EventBus so EVERY
 * `session_ended` (graceful end via `endSession`, crash via `crashSession`,
 * client-driven PATCH /sessions/:id done|crashed) reclaims the per-session
 * dedup entry. Returns an unsubscribe function.
 *
 * @lore I3 review C1 / arch H-1: handoff and PATCH /sessions/:id formerly
 * bypassed `endSession`/`crashSession` and never released the dedup entry.
 * Subscribing centrally here keeps cleanup at a single chokepoint — any
 * future code path that emits `session_ended` is automatically covered.
 * Handoff still calls `releaseSessionDedup` directly because handoff
 * deliberately suppresses `session_ended` (see handoff-protocol.ts line
 * 85-87).
 */
export function registerCostCapDedupReleaser(eventBus: EventBus): () => void {
	const handler = (event: SessionEndedEvent): void => {
		releaseSessionDedup(event.sessionId);
	};
	return eventBus.on("session_ended", handler);
}
