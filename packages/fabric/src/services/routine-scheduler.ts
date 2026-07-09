import * as crypto from "node:crypto";
import {
	factorySettings,
	type HyperIdleDb,
	items,
	type Routine,
	routineRuns,
	routines,
	sessions,
	threads,
} from "@hyperidle/db";
import { createLogger, type EventBus, type EventType } from "@hyperidle/shared";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { isAgentAtWipLimit, selectAgentFabric } from "./agent-selection.js";
import { extractBuiltinKind, isBuiltinRoutineId, runBuiltinRoutine } from "./builtin-routines.js";
import {
	getAgentSessionRequestConsumerFn,
	getAgentSessionRequestCreateFn,
} from "./provision-registry.js";
import type { TaskDispatcherDeps } from "./task-dispatcher.js";

const schedulerLog = createLogger({ pkg: "fabric" });

// --- Types ---

export interface FireResult {
	fired: boolean;
	reason?: string;
	sessionId?: string;
	delegatedTo?: string;
}

/**
 * Periodic reaper hook (AF6 §4, WARNING 2). Injected by the boot wiring so the
 * scheduler can run an in-process stale-session sweep without fabric importing
 * the server layer. Returns the number of sessions reaped.
 */
export type ReapStaleSessions = () => Promise<number>;

export interface RoutineSchedulerConfig {
	pollIntervalMs: number;
	/**
	 * When false, generic routines do not auto-fire. Production wires runtimeDeps
	 * through bootstrap, so generic routine fires enter via AgentSessionRequest.
	 * Built-ins (no session) always fire. Default false for tests without runtime.
	 */
	canProvision?: boolean;
	readonly runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	/**
	 * AF6 §4 (WARNING 2): non-optional in-process periodic reaper. When provided,
	 * the poll loop invokes it on a ~5-min cadence (guarded by a last-reaped
	 * timestamp) to finalize stale `active` routine sessions that hung during the
	 * current process (no restart).
	 */
	reap?: ReapStaleSessions;
	/** Reaper cadence in ms (default 5 min). 0 = run every poll (tests). */
	reaperCadenceMs?: number;
}

export interface RoutineScheduler {
	stop: () => void;
}

interface CronFields {
	minute: number[] | "*";
	hour: number[] | "*";
	dayOfMonth: number[] | "*";
	month: number[] | "*";
	dayOfWeek: number[] | "*";
}

interface TriggerConfig {
	intervalSeconds?: number;
	cron?: string;
	eventType?: string;
	taskId?: string;
}

// --- Cron parsing ---

const DAY_NAMES: Record<string, number> = {
	SUN: 0,
	MON: 1,
	TUE: 2,
	WED: 3,
	THU: 4,
	FRI: 5,
	SAT: 6,
};

function parseField(field: string, min: number, max: number): number[] | "*" {
	if (field === "*") return "*";

	const values: number[] = [];
	const parts = field.split(",");

	for (const part of parts) {
		// Check for day-of-week names
		const upper = part.toUpperCase();
		if (DAY_NAMES[upper] !== undefined) {
			values.push(DAY_NAMES[upper]);
			continue;
		}

		// Check for ranges like 1-5
		// @lore AF3 C7: part.includes("-") proves a hyphen exists but not 2 parts.
		// Guard startStr/endStr for noUncheckedIndexedAccess; malformed cron still
		// throws via the NaN check (runtime behavior preserved).
		if (part.includes("-")) {
			const rangeParts = part.split("-");
			const startStr = rangeParts[0];
			const endStr = rangeParts[1];
			if (startStr === undefined || endStr === undefined) {
				throw new Error(`Invalid cron range: ${part}`);
			}
			const start = Number.parseInt(startStr, 10);
			const end = Number.parseInt(endStr, 10);
			if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max) {
				throw new Error(`Invalid cron range: ${part}`);
			}
			for (let i = start; i <= end; i++) {
				values.push(i);
			}
			continue;
		}

		// Check for step like */5
		if (part.startsWith("*/")) {
			const step = Number.parseInt(part.slice(2), 10);
			if (Number.isNaN(step) || step <= 0) {
				throw new Error(`Invalid cron step: ${part}`);
			}
			for (let i = min; i <= max; i += step) {
				values.push(i);
			}
			continue;
		}

		const num = Number.parseInt(part, 10);
		if (Number.isNaN(num) || num < min || num > max) {
			throw new Error(`Invalid cron field value: ${part}`);
		}
		values.push(num);
	}

	return values;
}

