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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { BetStateChangedEvent, DomainEvent } from "@hyperidle/domain-model";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { registerBuiltinRoutineReactions } from "../services/routine-scheduler-bindings.js";
import { fireStoredRoutine, seedTeamRoutines } from "./dispatch-test-helpers.js";

const NOW_ISO = "2026-04-18T10:00:00.000Z";
const BUILTIN_ROUTINE_IDS = [
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion",
] as const;

// @lore AU38: BID values are derived from the scoped team id — the production
// seeding scheme is `builtin:<kind>:<teamId>`, so scoping the team id scopes
// the routine ids. We use a function (not a constant) because `ids` is per-test.
function getBID(ids: ScopedIds) {
	const teamId = ids("prod-1");
	return {
		// @lore AU21 Increment 5: practice-meeting is deleted — this id is never
		// seeded by seedBuiltinRoutines anymore. Kept only as a literal id string
		// for the "still doesn't fire" regression test below (a routine row that
		// genuinely does not exist).
		practiceMeeting: `builtin:practice-meeting:${teamId}`,
		postBetRetro: `builtin:post-bet-retro:${teamId}`,
		portfolioRetro: `builtin:portfolio-retro:${teamId}`,
		knowledgeDecay: `builtin:knowledge-decay:${teamId}`,
		knowledgePromotion: `builtin:knowledge-promotion:${teamId}`,
	} as const;
}

