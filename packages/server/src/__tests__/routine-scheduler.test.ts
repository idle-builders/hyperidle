import {
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	items,
	products,
	routines,
	sessions,
	tasks,
	teams,
	threads,
	userSkills,
	users,
	type TestDbHandle
} from "@hyperidle/db";
import {
	checkAndFireRoutine,
	nextCronMatch,
	parseCron,
	type RoutineSchedulerConfig,
	registerEventTriggers,
	startRoutineScheduler,
} from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: now })

	await db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })

	await db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test bet",
			appetite: "small",
			status: "committed",
			createdAt: now,
		})

	await db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: "Test task",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})

	await db.insert(users)
		.values({
			id: "agent-1",
			kind: "ai",
			name: "Builder Agent",
			role: "builder",
			skills: JSON.stringify(["deploy"]),
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		})

	await db.insert(users)
		.values({
			id: "agent-2",
			kind: "ai",
			name: "Teammate Agent",
			role: "builder",
			skills: JSON.stringify(["deploy"]),
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		})

	await db.insert(userSkills)
		.values({
			userId: "agent-2",
			skillId: "deploy",
			autonomyLevel: 3,
			successCount: 0,
			failureCount: 0,
		})

}

async function getRoutine(db: HyperIdleDb, id: string) {
	const [routine] = await db.select().from(routines).where(eq(routines.id, id));
	if (!routine) throw new Error(`Routine ${id} not found`);
	return routine;
}

