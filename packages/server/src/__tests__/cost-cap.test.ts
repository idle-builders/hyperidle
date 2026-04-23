import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { type CostCapBreachedEvent, type CostCapWarningEvent, EventBus } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	checkCostCap,
	clearDeduplicationCache,
	recordCostAndCheck,
	resetCosts,
} from "../services/cost-cap.js";

const NOW = new Date().toISOString();

function seedBase(db: HyperIdleDb): void {
	db.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW })
		.run();

	db.insert(teams)
		.values({
			id: "t1",
			productId: "p1",
			capacity: 5,
			activeBets: 0,
			costCap: 5000, // $50 in cents
			costActual: 0,
			formedAt: NOW,
		})
		.run();

	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test bet",
			appetite: "small",
			status: "committed",
			createdAt: NOW,
		})
		.run();

	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: "Test task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();

	db.insert(agents)
		.values({
			id: "agent-1",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			teamId: "t1",
			maxConcurrentSessions: 2,
			costCap: 1000, // $10 in cents
			costActual: 0,
			createdAt: NOW,
		})
		.run();

	db.insert(threads)
		.values({
			id: "thread-1",
			kind: "review",
			createdAt: NOW,
		})
		.run();
}

function insertSession(
	db: HyperIdleDb,
	id: string,
	agentId: string,
	cost: number,
	state = "done" as string,
): void {
	db.insert(sessions)
		.values({
			id,
			taskId: "task-1",
			agentId,
			modelTier: "workhorse",
			startedAt: NOW,
			state,
			cost,
		})
		.run();
}

