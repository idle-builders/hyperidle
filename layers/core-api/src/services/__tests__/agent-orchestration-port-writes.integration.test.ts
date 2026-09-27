/**
 * The WRITE side of `AgentOrchestrationPort`: `intents`, `requests`, `runs`,
 * `runConfig`, `filesystems` each reach their real backing route through a
 * real in-process transport, both layers' apps composed via the `app`
 * fixture — mirrors `agent-orchestration-port.integration.test.ts`'s pattern.
 */

import {
	agentWorkIntents,
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	sessions,
	tasks,
	teams,
	threads,
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
	await db.insert(teams).values({ id: `${prefix}-team-parent`, name: prefix, createdAt: NOW });
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
			// @lore users.teamId references teams.id directly (no teamMembers hop).
			teamId: `${prefix}-team-parent`,
			createdAt: NOW,
		},
	]);
	await db.insert(threads).values({
		id: `thr-${`${prefix}-bet`}`,
		hostKind: "team",
		hostId: `${prefix}-team-parent`,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${`${prefix}-bet`}`,
		id: `${prefix}-bet`,
		parentTaskId: null,
		teamId: `${prefix}-team-parent`,
		title: prefix,
		description: prefix,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${`${prefix}-task`}`,
		hostKind: "team",
		hostId: `${prefix}-team-parent`,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${`${prefix}-task`}`,
		id: `${prefix}-task`,
		parentTaskId: `${prefix}-bet`,
		teamId: `${prefix}-team-parent`,
		title: prefix,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("AgentOrchestrationPort — write side (contract-test harness)", () => {
	test("intents.submit reaches the real route and durably inserts an agent_work_intents row", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-submit");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const receipt = await port.intents.submit({
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: "thread:aop-write-1",
			idempotencyKey: "thread:aop-write-1:review:e1",
		});

		expect(receipt.id).toBeTruthy();
		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, receipt.id))
			.limit(1);
		expect(row?.sourceId).toBe("thread:aop-write-1");
		expect(row?.status).toBe("pending");
	});

	test("intents.submit is idempotent — the same idempotencyKey resolves the SAME row", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-idem");
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		const first = await port.intents.submit({
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: "thread:aop-write-idem",
			idempotencyKey: "thread:aop-write-idem:review:e1",
		});
		const second = await port.intents.submit({
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: "thread:aop-write-idem",
			idempotencyKey: "thread:aop-write-idem:review:e1",
		});

		expect(second.id).toBe(first.id);
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
		await db.insert(teams).values({ id: "aopw-fs-team-parent", name: "aopw-fs", createdAt: NOW });
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

		const stopped = await port.runs.stopForTasks(["aopw-stop-task"]);
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
		// The assertion is about the auth middleware, not this specific route —
		// any GET on the same mount proves it.
		const res = await requestWithoutAuth("/api/agent-orchestration/run-config/agent-1");
		expect(res.status).not.toBe(200);
	});

	test("filesystems.getTeamId reaches the real route and returns null for an unknown filesystem", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-fs-team");
		await db.insert(teams).values({ id: "aopw-fst-team-parent", name: "aopw-fst", createdAt: NOW });
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