describe("Routine Scheduler", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		await seedBase(db);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	describe("parseCron", () => {
		it("parses 5-field cron expression", () => {
			const parsed = parseCron("0 9 * * MON");
			expect(parsed).toBeDefined();
			expect(parsed.minute).toEqual([0]);
			expect(parsed.hour).toEqual([9]);
			expect(parsed.dayOfMonth).toEqual("*");
			expect(parsed.month).toEqual("*");
			expect(parsed.dayOfWeek).toEqual([1]);
		});

		it("throws on invalid cron expression", () => {
			expect(() => parseCron("invalid")).toThrow();
		});
	});

	describe("nextCronMatch", () => {
		it("computes next Monday 9:00 from a Sunday", () => {
			const from = new Date("2026-04-12T10:00:00Z");
			const next = nextCronMatch(parseCron("0 9 * * MON"), from);
			expect(next.getUTCDay()).toBe(1);
			expect(next.getUTCHours()).toBe(9);
			expect(next.getUTCMinutes()).toBe(0);
			expect(next > from).toBe(true);
		});

		// Pins the "first Monday of the month" semantics for the built-in
		// Portfolio Retro cron ("0 10 1-7 * MON"). Over 12 iterated matches we
		// must land on dayOfMonth<=7 AND dayOfWeek===Monday every time — if
		// the matcher ever flips to POSIX-OR semantics, this test fails.
		it("first-Monday cron (0 10 1-7 * MON) hits dayOfMonth<=7 AND Monday over a 12-month window", () => {
			const cron = parseCron("0 10 1-7 * MON");
			let cursor = new Date("2026-01-01T00:00:00Z");
			const end = new Date("2027-01-01T00:00:00Z");
			const matches: Date[] = [];

			while (cursor < end) {
				const next = nextCronMatch(cron, cursor);
				if (next >= end) break;
				matches.push(next);
				cursor = new Date(next.getTime() + 60_000);
			}

			// One match per month: 12 iterations over a one-year window.
			expect(matches.length).toBe(12);

			for (const m of matches) {
				expect(m.getUTCDay(), `${m.toISOString()} should be Monday`).toBe(1);
				expect(
					m.getUTCDate(),
					`${m.toISOString()} should be in first 7 days of month`,
				).toBeLessThanOrEqual(7);
				expect(m.getUTCHours()).toBe(10);
				expect(m.getUTCMinutes()).toBe(0);
			}
		});
	});

	// AC1: Heartbeat routine fires within 60-90s of last run
	describe("AC1: Heartbeat routine fires within interval", () => {
		it("fires heartbeat routine and sets next_run_at = now + interval", async () => {
			const now = new Date();
			const pastDue = new Date(now.getTime() - 5000).toISOString();

			await db.insert(routines)
				.values({
					id: "r-heartbeat",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 60, taskId: "task-1" }),
					active: true,
					lastRunAt: new Date(now.getTime() - 65000).toISOString(),
					nextRunAt: pastDue,
				})

			const routine = await getRoutine(db, "r-heartbeat");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(true);

			const updated = await getRoutine(db, "r-heartbeat");
			expect(updated.lastRunAt).toBeTruthy();
			expect(updated.nextRunAt).toBeTruthy();

			const nextRun = new Date(updated.nextRunAt ?? "").getTime();
			const expectedMin = now.getTime() + 55000;
			const expectedMax = now.getTime() + 90000;
			expect(nextRun).toBeGreaterThanOrEqual(expectedMin);
			expect(nextRun).toBeLessThanOrEqual(expectedMax);
		});
	});

	// AC2: Calendar routine with cron fires at correct time
	describe("AC2: Calendar routine fires at correct cron time", () => {
		it("fires calendar routine and sets next_run_at to next cron match", async () => {
			const now = new Date();
			const pastDue = new Date(now.getTime() - 5000).toISOString();

			await db.insert(routines)
				.values({
					id: "r-calendar",
					ownerAgentId: "agent-1",
					triggerType: "calendar",
					triggerConfig: JSON.stringify({ cron: "0 9 * * MON", taskId: "task-1" }),
					active: true,
					nextRunAt: pastDue,
				})

			const routine = await getRoutine(db, "r-calendar");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(true);

			const updated = await getRoutine(db, "r-calendar");
			const nextRun = new Date(updated.nextRunAt ?? "");
			expect(nextRun.getUTCDay()).toBe(1);
			expect(nextRun.getUTCHours()).toBe(9);
			expect(nextRun.getUTCMinutes()).toBe(0);
		});
	});

	// AC3: Event-triggered routine fires when event emitted
	describe("AC3: Event-triggered routine fires on event", () => {
		it("fires when configured event is emitted", async () => {
			await db.insert(routines)
				.values({
					id: "r-event",
					ownerAgentId: "agent-1",
					triggerType: "event",
					triggerConfig: JSON.stringify({ eventType: "bet_state_changed", taskId: "task-1" }),
					active: true,
				})

			const sessionsBefore = await db.select().from(sessions);
			expect(sessionsBefore).toHaveLength(0);

			registerEventTriggers(db, eventBus);

			eventBus.emit({
				type: "bet_state_changed",
				streamId: "b1",
				betId: "b1",
				fromState: "review",
				toState: "shipped",
				timestamp: Date.now(),
			});

			// Handler is synchronous via EventBus, but checkAndFireRoutine is async
			await new Promise((r) => setTimeout(r, 50));

			const sessionsAfter = await db.select().from(sessions);
			expect(sessionsAfter).toHaveLength(1);
			expect(sessionsAfter[0].agentId).toBe("agent-1");

			const updated = await getRoutine(db, "r-event");
			expect(updated.lastRunAt).toBeTruthy();
		});
	});

	// AC4: Delegation when owner at WIP limit
	describe("AC4: Delegation to teammate", () => {
		it("delegates to teammate when owner at WIP limit", async () => {
			const now = new Date();

			// Put agent-1 at WIP limit (maxConcurrentSessions=2)
			await db.insert(sessions)
				.values({
					id: "s-existing-1",
					taskId: "task-1",
					agentId: "agent-1",
					modelTier: "workhorse",
					startedAt: now.toISOString(),
					state: "active",
					cost: 0,
				})

			await db.insert(sessions)
				.values({
					id: "s-existing-2",
					taskId: "task-1",
					agentId: "agent-1",
					modelTier: "workhorse",
					startedAt: now.toISOString(),
					state: "active",
					cost: 0,
				})

			await db.insert(routines)
				.values({
					id: "r-delegate",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 60, taskId: "task-1" }),
					skillId: "deploy",
					delegationAllowed: true,
					active: true,
					nextRunAt: new Date(now.getTime() - 5000).toISOString(),
				})

			const routine = await getRoutine(db, "r-delegate");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(true);
			expect(result.delegatedTo).toBe("agent-2");

			const delegateSessions = db
				.select()
				.from(sessions)
				.where(eq(sessions.agentId, "agent-2"))
				.all();
			expect(delegateSessions.length).toBeGreaterThanOrEqual(1);
		});
	});

	// AC5: Factory cost cap reached -> routine does NOT fire
	describe("AC5: Factory cost cap blocks firing", () => {
		it("skips firing when factory cost cap is reached", async () => {
			const now = new Date();

			await db.insert(factorySettings)
				.values({ key: "cost_cap", value: "100", updatedAt: now.toISOString() })

			await db.insert(factorySettings)
				.values({ key: "cost_actual", value: "150", updatedAt: now.toISOString() })

			await db.insert(routines)
				.values({
					id: "r-capped",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 60, taskId: "task-1" }),
					active: true,
					nextRunAt: new Date(now.getTime() - 5000).toISOString(),
				})

			const routine = await getRoutine(db, "r-capped");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(false);
			expect(result.reason).toContain("cost");

			const updated = await getRoutine(db, "r-capped");
			expect(updated.nextRunAt).toBeTruthy();
			const nextRunTime = new Date(updated.nextRunAt ?? "").getTime();
			expect(nextRunTime).toBeGreaterThan(now.getTime());

			const allSessions = await db.select().from(sessions);
			expect(allSessions).toHaveLength(0);
		});
	});

	// AC6: Silent routine creates session but no item
	describe("AC6: Silent routine creates no item", () => {
		it("creates session but no item when silent=true", async () => {
			const now = new Date();

			await db.insert(routines)
				.values({
					id: "r-silent",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 60, taskId: "task-1" }),
					silent: true,
					active: true,
					nextRunAt: new Date(now.getTime() - 5000).toISOString(),
				})

			const routine = await getRoutine(db, "r-silent");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(true);

			const allSessions = await db.select().from(sessions);
			expect(allSessions).toHaveLength(1);

			const allItems = await db.select().from(items);
			expect(allItems).toHaveLength(0);
		});
	});

	// AC7: Human review routine produces review item
	describe("AC7: Human review routine creates review item", () => {
		it("creates review item in thread when human_review=true", async () => {
			const now = new Date();

			await db.insert(routines)
				.values({
					id: "r-review",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 60, taskId: "task-1" }),
					humanReview: true,
					active: true,
					nextRunAt: new Date(now.getTime() - 5000).toISOString(),
				})

			const routine = await getRoutine(db, "r-review");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(true);

			const allItems = await db.select().from(items);
			expect(allItems).toHaveLength(1);
			expect(allItems[0].kind).toBe("review");
			expect(allItems[0].sourceAgentId).toBe("agent-1");

			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1);
		});
	});

	// AC8: last_run_at and next_run_at updated after fire
	describe("AC8: Timestamps updated after fire", () => {
		it("updates last_run_at and next_run_at after firing", async () => {
			const now = new Date();
			const pastDue = new Date(now.getTime() - 5000).toISOString();

			await db.insert(routines)
				.values({
					id: "r-timestamps",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 120, taskId: "task-1" }),
					active: true,
					lastRunAt: null,
					nextRunAt: pastDue,
				})

			const routine = await getRoutine(db, "r-timestamps");
			const result = await checkAndFireRoutine(db, eventBus, routine);

			expect(result.fired).toBe(true);

			const updated = await getRoutine(db, "r-timestamps");
			expect(updated.lastRunAt).toBeTruthy();
			expect(updated.nextRunAt).toBeTruthy();

			const lastRun = new Date(updated.lastRunAt ?? "").getTime();
			const nextRun = new Date(updated.nextRunAt ?? "").getTime();

			expect(lastRun).toBeGreaterThanOrEqual(now.getTime() - 2000);
			expect(lastRun).toBeLessThanOrEqual(now.getTime() + 5000);

			expect(nextRun).toBeGreaterThanOrEqual(now.getTime() + 115000);
			expect(nextRun).toBeLessThanOrEqual(now.getTime() + 130000);
		});
	});

	describe("startRoutineScheduler", () => {
		it("starts and stops the scheduler", async () => {
			const config: RoutineSchedulerConfig = { pollIntervalMs: 30000 };
			const scheduler = await startRoutineScheduler(db, eventBus, config);

			expect(scheduler).toBeDefined();
			expect(typeof scheduler.stop).toBe("function");

			scheduler.stop();
		});
	});
});
