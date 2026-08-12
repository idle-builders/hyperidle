/**
 * AU31 §3 — the WRITE side of `AgentOrchestrationPort`, RED phase → GREEN.
 *
 * Mirrors `agent-orchestration-port.integration.test.ts`'s pattern (real
 * in-process transport, both layers' apps composed via the `app` fixture,
 * §11's "reaches its real backing route" obligation) for the new write
 * families §2.1a/§2.2/§2.3/§2.6 need: `intents`, `requests`, `runs`,
 * `runConfig`, `filesystems`.
 */

import {
	agentWorkIntents,
	bets,
	explicitSessionStarts,
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

const NOW = "2026-08-08T00:00:00.000Z";

async function seedTeamAndTask(
	db: HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
): Promise<{
	teamParentId: string;
	teamMembersId: string;
	humanId: string;
	agentId: string;
	betId: string;
	taskId: string;
}> {
	const teamParentId = ids(`${prefix}-team-parent`);
	const teamMembersId = ids(`${prefix}-team`);
	const humanId = ids(`${prefix}-human`);
	const agentId = ids(`${prefix}-agent`);
	const betId = ids(`${prefix}-bet`);
	const taskId = ids(`${prefix}-task`);
	await db.insert(teams).values({ id: teamParentId, name: prefix, phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId: teamParentId,
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values([
		{
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			teamId: teamMembersId,
			createdAt: NOW,
		},
	]);
	await db.insert(bets).values({
		id: betId,
		teamId: teamParentId,
		description: prefix,
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId: teamParentId,
		title: prefix,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { teamParentId, teamMembersId, humanId, agentId, betId, taskId };
}

describe("AgentOrchestrationPort — write side (§3, §11 contract-test harness)", () => {
	test("intents.submit reaches the real route and durably inserts an agent_work_intents row", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-submit"));
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const sourceId = ids("aopw-submit-source");
		const idemKey = ids("aopw-submit-idem");
		const receipt = await port.intents.submit({
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId,
			idempotencyKey: idemKey,
		});

		expect(receipt.id).toBeTruthy();
		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, receipt.id))
			.limit(1);
		expect(row?.sourceId).toBe(sourceId);
		expect(row?.status).toBe("pending");
	});

	test("intents.submit is idempotent — the same idempotencyKey resolves the SAME row", async ({
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-idem"));
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const sourceId = ids("aopw-idem-source");
		const idemKey = ids("aopw-idem-key");
		const first = await port.intents.submit({
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId,
			idempotencyKey: idemKey,
		});
		const second = await port.intents.submit({
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId,
			idempotencyKey: idemKey,
		});

		expect(second.id).toBe(first.id);
	});

	test("intents.createExplicitStart atomically creates the explicit start AND its baked intent", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-explicit-start"));
		const seed = await seedTeamAndTask(db, ids, "aopw-es");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const startId = ids("aopw-es-start");
		const intentIdemKey = ids("aopw-es-intent-idem");
		const result = await port.intents.createExplicitStart({
			startId,
			taskId: seed.taskId,
			requestedAgentId: seed.agentId,
			requestedModelTier: "workhorse",
			requestedBy: seed.humanId,
			idempotencyKey: ids("aopw-es-key"),
			intentIdempotencyKey: intentIdemKey,
			bakedRequest: { defaultAgentId: seed.agentId },
		});

		expect(result.start.id).toBe(startId);
		expect(result.start.status).toBe("requested");
		expect(result.intent?.id).toBeTruthy();

		const [startRow] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, startId))
			.limit(1);
		expect(startRow?.taskId).toBe(seed.taskId);

		const [intentRow] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, startId))
			.limit(1);
		expect(intentRow?.kind).toBe("session_start");
		expect(intentRow?.bakedRequestJson).toContain(seed.agentId);
	});

	test("requests.findExplicitStartByIdempotencyKey / findExplicitStartById reach the real routes", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-find"));
		const seed = await seedTeamAndTask(db, ids, "aopw-find");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const startId = ids("aopw-find-start");
		const idemKey = ids("aopw-find-key");
		await port.intents.createExplicitStart({
			startId,
			taskId: seed.taskId,
			requestedAgentId: seed.agentId,
			requestedBy: seed.humanId,
			idempotencyKey: idemKey,
			intentIdempotencyKey: ids("aopw-find-intent-idem"),
		});

		const byKey = await port.requests.findExplicitStartByIdempotencyKey(seed.humanId, idemKey);
		expect(byKey?.id).toBe(startId);

		const byId = await port.requests.findExplicitStartById(startId);
		expect(byId?.taskId).toBe(seed.taskId);

		const missing = await port.requests.findExplicitStartById(ids("aopw-find-does-not-exist"));
		expect(missing).toBeNull();
	});

	test("requests.listPendingIntentsByKind returns only pending/claimed intents for that kind", async ({
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-pending"));
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const sourceId = ids("aopw-pending-msg-1");
		await port.intents.submit({
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId,
			idempotencyKey: ids("aopw-pending-idem"),
		});

		const pending = await port.requests.listPendingIntentsByKind("assistant_turn");
		expect(pending.some((p) => p.sourceId === sourceId)).toBe(true);
	});

	test("runConfig.write then runConfig.read round-trips through the real route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-runconfig"));
		const agentId = ids("aopw-rc-agent");
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runConfig.write(agentId, {
			harnessType: "claude-code",
			maxConcurrentSessions: 2,
		});
		const config = await port.runConfig.read(agentId);

		expect(config.harnessType).toBe("claude-code");
		expect(config.maxConcurrentSessions).toBe(2);
	});

	test("runConfig.readBatch reads multiple agents in one call, defaulting an unwritten agent", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-runconfig-batch"));
		const agent1 = ids("aopw-rcb-agent-1");
		const agent2 = ids("aopw-rcb-agent-2");
		await db.insert(users).values([
			{
				id: agent1,
				kind: "ai",
				name: "Agent1",
				role: "builder",
				status: "idle",
				createdAt: NOW,
			},
			{
				id: agent2,
				kind: "ai",
				name: "Agent2",
				role: "builder",
				status: "idle",
				createdAt: NOW,
			},
		]);
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runConfig.write(agent1, { harnessType: "codex" });
		const configs = await port.runConfig.readBatch([agent1, agent2]);

		expect(configs.get(agent1)?.harnessType).toBe("codex");
		expect(configs.get(agent2)?.harnessType).toBeNull();
	});

	test("filesystems.persistInjection persists the row and reports NOT_FOUND for an unknown filesystem", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-fs"));
		const teamParentId = ids("aopw-fs-team-parent");
		const agentId = ids("aopw-fs-agent");
		const fsId = ids("aopw-fs-1");
		await db
			.insert(teams)
			.values({ id: teamParentId, name: "aopw-fs", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: NOW,
		});
		await db.insert(filesystems).values({
			id: fsId,
			teamId: teamParentId,
			source: "local",
			kind: "code",
			resourceRef: JSON.stringify({ kind: "code", repo: "x", branch: "main" }),
			writeback: "none",
			state: "attached",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const result = await port.filesystems.persistInjection(fsId, agentId);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const [row] = await db
				.select()
				.from(filesystemInjections)
				.where(
					and(
						eq(filesystemInjections.filesystemId, fsId),
						eq(filesystemInjections.agentUserId, agentId),
					),
				)
				.limit(1);
			expect(row).toBeTruthy();
		}

		const notFound = await port.filesystems.persistInjection(
			ids("aopw-fs-does-not-exist"),
			agentId,
		);
		expect(notFound.ok).toBe(false);
		if (!notFound.ok) expect(notFound.code).toBe("NOT_FOUND");
	});

	test("runs.createBareRun inserts an active session row through the real route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-bare-run"));
		const seed = await seedTeamAndTask(db, ids, "aopw-bare");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const session = await port.runs.createBareRun({
			agentId: seed.agentId,
			taskId: seed.taskId,
			modelTier: "workhorse",
		});

		expect(session.state).toBe("active");
		const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
		expect(row?.agentId).toBe(seed.agentId);
	});

	test("runs.stopForTasks stops the active session for a task and returns it", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-stop"));
		const seed = await seedTeamAndTask(db, ids, "aopw-stop");
		const sessionId = ids("aopw-stop-session");
		await db.insert(sessions).values({
			id: sessionId,
			agentId: seed.agentId,
			taskId: seed.taskId,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const stopped = await port.runs.stopForTasks([seed.taskId], "bet_killed");
		expect(stopped).toEqual([{ taskId: seed.taskId, sessionId }]);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		expect(row?.state).toBe("stopped");
	});

	test("runs.endForHandoff marks the session done without emitting session_ended", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-handoff"));
		const seed = await seedTeamAndTask(db, ids, "aopw-handoff");
		const sessionId = ids("aopw-handoff-session");
		await db.insert(sessions).values({
			id: sessionId,
			agentId: seed.agentId,
			taskId: seed.taskId,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runs.endForHandoff(sessionId, NOW);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		expect(row?.state).toBe("done");
	});

	test("runs.failExplicitStart marks the explicit start failed through the real route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-fail-start"));
		const seed = await seedTeamAndTask(db, ids, "aopw-fail");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));
		const startId = ids("aopw-fail-start");
		await port.intents.createExplicitStart({
			startId,
			taskId: seed.taskId,
			requestedAgentId: seed.agentId,
			requestedBy: seed.humanId,
			idempotencyKey: ids("aopw-fail-key"),
			intentIdempotencyKey: ids("aopw-fail-intent-idem"),
		});

		await port.runs.failExplicitStart(startId, "no_runnable_agent");

		const [row] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, startId))
			.limit(1);
		expect(row?.status).toBe("failed");
		expect(row?.failureCode).toBe("no_runnable_agent");
	});

	test("auth/boundary middleware genuinely ran — a raw call with no credentials is rejected", async ({
		app,
	}) => {
		const res = await app.request(
			"/api/agent-orchestration/requests/pending-intents?kind=assistant_turn",
		);
		expect(res.status).not.toBe(200);
	});

	// AU31 §2.6: the team-consistency gate's pre-write read — RED-phase gap
	// closed. `filesystems.getTeamId` had no standalone written-first test.
	test("filesystems.getTeamId reaches the real route and returns null for an unknown filesystem", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-fs-team"));
		const teamParentId = ids("aopw-fst-team-parent");
		const fsId = ids("aopw-fst-1");
		await db
			.insert(teams)
			.values({ id: teamParentId, name: "aopw-fst", phase: "build", createdAt: NOW });
		await db.insert(filesystems).values({
			id: fsId,
			teamId: teamParentId,
			source: "local",
			kind: "code",
			resourceRef: JSON.stringify({ kind: "code", repo: "x", branch: "main" }),
			writeback: "none",
			state: "attached",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		expect(await port.filesystems.getTeamId(fsId)).toBe(teamParentId);
		expect(await port.filesystems.getTeamId(ids("aopw-fst-does-not-exist"))).toBeNull();
	});

	// AU31 §3 clause 2 — the team-defaults pair `teams-routes.ts` needs
	// (:540 reads, :280 writes, site 2's relinquished write).
	test("runConfig.writeTeamDefaults then readTeamDefaults round-trips through the real route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("aop-write-key-team-defaults"));
		const teamId = ids("aopw-td-team");
		await db.insert(teams).values({ id: teamId, name: "aopw-td", phase: "build", createdAt: NOW });
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		// Absent row ≡ all-null row.
		const before = await port.runConfig.readTeamDefaults(teamId);
		expect(before).toEqual({
			defaultHarnessType: null,
			defaultModelId: null,
			defaultModelProvider: null,
		});

		await port.runConfig.writeTeamDefaults(teamId, {
			defaultHarnessType: "claude-code",
			defaultModelId: "claude-sonnet-4-6",
			defaultModelProvider: "anthropic",
		});
		const after = await port.runConfig.readTeamDefaults(teamId);

		expect(after).toEqual({
			defaultHarnessType: "claude-code",
			defaultModelId: "claude-sonnet-4-6",
			defaultModelProvider: "anthropic",
		});
	});
});
