import * as crypto from "node:crypto";
import { factorySettings, type HyperIdleDb, type Routine } from "@hyperidle/db";
import { createLogger, type EventBus, type EventType } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { extractBuiltinKind, isBuiltinRoutineId } from "../config/builtin-routines.js";
import * as routineService from "../routine-service.js";
import { recordAgentWorkIntent } from "./agent-work-intents.js";
import { runBuiltinRoutine } from "./builtin-routine-handlers.js";
import type { TaskDispatcherDeps } from "./task-dispatcher.js";

const schedulerLog = createLogger({ pkg: "server.routine-scheduler" });

// --- Types ---

export interface FireResult {
	fired: boolean;
	reason?: string;
	sessionId?: string;
}

/**
 * Periodic reaper hook (AF6 §4, WARNING 2). Injected by the boot wiring so the
 * scheduler can run an in-process stale-session sweep without coupling to
 * session provisioning. Returns the number of sessions reaped.
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

// --- Review item creation ---

/* AU9: review projection moves to terminal lifecycle consumers. */
/*
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
*/

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
	return routineService.sumRoutineRunCostSince(db, routineId, firstOfMonth);
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
		await routineService.updateRoutineById(db, routine.id, { nextRunAt });
		return { fired: false, reason: "factory cost cap reached" };
	}

	// AA3: Check routine monthly cost cap
	if (routine.costCapMonthlyMinor != null) {
		const monthlySpend = await getRoutineMonthlySpend(db, routine.id);
		if (monthlySpend >= routine.costCapMonthlyMinor) {
			// Insert a skipped run record with the monthly_budget_exhausted outcome
			const runId = crypto.randomUUID();
			await routineService.insertRoutineRun(db, {
				id: runId,
				routineId: routine.id,
				startedAt: now.toISOString(),
				outcome: "monthly_budget_exhausted",
			});
			const nextRunAt = computeNextRunAt(routine, now);
			await routineService.updateRoutineById(db, routine.id, { nextRunAt });
			return { fired: false, reason: "monthly cost cap reached" };
		}
	}

	// AU15 §4a (W2): unified run-row coalescing — the SAME signal
	// (`routineService.findRunningRoutineRun`) also gates the manual-trigger
	// route (`routines-routes.ts`), closing the fired-but-unprovisioned
	// double-run window a session-keyed signal would miss (a routine_run
	// stays "running" from fire until the terminal lifecycle fact finalizes
	// it — see agent-work-intent-worker.ts's failOrRelease + projectRoutine).
	if (await routineService.findRunningRoutineRun(db, routine.id)) {
		const nextRunAt = computeNextRunAt(routine, now);
		await routineService.updateRoutineById(db, routine.id, { nextRunAt });
		return { fired: false, reason: "previous run still in progress" };
	}

	if (!runtimeDeps) {
		return { fired: false, reason: "agent session request runtime unavailable" };
	}

	// AU15 §3/§4b: owner-WIP evaluation + delegate resolution moved to
	// drain-time (`agent-work-intent-worker.ts`'s `resolveAuthoritativeInput`
	// `routine_run` branch). `targetAgentId` here is only a correlation hint
	// (the `routine_fired` event's `agentId` + the intent's `requestedBy`) —
	// the drain resolver re-evaluates WIP/delegation at the point closest to
	// execution and is authoritative for who actually runs.
	const targetAgentId = routine.ownerAgentId;

	const runId = crypto.randomUUID();
	let intent: Awaited<ReturnType<typeof recordAgentWorkIntent>> | undefined;
	await db.transaction(async (tx) => {
		await routineService.insertRoutineRun(tx, {
			id: runId,
			routineId: routine.id,
			startedAt: now.toISOString(),
			outcome: "running",
		});
		intent = await recordAgentWorkIntent(tx as HyperIdleDb, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: targetAgentId,
			idempotencyKey: `routine:${runId}`,
		});
	});
	if (!intent) throw new Error("Routine work intent was not persisted");
	eventBus.emit({
		type: "agent_work_intent_recorded",
		streamId: `routine:${routine.id}`,
		intentId: intent.id,
		intentKind: "routine_run",
		sourceKind: "routine",
		sourceId: runId,
		idempotencyKey: intent.idempotencyKey,
		timestamp: Date.now(),
	});

	// Update timestamps
	const lastRunAt = now.toISOString();
	const nextRunAt = computeNextRunAt(routine, now);

	await routineService.updateRoutineById(db, routine.id, {
		lastRunAt,
		nextRunAt: nextRunAt || null,
	});

	// @lore H2 daily digest relies on `routine_fired` to trigger the
	// notification dispatcher. Emit here — the event is a commitment the
	// scheduler makes on every successful fire. Consumers filter by
	// routineId (e.g. `includes("daily_digest")`).
	eventBus.emit({
		type: "routine_fired",
		streamId: `routine:${routine.id}`,
		routineId: routine.id,
		agentId: targetAgentId,
		timestamp: Date.now(),
	});

	return { fired: true };
}

// --- Event triggers ---

export async function registerEventTriggers(
	db: HyperIdleDb,
	eventBus: EventBus,
	runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
): Promise<() => void> {
	const eventRoutines = await routineService.listActiveRoutines(db, { triggerType: "event" });

	const unsubscribers: Array<() => void> = [];

	for (const routine of eventRoutines) {
		const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;
		if (!config.eventType) continue;

		const eventType = config.eventType as EventType;
		const unsub = eventBus.on(eventType, () => {
			// Re-read the routine to get current state
			void (async () => {
				const current = await routineService.getRoutineById(db, routine.id);
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
	const candidates = await routineService.listScheduledRoutinesMissingNextRunAt(db);

	let count = 0;
	for (const routine of candidates) {
		const nextRunAt = computeNextRunAt(routine, now);
		if (!nextRunAt) continue;
		await routineService.updateRoutineById(db, routine.id, { nextRunAt });
		count += 1;
	}
	return count;
}

// --- Scheduler ---

const ROUTINE_REAPER_CADENCE_MS = 5 * 60 * 1000;

export async function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	config: RoutineSchedulerConfig,
): Promise<RoutineScheduler> {
	const canProvision = config.canProvision ?? false;
	const reaperCadenceMs = config.reaperCadenceMs ?? ROUTINE_REAPER_CADENCE_MS;
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

			const allRoutines = await routineService.listActiveRoutines(db);
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
					await routineService.updateRoutineById(db, routine.id, { nextRunAt });
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