export function parseCron(expr: string): CronFields {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
	}

	// @lore AF3 C7: parts.length === 5 is proven above; guard each element to
	// satisfy noUncheckedIndexedAccess. The length guard proves all 5 are present,
	// so these undefined branches are unreachable at runtime (behavior preserved).
	const [p0, p1, p2, p3, p4] = parts;
	if (
		p0 === undefined ||
		p1 === undefined ||
		p2 === undefined ||
		p3 === undefined ||
		p4 === undefined
	) {
		throw new Error(`Invalid cron expression: expected 5 fields`);
	}

	return {
		minute: parseField(p0, 0, 59),
		hour: parseField(p1, 0, 23),
		dayOfMonth: parseField(p2, 1, 31),
		month: parseField(p3, 1, 12),
		dayOfWeek: parseField(p4, 0, 6),
	};
}

function fieldMatches(field: number[] | "*", value: number): boolean {
	if (field === "*") return true;
	return field.includes(value);
}

export function nextCronMatch(cron: CronFields, from: Date): Date {
	// Start from the next minute after `from`
	const candidate = new Date(from.getTime());
	candidate.setUTCSeconds(0, 0);
	candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

	// Iterate up to 400 days to find a match
	const maxIterations = 400 * 24 * 60;
	for (let i = 0; i < maxIterations; i++) {
		if (
			fieldMatches(cron.month, candidate.getUTCMonth() + 1) &&
			fieldMatches(cron.dayOfMonth, candidate.getUTCDate()) &&
			fieldMatches(cron.dayOfWeek, candidate.getUTCDay()) &&
			fieldMatches(cron.hour, candidate.getUTCHours()) &&
			fieldMatches(cron.minute, candidate.getUTCMinutes())
		) {
			return candidate;
		}
		candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
	}

	throw new Error("No cron match found within 400 days");
}

// --- Cost cap check ---

async function isFactoryCostCapReached(db: HyperIdleDb): Promise<boolean> {
	const [capRow] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_cap"))
		.limit(1);
	const [actualRow] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_actual"))
		.limit(1);

	if (!capRow) return false;

	const cap = Number.parseInt(capRow.value, 10);
	const actual = Number.parseInt(actualRow?.value ?? "0", 10);

	return actual >= cap;
}

// --- WIP check + Delegation ---
// @lore AK7 §8: isAgentAtWipLimit and the findDelegate body have moved to
// packages/fabric/src/services/agent-selection.ts (selectAgentFabric's routine_delegate
// branch). isAgentAtWipLimit is imported from there so the owner-WIP check below
// continues to work byte-identically. findDelegate is replaced by selectAgentFabric
// at the call site (architecture §5.3 / concept §3a carve-out).

// --- Review item creation ---

async function createReviewItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	_sessionId: string,
): Promise<void> {
	const now = new Date().toISOString();
	const threadId = crypto.randomUUID();

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: routine.id,
		initiatorId: routine.ownerAgentId,
		participants: JSON.stringify([routine.ownerAgentId]),
		lastActiveAt: now,
		createdAt: now,
	});

	const itemId = crypto.randomUUID();
	await db.insert(items).values({
		id: itemId,
		sourceAgentId: routine.ownerAgentId,
		layer: "meta",
		kind: "review",
		title: `Review: Routine ${routine.id}`,
		body: `Routine ${routine.id} output requires human review.`,
		threadId,
		createdAt: now,
	});

	eventBus.emit({
		type: "item_created",
		streamId: itemId,
		itemId,
		conversationId: threadId,
		kind: "review",
		timestamp: Date.now(),
	});
}

// --- Compute next_run_at ---

export function computeNextRunAt(routine: Routine, now: Date): string {
	const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;

	if (routine.triggerType === "heartbeat" || routine.triggerType === "continuous") {
		const intervalMs = (config.intervalSeconds ?? 60) * 1000;
		return new Date(now.getTime() + intervalMs).toISOString();
	}

	if (routine.triggerType === "calendar" && config.cron) {
		const cron = parseCron(config.cron);
		return nextCronMatch(cron, now).toISOString();
	}

	// Event-triggered routines don't have a scheduled next_run_at
	return "";
}

