import * as crypto from "node:crypto";
// @lore U1: `teams` is the domain entity (no costActual/costCap columns).
// Cost tracking uses `teamMembers` (the agent-membership group) which has costActual/costCap.
// params.teamId in cost-cap service refers to the teamMembers.id, not teams.id.
// @lore R5: bet cost accumulation via taskId lookup (through the `work` port).
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	CostCapBreachedEvent,
	CostCapWarningEvent,
	EventBus,
	SessionEndedEvent,
	SessionHandoffCompletedEvent,
} from "@hyperidle/shared";
import type {
	CostCheckParams,
	CostDeps,
	CostRecordParams,
	CostScope,
	CostVerdict,
} from "./ports.js";

/**
 * Per-session dedup state. Each session has a small Set of dedup keys
 * (eventType:capLevel:entityId). The map entry is dropped when the session
 * ends via `releaseFromDedupState`, preventing unbounded memory growth.
 *
 * @lore I3 (TRACK-I.md L156-159): the previous implementation used a
 * module-level `Set<string>` keyed on `sessionId:…`, so dedup keys for
 * dead sessions stayed forever. The fix is per-session scoping with a
 * lifecycle hook called from session-lifecycle.ts AND an EventBus
 * subscription registered from `startSentinel`
 * (`installDedupReleaser`) so EVERY session-end path reclaims the entry.
 *
 * @lore AU20 Am3: the map moved from module-level to closure-local in
 * `createCostOps`. `CostDedupState` stays private so callers never inspect it.
 */
interface SessionDedupEntry {
	readonly agentId?: string;
	readonly teamId?: string;
	readonly keys: Set<string>;
}

type CostDedupState = Map<string, SessionDedupEntry>;

/** Create a fresh, empty dedup state. Call once per `createCostOps` closure. */
function createDedupState(): CostDedupState {
	return new Map<string, SessionDedupEntry>();
}

function dedupKeyPart(eventType: string, capLevel: string, entityId: string): string {
	return `${eventType}:${capLevel}:${entityId}`;
}

function tryRecordDedupKey(
	dedupState: CostDedupState,
	sessionId: string,
	eventType: string,
	capLevel: string,
	entityId: string,
	agentId?: string,
	teamId?: string,
): boolean {
	let entry = dedupState.get(sessionId);
	const key = dedupKeyPart(eventType, capLevel, entityId);
	if (entry?.keys.has(key)) {
		return false;
	}
	if (!entry) {
		entry = { agentId, teamId, keys: new Set() };
		dedupState.set(sessionId, entry);
	}
	entry.keys.add(key);
	return true;
}

// ---------------------------------------------------------------------------
// Instance-local dedup-state helpers.
// ---------------------------------------------------------------------------

/** Clear all dedup entries. Used by `_testHooks.clearDedup`. */
function clearDedupState(state: CostDedupState): void {
	state.clear();
}

/** Count of sessions in the dedup map. Used by `_testHooks.getDedupSize`. */
function getDedupStateSize(state: CostDedupState): number {
	return state.size;
}

/** Drop a single session's dedup entry. Used by `_testHooks.releaseDedup`. */
function releaseFromDedupState(state: CostDedupState, sessionId: string): void {
	state.delete(sessionId);
}

/**
 * Subscribe the dedup releaser to the EventBus so EVERY `session_ended`
 * (graceful end, crash, PATCH /sessions/:id done|crashed) AND
 * `session_handoff_completed` (handoff — which deliberately suppresses
 * `session_ended`) reclaims the per-session dedup entry.
 * Returns an unsubscribe function.
 *
 * @lore AU20: `startSentinel` owns both this subscription and the timer, so
 * production has one lifecycle owner and one disposer.
 */
function installDedupReleaser(state: CostDedupState, eventBus: EventBus): () => void {
	const handler = (event: SessionEndedEvent | SessionHandoffCompletedEvent): void => {
		state.delete(event.sessionId);
	};
	const offEnded = eventBus.on("session_ended", handler);
	const offHandoff = eventBus.on("session_handoff_completed", handler);
	return (): void => {
		offEnded();
		offHandoff();
	};
}

// ---------------------------------------------------------------------------
// Core cost-cap functions
// ---------------------------------------------------------------------------