/** Seed the owner agents and provision built-in routines for the test team. */
async function seedOwners(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await db
		.insert(teams)
		.values({ id: ids("prod-1"), name: "Acme", phase: "build", createdAt: NOW_ISO });

	await db.insert(teamMembers).values({
		id: ids("team-1"),
		teamId: ids("prod-1"),
		capacity: 5,
		activeBets: 0,
		formedAt: NOW_ISO,
	});

	await db.insert(users).values({
		id: ids("seed-agent-cos"),
		name: "System Agent",
		role: "assistant",
		status: "active",
		createdAt: NOW_ISO,
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	await db.insert(users).values({
		id: ids("seed-agent-pf-facilitation"),
		name: "Facilitation Facilitator",
		role: "facilitator",
		status: "active",
		createdAt: NOW_ISO,
	});

	await db.insert(users).values({
		id: ids("demo-agent-pm"),
		name: "Acme Product Manager",
		role: "product_manager",
		status: "active",
		teamId: ids("team-1"),
		createdAt: NOW_ISO,
	});
}

/**
 * @lore AF17: replaces seedBuiltinRoutines(db, teamId).
 * Uses seedTeamRoutines so ids are per-team: `builtin:<kind>:<teamId>`.
 */
async function seedBuiltinRoutines(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await seedTeamRoutines(db, {
		teamId: ids("prod-1"),
		ownerByRole: {
			facilitator: ids("seed-agent-pf-facilitation"),
			product_manager: ids("demo-agent-pm"),
			assistant: ids("seed-agent-cos"),
		},
		leadAgentId: ids("seed-agent-cos"),
	});
}

describe("G4: Built-in Routines", () => {
	// ------------------------------------------------------------------
	// AC6: all 4 builtins created by seedBuiltinRoutines with correct config
	// @lore AD8c: cost-sentinel removed from routines table (now app-level scheduled job)
	// ------------------------------------------------------------------
	describe("AC6: seedBuiltinRoutines creates all 4 with correct config (AD8c)", () => {
		test("inserts every builtin routine id with correct trigger_type and trigger_config (AD8c: 4 routines)", async ({
			db,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);

			const allRows = await db.select().from(routines).where(sql`1=1`);
			// P1: scope — only this test's routines (by scoped team id prefix)
			const rows = allRows
				.filter((r: Routine) => r.id.includes(`:${ids("prod-1")}`))
				.sort((a: Routine, b: Routine) => a.id.localeCompare(b.id));

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
		test("assigns correct owner agent for each builtin (AD8c)", async ({ db, ids }) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			const allRows = await db.select().from(routines).where(sql`1=1`);
			const byId = new Map<string, Routine>(
				allRows.map((r: Routine) => [r.id, r] as [string, Routine]),
			);
			// @lore AD8c: cost-sentinel is no longer seeded as a routine
			// @lore AF17: per-team ids used; no global "builtin:cost-sentinel" row
			expect(allRows.some((r: Routine) => r.id.startsWith("builtin:cost-sentinel"))).toBe(false);
			expect(byId.get(BID.postBetRetro)?.ownerAgentId).toBe(ids("demo-agent-pm"));
			expect(byId.get(BID.portfolioRetro)?.ownerAgentId).toBe(ids("seed-agent-cos"));
			// @lore AD8c: knowledge-decay ownership transferred to facilitator agent
			expect(byId.get(BID.knowledgeDecay)?.ownerAgentId).toBe(ids("seed-agent-pf-facilitation"));
		});

		test("sets all builtins active=true by default", async ({ db, ids }) => {
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			const allRows = await db.select().from(routines).where(sql`1=1`);
			const rows = allRows.filter((r: Routine) => r.id.includes(`:${ids("prod-1")}`));
			expect(rows).toHaveLength(BUILTIN_ROUTINE_IDS.length);
			for (const r of rows) {
				expect(r.active, `${r.id} active`).toBe(true);
			}
		});

		test("is idempotent: running twice produces no duplicate rows and no error", async ({
			db,
			ids,
		}) => {
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await expect(seedBuiltinRoutines(db, ids)).resolves.not.toThrow();
			const allRows = await db.select().from(routines).where(sql`1=1`);
			const rows = allRows.filter((r: Routine) => r.id.includes(`:${ids("prod-1")}`));
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
			ids,
		}) => {
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);

			const allRows = await db.select().from(routines).where(sql`1=1`);
			const rows = allRows.filter((r: Routine) => r.id.includes(`:${ids("prod-1")}`));
			expect(rows.some((r: Routine) => r.id.startsWith("builtin:practice-meeting"))).toBe(false);
			expect(rows).toHaveLength(4);
		});

		test("firing builtin:practice-meeting does not fire — the kind is no longer provisioned or recognized", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);

			const result = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.practiceMeeting);
			expect(result.fired).toBe(false);
		});

		test("no practice_meeting_anchor knowledge item is created by seeding + firing the surviving builtins", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await fireStoredRoutine(db, eventBus, agentOrchestration, BID.knowledgeDecay);
			await fireStoredRoutine(db, eventBus, agentOrchestration, BID.portfolioRetro);

			const anchors = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.topic, "practice_meeting"));
			expect(anchors).toHaveLength(0);
		});
	});

	// @lore AU21 Increment 14a: "AC1: Cost Sentinel" describe block is deleted
	// along with the rest of the cost feature — the cost sentinel, its
	// events, and the factory cap are all gone, no replacement.

	// ------------------------------------------------------------------
	// AC3: Post-Bet Retro — compares hypothesis vs reality for completed bet
	// ------------------------------------------------------------------
	describe("AC3: Post-Bet Retro", () => {
		async function seedShippedBet(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
			await db.insert(bets).values({
				id: ids("bet-shipped-1"),
				teamId: ids("prod-1"),
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
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await seedShippedBet(db, ids);

			const result = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.postBetRetro, {
				betId: ids("bet-shipped-1"),
			});

			expect(result.fired).toBe(true);

			const allItems = await db.select().from(items).where(sql`1=1`);
			const reviewRows = allItems.filter(
				(i) => i.kind === "review" && (i.title ?? "").includes("Post-bet retro"),
			);
			expect(reviewRows).toHaveLength(1);
			const row = reviewRows[0];
			expect(row!.kind).toBe("review");
			expect(row!.title).toContain("Post-bet retro");
			expect(row!.body ?? "").toContain("Users will complete onboarding in <3 minutes.");
			expect((row!.body ?? "").toLowerCase()).toContain("reality");
		});

		test("emits an item_created event", async ({ db, eventBus, agentOrchestration, ids }) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await seedBuiltinRoutines(db, ids);
			await seedShippedBet(db, ids);

			await fireStoredRoutine(db, eventBus, agentOrchestration, BID.postBetRetro, {
				betId: ids("bet-shipped-1"),
			});

			const itemEvents = emitted.filter((e) => e.type === "item_created");
			expect(itemEvents).toHaveLength(1);
		});

		test("fires on bet_state_changed(toState=completed) event when handler is registered", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await seedShippedBet(db, ids);

			const unsub = registerBuiltinRoutineReactions(db, eventBus, agentOrchestration);
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: ids("bet-shipped-1"),
					betId: ids("bet-shipped-1"),
					fromState: "active",
					toState: "completed",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const allItems = await db.select().from(items).where(sql`1=1`);
				const reviewRows = allItems.filter((i) => i.kind === "review");
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
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await seedShippedBet(db, ids);

			const first = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.postBetRetro, {
				betId: ids("bet-shipped-1"),
			});
			expect(first.fired).toBe(true);

			const second = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.postBetRetro, {
				betId: ids("bet-shipped-1"),
			});
			expect(second.fired).toBe(false);
			if (!second.fired) {
				expect(second.reason).toBe("already-retroed");
			}

			const allItems = await db.select().from(items).where(sql`1=1`);
			const reviewRows = allItems.filter((i) => i.kind === "review");
			expect(reviewRows).toHaveLength(1);
		});

		test("dedupes across consecutive bet_state_changed(toState=completed) events for same betId", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await seedShippedBet(db, ids);

			const unsub = registerBuiltinRoutineReactions(db, eventBus, agentOrchestration);
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: ids("bet-shipped-1"),
					betId: ids("bet-shipped-1"),
					fromState: "active",
					toState: "completed",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 200));
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 200));

				const allItems = await db.select().from(items).where(sql`1=1`);
				const reviewRows = allItems.filter((i) => i.kind === "review");
				expect(reviewRows).toHaveLength(1);
			} finally {
				unsub();
			}
		});

		test("does NOT fire on non-completed bet_state_changed transitions", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await seedShippedBet(db, ids);

			const unsub = registerBuiltinRoutineReactions(db, eventBus, agentOrchestration);
			try {
				// Emit a non-completed transition — should be ignored
				const nonCompleted: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: ids("bet-shipped-1"),
					betId: ids("bet-shipped-1"),
					fromState: "draft",
					toState: "active",
					timestamp: Date.now(),
				};
				eventBus.emit(nonCompleted);
				await new Promise((r) => setTimeout(r, 20));

				const allItems = await db.select().from(items).where(sql`1=1`);
				const reviewRows = allItems.filter((i) => i.kind === "review");
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
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);

			const recentIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
			const staleIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

			// @lore O2: split kernel (knowledgeItems) from strategy (knowledgeAppProjection)
			await db.insert(knowledgeItems).values({
				id: ids("ki-recent-l3"),
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
				id: ids("ksf-ki-recent-l3"),
				knowledgeItemId: ids("ki-recent-l3"),
				layer: "L3",
				kind: "pattern",
			});
			await db.insert(knowledgeItems).values({
				id: ids("ki-recent-l4"),
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
				id: ids("ksf-ki-recent-l4"),
				knowledgeItemId: ids("ki-recent-l4"),
				layer: "L4",
				kind: "principle",
			});
			await db.insert(knowledgeItems).values({
				id: ids("ki-stale-l3"),
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
				id: ids("ksf-ki-stale-l3"),
				knowledgeItemId: ids("ki-stale-l3"),
				layer: "L3",
				kind: "pattern",
			});

			const result = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.portfolioRetro);
			expect(result.fired).toBe(true);

			const allItems = await db.select().from(items).where(sql`1=1`);
			const reviewRows = allItems.filter((i) => i.kind === "review");
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
		test("marks active items older than 90 days as stale", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			await db.insert(knowledgeItems).values({
				id: ids("ki-old"),
				title: "Old pattern",
				body: "old",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: longAgo,
				updatedAt: longAgo,
			});

			const result = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.knowledgeDecay);
			expect(result.fired).toBe(true);

			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, ids("ki-old")))
				.limit(1);
			expect(row?.status).toBe("stale");
		});

		// --- G4 review MAJOR-5: honor `silent` column ---
		test("suppresses knowledge_updated events when routine.silent=1 (G4 MAJOR-5)", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await seedBuiltinRoutines(db, ids);
			// builtin:knowledge-decay is seeded silent=1 by default. Verify.
			const [row] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, BID.knowledgeDecay))
				.limit(1);
			expect(row?.silent).toBe(true);

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			const myKiIds: string[] = [];
			for (let i = 0; i < 3; i++) {
				const kiId = ids(`ki-silent-${i}`);
				myKiIds.push(kiId);
				await db.insert(knowledgeItems).values({
					id: kiId,
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

			await fireStoredRoutine(db, eventBus, agentOrchestration, BID.knowledgeDecay);

			// DB writes still happen — verify the transitions succeeded.
			const markedStale = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.status, "stale"));
			const myMarkedStale = markedStale.filter((i) => myKiIds.includes(i.id));
			expect(myMarkedStale.length).toBe(3);

			// But the bus was not notified.
			const events = emitted.filter((e) => e.type === "knowledge_updated");
			expect(events).toHaveLength(0);
		});

		test("emits knowledge_updated events when routine.silent=0", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			const emitted: DomainEvent[] = [];
			eventBus.on("*", (e: DomainEvent) => emitted.push(e));
			await seedBuiltinRoutines(db, ids);
			// Flip silent off for this test.
			await db.update(routines).set({ silent: false }).where(eq(routines.id, BID.knowledgeDecay));

			const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
			await db.insert(knowledgeItems).values({
				id: ids("ki-noisy"),
				title: "Old pattern",
				body: "old",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent:test",
				createdAt: longAgo,
				updatedAt: longAgo,
			});

			await fireStoredRoutine(db, eventBus, agentOrchestration, BID.knowledgeDecay);

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
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await db.update(routines).set({ active: false }).where(eq(routines.id, BID.knowledgeDecay));

			const result = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.knowledgeDecay);
			expect(result.fired).toBe(false);
			if (!result.fired) expect(result.reason).toContain("disabled");
		});

		test("event handler does not run when event routine active=0", async ({
			db,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const BID = getBID(ids);
			await seedOwners(db, ids);
			await seedBuiltinRoutines(db, ids);
			await db.update(routines).set({ active: false }).where(eq(routines.id, BID.postBetRetro));
			await db.insert(bets).values({
				id: ids("bet-inactive-1"),
				teamId: ids("prod-1"),
				description: "Ship X",
				appetite: "small",
				hypothesis: "Will work",
				status: "completed",
				createdAt: NOW_ISO,
			});

			const unsub = registerBuiltinRoutineReactions(db, eventBus, agentOrchestration);
			try {
				const shipped: BetStateChangedEvent = {
					type: "bet_state_changed",
					streamId: ids("bet-inactive-1"),
					betId: ids("bet-inactive-1"),
					fromState: "active",
					toState: "completed",
					timestamp: Date.now(),
				};
				eventBus.emit(shipped);
				await new Promise((r) => setTimeout(r, 20));

				const allItems = await db.select().from(items).where(sql`1=1`);
				const reviewRows = allItems.filter((i) => i.kind === "review");
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
		agentOrchestration,
		ids,
	}) => {
		const BID = getBID(ids);
		await seedOwners(db, ids);
		await seedBuiltinRoutines(db, ids);

		// Put the knowledge-decay owner at their WIP limit (maxConcurrentSessions=1).
		await db.insert(sessions).values({
			id: ids("au15-builtin-owner-session"),
			agentId: ids("seed-agent-pf-facilitation"),
			modelTier: "fast",
			startedAt: NOW_ISO,
			state: "active",
		});

		const longAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
		await db.insert(knowledgeItems).values({
			id: ids("au15-ki-old"),
			title: "Old pattern",
			body: "old",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "agent:test",
			createdAt: longAgo,
			updatedAt: longAgo,
		});

		const result = await fireStoredRoutine(db, eventBus, agentOrchestration, BID.knowledgeDecay);
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
