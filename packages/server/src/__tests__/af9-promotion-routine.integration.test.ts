/**
 * AF9 — AC2: Promotion sweep builtin routine.
 *
 * RED PHASE: These tests fail until `builtin:knowledge-promotion` is added to
 * `BUILTIN_ROUTINE_IDS` and implemented in `runBuiltinRoutine` (Task 2).
 *
 * Key critique findings honored:
 * - Assert `routine_runs` outcome=success row written on a successful sweep.
 * - Assert NEGATIVE: disabled routine writes NO run row.
 * - Assert exactly one `knowledge_updated action=auto_promoted` per promoted
 *   item — no double-emit (the sweep emits; the handler must NOT also emit).
 * - Assert `builtin:knowledge-promotion` is in `BUILTIN_ROUTINE_IDS` and
 *   receives a `nextRunAt` from `seedBuiltinRoutines`.
 */

import {
	type HyperIdleDb,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
	routineRuns,
	routines,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { BUILTIN_ROUTINE_IDS, type BuiltinRoutineId } from "@hyperidle/core-app";
import { provisionTeamRoutines, runBuiltinRoutine } from "@hyperidle/agent-layer";
import { describe, expect, test } from "../test-fixtures.js";

const NOW_ISO = "2026-06-11T00:00:00.000Z";

const TEST_TEAM_ID = "prod-1";
// @lore AF17: per-team routine id scheme — builtin:<kind>:<teamId>
const PROMOTION_ROUTINE_ID = `builtin:knowledge-promotion:${TEST_TEAM_ID}` as BuiltinRoutineId;

/**
 * Seed the agent rows referenced by builtin routines.
 * Mirrors `seedOwners` in `builtin-routines.integration.test.ts`.
 */
async function seedOwners(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "prod-1", name: "Acme", phase: "build", createdAt: NOW_ISO });
	await db.insert(teamMembers).values({
		id: "team-1",
		teamId: "prod-1",
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
		name: "Acme PM",
		role: "product_manager",
		status: "active",
		maxConcurrentSessions: 1,
		teamId: "team-1",
		createdAt: NOW_ISO,
	});
}

/**
 * @lore AF17: replaces seedBuiltinRoutines(db, teamId).
 * Uses provisionTeamRoutines so ids are per-team: `builtin:<kind>:<teamId>`.
 */
async function seedBuiltinRoutines(db: HyperIdleDb, teamId = TEST_TEAM_ID): Promise<void> {
	await provisionTeamRoutines(db, {
		teamId,
		ownerByRole: {
			facilitator: "seed-agent-pf-facilitation",
			product_manager: "demo-agent-pm",
			assistant: "seed-agent-cos",
		},
		leadAgentId: "seed-agent-cos",
	});
}

/**
 * Seed 5 provisional items sharing the same (layer, topic, kind) signature
 * across 5 distinct scopeIds — the minimum threshold for auto-promotion.
 * Returns the id of the first item (the "subject").
 */
async function seedPromotionCandidates(db: HyperIdleDb, prefix: string): Promise<string> {
	const scopes = ["scope-a", "scope-b", "scope-c", "scope-d", "scope-e"];
	const layer = "L3";
	const topic = `topic-${prefix}`;
	const kind = "pattern";

	for (let i = 0; i < scopes.length; i++) {
		const id = `${prefix}-ki-${i}`;
		await db.insert(knowledgeItems).values({
			id,
			scopeKind: "factory",
			topic,
			title: `Candidate ${prefix}-${i}`,
			body: "Body",
			format: "markdown",
			status: "provisional",
			version: 1,
			updatedBy: "agent:seed",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});
		await db.insert(knowledgeStrategyFabric).values({
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer,
			scopeId: scopes[i],
			kind,
		});
	}

	return `${prefix}-ki-0`;
}