/**
 * Check if a new session is allowed given cost caps.
 * Checks agent -> team -> factory hierarchy, returning the first breach.
 *
 * @lore L17: Currency mismatch is NOT enforced at this boundary.
 */
async function checkCostCap(
	deps: CostDeps,
	db: HyperIdleDb,
	_eventBus: EventBus,
	params: CostCheckParams,
	_dedupState: CostDedupState,
): Promise<CostVerdict> {
	// 1. Check agent cap
	const agent = await deps.users.getUserById(db, params.agentId);
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	// L17: prefer costCapMinor (new column) over costCap (legacy)
	const agentCap = agent.costCapMinor ?? agent.costCap;
	if (agentCap != null) {
		// @lore I0b: agent row already loaded above — read costActual directly
		// instead of re-querying via the now-deleted getAgentSpend helper.
		const agentSpend = agent.costActual ?? 0;
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
		const team = await deps.org.getTeamMembersById(db, params.teamId);
		// L17: prefer costCapMinor (new column) over costCap (legacy)
		const teamCap = team?.costCapMinor ?? team?.costCap;
		if (teamCap != null) {
			// @lore I0b: team row already loaded above — read costActual directly.
			const teamSpend = team?.costActual ?? 0;
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
async function recordCostAndCheck(
	deps: CostDeps,
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CostRecordParams,
	dedupState: CostDedupState,
): Promise<void> {
	// @lore O2: session cost columns stripped from the kernel sessions table.
	const effectiveCostMinor = params.costMinor ?? 0;

	if (effectiveCostMinor > 0) {
		// Accumulate on agent
		await deps.users.incrementUserCost(db, params.agentId, effectiveCostMinor);

		// Accumulate on team if provided
		// @lore U1: params.teamId is a teamMembers.id (membership group), not teams.id (domain entity).
		if (params.teamId) {
			await deps.org.incrementTeamMembersCost(db, params.teamId, effectiveCostMinor);
		}

		// R5: Accumulate on bet (via task.betId lookup) if taskId is provided.
		if (params.taskId) {
			const task = await deps.work.getTaskById(db, params.taskId);
			if (task?.betId) {
				await deps.work.incrementBetCost(
					db,
					task.betId,
					effectiveCostMinor,
					params.currency ?? "USD",
				);
			}
		}
	}

	const agent = await deps.users.getUserById(db, params.agentId);
	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	const now = Date.now();

	// L17: prefer costCapMinor (new column) over costCap (legacy)
	const agentCap = agent.costCapMinor ?? agent.costCap;

	// Check agent cap
	if (agentCap != null) {
		// @lore I0b: agent row was fetched above (post-increment, the correct updated value).
		const agentSpend = agent.costActual ?? 0;
		await checkAndEmit(deps, db, eventBus, dedupState, {
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
		const team = await deps.org.getTeamMembersById(db, params.teamId);
		// L17: prefer costCapMinor (new column) over costCap (legacy)
		const teamCap = team?.costCapMinor ?? team?.costCap;
		if (teamCap != null) {
			// @lore I0b: team row was fetched above (post-increment).
			const teamSpend = team?.costActual ?? 0;
			await checkAndEmit(deps, db, eventBus, dedupState, {
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
		await checkAndEmit(deps, db, eventBus, dedupState, {
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

/** Read current spend through the single scope discriminator. */
async function spend(deps: CostDeps, db: HyperIdleDb, scope: CostScope): Promise<number> {
	switch (scope.level) {
		case "factory":
			return deps.users.sumAllUserCost(db);
		case "agent": {
			if (!scope.id) throw new Error("Agent ID required for agent spend");
			const agent = await deps.users.getUserById(db, scope.id);
			return agent?.costActual ?? 0;
		}
		case "team": {
			if (!scope.id) throw new Error("Team ID required for team spend");
			const team = await deps.org.getTeamMembersById(db, scope.id);
			return team?.costActual ?? 0;
		}
	}
}

/**
 * Reset costs for a new billing cycle.
 * For agent/team: zeroes running cost counters for that entity.
 * For factory: zeroes all running cost counters.
 * Every caller supplies the same `CostScope` discriminator used by `spend`.
 */
async function resetCosts(
	deps: CostDeps,
	db: HyperIdleDb,
	scope: CostScope,
	dedupState: CostDedupState,
): Promise<void> {
	// Clear deduplication state on reset (factory clears all,
	// agent/team clears entries belonging to those scopes).
	if (scope.level === "factory") {
		dedupState.clear();
	} else if (scope.level === "agent" && scope.id) {
		// I3 review W7: collect-then-delete to avoid mutating the Map mid-iteration.
		const toDelete: string[] = [];
		for (const [sid, entry] of dedupState) {
			if (entry.agentId === scope.id) toDelete.push(sid);
		}
		for (const sid of toDelete) dedupState.delete(sid);
	} else if (scope.level === "team" && scope.id) {
		const toDelete: string[] = [];
		for (const [sid, entry] of dedupState) {
			if (entry.teamId === scope.id) toDelete.push(sid);
		}
		for (const sid of toDelete) dedupState.delete(sid);
	}

	// @lore O2: session cost columns stripped from the kernel sessions table.
	// resetCosts only resets agent/team running cost counters.
	switch (scope.level) {
		case "agent": {
			if (!scope.id) throw new Error("Agent ID required for agent reset");
			await deps.users.updateUser(db, scope.id, { costActual: 0 });
			break;
		}
		case "team": {
			if (!scope.id) throw new Error("Team ID required for team reset");
			// @lore U1: teamId here is a teamMembers.id (membership group), not teams.id.
			await deps.org.resetTeamMembersCost(db, scope.id);
			break;
		}
		case "factory": {
			// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
			await deps.users.resetAllUserCost(db);
			// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
			await deps.org.resetAllTeamMembersCost(db);
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

interface CostReviewItemInput {
	readonly id: string;
	readonly sourceAgentId: string | null;
	readonly kind: string;
	readonly title: string;
	readonly body: string;
	readonly threadId: string;
	readonly riskTier: string;
	readonly blocking: boolean;
	readonly createdAt: string;
}

async function checkAndEmit(
	deps: CostDeps,
	db: HyperIdleDb,
	eventBus: EventBus,
	dedupState: CostDedupState,
	params: CheckAndEmitParams,
): Promise<void> {
	const ratio = params.spend / params.cap;

	// Breach at 100%
	if (ratio >= 1) {
		if (
			tryRecordDedupKey(
				dedupState,
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
				await createReviewItem(deps, db, eventBus, params);
			}
		}
	}

	// Warning at 80%
	if (ratio >= 0.8) {
		if (
			tryRecordDedupKey(
				dedupState,
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
	deps: CostDeps,
	db: HyperIdleDb,
	_eventBus: EventBus,
	params: CheckAndEmitParams,
): Promise<void> {
	if (!params.reviewThreadId) return;

	const itemId = crypto.randomUUID();
	const now = new Date().toISOString();

	const item: CostReviewItemInput = {
		id: itemId,
		sourceAgentId: params.entityId !== "factory" ? params.entityId : null,
		kind: "cost_cap_breach",
		title: `Cost cap breached: ${params.capLevel} ${params.entityId} (${params.spend}/${params.cap})`,
		body: `The ${params.capLevel}-level cost cap has been breached. Entity: ${params.entityId}, Spend: ${params.spend} cents, Cap: ${params.cap} cents.`,
		threadId: params.reviewThreadId,
		riskTier: "high",
		blocking: true,
		createdAt: now,
	};
	await deps.work.createItem(db, item);
}

interface CostSentinelState {
	testResetRequested: boolean;
}

const COST_SENTINEL_INTERVAL_MS = 900_000;
const COST_WARNING_RATIO = 0.8;

function createSentinelState(): CostSentinelState {
	return { testResetRequested: false };
}

async function readStoredLevel(
	deps: CostDeps,
	db: HyperIdleDb,
	state: CostSentinelState,
): Promise<"ok" | "warning" | "breach" | null> {
	if (state.testResetRequested) return null;
	const { internal } = await deps.settings.readServerConfig(db);
	return internal.costSentinelLastLevel;
}

async function writeStoredLevel(
	deps: CostDeps,
	db: HyperIdleDb,
	level: "ok" | "warning" | "breach",
	state: CostSentinelState,
): Promise<void> {
	await deps.settings.updateServerConfig(db, { internal: { costSentinelLastLevel: level } });
	state.testResetRequested = false;
}

function classifyLevel(ratio: number): "ok" | "warning" | "breach" {
	if (ratio >= 1) return "breach";
	if (ratio >= COST_WARNING_RATIO) return "warning";
	return "ok";
}

async function runSentinelCheck(
	deps: CostDeps,
	db: HyperIdleDb,
	eventBus: EventBus,
	state: CostSentinelState,
): Promise<{ fired: true; emitted: readonly string[] }> {
	const { cost } = await deps.settings.readServerConfig(db);
	const cap = cost.capMinor;
	const actual = await spend(deps, db, { level: "factory" });
	if (!Number.isFinite(cap) || cap <= 0) return { fired: true, emitted: [] };

	const currentLevel = classifyLevel(actual / cap);
	const previousLevel = (await readStoredLevel(deps, db, state)) ?? "ok";
	const emitted: string[] = [];
	const timestamp = Date.now();
	if (currentLevel !== previousLevel) {
		if (currentLevel === "breach") {
			const event: CostCapBreachedEvent = {
				type: "cost_cap_breached",
				streamId: crypto.randomUUID(),
				level: "hard",
				capLevel: "factory",
				entityId: "factory",
				spend: actual,
				cap,
				timestamp,
			};
			eventBus.emit(event);
			emitted.push("cost_cap_breached");
		} else if (currentLevel === "warning") {
			const event: CostCapWarningEvent = {
				type: "cost_cap_warning",
				streamId: crypto.randomUUID(),
				level: "warning",
				capLevel: "factory",
				entityId: "factory",
				spend: actual,
				cap,
				timestamp,
			};
			eventBus.emit(event);
			emitted.push("cost_cap_warning");
		}
	}
	if (currentLevel !== previousLevel || state.testResetRequested) {
		await writeStoredLevel(deps, db, currentLevel, state);
	}
	return { fired: true, emitted };
}

function startSentinelTimer(
	deps: CostDeps,
	db: HyperIdleDb,
	eventBus: EventBus,
	state: CostSentinelState,
): () => void {
	const handle = setInterval(() => {
		void runSentinelCheck(deps, db, eventBus, state);
	}, COST_SENTINEL_INTERVAL_MS);
	return (): void => clearInterval(handle);
}

export interface CostOps {
	check(db: HyperIdleDb, eventBus: EventBus, params: CostCheckParams): Promise<CostVerdict>;
	record(db: HyperIdleDb, eventBus: EventBus, params: CostRecordParams): Promise<void>;
	spend(db: HyperIdleDb, scope: CostScope): Promise<number>;
	reset(db: HyperIdleDb, scope: CostScope): Promise<void>;
	startSentinel(db: HyperIdleDb, eventBus: EventBus): () => void;
	runCostSentinelCheck(
		db: HyperIdleDb,
		eventBus: EventBus,
	): Promise<{ fired: true; emitted: readonly string[] }>;
}

/** Bind the complete budget policy to its four table-owner ports. */
export function createCostOps(deps: CostDeps): CostOps & {
	readonly _testHooks: {
		getDedupSize(): number;
		releaseDedup(sessionId: string): void;
		clearDedup(): void;
		resetSentinelState(): void;
		installDedupReleaser(eventBus: EventBus): () => void;
	};
} {
	const dedupState = createDedupState();
	const sentinelState = createSentinelState();
	const ops: CostOps = {
		check: (db, eventBus, params) => checkCostCap(deps, db, eventBus, params, dedupState),
		record: (db, eventBus, params) => recordCostAndCheck(deps, db, eventBus, params, dedupState),
		spend: (db, scope) => spend(deps, db, scope),
		reset: (db, scope) => resetCosts(deps, db, scope, dedupState),
		startSentinel: (db, eventBus) => {
			const offDedup = installDedupReleaser(dedupState, eventBus);
			const offSentinel = startSentinelTimer(deps, db, eventBus, sentinelState);
			return (): void => {
				offDedup();
				offSentinel();
			};
		},
		runCostSentinelCheck: (db, eventBus) => runSentinelCheck(deps, db, eventBus, sentinelState),
	};
	return {
		...ops,
		_testHooks: {
			getDedupSize: () => getDedupStateSize(dedupState),
			releaseDedup: (sessionId) => releaseFromDedupState(dedupState, sessionId),
			clearDedup: () => clearDedupState(dedupState),
			resetSentinelState: () => {
				sentinelState.testResetRequested = true;
			},
			installDedupReleaser: (eventBus) => installDedupReleaser(dedupState, eventBus),
		},
	};
}
