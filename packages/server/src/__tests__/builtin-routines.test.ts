import {
	agents,
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	items,
	knowledgeItems,
	knowledgeStrategyFabric,
	products,
	routines,
	teams,
} from "@hyperidle/db";
import {
	type BetStateChangedEvent,
	type CostCapBreachedEvent,
	type CostCapWarningEvent,
	type DomainEvent,
	EventBus,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	BUILTIN_ROUTINE_IDS,
	clearBuiltinCostSentinelCache,
	registerBuiltinRoutineHandlers,
	runBuiltinRoutine,
	seedBuiltinRoutines,
} from "../services/builtin-routines.js";

const NOW_ISO = "2026-04-18T10:00:00.000Z";

/** Seed the owner agents the G4 builtins reference. */
function seedOwners(db: HyperIdleDb): void {
	db.insert(products)
		.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: NOW_ISO })
		.run();
	db.insert(teams)
		.values({
			id: "team-1",
			productId: "prod-1",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW_ISO,
		})
		.run();
	db.insert(agents)
		.values({
			id: "seed-agent-cos",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW_ISO,
		})
		.run();
	db.insert(agents)
		.values({
			id: "seed-agent-pf-facilitation",
			name: "Facilitation Practice Facilitator",
			role: "practice_facilitator",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW_ISO,
		})
		.run();
	db.insert(agents)
		.values({
			id: "seed-agent-pm-nimmly",
			name: "Nimmly Product Manager",
			role: "product_manager",
			status: "active",
			maxConcurrentSessions: 1,
			teamId: "team-1",
			createdAt: NOW_ISO,
		})
		.run();
}