describe("AF9 AC2: builtin:knowledge-promotion routine", () => {
	test("BUILTIN_ROUTINE_IDS contains 'builtin:knowledge-promotion'", () => {
		// This test asserts a static property via runtime import.
		// BUILTIN_ROUTINE_IDS contains the kind (global), not the per-team id.
		expect(BUILTIN_ROUTINE_IDS as readonly string[]).toContain("builtin:knowledge-promotion");
	});

	test("seedBuiltinRoutines creates 'builtin:knowledge-promotion' with nextRunAt (scheduler eligible)", async ({
		db,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db, "prod-1");

		const [row] = await db.select().from(routines).where(eq(routines.id, PROMOTION_ROUTINE_ID));

		expect(row).toBeDefined();
		expect(row?.triggerType).toBe("calendar");
		// cron should be 03:00 daily (distinct from knowledge-decay 02:00)
		const triggerConfig = JSON.parse(row?.triggerConfig ?? "{}") as { cron?: string };
		expect(triggerConfig.cron).toBe("0 3 * * *");
		// Calendar builtins must have nextRunAt set by seedBuiltinRoutines.
		expect(row?.nextRunAt).not.toBeNull();
		// silent: false — promotions emit events (unlike decay which is silent).
		expect(row?.silent).toBe(false);
	});

	test("runBuiltinRoutine promotes provisional items meeting the threshold", async ({
		db,
		eventBus,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db, "prod-1");

		// Seed 5 provisional items with same signature across 5 scopes.
		const subjectId = await seedPromotionCandidates(db, "promo-basic");

		// Act: run the promotion routine.
		const result = await runBuiltinRoutine(db, eventBus, PROMOTION_ROUTINE_ID);
		expect(result.fired).toBe(true);

		// Assert: the subject item is now validated.
		const [item] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, subjectId));
		expect(item?.status).toBe("validated");

		// Assert: an edit-log row for the promotion exists.
		const editRows = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, subjectId));
		expect(editRows.length).toBeGreaterThanOrEqual(1);
		const autoPromoEdit = editRows.find((r) => r.editor === "system:auto-promotion");
		expect(autoPromoEdit).toBeDefined();
	});

	test("runBuiltinRoutine writes a routine_runs row with outcome=success", async ({
		db,
		eventBus,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db, "prod-1");
		await seedPromotionCandidates(db, "promo-runs");

		const runsBefore = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, PROMOTION_ROUTINE_ID));

		await runBuiltinRoutine(db, eventBus, PROMOTION_ROUTINE_ID);

		const runsAfter = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, PROMOTION_ROUTINE_ID));

		expect(runsAfter.length).toBe(runsBefore.length + 1);
		const newRun = runsAfter[runsAfter.length - 1];
		expect(newRun?.outcome).toBe("success");
		expect(newRun?.startedAt).not.toBeNull();
		expect(newRun?.endedAt).not.toBeNull();
	});

	test("disabled routine writes NO routine_runs row (AC2 negative: disabled → no fire)", async ({
		db,
		eventBus,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db, "prod-1");

		// Disable the promotion routine.
		await db.update(routines).set({ active: false }).where(eq(routines.id, PROMOTION_ROUTINE_ID));

		const runsBefore = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, PROMOTION_ROUTINE_ID));

		// Act: run while disabled.
		const result = await runBuiltinRoutine(db, eventBus, PROMOTION_ROUTINE_ID);
		expect(result.fired).toBe(false);

		// Assert: NO new routine_runs row written (the AF6 invariant: disabled → no row).
		const runsAfter = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, PROMOTION_ROUTINE_ID));
		expect(runsAfter.length).toBe(runsBefore.length);
	});

	test("exactly ONE knowledge_updated action=auto_promoted per promoted item (no double-emit)", async ({
		db,
		eventBus,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db, "prod-1");
		const subjectId = await seedPromotionCandidates(db, "promo-emit");

		const updatedEvents: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => updatedEvents.push(e));

		await runBuiltinRoutine(db, eventBus, PROMOTION_ROUTINE_ID);

		// Filter to auto_promoted events for the subject.
		const autoPromotedForSubject = updatedEvents.filter(
			(e) => e.action === "auto_promoted" && e.itemId === subjectId,
		);

		// The sweep emits one event per promoted item.
		// The builtin handler must NOT additionally emit — exactly ONE.
		expect(autoPromotedForSubject.length).toBe(1);
	});

	test("idempotent: running again on already-validated items does not re-promote", async ({
		db,
		eventBus,
	}) => {
		await seedOwners(db);
		await seedBuiltinRoutines(db, "prod-1");
		await seedPromotionCandidates(db, "promo-idem");

		// First run — promotes items.
		await runBuiltinRoutine(db, eventBus, PROMOTION_ROUTINE_ID);

		const updatedEventsRound2: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => updatedEventsRound2.push(e));

		// Second run — already validated, should produce no new auto_promoted events.
		await runBuiltinRoutine(db, eventBus, PROMOTION_ROUTINE_ID);

		const newAutoPromoted = updatedEventsRound2.filter((e) => e.action === "auto_promoted");
		expect(newAutoPromoted.length).toBe(0);
	});
});