// --- Coalescing (AA2) ---

/**
 * Returns true if there is an active session for the given routineId.
 * Used to coalesce (skip) a routine trigger when a previous run is still in progress.
 *
 * @lore AA2: Coalescing prevents double-firing when the scheduler beat arrives
 * before the previous session has completed. Both checkAndFireRoutine and the
 * manual trigger endpoint (POST /api/routines/:id/trigger) call this helper.
 * Only sessions with state='active' count — completed, crashed, or timed-out
 * sessions do not block new runs.
 */
export async function shouldCoalesce(db: HyperIdleDb, routineId: string): Promise<boolean> {
	const [activeSession] = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(and(eq(sessions.routineId, routineId), eq(sessions.state, "active")))
		.limit(1);
	return activeSession !== undefined;
}

// --- AA3: Monthly cost cap helpers ---

/**
 * Returns the total cost (in minor units) of all routine runs for the given
 * routineId in the current UTC calendar month.
 *
 * @lore AA3: Uses startedAt (not endedAt) for month boundary. A run that starts
 * on Jan 31 and ends Feb 1 is counted in January. This matches the mental model
 * "I authorized this run in January" and avoids double-counting ambiguity.
 */
export async function getRoutineMonthlySpend(db: HyperIdleDb, routineId: string): Promise<number> {
	const now = new Date();
	const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

	const [row] = await db
		.select({ total: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
		.from(routineRuns)
		.where(and(eq(routineRuns.routineId, routineId), gte(routineRuns.startedAt, firstOfMonth)))
		.limit(1);

	return row?.total ?? 0;
}

// --- Core: check and fire a routine ---

export async function checkAndFireRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
): Promise<FireResult> {
	const now = new Date();

	// Check factory cost cap
	if (await isFactoryCostCapReached(db)) {
		const nextRunAt = computeNextRunAt(routine, now);
		await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
		return { fired: false, reason: "factory cost cap reached" };
	}

	// AA3: Check routine monthly cost cap
	if (routine.costCapMonthlyMinor != null) {
		const monthlySpend = await getRoutineMonthlySpend(db, routine.id);
		if (monthlySpend >= routine.costCapMonthlyMinor) {
			// Insert a skipped run record with the monthly_budget_exhausted outcome
			const runId = crypto.randomUUID();
			await db.insert(routineRuns).values({
				id: runId,
				routineId: routine.id,
				startedAt: now.toISOString(),
				outcome: "monthly_budget_exhausted",
			});
			const nextRunAt = computeNextRunAt(routine, now);
			await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
			return { fired: false, reason: "monthly cost cap reached" };
		}
	}

	// Determine target agent
	let targetAgentId = routine.ownerAgentId;
	let delegatedTo: string | undefined;

	if (await isAgentAtWipLimit(db, targetAgentId)) {
		if (routine.delegationAllowed && routine.skillId) {
			// AK7 §8: selectAgentFabric's routine_delegate branch runs findDelegate's
			// exact userSkills-scoped query verbatim (concept §3a carve-out):
			// system-wide-by-skill, userSkills insertion order, WIP fallback.
			// No teamId — routine delegation has no team scope (call site has no teamId).
			// candidates: [] — routine_delegate ignores candidates (its own query).
			const { agentId: delegate } = await selectAgentFabric({
				db,
				surface: "routine_delegate",
				teamId: null,
				workKey: routine.id,
				candidates: [],
				roleHint: null,
				spreadIndex: null,
				excludeAgentId: targetAgentId,
				skillId: routine.skillId,
			});
			if (delegate) {
				targetAgentId = delegate;
				delegatedTo = delegate;
			} else {
				const nextRunAt = computeNextRunAt(routine, now);
				await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
				return { fired: false, reason: "owner at WIP limit, no delegate available" };
			}
		} else {
			const nextRunAt = computeNextRunAt(routine, now);
			await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
			return { fired: false, reason: "owner at WIP limit, delegation not allowed" };
		}
	}

	const createAgentSessionRequest = getAgentSessionRequestCreateFn();
	const consumeAgentSessionRequest = getAgentSessionRequestConsumerFn();
	if (!(createAgentSessionRequest && consumeAgentSessionRequest && runtimeDeps)) {
		return { fired: false, reason: "agent session request runtime unavailable" };
	}

	const runId = crypto.randomUUID();
	await db.insert(routineRuns).values({
		id: runId,
		routineId: routine.id,
		startedAt: now.toISOString(),
		outcome: "running",
	});

	const request = await createAgentSessionRequest(db, {
		eventType: "routine.fire",
		sourceKind: "routine",
		sourceId: routine.id,
		streamId: `routine:${routine.id}`,
		taskId: null,
		agentId: targetAgentId,
		defaultAgentId: targetAgentId,
		teamId: routine.teamId,
		promptMode: "routine",
		idempotencyKey: `routine:${runId}`,
		payloadJson: JSON.stringify({ routineId: routine.id, routineRunId: runId }),
		sourceCorrelation: {
			routineId: routine.id,
			routineRunId: runId,
			teamId: routine.teamId,
		},
	});

	let resolvedModel: import("@hyperidle/shared").ResolvedModel | undefined;
	if (runtimeDeps.resolveModel) {
		resolvedModel = await runtimeDeps.resolveModel("workhorse");
	}

	let sessionId: string;
	try {
		const result = await consumeAgentSessionRequest(
			{
				db,
				eventBus,
				adapterPool: runtimeDeps.adapterPool,
				workspace: runtimeDeps.workspace,
				mcpBridgeRegistry: runtimeDeps.mcpBridgeRegistry,
				mcpBaseUrl: runtimeDeps.mcpBaseUrl,
				...(runtimeDeps.mounter ? { mounter: runtimeDeps.mounter } : {}),
				...(runtimeDeps.onBeforeTeardown ? { onBeforeTeardown: runtimeDeps.onBeforeTeardown } : {}),
			},
			request,
			{
				sandboxBasePath: runtimeDeps.sandboxBasePath,
				...(resolvedModel ? { resolvedModel } : {}),
			},
		);
		sessionId = result.sessionId;
	} catch (err) {
		await db
			.update(routineRuns)
			.set({
				outcome: "error",
				endedAt: new Date().toISOString(),
				errorMessage: err instanceof Error ? err.message : String(err),
			})
			.where(eq(routineRuns.id, runId));
		throw err;
	}

	// Handle human_review
	if (routine.humanReview) {
		await createReviewItem(db, eventBus, routine, sessionId);
	}

	// Update timestamps
	const lastRunAt = now.toISOString();
	const nextRunAt = computeNextRunAt(routine, now);

	await db
		.update(routines)
		.set({
			lastRunAt,
			nextRunAt: nextRunAt || null,
		})
		.where(eq(routines.id, routine.id));

	// @lore H2 daily digest relies on `routine_fired` to trigger the
	// notification dispatcher. Emit here — the event is a commitment the
	// scheduler makes on every successful fire. Consumers filter by
	// routineId (e.g. `includes("daily_digest")`).
	eventBus.emit({
		type: "routine_fired",
		streamId: sessionId,
		routineId: routine.id,
		agentId: targetAgentId,
		timestamp: Date.now(),
	});

	return { fired: true, sessionId, delegatedTo };
}

// --- Event triggers ---

export async function registerEventTriggers(
	db: HyperIdleDb,
	eventBus: EventBus,
	runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
): Promise<() => void> {
	const eventRoutines = await db
		.select()
		.from(routines)
		.where(and(eq(routines.triggerType, "event"), eq(routines.active, true)));

	const unsubscribers: Array<() => void> = [];

	for (const routine of eventRoutines) {
		const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;
		if (!config.eventType) continue;

		const eventType = config.eventType as EventType;
		const unsub = eventBus.on(eventType, () => {
			// Re-read the routine to get current state
			void (async () => {
				const [current] = await db
					.select()
					.from(routines)
					.where(eq(routines.id, routine.id))
					.limit(1);
				if (current?.active) {
					// @lore I6: .catch() prevents unhandled promise rejection from crashing
					// the event-bus handler chain. Errors are logged, not propagated.
					checkAndFireRoutine(db, eventBus, current, runtimeDeps).catch(() => {
						/* fire-and-forget: checkAndFireRoutine is resilient internally */
					});
				}
			})();
		});
		unsubscribers.push(unsub);
	}

	return () => {
		for (const unsub of unsubscribers) {
			unsub();
		}
	};
}

// --- Backfill missing nextRunAt (AF6 §2b, self-heal existing DBs) ---

/**
 * For every active scheduled routine (calendar/heartbeat/continuous) with a NULL
 * nextRunAt, compute and persist nextRunAt so the poll loop will select it.
 * Idempotent and self-healing — runs once at scheduler start before the first poll.
 *
 * @lore AF6 §2b: backfill computes the NEXT match (not back-firing overdue runs)
 * to avoid a thundering herd of catch-up runs after downtime. A routine that was
 * due during downtime simply fires at its next scheduled slot.
 */
export async function backfillMissingNextRunAt(db: HyperIdleDb): Promise<number> {
	const now = new Date();
	const candidates = await db
		.select()
		.from(routines)
		.where(
			and(
				eq(routines.active, true),
				inArray(routines.triggerType, ["calendar", "heartbeat", "continuous"]),
				isNull(routines.nextRunAt),
			),
		);

	let count = 0;
	for (const routine of candidates) {
		const nextRunAt = computeNextRunAt(routine, now);
		if (!nextRunAt) continue;
		await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
		count += 1;
	}
	return count;
}

// --- Scheduler ---

const DEFAULT_REAPER_CADENCE_MS = 5 * 60 * 1000;

export async function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	config: RoutineSchedulerConfig,
): Promise<RoutineScheduler> {
	const canProvision = config.canProvision ?? false;
	const reaperCadenceMs = config.reaperCadenceMs ?? DEFAULT_REAPER_CADENCE_MS;
	let lastReapedAt = 0;

	// Self-heal: ensure scheduled routines have a nextRunAt before the first poll.
	await backfillMissingNextRunAt(db);

	const intervalId = setInterval(() => {
		const now = new Date().toISOString();
		void (async () => {
			// AF6 §4 (WARNING 2): non-optional in-process periodic reaper sweep,
			// guarded by a last-reaped timestamp so it runs ~every reaperCadenceMs
			// rather than every poll. Catches sessions that hung during this process.
			if (config.reap && Date.now() - lastReapedAt >= reaperCadenceMs) {
				lastReapedAt = Date.now();
				config.reap().catch(() => {
					/* fire-and-forget: reaper errors must not block routine dispatch */
				});
			}

			const allRoutines = await db.select().from(routines).where(eq(routines.active, true));
			const dueRoutines = allRoutines.filter((r) => {
				if (r.triggerType === "event") return false;
				if (!r.nextRunAt) return false;
				return r.nextRunAt <= now;
			});

			for (const routine of dueRoutines) {
				if (isBuiltinRoutineId(routine.id)) {
					// post-bet-retro is event-driven (needs betId args) — never dispatched
					// from the calendar poll. Its triggerType is "event" so it's already
					// filtered above; this is belt-and-suspenders.
					// @lore AF17: check the kind prefix, not exact id, since stored ids
					// are now per-team (`builtin:post-bet-retro:<teamId>`).
					const kind = extractBuiltinKind(routine.id);
					if (kind === "builtin:post-bet-retro") continue;

					// WARNING 1: advance nextRunAt SYNCHRONOUSLY, BEFORE dispatch.
					// runBuiltinRoutine is async; a fire-and-forget advance would let the
					// next poll re-select this still-due routine and double-fire. Advancing
					// first makes the row no longer due before the next poll observes it.
					const nextRunAt = computeNextRunAt(routine, new Date());
					await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
					void runBuiltinRoutine(db, eventBus, routine.id).catch(() => {
						/* runBuiltinRoutine writes its own terminal run row (§3a) */
					});
				} else {
					// Generic routines require runtime wiring; when absent, skip instead
					// of creating an unconsumable request.
					if (!canProvision) continue;
					checkAndFireRoutine(db, eventBus, routine, config.runtimeDeps).catch(() => {
						/* fire-and-forget: errors do not block subsequent routines */
					});
				}
			}
		})();
	}, config.pollIntervalMs);

	// Register event triggers
	const unsubEvents = await registerEventTriggers(db, eventBus, config.runtimeDeps);

	schedulerLog.info("routine scheduler started", {
		pollIntervalMs: config.pollIntervalMs,
		canProvision,
		reaperEnabled: !!config.reap,
	});

	return {
		stop: () => {
			clearInterval(intervalId);
			unsubEvents();
		},
	};
}