describe("Cost Cap Enforcement", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		clearDeduplicationCache();
		seedBase(db);
	});

	// AC1: Agent cap $10 -> after $10 spent, checkCostCap returns { allowed: false, level: 'agent' }
	describe("AC1: Agent cap enforcement", () => {
		it("allows session when agent spend is under cap", async () => {
			insertSession(db, "s1", "agent-1", 500); // $5

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});

			expect(result.allowed).toBe(true);
		});

		it("blocks session when agent spend reaches cap", async () => {
			insertSession(db, "s1", "agent-1", 1000); // $10 = cap

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});

			expect(result).toEqual({
				allowed: false,
				level: "agent",
				currentSpend: 1000,
				cap: 1000,
			});
		});

		it("blocks session when agent spend exceeds cap", async () => {
			insertSession(db, "s1", "agent-1", 1200); // $12 > $10

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});

			expect(result.allowed).toBe(false);
			expect(result.level).toBe("agent");
		});

		it("allows session when agent has no cost cap", async () => {
			// Create agent without cost cap
			db.insert(agents)
				.values({
					id: "agent-nocap",
					name: "No Cap Agent",
					role: "builder",
					status: "active",
					teamId: "t1",
					maxConcurrentSessions: 1,
					createdAt: NOW,
				})
				.run();

			// Spend well above agent level but below team cap ($50)
			insertSession(db, "s1", "agent-nocap", 4000);

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-nocap",
				teamId: "t1",
			});

			// Allowed because agent has no cap, and team spend (4000) < team cap (5000)
			expect(result.allowed).toBe(true);
		});
	});

	// AC2: Team cap $50 -> team total at $50 blocks new sessions even if agent has budget
	describe("AC2: Team cap enforcement", () => {
		it("blocks session when team total reaches cap even if agent has budget", async () => {
			// Add another agent to team
			db.insert(agents)
				.values({
					id: "agent-2",
					name: "Agent 2",
					role: "builder",
					status: "active",
					teamId: "t1",
					maxConcurrentSessions: 1,
					costCap: 1000,
					costActual: 0,
					createdAt: NOW,
				})
				.run();

			// agent-2 spent $45, agent-1 spent $5 = team total $50 = team cap
			insertSession(db, "s1", "agent-2", 4500);
			insertSession(db, "s2", "agent-1", 500);

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});

			expect(result).toEqual({
				allowed: false,
				level: "team",
				currentSpend: 5000,
				cap: 5000,
			});
		});
	});

	// AC3: Factory cap $200 -> no agent can start session when hit
	describe("AC3: Factory cap enforcement", () => {
		it("blocks session when factory cap is reached", async () => {
			insertSession(db, "s1", "agent-1", 900); // agent under cap

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
				factoryCap: 20000, // $200
				factorySpend: 20000, // already at $200
			});

			expect(result).toEqual({
				allowed: false,
				level: "factory",
				currentSpend: 20000,
				cap: 20000,
			});
		});
	});

	// AC4: Breach emits cost_cap_breached event with level and spend
	describe("AC4: Breach events", () => {
		it("emits cost_cap_breached event when agent cap is breached", async () => {
			const events: CostCapBreachedEvent[] = [];
			eventBus.on("cost_cap_breached", (e) => events.push(e));

			// Previous session spent 800
			insertSession(db, "s-prev", "agent-1", 800);
			// Current session starts at 0
			insertSession(db, "s1", "agent-1", 0);

			// Record cost of 200 on current session -> total agent spend = 800 + 200 = 1000
			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 200,
				agentId: "agent-1",
				teamId: "t1",
			});

			expect(events).toHaveLength(1);
			expect(events[0].capLevel).toBe("agent");
			expect(events[0].spend).toBe(1000);
			expect(events[0].cap).toBe(1000);
			expect(events[0].entityId).toBe("agent-1");
		});

		it("emits cost_cap_breached event when team cap is breached", async () => {
			const events: CostCapBreachedEvent[] = [];
			eventBus.on("cost_cap_breached", (e) => events.push(e));

			// Team at 4800, add 200 to reach 5000 (team cap)
			db.insert(agents)
				.values({
					id: "agent-2",
					name: "Agent 2",
					role: "builder",
					status: "active",
					teamId: "t1",
					maxConcurrentSessions: 1,
					costCap: 5000, // high agent cap
					createdAt: NOW,
				})
				.run();
			insertSession(db, "s-big", "agent-2", 4800);
			insertSession(db, "s1", "agent-1", 0);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 200,
				agentId: "agent-1",
				teamId: "t1",
			});

			// Should have team breach
			const teamEvents = events.filter((e) => e.capLevel === "team");
			expect(teamEvents).toHaveLength(1);
			expect(teamEvents[0].spend).toBe(5000);
			expect(teamEvents[0].cap).toBe(5000);
		});
	});

	// AC5: Warning at 80%: factory cap $200, spend $160 -> cost_cap_warning emits
	describe("AC5: Warning at 80%", () => {
		it("emits cost_cap_warning when agent spend reaches 80% of cap", async () => {
			const warnings: CostCapWarningEvent[] = [];
			eventBus.on("cost_cap_warning", (e) => warnings.push(e));

			insertSession(db, "s1", "agent-1", 0);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 800, // 800/1000 = 80%
				agentId: "agent-1",
				teamId: "t1",
			});

			expect(warnings).toHaveLength(1);
			expect(warnings[0].capLevel).toBe("agent");
			expect(warnings[0].spend).toBe(800);
			expect(warnings[0].cap).toBe(1000);
		});

		it("emits cost_cap_warning when team spend reaches 80% of cap", async () => {
			const warnings: CostCapWarningEvent[] = [];
			eventBus.on("cost_cap_warning", (e) => warnings.push(e));

			// Agent-2 spent 3800, agent-1 adds 200 = team total 4000 = 80% of 5000
			db.insert(agents)
				.values({
					id: "agent-2",
					name: "Agent 2",
					role: "builder",
					status: "active",
					teamId: "t1",
					maxConcurrentSessions: 1,
					costCap: 5000,
					createdAt: NOW,
				})
				.run();
			insertSession(db, "s-big", "agent-2", 3800);
			insertSession(db, "s1", "agent-1", 0);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 200,
				agentId: "agent-1",
				teamId: "t1",
			});

			const teamWarnings = warnings.filter((e) => e.capLevel === "team");
			expect(teamWarnings).toHaveLength(1);
			expect(teamWarnings[0].spend).toBe(4000);
		});

		it("emits cost_cap_warning for factory at 80%", async () => {
			const warnings: CostCapWarningEvent[] = [];
			eventBus.on("cost_cap_warning", (e) => warnings.push(e));

			insertSession(db, "s1", "agent-1", 0);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 100,
				agentId: "agent-1",
				teamId: "t1",
				factoryCap: 20000, // $200
				factorySpend: 15900, // + 100 = 16000 = 80% of 20000
			});

			const factoryWarnings = warnings.filter((e) => e.capLevel === "factory");
			expect(factoryWarnings).toHaveLength(1);
			expect(factoryWarnings[0].spend).toBe(16000);
			expect(factoryWarnings[0].cap).toBe(20000);
		});
	});

	// AC6: After reset, agents can start sessions again
	describe("AC6: Cost reset", () => {
		it("allows sessions after agent cost reset", async () => {
			insertSession(db, "s1", "agent-1", 1000); // at cap

			// Verify blocked before reset
			const beforeReset = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});
			expect(beforeReset.allowed).toBe(false);

			// Reset agent costs
			await resetCosts(db, { level: "agent", id: "agent-1" });

			// Should be allowed after reset
			const afterReset = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});
			expect(afterReset.allowed).toBe(true);
		});

		it("allows sessions after team cost reset", async () => {
			db.insert(agents)
				.values({
					id: "agent-2",
					name: "Agent 2",
					role: "builder",
					status: "active",
					teamId: "t1",
					maxConcurrentSessions: 1,
					costCap: 5000,
					createdAt: NOW,
				})
				.run();

			insertSession(db, "s1", "agent-2", 5000); // team at cap

			const beforeReset = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});
			expect(beforeReset.allowed).toBe(false);
			expect(beforeReset.level).toBe("team");

			await resetCosts(db, { level: "team", id: "t1" });

			const afterReset = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});
			expect(afterReset.allowed).toBe(true);
		});

		it("resets factory costs", async () => {
			insertSession(db, "s1", "agent-1", 500);

			await resetCosts(db, { level: "factory" });

			// All session costs should be zeroed
			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
				factoryCap: 100, // tiny cap but spend is reset
				factorySpend: 0,
			});
			expect(result.allowed).toBe(true);
		});
	});

	// AC7: In-progress sessions NOT killed (finish naturally)
	describe("AC7: In-progress sessions not killed", () => {
		it("checkCostCap does not modify active sessions", async () => {
			insertSession(db, "s-active", "agent-1", 1000, "active"); // at cap, but active
			insertSession(db, "s-done", "agent-1", 100, "done");

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});

			// Cap is breached, so new sessions blocked
			expect(result.allowed).toBe(false);

			// But the active session is still active (not killed)
			const activeSession = db
				.select()
				.from(sessions)
				.where(and(eq(sessions.id, "s-active"), eq(sessions.state, "active")))
				.get();
			expect(activeSession).toBeDefined();
			expect(activeSession?.state).toBe("active");
		});
	});

	// AC8: Review thread item created on breach
	describe("AC8: Review item on breach", () => {
		it("creates a review item when cost cap is breached", async () => {
			insertSession(db, "s1", "agent-1", 0);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 1000, // hits agent cap
				agentId: "agent-1",
				teamId: "t1",
				reviewThreadId: "thread-1",
			});

			const reviewItems = db.select().from(items).all();
			expect(reviewItems).toHaveLength(1);
			expect(reviewItems[0].title).toContain("Cost cap breached");
			expect(reviewItems[0].threadId).toBe("thread-1");
			expect(reviewItems[0].kind).toBe("cost_cap_breach");
		});
	});

	// AC9: Idempotency: duplicate warnings deduplicated by session_id + event_type
	describe("AC9: Idempotency", () => {
		it("does not emit duplicate warnings for same session", async () => {
			const warnings: CostCapWarningEvent[] = [];
			eventBus.on("cost_cap_warning", (e) => warnings.push(e));

			insertSession(db, "s1", "agent-1", 0);

			// First call at 80%
			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 800,
				agentId: "agent-1",
				teamId: "t1",
			});

			// Second call still at 80%+ (cost goes higher)
			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 850,
				agentId: "agent-1",
				teamId: "t1",
			});

			// Should only get one warning per session+level
			const agentWarnings = warnings.filter(
				(e) => e.capLevel === "agent" && e.entityId === "agent-1",
			);
			expect(agentWarnings).toHaveLength(1);
		});

		it("does not emit duplicate breach events for same session", async () => {
			const breaches: CostCapBreachedEvent[] = [];
			eventBus.on("cost_cap_breached", (e) => breaches.push(e));

			insertSession(db, "s1", "agent-1", 0);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 1000,
				agentId: "agent-1",
				teamId: "t1",
			});

			await recordCostAndCheck(db, eventBus, {
				sessionId: "s1",
				cost: 1100,
				agentId: "agent-1",
				teamId: "t1",
			});

			const agentBreaches = breaches.filter(
				(e) => e.capLevel === "agent" && e.entityId === "agent-1",
			);
			expect(agentBreaches).toHaveLength(1);
		});
	});

	// Edge case: hierarchy check order (agent checked before team before factory)
	describe("Hierarchy ordering", () => {
		it("returns agent level when both agent and team caps are breached", async () => {
			// Both agent ($10) and team ($50) caps breached
			insertSession(db, "s1", "agent-1", 1000); // agent at cap

			// Also make team at cap
			db.insert(agents)
				.values({
					id: "agent-2",
					name: "Agent 2",
					role: "builder",
					status: "active",
					teamId: "t1",
					maxConcurrentSessions: 1,
					costCap: 5000,
					createdAt: NOW,
				})
				.run();
			insertSession(db, "s2", "agent-2", 4000);

			const result = await checkCostCap(db, eventBus, {
				agentId: "agent-1",
				teamId: "t1",
			});

			// Agent cap should be reported first
			expect(result.level).toBe("agent");
		});
	});
});
