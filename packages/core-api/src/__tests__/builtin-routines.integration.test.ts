import {
	bets,
	type HyperIdleDb,
	items,
	knowledgeAppProjection,
	knowledgeItems,
	type Routine,
	routineRuns,
	routines,
	sessions,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { updateServerConfig } from "@hyperidle/settings";
import type {
	BetStateChangedEvent,
	CostCapBreachedEvent,
	CostCapWarningEvent,
	DomainEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { costOps } from "../services/cost-bindings.js";
import { afterEach, beforeEach, describe, expect, test } from "../test-fixtures.js";
import {
	fireStoredRoutine,
	seedTeamRoutines,
	startDispatchEngine,
} from "./dispatch-test-helpers.js";

const NOW_ISO = "2026-04-18T10:00:00.000Z";
const BUILTIN_ROUTINE_IDS = [
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion",
] as const;

// @lore AF17: Per-team routine ids — builtin:<kind>:<teamId>.
// seedTeamRoutines uses this scheme so multiple teams don't collide.
const TEST_TEAM_ID = "prod-1";
const BID = {
	// @lore AU21 Increment 5: practice-meeting is deleted — this id is never
	// seeded by seedBuiltinRoutines anymore. Kept only as a literal id string
	// for the "still doesn't fire" regression test below (a routine row that
	// genuinely does not exist).
	practiceMeeting: `builtin:practice-meeting:${TEST_TEAM_ID}`,
	postBetRetro: `builtin:post-bet-retro:${TEST_TEAM_ID}`,
	portfolioRetro: `builtin:portfolio-retro:${TEST_TEAM_ID}`,
	knowledgeDecay: `builtin:knowledge-decay:${TEST_TEAM_ID}`,
	knowledgePromotion: `builtin:knowledge-promotion:${TEST_TEAM_ID}`,
} as const;

/** Seed the owner agents and provision built-in routines for the test team. */
async function seedOwners(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: TEST_TEAM_ID, name: "Acme", phase: "build", createdAt: NOW_ISO });

	await db.insert(teamMembers).values({
		id: "team-1",
		teamId: TEST_TEAM_ID,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW_ISO,
	});

	await db.insert(users).values({
		id: "seed-agent-cos",
		name: "System Agent",
		role: "assistant",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW_ISO,
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	await db.insert(users).values({
		id: "seed-agent-pf-facilitation",
		name: "Facilitation Facilitator",
		role: "facilitator",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW_ISO,
	});

	await db.insert(users).values({
		id: "demo-agent-pm",
		name: "Acme Product Manager",
		role: "product_manager",
		status: "active",
		maxConcurrentSessions: 1,
		teamId: "team-1",
		createdAt: NOW_ISO,
	});
}

/**
 * @lore AF17: replaces seedBuiltinRoutines(db, teamId).
 * Uses seedTeamRoutines so ids are per-team: `builtin:<kind>:prod-1`.
 */
async function seedBuiltinRoutines(db: HyperIdleDb, teamId = TEST_TEAM_ID): Promise<void> {
	await seedTeamRoutines(db, {
		teamId,
		ownerByRole: {
			facilitator: "seed-agent-pf-facilitation",
			product_manager: "demo-agent-pm",
			assistant: "seed-agent-cos",
		},
		leadAgentId: "seed-agent-cos",
	});
}

describe("G4: Built-in Routines", () => {
	beforeEach(() => {
		costOps._testHooks.resetSentinelState();
	});

	afterEach(() => {
		costOps._testHooks.resetSentinelState();
	});

	// ------------------------------------------------------------------
	// AC6: all 4 builtins created by seedBuiltinRoutines with correct config
	// @lore AD8c: cost-sentinel removed from routines table (now app-level scheduled job)
	// ------------------------------------------------------------------
	describe("AC6: seedBuiltinRoutines creates all 4 with correct config (AD8c)", () => {
		test("inserts every builtin routine id with correct trigger_type and trigger_config (AD8c: 4 routines)", async ({
			db,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);

			const rows = (await db.select().from(routines)).sort((a: Routine, b: Routine) =>
				a.id.localeCompare(b.id),
			);

			const byId = new Map<string, Routine>(
				rows.map((r: Routine) => [r.id, r] as [string, Routine]),
			);

			// @lore AD8c: cost-sentinel is no longer a routine row
			// @lore AF17: per-team ids — no global "builtin:cost-sentinel" row
			expect(rows.some((r: Routine) => r.id.startsWith("builtin:cost-sentinel"))).toBe(false);

			expect(byId.get(BID.postBetRetro)?.triggerType).toBe("event");
			expect(JSON.parse(byId.get(BID.postBetRetro)?.triggerConfig ?? "{}")).toEqual({
				eventType: "bet_state_changed",
			});

			expect(byId.get(BID.portfolioRetro)?.triggerType).toBe("calendar");
			expect(JSON.parse(byId.get(BID.portfolioRetro)?.triggerConfig ?? "{}")).toEqual({
				cron: "0 10 1-7 * MON",
			});

			expect(byId.get(BID.knowledgeDecay)?.triggerType).toBe("calendar");
			expect(JSON.parse(byId.get(BID.knowledgeDecay)?.triggerConfig ?? "{}")).toEqual({
				cron: "0 2 * * *",
			});
		});

		// @lore AD8c: cost-sentinel removed; knowledge-decay owner changed to seed-agent-pf-facilitation
		test("assigns correct owner agent for each builtin (AD8c)", async ({ db }) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			const rows = await db.select().from(routines);
			const byId = new Map<string, Routine>(
				rows.map((r: Routine) => [r.id, r] as [string, Routine]),
			);
			// @lore AD8c: cost-sentinel is no longer seeded as a routine
			// @lore AF17: per-team ids used; no global "builtin:cost-sentinel" row
			expect(rows.some((r: Routine) => r.id.startsWith("builtin:cost-sentinel"))).toBe(false);
			expect(byId.get(BID.postBetRetro)?.ownerAgentId).toBe("demo-agent-pm");
			expect(byId.get(BID.portfolioRetro)?.ownerAgentId).toBe("seed-agent-cos");
			// @lore AD8c: knowledge-decay ownership transferred to facilitator agent
			expect(byId.get(BID.knowledgeDecay)?.ownerAgentId).toBe("seed-agent-pf-facilitation");
		});

		test("sets all builtins active=true by default", async ({ db }) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			const rows = await db.select().from(routines);
			expect(rows).toHaveLength(BUILTIN_ROUTINE_IDS.length);
			for (const r of rows) {
				expect(r.active, `${r.id} active`).toBe(true);
			}
		});

		test("is idempotent: running twice produces no duplicate rows and no error", async ({ db }) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await expect(seedBuiltinRoutines(db)).resolves.not.toThrow();
			const rows = await db.select().from(routines);
			expect(rows).toHaveLength(BUILTIN_ROUTINE_IDS.length);
		});

		// @lore AF9: knowledge-promotion added; AU21 Increment 5 removed
		// practice-meeting — now 4 builtin routine IDs.
		// (AD8c removed cost-sentinel from routines; AF9 added knowledge-promotion;
		// AU21 Increment 5 deleted practice-meeting, no replacement)
		test("exports exactly 4 stable builtin ids (AU21 Increment 5: practice-meeting removed)", () => {
			expect(BUILTIN_ROUTINE_IDS).toHaveLength(4);
			for (const id of BUILTIN_ROUTINE_IDS) {
				expect(id.startsWith("builtin:")).toBe(true);
			}
			// @lore AD8c: cost-sentinel is no longer a builtin routine ID
			expect(BUILTIN_ROUTINE_IDS).not.toContain("builtin:cost-sentinel");
			// @lore AU21 Increment 5: practice-meeting deleted, no replacement
			expect(BUILTIN_ROUTINE_IDS).not.toContain("builtin:practice-meeting");
			// AF9: promotion sweep is a builtin
			expect(BUILTIN_ROUTINE_IDS).toContain("builtin:knowledge-promotion");
		});
	});

	// ------------------------------------------------------------------
	// AU21 §9 Increment 5 (AC #7) — practice-meeting deleted, no replacement.
	// The other four builtins (post-bet-retro, portfolio-retro,
	// knowledge-decay, knowledge-promotion) stay unaffected.
	// ------------------------------------------------------------------
	describe("AU21 Increment 5: practice-meeting removed from the builtin registry", () => {
		test("seeding builtin routines provisions only the 4 surviving kinds — no practice-meeting row", async ({
			db,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);

			const rows = await db.select().from(routines);
			expect(rows.some((r: Routine) => r.id.startsWith("builtin:practice-meeting"))).toBe(false);
			expect(rows).toHaveLength(4);
		});

		test("firing builtin:practice-meeting does not fire — the kind is no longer provisioned or recognized", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);

			const result = await fireStoredRoutine(db, eventBus, BID.practiceMeeting);
			expect(result.fired).toBe(false);
		});

		test("no practice_meeting_anchor knowledge item is created by seeding + firing the surviving builtins", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await fireStoredRoutine(db, eventBus, BID.knowledgeDecay);
			await fireStoredRoutine(db, eventBus, BID.portfolioRetro);

			const anchors = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.topic, "practice_meeting"));
			expect(anchors).toHaveLength(0);
		});
	});

	// ------------------------------------------------------------------
	// AC1: Cost Sentinel — extracted to app code, NOT a routine (AD8c)
	// Tests call costOps.runCostSentinelCheck directly (no DB routine row needed).
	// @lore AD8c: cost-sentinel removed from routines table. Tests migrated
	// from fireStoredRoutine("builtin:cost-sentinel") to costOps.runCostSentinelCheck.
	// ------------------------------------------------------------------
	describe("AC1: Cost Sentinel (app code, not a routine)", () => {
		// @lore AU18: `cost_actual` is no longer a settable KV row — cost-sentinel
		// now reads `costOps.spend(db)` (= sumAllUserCost, a live SUM over
		// users.costActual). Seed exactly one costed user row so the sum resolves
		// to `actual` (onConflictDoUpdate — safe to call more than once per test,
		// e.g. the level-transition tests below that call this twice).
		async function setFactoryCost(db: HyperIdleDb, cap: number, actual: number): Promise<void> {
			await updateServerConfig(db, { cost: { capMinor: cap } });
			await db
				.insert(users)
				.values({
					id: "cost-sentinel-test-agent",
					kind: "ai",
					name: "Cost Sentinel Test Agent",
					role: "builder",
					status: "active",
					costActual: actual,
					createdAt: NOW_ISO,
				})
				.onConflictDoUpdate({ target: users.id, set: { costActual: actual } });
		}

		test("emits no events when spend is below 80% of cap", async ({ db, eventBus }) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 500);

			const result = await costOps.runCostSentinelCheck(db, eventBus);

			expect(result.fired).toBe(true);
			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			const breaches = emitted.filter((e) => e.type === "cost_cap_breached");
			expect(warnings).toHaveLength(0);
			expect(breaches).toHaveLength(0);
		});

		test("emits cost_cap_warning when spend reaches 80% of cap", async ({ db, eventBus }) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 800);

			await costOps.runCostSentinelCheck(db, eventBus);

			const warnings = emitted.filter(
				(e): e is CostCapWarningEvent => e.type === "cost_cap_warning",
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]!.capLevel).toBe("factory");
			expect(warnings[0]!.spend).toBe(800);
			expect(warnings[0]!.cap).toBe(1000);
		});

		test("emits cost_cap_breached when spend reaches 100% of cap", async ({ db, eventBus }) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 1000);

			await costOps.runCostSentinelCheck(db, eventBus);

			const breaches = emitted.filter(
				(e): e is CostCapBreachedEvent => e.type === "cost_cap_breached",
			);
			expect(breaches).toHaveLength(1);
			expect(breaches[0]!.level).toBe("hard");
			expect(breaches[0]!.spend).toBe(1000);
			expect(breaches[0]!.cap).toBe(1000);
		});

		// --- G4 review MAJOR-4: level-based dedupe semantics ---
		test("does not re-emit cost_cap_warning on consecutive ticks while still in warning level", async ({
			db,
			eventBus,
		}) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 800);

			await costOps.runCostSentinelCheck(db, eventBus);
			await costOps.runCostSentinelCheck(db, eventBus);
			await costOps.runCostSentinelCheck(db, eventBus);

			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			expect(warnings).toHaveLength(1);
		});

		test("does not re-emit cost_cap_breached on consecutive ticks while still in breach level", async ({
			db,
			eventBus,
		}) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 1200);

			await costOps.runCostSentinelCheck(db, eventBus);
			await costOps.runCostSentinelCheck(db, eventBus);

			const breaches = emitted.filter((e) => e.type === "cost_cap_breached");
			expect(breaches).toHaveLength(1);
		});

		test("re-emits cost_cap_warning after level transitions warning -> ok -> warning", async ({
			db,
			eventBus,
		}) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 800);
			await costOps.runCostSentinelCheck(db, eventBus);

			// Drop below 80% — level transitions to 'ok' (silent reset).
			await setFactoryCost(db, 1000, 500);
			await costOps.runCostSentinelCheck(db, eventBus);

			// Climb back up — this is a new transition and must re-emit.
			await setFactoryCost(db, 1000, 850);
			await costOps.runCostSentinelCheck(db, eventBus);

			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			expect(warnings).toHaveLength(2);
		});

		test("escalates from warning to breach on the transition tick", async ({ db, eventBus }) => {
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await setFactoryCost(db, 1000, 800);
			await costOps.runCostSentinelCheck(db, eventBus);

			await setFactoryCost(db, 1000, 1100);
			await costOps.runCostSentinelCheck(db, eventBus);

			const warnings = emitted.filter((e) => e.type === "cost_cap_warning");
			const breaches = emitted.filter((e) => e.type === "cost_cap_breached");
			expect(warnings).toHaveLength(1);
			expect(breaches).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------
	// AC3: Post-Bet Retro — compares hypothesis vs reality for completed bet
	// ------------------------------------------------------------------
	describe("AC3: Post-Bet Retro", () => {
		async function seedShippedBet(db: HyperIdleDb): Promise<void> {
			await db.insert(bets).values({
				id: "bet-shipped-1",
				teamId: "prod-1",
				description: "Ship onboarding flow",
				appetite: "small",
				hypothesis: "Users will complete onboarding in <3 minutes.",
				status: "completed",
				revisionLog: JSON.stringify([{ field: "status", to: "completed" }]),
				createdAt: NOW_ISO,
				completedAt: NOW_ISO,
			});
		}

		test("creates a review items row citing both hypothesis and reality", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await seedShippedBet(db);

			const result = await fireStoredRoutine(db, eventBus, BID.postBetRetro, {
				betId: "bet-shipped-1",
			});

			expect(result.fired).toBe(true);

			const reviewRows = await db.select().from(items);
			expect(reviewRows).toHaveLength(1);
			const row = reviewRows[0];
			expect(row!.kind).toBe("review");
			expect(row!.title).toContain("Post-bet retro");
			expect(row!.body ?? "").toContain("Users will complete onboarding in <3 minutes.");
			expect((row!.body ?? "").toLowerCase()).toContain("reality");
		});

		test("emits an item_created event", async ({ db, eventBus }) => {
			await seedOwners(db);
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await seedBuiltinRoutines(db);
			await seedShippedBet(db);

			await fireStoredRoutine(db, eventBus, BID.postBetRetro, {
				betId: "bet-shipped-1",
			});

			const itemEvents = emitted.filter((e) => e.type === "item_created");
			expect(itemEvents).toHaveLength(1);
		});

		test("fires on bet_state_changed(toState=completed) event when handler is registered", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await seedShippedBet(db);

			const unsub = await startDispatchEngine({ db, eventBus });
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-shipped-1",
					betId: "bet-shipped-1",
					fromState: "active",
					toState: "completed",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = await db.select().from(items);
				expect(reviewRows).toHaveLength(1);
				expect(reviewRows[0]!.kind).toBe("review");
			} finally {
				unsub();
			}
		});

		// --- G4 review WARN-3: dedupe by betId ---
		test("does not create a second review when the same bet ships twice (G4 WARN-3)", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await seedShippedBet(db);

			const first = await fireStoredRoutine(db, eventBus, BID.postBetRetro, {
				betId: "bet-shipped-1",
			});
			expect(first.fired).toBe(true);

			const second = await fireStoredRoutine(db, eventBus, BID.postBetRetro, {
				betId: "bet-shipped-1",
			});
			expect(second.fired).toBe(false);
			if (!second.fired) {
				expect(second.reason).toBe("already-retroed");
			}

			const reviewRows = await db.select().from(items);
			expect(reviewRows).toHaveLength(1);
		});

		test("dedupes across consecutive bet_state_changed(toState=completed) events for same betId", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await seedShippedBet(db);

			const unsub = await startDispatchEngine({ db, eventBus });
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-shipped-1",
					betId: "bet-shipped-1",
					fromState: "active",
					toState: "completed",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 200));
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 200));

				const reviewRows = await db.select().from(items);
				expect(reviewRows).toHaveLength(1);
			} finally {
				unsub();
			}
		});

		test("does NOT fire on non-completed bet_state_changed transitions", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await seedShippedBet(db);

			const unsub = await startDispatchEngine({ db, eventBus });
			try {
				// Emit a non-completed transition — should be ignored
				const nonCompleted: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-shipped-1",
					betId: "bet-shipped-1",
					fromState: "draft",
					toState: "active",
					timestamp: Date.now(),
				};
				eventBus.emit(nonCompleted);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = await db.select().from(items);
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
		test("summarizes cross-product L3/L4 items updated within the last month", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);

			const recentIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
			const staleIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

			// @lore O2: split kernel (knowledgeItems) from strategy (knowledgeAppProjection)
			await db.insert(knowledgeItems).values({
				id: "ki-recent-l3",
				title: "Recent L3 pattern",
				body: "…",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: recentIso,
				updatedAt: recentIso,
			});
			await db.insert(knowledgeAppProjection).values({
				id: "ksf-ki-recent-l3",
				knowledgeItemId: "ki-recent-l3",
				layer: "L3",
				kind: "pattern",
			});
			await db.insert(knowledgeItems).values({
				id: "ki-recent-l4",
				title: "Recent L4 principle",
				body: "…",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: recentIso,
				updatedAt: recentIso,
			});
			await db.insert(knowledgeAppProjection).values({
				id: "ksf-ki-recent-l4",
				knowledgeItemId: "ki-recent-l4",
				layer: "L4",
				kind: "principle",
			});
			await db.insert(knowledgeItems).values({
				id: "ki-stale-l3",
				title: "Stale L3 pattern",
				body: "…",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: staleIso,
				updatedAt: staleIso,
			});
			await db.insert(knowledgeAppProjection).values({
				id: "ksf-ki-stale-l3",
				knowledgeItemId: "ki-stale-l3",
				layer: "L3",
				kind: "pattern",
			});

			const result = await fireStoredRoutine(db, eventBus, BID.portfolioRetro);
			expect(result.fired).toBe(true);

			const reviewRows = await db.select().from(items);
			expect(reviewRows).toHaveLength(1);
			const body = reviewRows[0]!.body ?? "";
			expect(body).toContain("Recent L3 pattern");
			expect(body).toContain("Recent L4 principle");
			expect(body).not.toContain("Stale L3 pattern");
		});
	});

	// ------------------------------------------------------------------
	// AC5: Knowledge Decay — transitions active items unused >90d to stale
	// ------------------------------------------------------------------
	describe("AC5: Knowledge Decay", () => {
		test("marks active items older than 90 days as stale", async ({ db, eventBus }) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			await db.insert(knowledgeItems).values({
				id: "ki-old",
				title: "Old pattern",
				body: "old",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: longAgo,
				updatedAt: longAgo,
			});

			const result = await fireStoredRoutine(db, eventBus, BID.knowledgeDecay);
			expect(result.fired).toBe(true);

			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "ki-old"))
				.limit(1);
			expect(row?.status).toBe("stale");
		});

		// --- G4 review MAJOR-5: honor `silent` column ---
		test("suppresses knowledge_updated events when routine.silent=1 (G4 MAJOR-5)", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await seedBuiltinRoutines(db);
			// builtin:knowledge-decay is seeded silent=1 by default. Verify.
			const [row] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, BID.knowledgeDecay))
				.limit(1);
			expect(row?.silent).toBe(true);

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			for (let i = 0; i < 3; i++) {
				await db.insert(knowledgeItems).values({
					id: `ki-silent-${i}`,
					title: `Old pattern ${i}`,
					body: "old",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent:test",
					createdAt: longAgo,
					updatedAt: longAgo,
				});
			}

			await fireStoredRoutine(db, eventBus, BID.knowledgeDecay);

			// DB writes still happen — verify the transitions succeeded.
			const markedStale = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.status, "stale"));
			expect(markedStale.length).toBe(3);

			// But the bus was not notified.
			const events = emitted.filter((e) => e.type === "knowledge_updated");
			expect(events).toHaveLength(0);
		});

		test("emits knowledge_updated events when routine.silent=0", async ({ db, eventBus }) => {
			await seedOwners(db);
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await seedBuiltinRoutines(db);
			// Flip silent off for this test.
			await db.update(routines).set({ silent: false }).where(eq(routines.id, BID.knowledgeDecay));

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			await db.insert(knowledgeItems).values({
				id: "ki-noisy",
				title: "Old pattern",
				body: "old",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: longAgo,
				updatedAt: longAgo,
			});

			await fireStoredRoutine(db, eventBus, BID.knowledgeDecay);

			const events = emitted.filter((e) => e.type === "knowledge_updated");
			expect(events).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------
	// AC8: Disabled routine (active=0) short-circuits execution
	// ------------------------------------------------------------------
	describe("AC8: Disabled routine prevents firing", () => {
		// @lore AD8c: cost-sentinel is no longer a routine; using knowledge-decay as the test subject.
		test("fireStoredRoutine returns fired=false when routine active=0", async ({
			db,
			eventBus,
		}) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await db.update(routines).set({ active: false }).where(eq(routines.id, BID.knowledgeDecay));

			const result = await fireStoredRoutine(db, eventBus, BID.knowledgeDecay);
			expect(result.fired).toBe(false);
			if (!result.fired) expect(result.reason).toContain("disabled");
		});

		test("event handler does not run when event routine active=0", async ({ db, eventBus }) => {
			await seedOwners(db);
			await seedBuiltinRoutines(db);
			await db.update(routines).set({ active: false }).where(eq(routines.id, BID.postBetRetro));
			await db.insert(bets).values({
				id: "bet-inactive-1",
				teamId: "prod-1",
				description: "Ship X",
				appetite: "small",
				hypothesis: "Will work",
				status: "completed",
				createdAt: NOW_ISO,
			});

			const unsub = await startDispatchEngine({ db, eventBus });
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: "bet-inactive-1",
					betId: "bet-inactive-1",
					fromState: "active",
					toState: "completed",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const reviewRows = await db.select().from(items);
				expect(reviewRows).toHaveLength(0);
			} finally {
				unsub();
			}
		});
	});
});

