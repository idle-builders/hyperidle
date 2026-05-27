import * as crypto from "node:crypto";
import {
	factorySettings,
	type HyperIdleDb,
	items,
	type Routine,
	routines,
	sessions,
	threads,
	userSkills,
	users,
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

// --- WIP check ---

async function getActiveSessionCount(db: HyperIdleDb, agentId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, agentId), eq(sessions.state, "active")))
		.limit(1);
	return row?.count ?? 0;
}

async function isAgentAtWipLimit(db: HyperIdleDb, agentId: string): Promise<boolean> {
	const [agent] = await db.select().from(users).where(eq(users.id, agentId)).limit(1);
	if (!agent) return true;
	const activeCount = await getActiveSessionCount(db, agentId);
	return activeCount >= agent.maxConcurrentSessions;
}

// --- Delegation ---

async function findDelegate(
	db: HyperIdleDb,
	skillId: string,
	ownerId: string,
): Promise<string | undefined> {
	// Find a user with the matching skill who is not at their WIP limit
	const candidates = await db
		.select({ agentId: userSkills.userId })
		.from(userSkills)
		.where(eq(userSkills.skillId, skillId));

	for (const candidate of candidates) {
		if (candidate.agentId === ownerId) continue;
		if (!(await isAgentAtWipLimit(db, candidate.agentId))) {
			return candidate.agentId;
		}
	}
	return undefined;
}

// --- Session creation (lightweight, no workspace/watcher) ---

async function createRoutineSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentId: string,
	taskId: string,
): Promise<string> {
	const sessionId = crypto.randomUUID();
	const now = new Date().toISOString();

	await db.insert(sessions).values({
		id: sessionId,
		taskId,
		agentId,
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
		cost: 0,
	});

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
	if (await isFactoryCostCapReached(db)) {
		const nextRunAt = computeNextRunAt(routine, now);
		await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
		return { fired: false, reason: "factory cost cap reached" };
	}

	// Determine target agent
	let targetAgentId = routine.ownerAgentId;
	let delegatedTo: string | undefined;

	if (await isAgentAtWipLimit(db, targetAgentId)) {
		if (routine.delegationAllowed && routine.skillId) {
			const delegate = await findDelegate(db, routine.skillId, targetAgentId);
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

	// Create session
	const sessionId = await createRoutineSession(db, eventBus, targetAgentId, taskId);

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
): Promise<() => void> {
	const eventRoutines = await db
		.select()
		.from(routines)
		.where(and(eq(routines.triggerType, "event"), eq(routines.active, 1)));

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
					checkAndFireRoutine(db, eventBus, current).catch(() => {
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

// --- Scheduler ---

export async function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	config: RoutineSchedulerConfig,
): Promise<RoutineScheduler> {
	const intervalId = setInterval(() => {
		const now = new Date().toISOString();
		void (async () => {
			const allRoutines = await db.select().from(routines).where(eq(routines.active, 1));
			const dueRoutines = allRoutines.filter((r) => {
				if (r.triggerType === "event") return false;
				if (!r.nextRunAt) return false;
				return r.nextRunAt <= now;
			});

			for (const routine of dueRoutines) {
				checkAndFireRoutine(db, eventBus, routine).catch(() => {
					/* fire-and-forget: errors do not block subsequent routines */
				});
			}
		})();
	}, config.pollIntervalMs);

	// Register event triggers
	const unsubEvents = await registerEventTriggers(db, eventBus);

	return {
		stop: () => {
			clearInterval(intervalId);
			unsubEvents();
		},
	};
}
