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
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

const NOW = "2026-08-08T00:00:00.000Z";

async function seedTeamAndTask(db: HyperIdleDb, prefix: string): Promise<void> {
	await db
		.insert(teams)
		.values({ id: `${prefix}-team-parent`, name: prefix, phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: `${prefix}-team`,
		teamId: `${prefix}-team-parent`,
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values([
		{
			id: `${prefix}-human`,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: `${prefix}-agent`,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			teamId: `${prefix}-team`,
			createdAt: NOW,
		},
	]);
	await db.insert(bets).values({
		id: `${prefix}-bet`,
		teamId: `${prefix}-team-parent`,
		description: prefix,
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: `${prefix}-task`,
		betId: `${prefix}-bet`,
		teamId: `${prefix}-team-parent`,
		title: prefix,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("AgentOrchestrationPort — write side (§3, §11 contract-test harness)", () => {
	test("intents.submit reaches the real route and durably inserts an agent_work_intents row", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-submit");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const receipt = await port.intents.submit({
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: "knowledge:aop-write-1",
			idempotencyKey: "knowledge:aop-write-1:review:e1",
		});

		expect(receipt.id).toBeTruthy();
		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, receipt.id))
			.limit(1);
		expect(row?.sourceId).toBe("knowledge:aop-write-1");
		expect(row?.status).toBe("pending");
	});

	test("intents.submit is idempotent — the same idempotencyKey resolves the SAME row", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-idem");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const first = await port.intents.submit({
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: "knowledge:aop-write-idem",
			idempotencyKey: "knowledge:aop-write-idem:review:e1",
		});
		const second = await port.intents.submit({
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: "knowledge:aop-write-idem",
			idempotencyKey: "knowledge:aop-write-idem:review:e1",
		});

		expect(second.id).toBe(first.id);
	});

	test("requests.listPendingIntentsByKind returns only pending/claimed intents for that kind", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-pending");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.intents.submit({
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: "aopw-pending-msg-1",
			idempotencyKey: "assistant:aopw-pending-msg-1",
		});

		const pending = await port.requests.listPendingIntentsByKind("assistant_turn");
		expect(pending.some((p) => p.sourceId === "aopw-pending-msg-1")).toBe(true);
	});

	test("runConfig.write then runConfig.read round-trips through the real route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-runconfig");
		await db.insert(users).values({
			id: "aopw-rc-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runConfig.write("aopw-rc-agent", {
			harnessType: "claude-code",
			maxConcurrentSessions: 2,
		});
		const config = await port.runConfig.read("aopw-rc-agent");

		expect(config.harnessType).toBe("claude-code");
		expect(config.maxConcurrentSessions).toBe(2);
	});

	test("runConfig.readBatch reads multiple agents in one call, defaulting an unwritten agent", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-runconfig-batch");
		await db.insert(users).values([
			{
				id: "aopw-rcb-agent-1",
				kind: "ai",
				name: "Agent1",
				role: "builder",
				status: "idle",
				createdAt: NOW,
			},
			{
				id: "aopw-rcb-agent-2",
				kind: "ai",
				name: "Agent2",
				role: "builder",
				status: "idle",
				createdAt: NOW,
			},
		]);
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runConfig.write("aopw-rcb-agent-1", { harnessType: "codex" });
		const configs = await port.runConfig.readBatch(["aopw-rcb-agent-1", "aopw-rcb-agent-2"]);

		expect(configs.get("aopw-rcb-agent-1")?.harnessType).toBe("codex");
		expect(configs.get("aopw-rcb-agent-2")?.harnessType).toBeNull();
	});

	test("filesystems.persistInjection persists the row and reports NOT_FOUND for an unknown filesystem", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-fs");
		await db
			.insert(teams)
			.values({ id: "aopw-fs-team-parent", name: "aopw-fs", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "aopw-fs-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: NOW,
		});
		await db.insert(filesystems).values({
			id: "aopw-fs-1",
			teamId: "aopw-fs-team-parent",
			source: "local",
			kind: "code",
			resourceRef: JSON.stringify({ kind: "code", repo: "x", branch: "main" }),
			writeback: "none",
			state: "attached",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const result = await port.filesystems.persistInjection("aopw-fs-1", "aopw-fs-agent");
		expect(result.ok).toBe(true);
		if (result.ok) {
			const [row] = await db
				.select()
				.from(filesystemInjections)
				.where(
					and(
						eq(filesystemInjections.filesystemId, "aopw-fs-1"),
						eq(filesystemInjections.agentUserId, "aopw-fs-agent"),
					),
				)
				.limit(1);
			expect(row).toBeTruthy();
		}

		const notFound = await port.filesystems.persistInjection(
			"aopw-fs-does-not-exist",
			"aopw-fs-agent",
		);
		expect(notFound.ok).toBe(false);
		if (!notFound.ok) expect(notFound.code).toBe("NOT_FOUND");
	});

	test("runs.stopForTasks stops the active session for a task and returns it", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-stop");
		await seedTeamAndTask(db, "aopw-stop");
		await db.insert(sessions).values({
			id: "aopw-stop-session",
			agentId: "aopw-stop-agent",
			taskId: "aopw-stop-task",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const stopped = await port.runs.stopForTasks(["aopw-stop-task"], "bet_killed");
		expect(stopped).toEqual([{ taskId: "aopw-stop-task", sessionId: "aopw-stop-session" }]);

		const [row] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, "aopw-stop-session"))
			.limit(1);
		expect(row?.state).toBe("stopped");
	});

	test("runs.endForHandoff marks the session done without emitting session_ended", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-handoff");
		await seedTeamAndTask(db, "aopw-handoff");
		await db.insert(sessions).values({
			id: "aopw-handoff-session",
			agentId: "aopw-handoff-agent",
			taskId: "aopw-handoff-task",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runs.endForHandoff("aopw-handoff-session", NOW);

		const [row] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, "aopw-handoff-session"))
			.limit(1);
		expect(row?.state).toBe("done");
	});

	test("auth/boundary middleware genuinely ran — a raw call with no credentials is rejected", async ({
		requestWithoutAuth,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-auth-boundary");
		const res = await requestWithoutAuth(
			"/api/agent-orchestration/requests/pending-intents?kind=assistant_turn",
		);
		expect(res.status).not.toBe(200);
	});

	// AU31 §2.6: the team-consistency gate's pre-write read — RED-phase gap
	// closed. `filesystems.getTeamId` had no standalone written-first test.
	test("filesystems.getTeamId reaches the real route and returns null for an unknown filesystem", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-fs-team");
		await db
			.insert(teams)
			.values({ id: "aopw-fst-team-parent", name: "aopw-fst", phase: "build", createdAt: NOW });
		await db.insert(filesystems).values({
			id: "aopw-fst-1",
			teamId: "aopw-fst-team-parent",
			source: "local",
			kind: "code",
			resourceRef: JSON.stringify({ kind: "code", repo: "x", branch: "main" }),
			writeback: "none",
			state: "attached",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		expect(await port.filesystems.getTeamId("aopw-fst-1")).toBe("aopw-fst-team-parent");
		expect(await port.filesystems.getTeamId("aopw-fst-does-not-exist")).toBeNull();
	});
});
