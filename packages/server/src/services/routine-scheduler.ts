import * as crypto from "node:crypto";
import {
	agentSkills,
	agents,
	factorySettings,
	type HyperIdleDb,
	items,
	type Routine,
	routines,
	sessions,
	threads,
} from "@hyperidle/db";
import type { EventBus, EventType } from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";

// --- Types ---

export interface FireResult {
	fired: boolean;
	reason?: string;
	sessionId?: string;
	delegatedTo?: string;
}

export interface RoutineSchedulerConfig {
	pollIntervalMs: number;
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
	taskId: string;
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
		if (part.includes("-")) {
			const [startStr, endStr] = part.split("-");
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

	return {
		minute: parseField(parts[0], 0, 59),
		hour: parseField(parts[1], 0, 23),
		dayOfMonth: parseField(parts[2], 1, 31),
		month: parseField(parts[3], 1, 12),
		dayOfWeek: parseField(parts[4], 0, 6),
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

function isFactoryCostCapReached(db: HyperIdleDb): boolean {
	const capRow = db.select().from(factorySettings).where(eq(factorySettings.key, "cost_cap")).get();
	const actualRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_actual"))
		.get();

	if (!capRow) return false;

	const cap = Number.parseInt(capRow.value, 10);
	const actual = Number.parseInt(actualRow?.value ?? "0", 10);

	return actual >= cap;
}

// --- WIP check ---

function getActiveSessionCount(db: HyperIdleDb, agentId: string): number {
	const row = db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, agentId), eq(sessions.state, "active")))
		.get();
	return row?.count ?? 0;
}

function isAgentAtWipLimit(db: HyperIdleDb, agentId: string): boolean {
	const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
	if (!agent) return true;
	const activeCount = getActiveSessionCount(db, agentId);
	return activeCount >= agent.maxConcurrentSessions;
}

// --- Delegation ---

function findDelegate(db: HyperIdleDb, skillId: string, ownerId: string): string | undefined {
	// Find an agent with the matching skill who is not at their WIP limit
	const candidates = db
		.select({ agentId: agentSkills.agentId })
		.from(agentSkills)
		.where(eq(agentSkills.skillId, skillId))
		.all();

	for (const candidate of candidates) {
		if (candidate.agentId === ownerId) continue;
		if (!isAgentAtWipLimit(db, candidate.agentId)) {
			return candidate.agentId;
		}
	}
	return undefined;
}

// --- Session creation (lightweight, no workspace/watcher) ---

function createRoutineSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentId: string,
	taskId: string,
): string {
	const sessionId = crypto.randomUUID();
	const now = new Date().toISOString();

	db.insert(sessions)
		.values({
			id: sessionId,
			taskId,
			agentId,
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
			cost: 0,
		})
		.run();

	eventBus.emit({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId,
		taskId,
		timestamp: Date.now(),
	});

	return sessionId;
}

// --- Review item creation ---

function createReviewItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	_sessionId: string,
): void {
	const now = new Date().toISOString();
	const threadId = crypto.randomUUID();

	db.insert(threads)
		.values({
			id: threadId,
			kind: "routine-review",
			createdAt: now,
		})
		.run();

	const itemId = crypto.randomUUID();
	db.insert(items)
		.values({
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			title: `Review: Routine ${routine.id}`,
			body: `Routine ${routine.id} output requires human review.`,
			threadId,
			createdAt: now,
		})
		.run();

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

function computeNextRunAt(routine: Routine, now: Date): string {
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

// --- Core: check and fire a routine ---

// biome-ignore lint/suspicious/useAwait: callers expect Promise return for consistency with async service layer
export async function checkAndFireRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<FireResult> {
	const now = new Date();
	const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;
	const taskId = config.taskId;

	if (!taskId) {
		return { fired: false, reason: "no taskId in trigger config" };
	}

	// Check factory cost cap
	if (isFactoryCostCapReached(db)) {
		const nextRunAt = computeNextRunAt(routine, now);
		db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id)).run();
		return { fired: false, reason: "factory cost cap reached" };
	}

	// Determine target agent
	let targetAgentId = routine.ownerAgentId;
	let delegatedTo: string | undefined;

	if (isAgentAtWipLimit(db, targetAgentId)) {
		if (routine.delegationAllowed && routine.skillId) {
			const delegate = findDelegate(db, routine.skillId, targetAgentId);
			if (delegate) {
				targetAgentId = delegate;
				delegatedTo = delegate;
			} else {
				const nextRunAt = computeNextRunAt(routine, now);
				db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id)).run();
				return { fired: false, reason: "owner at WIP limit, no delegate available" };
			}
		} else {
			const nextRunAt = computeNextRunAt(routine, now);
			db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id)).run();
			return { fired: false, reason: "owner at WIP limit, delegation not allowed" };
		}
	}

	// Create session
	const sessionId = createRoutineSession(db, eventBus, targetAgentId, taskId);

	// Handle human_review
	if (routine.humanReview) {
		createReviewItem(db, eventBus, routine, sessionId);
	}

	// Update timestamps
	const lastRunAt = now.toISOString();
	const nextRunAt = computeNextRunAt(routine, now);

	db.update(routines)
		.set({
			lastRunAt,
			nextRunAt: nextRunAt || null,
		})
		.where(eq(routines.id, routine.id))
		.run();

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

export function registerEventTriggers(db: HyperIdleDb, eventBus: EventBus): () => void {
	const eventRoutines = db
		.select()
		.from(routines)
		.where(and(eq(routines.triggerType, "event"), eq(routines.active, 1)))
		.all();

	const unsubscribers: Array<() => void> = [];

	for (const routine of eventRoutines) {
		const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;
		if (!config.eventType) continue;

		const eventType = config.eventType as EventType;
		const unsub = eventBus.on(eventType, () => {
			// Re-read the routine to get current state
			const current = db.select().from(routines).where(eq(routines.id, routine.id)).get();
			if (current?.active) {
				// @lore I6: .catch() prevents unhandled promise rejection from crashing
				// the event-bus handler chain. Errors are logged, not propagated.
				checkAndFireRoutine(db, eventBus, current).catch(() => {
					/* fire-and-forget: checkAndFireRoutine is resilient internally */
				});
			}
		});
		unsubscribers.push(unsub);
	}

	return () => {
		for (const unsub of unsubscribers) {
			unsub();
		}
	};
}

// --- Scheduler ---

export function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	config: RoutineSchedulerConfig,
): RoutineScheduler {
	const intervalId = setInterval(() => {
		const now = new Date().toISOString();
		const dueRoutines = db
			.select()
			.from(routines)
			.where(eq(routines.active, 1))
			.all()
			.filter((r) => {
				if (r.triggerType === "event") return false;
				if (!r.nextRunAt) return false;
				return r.nextRunAt <= now;
			});

		for (const routine of dueRoutines) {
			checkAndFireRoutine(db, eventBus, routine).catch(() => {
				/* fire-and-forget: errors do not block subsequent routines */
			});
		}
	}, config.pollIntervalMs);

	// Register event triggers
	const unsubEvents = registerEventTriggers(db, eventBus);

	return {
		stop: () => {
			clearInterval(intervalId);
			unsubEvents();
		},
	};
}
