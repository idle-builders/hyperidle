/**
 * AU15 R1/AC-1/AC-2b — drain-time routine agent-selection.
 *
 * Routine agent-selection (owner-WIP evaluation + delegate resolution) moved
 * from fire-time `checkAndFireRoutine` (Core) to drain-time
 * `resolveAuthoritativeInput`'s `routine_run` branch (Agent Layer). This
 * suite drives the real `drainAgentWorkIntents` worker against a recorded
 * `routine_run` intent and asserts the handed-off `AgentSessionRequest`'s
 * target agent — never the fire-time selection (which no longer exists).
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
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../test-fixtures.js";
import { drainAgentWorkIntents, recordAgentWorkIntent } from "../session-requests-bindings.js";

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
			maxConcurrentSessions: 1,
			createdAt: NOW,
		},
		{
			id: delegateAgentId,
			kind: "ai",
			name: "Delegate",
			role: "builder",
			status: "active",
			teamId: tmId,
			maxConcurrentSessions: 1,
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

async function recordRunningIntent(
	db: HyperIdleDb,
	routineId: string,
	ownerAgentId: string,
): Promise<string> {
	const runId = `${routineId}-run`;
	await routineService.insertRoutineRun(db, {
		id: runId,
		routineId,
		startedAt: NOW,
		outcome: "running",
	});
	await recordAgentWorkIntent(db, {
		kind: "routine_run",
		sourceKind: "routine_run",
		sourceId: runId,
		requestedBy: ownerAgentId,
		idempotencyKey: `routine:${runId}`,
	});
	return runId;
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

describe("drain-time routine agent-selection (resolveAuthoritativeInput routine_run)", () => {
	test("owner not at WIP: drain hands off to the owner", async ({ db }) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db);
		const runId = await recordRunningIntent(db, routineId, ownerAgentId);

		await drainAgentWorkIntents(db);

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

	test("owner at WIP + delegate available: drain hands off to the delegate", async ({ db }) => {
		const { routineId, ownerAgentId, delegateAgentId } = await seedRoutineWorld(db);
		await putAgentAtWip(db, ownerAgentId, "au15-owner-session");
		const runId = await recordRunningIntent(db, routineId, ownerAgentId);

		await drainAgentWorkIntents(db);

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, runId));
		expect(request?.agentId).toBe(delegateAgentId);
	});

	test("owner at WIP + no delegate available: drain defers to the owner (not skipped)", async ({
		db,
	}) => {
		const { routineId, ownerAgentId, delegateAgentId } = await seedRoutineWorld(db);
		await putAgentAtWip(db, ownerAgentId, "au15-owner-session");
		// Delegate is also at WIP — findDelegateVerbatim skips it, returns null.
		await putAgentAtWip(db, delegateAgentId, "au15-delegate-session");
		const runId = await recordRunningIntent(db, routineId, ownerAgentId);

		await drainAgentWorkIntents(db);

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
	}) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db, { delegationAllowed: false });
		await putAgentAtWip(db, ownerAgentId, "au15-owner-session");
		const runId = await recordRunningIntent(db, routineId, ownerAgentId);

		await drainAgentWorkIntents(db);

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, runId));
		expect(request?.agentId).toBe(ownerAgentId);
	});

	test("recordAgentWorkIntent is idempotent on (kind, sourceId, idempotencyKey)", async ({
		db,
	}) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db);
		const runId = "au15-routine-idem-run";
		await routineService.insertRoutineRun(db, {
			id: runId,
			routineId,
			startedAt: NOW,
			outcome: "running",
		});
		const first = await recordAgentWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: ownerAgentId,
			idempotencyKey: `routine:${runId}`,
		});
		const second = await recordAgentWorkIntent(db, {
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