/**
 * The drain-time agent-selection move only touches the generic-routine path.
 * `fireStoredRoutine`
 * never called `isAgentAtWipLimit`/`selectAgentByAppDefaults` before or after
 * that move — this proves it structurally, by putting the owner at their WIP
 * limit and confirming the builtin still fires and writes a terminal
 * `routineRuns` row regardless (all 5 kinds share this same `fireStoredRoutine`
 * entry point — there is no per-kind WIP gate to regress).
 */
describe("built-ins are structurally unaffected by the drain-time selection move", () => {
	test("owner at WIP limit does not block a built-in fire (no fire-time selection to trip)", async ({
		db,
		eventBus,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db);

		// Put the knowledge-decay owner at their WIP limit (maxConcurrentSessions=1).
		await db.insert(sessions).values({
			id: "au15-builtin-owner-session",
			agentId: "seed-agent-pf-facilitation",
			modelTier: "fast",
			startedAt: NOW_ISO,
			state: "active",
		});

		const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
		await db.insert(knowledgeItems).values({
			id: "au15-ki-old",
			title: "Old pattern",
			body: "old",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "agent:test",
			createdAt: longAgo,
			updatedAt: longAgo,
		});

		const result = await fireStoredRoutine(db, eventBus, BID.knowledgeDecay);
		expect(result.fired).toBe(true);

		const runs = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, BID.knowledgeDecay));
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("success");
		expect(runs[0]?.endedAt).toBeTruthy();
	});
});
