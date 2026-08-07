/**
 * AU15 R1/AC-1/AC-2b — routine agent-selection (owner-WIP evaluation +
 * delegate resolution).
 *
 * @lore AU21 §9 Increment 4, Wave B rewiring: this suite originally drove
 * `drainIntents` against a MANUALLY-enqueued, unbaked `routine_run` intent —
 * `resolveIntentInputInternal`'s "routine_run" branch (drain-time) evaluated
 * owner-WIP + delegate selection at DRAIN time. That branch is now DELETED
 * (architecture.md §6 Decision B / §9 Increment 4): the SAME selection logic
 * (owner-not-at-capacity / at-capacity+delegate / at-capacity+no-delegate /
 * delegation-not-allowed) now runs at EMIT time, inside `fireGenericRoutine`'s
 * own transaction (`resolveRoutineRunRequest`, `@hyperidle/routine`), and is
 * baked onto the intent before the drain ever sees it. The four selection
 * scenarios below are unchanged in INTENT — only the mechanism producing the
 * target agent moves from "drain resolves" to "fire bakes, drain hands off
 * the baked value" — so each now fires the routine through the REAL
 * production composition (`fireGenericRoutine`, `../routine-scheduler-bindings.js`)
 * instead of hand-inserting an unbaked intent, with the WIP-seeding moved
 * BEFORE the fire call (capacity is now evaluated at fire/emit time, not
 * drain time). The dedicated `resolveRoutineRunRequest` validation-matrix
 * test (`layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts`)
 * covers this same matrix directly at the resolver level; this file's value
 * is now proving the END-TO-END fire→bake→drain→hand-off path, not the
 * resolver logic in isolation.
 *
 * The idempotency/dedup test at the bottom is UNCHANGED and remains the one
 * formally protected by architecture.md §14 — it never drains, so it is
 * unaffected by the resolve-at-emit move.
 */
import {
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	routines,
	sessions,
	teamMembers,
	teams,
	userSkills,
	users,
} from "@hyperidle/db";
import * as routineService from "@hyperidle/routine";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { queueDeps } from "../durable-agent-queue.js";
import { fireRoutine } from "../routine-scheduler-bindings.js";

const NOW = "2026-07-12T00:00:00.000Z";

interface SeedOpts {
	readonly delegationAllowed?: boolean;
	readonly skillId?: string | null;
}

async function seedRoutineWorld(
	db: HyperIdleDb,
	opts: SeedOpts = {},
): Promise<{ routineId: string; ownerAgentId: string; delegateAgentId: string }> {
	const teamId = "au15-team";
	const tmId = "au15-tm";
	const ownerAgentId = "au15-owner";
	const delegateAgentId = "au15-delegate";
	const skillId = opts.skillId === undefined ? "au15-skill" : opts.skillId;

	await db.insert(teams).values({ id: teamId, name: "AU15 team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values([
		{
			id: ownerAgentId,
			kind: "ai",
			name: "Owner",
			role: "builder",
			status: "active",
			teamId: tmId,
			createdAt: NOW,
		},
		{
			id: delegateAgentId,
			kind: "ai",
			name: "Delegate",
			role: "builder",
			status: "active",
			teamId: tmId,
			createdAt: NOW,
		},
	]);
	if (skillId) {
		await db.insert(userSkills).values([
			{ userId: ownerAgentId, skillId, autonomyLevel: 2 },
			{ userId: delegateAgentId, skillId, autonomyLevel: 2 },
		]);
	}
	await db.insert(routines).values({
		id: "au15-routine",
		name: "AU15 routine",
		teamId,
		state: "active",
		ownerAgentId,
		triggerType: "manual",
		active: true,
		skillId,
		delegationAllowed: opts.delegationAllowed ?? true,
	});

	return { routineId: "au15-routine", ownerAgentId, delegateAgentId };
}

/**
 * Fires the routine through the REAL production composition (owner-WIP +
 * delegate selection now happens HERE, at emit time — not at drain time).
 */
async function fireRoutineAndGetRunId(
	db: HyperIdleDb,
	eventBus: import("@hyperidle/shared").EventBus,
	routineId: string,
): Promise<string> {
	const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
	if (!routine) throw new Error(`routine ${routineId} not seeded`);
	const result = await fireRoutine(db, eventBus, routine);
	if (!(result.fired && result.runId)) throw new Error(`routine ${routineId} did not fire`);
	return result.runId;
}

async function putAgentAtWip(db: HyperIdleDb, agentId: string, sessionId: string): Promise<void> {
	await db.insert(sessions).values({
		id: sessionId,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "active",
	});
}

describe("routine agent-selection — resolved at emit, handed off (baked) at drain", () => {
	test("owner not at WIP: fire bakes + drain hands off to the owner", async ({ db, eventBus }) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db);
		const runId = await fireRoutineAndGetRunId(db, eventBus, routineId);

		await drainIntents(queueDeps(db));

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, runId));
		expect(intent?.status).toBe("handed_off");

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, runId));
		expect(request?.agentId).toBe(ownerAgentId);
	});

	test("owner at WIP + delegate available: fire bakes + drain hands off to the delegate", async ({
		db,
		eventBus,
	}) => {
		const { routineId, ownerAgentId, delegateAgentId } = await seedRoutineWorld(db);
		await putAgentAtWip(db, ownerAgentId, "au15-owner-session");
		const runId = await fireRoutineAndGetRunId(db, eventBus, routineId);

		await drainIntents(queueDeps(db));

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, runId));
		expect(request?.agentId).toBe(delegateAgentId);
	});

	test("owner at WIP + no delegate available: fire defers to the owner (not skipped)", async ({
		db,
		eventBus,
	}) => {
		const { routineId, ownerAgentId, delegateAgentId } = await seedRoutineWorld(db);
		await putAgentAtWip(db, ownerAgentId, "au15-owner-session");
		// Delegate is also at WIP — selectRoutineDelegate skips it, returns null.
		await putAgentAtWip(db, delegateAgentId, "au15-delegate-session");
		const runId = await fireRoutineAndGetRunId(db, eventBus, routineId);

		await drainIntents(queueDeps(db));

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, runId));
		// AC-2(b): defers (handed off to the owner), never a terminal failure.
		expect(intent?.status).toBe("handed_off");

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, runId));
		expect(request?.agentId).toBe(ownerAgentId);
	});

	test("delegation not allowed: owner at WIP still hands off to the owner (no delegate lookup)", async ({
		db,
		eventBus,
	}) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db, { delegationAllowed: false });
		await putAgentAtWip(db, ownerAgentId, "au15-owner-session");
		const runId = await fireRoutineAndGetRunId(db, eventBus, routineId);

		await drainIntents(queueDeps(db));

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, runId));
		expect(request?.agentId).toBe(ownerAgentId);
	});

	test("enqueueWorkIntent is idempotent on (kind, sourceId, idempotencyKey)", async ({ db }) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db);
		const runId = "au15-routine-idem-run";
		await routineService.insertRoutineRun(db, {
			id: runId,
			routineId,
			startedAt: NOW,
			outcome: "running",
		});
		const first = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: ownerAgentId,
			idempotencyKey: `routine:${runId}`,
		});
		const second = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: ownerAgentId,
			idempotencyKey: `routine:${runId}`,
		});
		expect(second.id).toBe(first.id);
		const rows = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, runId));
		expect(rows).toHaveLength(1);
	});
});
