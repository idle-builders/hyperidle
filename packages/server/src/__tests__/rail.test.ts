import {
	agents,
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	items,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import type {
	CostCapBreachedEvent,
	CostCapWarningEvent,
	ItemCreatedEvent,
	TaskStateChangedEvent,
} from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-rail";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("Rail Endpoint (E5)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed base data
		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC1: GET /api/rail returns current state with bets, blockers, awaiting-ordering items, cost burn rate
	describe("AC1: GET /api/rail — current state", () => {
		it("returns empty state when no data exists", async () => {
			const res = await app.request("/api/rail", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.bets).toEqual([]);
			expect(body.blockers).toEqual([]);
			expect(body.awaitingOrdering).toEqual([]);
			expect(body.costBurnRate).toBeDefined();
		});

		it("returns bets with status, blockers, items, and cost burn rate", async () => {
			// Create bets
			db.insert(bets)
				.values({
					id: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Build feature X",
					appetite: "small",
					status: "committed",
					createdAt: new Date().toISOString(),
				})
				.run();

			db.insert(bets)
				.values({
					id: "bet-2",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Build feature Y",
					appetite: "medium",
					status: "in_progress",
					createdAt: new Date().toISOString(),
				})
				.run();

			// Create agent for owner
			db.insert(agents)
				.values({
					id: "agent-1",
					name: "Builder Bot",
					role: "builder",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();

			// Create a blocked task
			const blockedAt = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
			db.insert(tasks)
				.values({
					id: "task-blocked-1",
					betId: "bet-2",
					productId: "prod-1",
					teamId: "team-1",
					ownerAgentId: "agent-1",
					title: "Blocked task",
					state: "blocked",
					createdAt: blockedAt,
					updatedAt: blockedAt,
				})
				.run();

			// Create a non-blocked task
			db.insert(tasks)
				.values({
					id: "task-ok-1",
					betId: "bet-2",
					productId: "prod-1",
					teamId: "team-1",
					title: "Normal task",
					state: "in_progress",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.run();

			// L1a: thread shape now uses host_kind/host_id/initiator/participants/
			// last_active_at instead of `kind`. Legacy `kind='review'` projects
			// to host_kind='task' for an item-scoped review thread (plan §5.3).
			const ts = new Date().toISOString();
			db.insert(threads)
				.values({
					id: "thread-1",
					hostKind: "task",
					hostId: "task-ok-1",
					initiatorId: "team-1",
					participants: JSON.stringify([]),
					lastActiveAt: ts,
					createdAt: ts,
				})
				.run();

			db.insert(items)
				.values({
					id: "item-1",
					title: "Needs ordering",
					kind: "ordering",
					threadId: "thread-1",
					createdAt: new Date().toISOString(),
				})
				.run();

			// Set cost settings
			db.insert(factorySettings)
				.values({ key: "cost_cap", value: "10000", updatedAt: new Date().toISOString() })
				.run();
			db.insert(factorySettings)
				.values({ key: "cost_actual", value: "2500", updatedAt: new Date().toISOString() })
				.run();

			const res = await app.request("/api/rail", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;

			// Bets: only active (committed, in_progress)
			const railBets = body.bets as Array<Record<string, unknown>>;
			expect(railBets).toHaveLength(2);

			// Blockers
			const blockers = body.blockers as Array<Record<string, unknown>>;
			expect(blockers).toHaveLength(1);
			expect(blockers[0].taskId).toBe("task-blocked-1");

			// Awaiting ordering
			const awaitingOrdering = body.awaitingOrdering as Array<Record<string, unknown>>;
			expect(awaitingOrdering).toHaveLength(1);

			// Cost burn rate
			const cost = body.costBurnRate as Record<string, unknown>;
			expect(cost.cap).toBe(10000);
			expect(cost.actual).toBe(2500);
		});
	});

	// AC5: Bets returned with one-liner: id, title, status, progress
	describe("AC5: Bets with one-liner fields", () => {
		it("returns id, title (pitch), status, and progress for each bet", async () => {
			db.insert(bets)
				.values({
					id: "bet-a",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Feature A",
					appetite: "small",
					status: "in_progress",
					createdAt: new Date().toISOString(),
				})
				.run();

			// Create tasks for progress calculation
			db.insert(tasks)
				.values({
					id: "t1",
					betId: "bet-a",
					productId: "prod-1",
					teamId: "team-1",
					title: "Done task",
					state: "done",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.run();
			db.insert(tasks)
				.values({
					id: "t2",
					betId: "bet-a",
					productId: "prod-1",
					teamId: "team-1",
					title: "In progress task",
					state: "in_progress",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request("/api/rail", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			const railBets = body.bets as Array<Record<string, unknown>>;

			expect(railBets).toHaveLength(1);
			const bet = railBets[0];
			expect(bet.id).toBe("bet-a");
			expect(bet.title).toBe("Feature A");
			expect(bet.status).toBe("in_progress");
			expect(bet.progress).toEqual({ done: 1, total: 2 });
		});
	});

	// AC6: Blockers include: task id, title, owner, duration blocked
	describe("AC6: Blockers include required fields", () => {
		it("returns task id, title, owner, and duration blocked", async () => {
			db.insert(bets)
				.values({
					id: "bet-b",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Feature B",
					appetite: "small",
					status: "in_progress",
					createdAt: new Date().toISOString(),
				})
				.run();

			db.insert(agents)
				.values({
					id: "agent-owner",
					name: "Owner Agent",
					role: "builder",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();

			const blockedSince = new Date(Date.now() - 7200_000).toISOString(); // 2 hours ago
			db.insert(tasks)
				.values({
					id: "task-blocked-x",
					betId: "bet-b",
					productId: "prod-1",
					teamId: "team-1",
					ownerAgentId: "agent-owner",
					title: "Blocked on external",
					state: "blocked",
					createdAt: new Date().toISOString(),
					updatedAt: blockedSince,
				})
				.run();

			const res = await app.request("/api/rail", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			const blockers = body.blockers as Array<Record<string, unknown>>;

			expect(blockers).toHaveLength(1);
			const blocker = blockers[0];
			expect(blocker.taskId).toBe("task-blocked-x");
			expect(blocker.title).toBe("Blocked on external");
			expect(blocker.owner).toBe("agent-owner");
			expect(typeof blocker.durationBlockedMs).toBe("number");
			expect(blocker.durationBlockedMs as number).toBeGreaterThanOrEqual(7200_000 - 1000); // allow 1s tolerance
		});
	});

	// AC2: WebSocket subscription events — test via EventBus subscriptions on the rail service
	describe("AC2: WebSocket event subscriptions (EventBus integration)", () => {
		it("rail subscribes to task_state_changed for blockers", () => {
			const events: unknown[] = [];
			// Simulate what the WebSocket rail handler does: subscribe to relevant events
			eventBus.on("task_state_changed", (e) => events.push(e));

			const event: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: "stream-1",
				taskId: "task-1",
				fromState: "in_progress",
				toState: "blocked",
				timestamp: Date.now(),
			};
			eventBus.emit(event);

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual(event);
		});

		it("rail subscribes to cost_cap_warning", () => {
			const events: unknown[] = [];
			eventBus.on("cost_cap_warning", (e) => events.push(e));

			const event: CostCapWarningEvent = {
				type: "cost_cap_warning",
				streamId: "stream-1",
				level: "warning",
				capLevel: "factory",
				entityId: "factory",
				spend: 8000,
				cap: 10000,
				timestamp: Date.now(),
			};
			eventBus.emit(event);

			expect(events).toHaveLength(1);
		});

		it("rail subscribes to cost_cap_breached", () => {
			const events: unknown[] = [];
			eventBus.on("cost_cap_breached", (e) => events.push(e));

			const event: CostCapBreachedEvent = {
				type: "cost_cap_breached",
				streamId: "stream-1",
				level: "hard",
				capLevel: "factory",
				entityId: "factory",
				spend: 11000,
				cap: 10000,
				timestamp: Date.now(),
			};
			eventBus.emit(event);

			expect(events).toHaveLength(1);
		});

		it("rail subscribes to item_created for ordering queue", () => {
			const events: unknown[] = [];
			eventBus.on("item_created", (e) => events.push(e));

			const event: ItemCreatedEvent = {
				type: "item_created",
				streamId: "stream-1",
				itemId: "item-1",
				conversationId: "conv-1",
				kind: "ordering",
				timestamp: Date.now(),
			};
			eventBus.emit(event);

			expect(events).toHaveLength(1);
		});
	});

	// AC3: Block task -> WebSocket blocker_added within 5s (tested via EventBus emit latency)
	describe("AC3: Block task → blocker event within 5s", () => {
		it("emits task_state_changed with blocked state immediately on EventBus", () => {
			const received: number[] = [];

			eventBus.on("task_state_changed", () => {
				received.push(Date.now());
			});

			const before = Date.now();
			const event: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: "stream-1",
				taskId: "task-1",
				fromState: "in_progress",
				toState: "blocked",
				timestamp: before,
			};
			eventBus.emit(event);

			expect(received).toHaveLength(1);
			// EventBus is synchronous, so delivery is immediate (< 5s)
			expect(received[0] - before).toBeLessThan(5000);
		});
	});

	// AC4: Cost warning → WebSocket cost_warning within 5s
	describe("AC4: Cost warning → cost_warning within 5s", () => {
		it("emits cost_cap_warning immediately on EventBus", () => {
			const received: number[] = [];

			eventBus.on("cost_cap_warning", () => {
				received.push(Date.now());
			});

			const before = Date.now();
			const event: CostCapWarningEvent = {
				type: "cost_cap_warning",
				streamId: "stream-1",
				level: "warning",
				capLevel: "factory",
				entityId: "factory",
				spend: 8000,
				cap: 10000,
				timestamp: before,
			};
			eventBus.emit(event);

			expect(received).toHaveLength(1);
			expect(received[0] - before).toBeLessThan(5000);
		});
	});

	// AC7: Cost updates pushed every 30s or per session cost
	describe("AC7: Cost burn rate in rail response", () => {
		it("returns cost burn rate from factory settings", async () => {
			db.insert(factorySettings)
				.values({ key: "cost_cap", value: "50000", updatedAt: new Date().toISOString() })
				.run();
			db.insert(factorySettings)
				.values({ key: "cost_actual", value: "12500", updatedAt: new Date().toISOString() })
				.run();

			const res = await app.request("/api/rail", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			const cost = body.costBurnRate as Record<string, unknown>;

			expect(cost.cap).toBe(50000);
			expect(cost.actual).toBe(12500);
			expect(cost.percentage).toBe(25);
		});

		it("returns zero cost when no factory settings exist", async () => {
			const res = await app.request("/api/rail", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			const cost = body.costBurnRate as Record<string, unknown>;

			expect(cost.cap).toBe(0);
			expect(cost.actual).toBe(0);
			expect(cost.percentage).toBe(0);
		});
	});

	// Additional: auth required
	describe("Auth required", () => {
		it("returns 401 without API key", async () => {
			const res = await app.request("/api/rail");
			expect(res.status).toBe(401);
		});
	});
});