describe("G4: Built-in Routines", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let emitted: DomainEvent[];

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		emitted = [];
		eventBus.on("*", (e: DomainEvent) => emitted.push(e));
		seedOwners(db);
		clearBuiltinCostSentinelCache();
	});

	afterEach(() => {
		clearBuiltinCostSentinelCache();
	});

	// ------------------------------------------------------------------
	// AC6: all 5 builtins created by seedBuiltinRoutines with correct config
	// ------------------------------------------------------------------
	describe("AC6: seedBuiltinRoutines creates all 5 with correct config", () => {
		it("inserts every builtin routine id with correct trigger_type and trigger_config", () => {
			seedBuiltinRoutines(db);

			const rows = db
				.select()
				.from(routines)
				.all()
				.sort((a, b) => a.id.localeCompare(b.id));

			const byId = new Map(rows.map((r) => [r.id, r]));

			expect(byId.get("builtin:cost-sentinel")?.triggerType).toBe("heartbeat");
			expect(JSON.parse(byId.get("builtin:cost-sentinel")?.triggerConfig ?? "{}")).toEqual({
				intervalSeconds: 900,
			});

			expect(byId.get("builtin:practice-meeting")?.triggerType).toBe("calendar");
			expect(JSON.parse(byId.get("builtin:practice-meeting")?.triggerConfig ?? "{}")).toEqual({
				cron: "0 10 * * MON",
			});

			expect(byId.get("builtin:post-bet-retro")?.triggerType).toBe("event");
			expect(JSON.parse(byId.get("builtin:post-bet-retro")?.triggerConfig ?? "{}")).toEqual({
				eventType: "bet_state_changed",
			});

			expect(byId.get("builtin:portfolio-retro")?.triggerType).toBe("calendar");
			expect(JSON.parse(byId.get("builtin:portfolio-retro")?.triggerConfig ?? "{}")).toEqual({
				cron: "0 10 1-7 * MON",
			});

			expect(byId.get("builtin:knowledge-decay")?.triggerType).toBe("calendar");
			expect(JSON.parse(byId.get("builtin:knowledge-decay")?.triggerConfig ?? "{}")).toEqual({
				cron: "0 2 * * *",
			});
		});

		it("assigns correct owner agent for each builtin", () => {
			seedBuiltinRoutines(db);
			const rows = db.select().from(routines).all();
			const byId = new Map(rows.map((r) => [r.id, r]));
			expect(byId.get("builtin:cost-sentinel")?.ownerAgentId).toBe("seed-agent-cos");
			expect(byId.get("builtin:practice-meeting")?.ownerAgentId).toBe("seed-agent-pf-facilitation");
			expect(byId.get("builtin:post-bet-retro")?.ownerAgentId).toBe("seed-agent-pm-nimmly");
			expect(byId.get("builtin:portfolio-retro")?.ownerAgentId).toBe("seed-agent-cos");
			expect(byId.get("builtin:knowledge-decay")?.ownerAgentId).toBe("seed-agent-cos");
		});

		it("sets all builtins active=1 by default", () => {
			seedBuiltinRoutines(db);
			const rows = db.select().from(routines).all();
			expect(rows).toHaveLength(BUILTIN_ROUTINE_IDS.length);
			for (const r of rows) {
				expect(r.active, `${r.id} active`).toBe(1);
			}
		});

		it("is idempotent: running twice produces no duplicate rows and no error", () => {
			seedBuiltinRoutines(db);
			expect(() => seedBuiltinRoutines(db)).not.toThrow();
			const rows = db.select().from(routines).all();
			expect(rows).toHaveLength(BUILTIN_ROUTINE_IDS.length);
		});

		it("exports exactly 5 stable builtin ids (none crypto.randomUUID)", () => {
			expect(BUILTIN_ROUTINE_IDS).toHaveLength(5);
			for (const id of BUILTIN_ROUTINE_IDS) {
				expect(id.startsWith("builtin:")).toBe(true);
			}
		});
	});

	// ------------------------------------------------------------------
	// AC1: Cost Sentinel — 15-min heartbeat, warning @ 80%, breach @ 100%
	// ------------------------------------------------------------------
	describe("AC1: Cost Sentinel", () => {
		function setFactoryCost(db: HyperIdleDb, cap: number, actual: number): void {
			db.insert(factorySettings)
				.values({ key: "cost_cap", value: String(cap), updatedAt: NOW_ISO })
				.onConflictDoNothing()
				.run();
			db.insert(factorySettings)
				.values({ key: "cost_actual", value: String(actual), updatedAt: NOW_ISO })
				.onConflictDoNothing()
				.run();
			db.update(factorySettings)
				.set({ value: String(cap) })
				.where(eq(factorySettings.key, "cost_cap"))
				.run();
			db.update(factorySettings)
				.set({ value: String(actual) })
				.where(eq(factorySettings.key, "cost_actual"))
				.run();
		}

		it("emits no events when spend is below 80% of cap", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 500);

			const result = await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			expect(result.fired).toBe(true);
			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			const breaches = emitted.filter((e) => e.type === "cost_cap_breached");
			expect(warnings).toHaveLength(0);
			expect(breaches).toHaveLength(0);
		});

		it("emits cost_cap_warning when spend reaches 80% of cap", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 800);

			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			const warnings = emitted.filter(
				(e): e is CostCapWarningEvent => e.type === "cost_cap_warning",
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0].capLevel).toBe("factory");
			expect(warnings[0].spend).toBe(800);
			expect(warnings[0].cap).toBe(1000);
		});

		it("emits cost_cap_breached when spend reaches 100% of cap", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 1000);

			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			const breaches = emitted.filter(
				(e): e is CostCapBreachedEvent => e.type === "cost_cap_breached",
			);
			expect(breaches).toHaveLength(1);
			expect(breaches[0].level).toBe("hard");
			expect(breaches[0].spend).toBe(1000);
			expect(breaches[0].cap).toBe(1000);
		});

		it("uses the 15-minute interval (900 seconds) from trigger config", () => {
			seedBuiltinRoutines(db);
			const row = db.select().from(routines).where(eq(routines.id, "builtin:cost-sentinel")).get();
			expect(row?.triggerType).toBe("heartbeat");
			const cfg = JSON.parse(row?.triggerConfig ?? "{}") as { intervalSeconds?: number };
			expect(cfg.intervalSeconds).toBe(900);
		});

		// --- G4 review MAJOR-4: level-based dedupe semantics ---
		it("does not re-emit cost_cap_warning on consecutive ticks while still in warning level", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 800);

			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			expect(warnings).toHaveLength(1);
		});

		it("does not re-emit cost_cap_breached on consecutive ticks while still in breach level", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 1200);

			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			const breaches = emitted.filter((e) => e.type === "cost_cap_breached");
			expect(breaches).toHaveLength(1);
		});

		it("re-emits cost_cap_warning after level transitions warning -> ok -> warning", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 800);
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			// Drop below 80% — level transitions to 'ok' (silent reset).
			setFactoryCost(db, 1000, 500);
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			// Climb back up — this is a new transition and must re-emit.
			setFactoryCost(db, 1000, 850);
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			expect(warnings).toHaveLength(2);
		});

		it("escalates from warning to breach on the transition tick", async () => {
			seedBuiltinRoutines(db);
			setFactoryCost(db, 1000, 800);
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			setFactoryCost(db, 1000, 1100);
			await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");

			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			const breaches = emitted.filter((e) => e.type === "cost_cap_breached");
			expect(warnings).toHaveLength(1);
			expect(breaches).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------
	// AC2: Practice Meeting — weekly, creates reflection anchor
	// ------------------------------------------------------------------
	describe("AC2: Practice Meeting", () => {
		it("creates a fresh practice meeting anchor row on each run", async () => {
			seedBuiltinRoutines(db);

			const result = await runBuiltinRoutine(db, eventBus, "builtin:practice-meeting");

			expect(result.fired).toBe(true);
			const anchors = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.topic, "practice_meeting"))
				.all();
			expect(anchors.length).toBeGreaterThanOrEqual(1);
			const anchor = anchors[0];
			expect(anchor.status).toBe("captured");
			// @lore O2: layer/kind/meta are in knowledgeStrategyFabric
			const anchorFabric = db
				.select()
				.from(knowledgeStrategyFabric)
				.where(eq(knowledgeStrategyFabric.knowledgeItemId, anchor.id))
				.get();
			expect(anchorFabric?.layer).toBe("L2");
			expect(anchorFabric?.kind).toBe("reflection");
			expect(anchorFabric?.meta).toBeTruthy();
			const meta = JSON.parse(anchorFabric?.meta ?? "{}") as { role?: string };
			expect(meta.role).toBe("practice_meeting_anchor");
		});
	});

	// ------------------------------------------------------------------
	// AC3: Post-Bet Retro — compares hypothesis vs reality for shipped bet
	// ------------------------------------------------------------------
	describe("AC3: Post-Bet Retro", () => {
		function seedShippedBet(): void {
			db.insert(bets)
				.values({
					id: "bet-shipped-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Ship onboarding flow",
					appetite: "small",
					hypothesis: "Users will complete onboarding in <3 minutes.",
					status: "shipped",
					revisionLog: JSON.stringify([{ field: "status", to: "shipped" }]),
					createdAt: NOW_ISO,
					shippedAt: NOW_ISO,
				})
				.run();
		}

		it("creates a review items row citing both hypothesis and reality", async () => {
			seedBuiltinRoutines(db);
			seedShippedBet();

			const result = await runBuiltinRoutine(db, eventBus, "builtin:post-bet-retro", {
				betId: "bet-shipped-1",
			});

			expect(result.fired).toBe(true);

			const reviewRows = db.select().from(items).all();
			expect(reviewRows).toHaveLength(1);
			const row = reviewRows[0];
			expect(row.kind).toBe("review");
			expect(row.title).toContain("Post-bet retro");
			expect(row.body ?? "").toContain("Users will complete onboarding in <3 minutes.");
			expect((row.body ?? "").toLowerCase()).toContain("reality");
		});

		it("emits an item_created event", async () => {
			seedBuiltinRoutines(db);
			seedShippedBet();

			await runBuiltinRoutine(db, eventBus, "builtin:post-bet-retro", {
				betId: "bet-shipped-1",
			});

			const itemEvents = emitted.filter((e) => e.type === "item_created");
			expect(itemEvents).toHaveLength(1);
		});

		it("fires on bet_state_changed(toState=shipped) event when handler is registered", async () => {
			seedBuiltinRoutines(db);
			seedShippedBet();

			const unsub = registerBuiltinRoutineHandlers(db, eventBus);
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-shipped-1",
					betId: "bet-shipped-1",
					fromState: "review",
					toState: "shipped",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = db.select().from(items).all();
				expect(reviewRows).toHaveLength(1);
				expect(reviewRows[0].kind).toBe("review");
			} finally {
				unsub();
			}
		});

		// --- G4 review WARN-3: dedupe by betId ---
		it("does not create a second review when the same bet ships twice (G4 WARN-3)", async () => {
			seedBuiltinRoutines(db);
			seedShippedBet();

			const first = await runBuiltinRoutine(db, eventBus, "builtin:post-bet-retro", {
				betId: "bet-shipped-1",
			});
			expect(first.fired).toBe(true);

			const second = await runBuiltinRoutine(db, eventBus, "builtin:post-bet-retro", {
				betId: "bet-shipped-1",
			});
			expect(second.fired).toBe(false);
			if (!second.fired) {
				expect(second.reason).toBe("already-retroed");
			}

			const reviewRows = db.select().from(items).all();
			expect(reviewRows).toHaveLength(1);
		});

		it("dedupes across consecutive bet_state_changed(toState=shipped) events for same betId", async () => {
			seedBuiltinRoutines(db);
			seedShippedBet();

			const unsub = registerBuiltinRoutineHandlers(db, eventBus);
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-shipped-1",
					betId: "bet-shipped-1",
					fromState: "review",
					toState: "shipped",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = db.select().from(items).all();
				expect(reviewRows).toHaveLength(1);
			} finally {
				unsub();
			}
		});

		it("does NOT fire on non-shipped bet_state_changed transitions", async () => {
			seedBuiltinRoutines(db);
			seedShippedBet();

			const unsub = registerBuiltinRoutineHandlers(db, eventBus);
			try {
				// Emit a non-shipped transition — should be ignored
				const nonShipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-shipped-1",
					betId: "bet-shipped-1",
					fromState: "shaped",
					toState: "committed",
					timestamp: Date.now(),
				};
				eventBus.emit(nonShipped);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = db.select().from(items).all();
				expect(reviewRows).toHaveLength(0);
			} finally {
				unsub();
			}
		});
	});

	// ------------------------------------------------------------------
	// AC4: Portfolio Retro — aggregates L3/L4 knowledge across last month
	// ------------------------------------------------------------------
	describe("AC4: Portfolio Retro", () => {
		it("summarizes cross-product L3/L4 items updated within the last month", async () => {
			seedBuiltinRoutines(db);

			const recentIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
			const staleIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

			// @lore O2: split kernel (knowledgeItems) from strategy (knowledgeStrategyFabric)
			db.insert(knowledgeItems)
				.values({
					id: "ki-recent-l3",
					title: "Recent L3 pattern",
					body: "…",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent:test",
					createdAt: recentIso,
					updatedAt: recentIso,
				})
				.run();
			db.insert(knowledgeStrategyFabric)
				.values({
					id: "ksf-ki-recent-l3",
					knowledgeItemId: "ki-recent-l3",
					layer: "L3",
					kind: "pattern",
				})
				.run();
			db.insert(knowledgeItems)
				.values({
					id: "ki-recent-l4",
					title: "Recent L4 principle",
					body: "…",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent:test",
					createdAt: recentIso,
					updatedAt: recentIso,
				})
				.run();
			db.insert(knowledgeStrategyFabric)
				.values({
					id: "ksf-ki-recent-l4",
					knowledgeItemId: "ki-recent-l4",
					layer: "L4",
					kind: "principle",
				})
				.run();
			db.insert(knowledgeItems)
				.values({
					id: "ki-stale-l3",
					title: "Stale L3 pattern",
					body: "…",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent:test",
					createdAt: staleIso,
					updatedAt: staleIso,
				})
				.run();
			db.insert(knowledgeStrategyFabric)
				.values({
					id: "ksf-ki-stale-l3",
					knowledgeItemId: "ki-stale-l3",
					layer: "L3",
					kind: "pattern",
				})
				.run();

			const result = await runBuiltinRoutine(db, eventBus, "builtin:portfolio-retro");
			expect(result.fired).toBe(true);

			const reviewRows = db.select().from(items).all();
			expect(reviewRows).toHaveLength(1);
			const body = reviewRows[0].body ?? "";
			expect(body).toContain("Recent L3 pattern");
			expect(body).toContain("Recent L4 principle");
			expect(body).not.toContain("Stale L3 pattern");
		});
	});

	// ------------------------------------------------------------------
	// AC5: Knowledge Decay — transitions active items unused >90d to stale
	// ------------------------------------------------------------------
	describe("AC5: Knowledge Decay", () => {
		it("marks active items older than 90 days as stale", async () => {
			seedBuiltinRoutines(db);

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-old",
					layer: "L3",
					kind: "pattern",
					title: "Old pattern",
					body: "old",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent:test",
					createdAt: longAgo,
					updatedAt: longAgo,
				})
				.run();

			const result = await runBuiltinRoutine(db, eventBus, "builtin:knowledge-decay");
			expect(result.fired).toBe(true);

			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-old")).get();
			expect(row?.status).toBe("stale");
		});

		// --- G4 review MAJOR-5: honor `silent` column ---
		it("suppresses knowledge_updated events when routine.silent=1 (G4 MAJOR-5)", async () => {
			seedBuiltinRoutines(db);
			// builtin:knowledge-decay is seeded silent=1 by default. Verify.
			const row = db
				.select()
				.from(routines)
				.where(eq(routines.id, "builtin:knowledge-decay"))
				.get();
			expect(row?.silent).toBe(1);

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			for (let i = 0; i < 3; i++) {
				db.insert(knowledgeItems)
					.values({
						id: `ki-silent-${i}`,
						layer: "L3",
						kind: "pattern",
						title: `Old pattern ${i}`,
						body: "old",
						format: "markdown",
						status: "active",
						version: 1,
						updatedBy: "agent:test",
						createdAt: longAgo,
						updatedAt: longAgo,
					})
					.run();
			}

			await runBuiltinRoutine(db, eventBus, "builtin:knowledge-decay");

			// DB writes still happen — verify the transitions succeeded.
			const markedStale = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.status, "stale"))
				.all();
			expect(markedStale.length).toBe(3);

			// But the bus was not notified.
			const events = emitted.filter((e) => e.type === "knowledge_updated");
			expect(events).toHaveLength(0);
		});

		it("emits knowledge_updated events when routine.silent=0", async () => {
			seedBuiltinRoutines(db);
			// Flip silent off for this test.
			db.update(routines)
				.set({ silent: 0 })
				.where(eq(routines.id, "builtin:knowledge-decay"))
				.run();

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-noisy",
					layer: "L3",
					kind: "pattern",
					title: "Old pattern",
					body: "old",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent:test",
					createdAt: longAgo,
					updatedAt: longAgo,
				})
				.run();

			await runBuiltinRoutine(db, eventBus, "builtin:knowledge-decay");

			const events = emitted.filter((e) => e.type === "knowledge_updated");
			expect(events).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------
	// AC8: Disabled routine (active=0) short-circuits execution
	// ------------------------------------------------------------------
	describe("AC8: Disabled routine prevents firing", () => {
		it("runBuiltinRoutine returns fired=false when routine active=0", async () => {
			seedBuiltinRoutines(db);
			db.update(routines).set({ active: 0 }).where(eq(routines.id, "builtin:cost-sentinel")).run();

			const result = await runBuiltinRoutine(db, eventBus, "builtin:cost-sentinel");
			expect(result.fired).toBe(false);
			expect(result.reason).toContain("disabled");
		});

		it("event handler does not run when event routine active=0", async () => {
			seedBuiltinRoutines(db);
			db.update(routines).set({ active: 0 }).where(eq(routines.id, "builtin:post-bet-retro")).run();
			db.insert(bets)
				.values({
					id: "bet-inactive-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Ship X",
					appetite: "small",
					hypothesis: "Will work",
					status: "shipped",
					createdAt: NOW_ISO,
				})
				.run();

			const unsub = registerBuiltinRoutineHandlers(db, eventBus);
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-inactive-1",
					betId: "bet-inactive-1",
					fromState: "review",
					toState: "shipped",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = db.select().from(items).all();
				expect(reviewRows).toHaveLength(0);
			} finally {
				unsub();
			}
		});
	});
});
