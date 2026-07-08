import {
	agentSessionRequests,
	bets,
	messages,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { type AgentSessionRequestInput, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import type { AdapterPool } from "../../harness/adapter-pool.js";
import type { SandboxAdapter } from "../../harness/sandbox-adapter.js";
import { createAgentSessionRequest } from "../agent-session-requests.js";
import { consumeAgentSessionRequest } from "../agent-session-runtime.js";

vi.mock("../session-provisioning.js", () => ({
	admitSession: vi.fn(async (_deps, params) => ({
		sessionId: `session-${params.requestContext.sourceKind}`,
		sessionContext: {
			sessionId: `session-${params.requestContext.sourceKind}`,
			agentId: params.agentId,
			taskId: params.taskId,
			sandboxPath: "/tmp/au3-agent-layer",
			ingestion: { dispose: vi.fn() },
			traceId: `trace-${params.requestContext.sourceKind}`,
			requestContext: params.requestContext,
		},
	})),
	runSession: vi.fn(async (_deps, params) => ({
		sessionId: `session-${params.requestContext?.sourceKind ?? "direct"}`,
		outcome: "completed",
		totalCostCents: 0,
		taskId: params.taskId,
		forceReturnCount: 0,
		conversationalReply: params.conversational ? "reply" : undefined,
	})),
}));

import { test as fixtureTest } from "../../test-fixtures.js";
import { admitSession, runSession } from "../session-provisioning.js";

async function seedWork(db: Parameters<typeof createAgentSessionRequest>[0]): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-au3-agent", name: "AU3 Agent", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "tm-au3-agent", teamId: "team-au3-agent", capacity: 3, formedAt: now });
	await db.insert(users).values([
		{
			id: "agent-au3-agent",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "tm-au3-agent",
			createdAt: now,
		},
		{
			id: "u-au3-agent",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: "bet-au3-agent",
		teamId: "team-au3-agent",
		description: "Agent layer execution",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-au3-agent",
		betId: "bet-au3-agent",
		teamId: "team-au3-agent",
		title: "Execute through agent layer",
		state: "accepted",
		ownerAgentId: "agent-au3-agent",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: "thread-au3-agent",
		hostKind: "user",
		hostId: "u-au3-agent",
		initiatorId: "u-au3-agent",
		participants: JSON.stringify(["u-au3-agent", "ast-u-au3-agent"]),
		createdAt: now,
		lastActiveAt: now,
	});
	await db.insert(messages).values({
		id: "msg-au3-agent",
		threadId: "thread-au3-agent",
		senderId: "u-au3-agent",
		type: "plain",
		payload: JSON.stringify({ text: "Help" }),
		clientKey: "msg-au3-agent",
		createdAt: now,
	});
}

describe("agent session request sources", () => {
	fixtureTest("all execution sources enter the agent session request consumer", async ({ db }) => {
		await seedWork(db);
		const eventBus = new EventBus();
		const deps = {
			db,
			eventBus,
			adapterPool: {} as AdapterPool,
			workspace: {} as SandboxAdapter,
		};

		const sources: AgentSessionRequestInput[] = [
			{
				sourceKind: "task" as const,
				sourceId: "task-au3-agent",
				streamId: "task:task-au3-agent",
				taskId: "task-au3-agent",
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				promptMode: "task" as const,
				idempotencyKey: "au3:task",
				sourceCorrelation: { taskId: "task-au3-agent", teamId: "team-au3-agent" },
			},
			{
				sourceKind: "decomposition" as const,
				sourceId: "bet-au3-agent",
				streamId: "bet:bet-au3-agent:decomposition",
				taskId: null,
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				promptMode: "decomposition" as const,
				idempotencyKey: "au3:decomposition",
				sourceCorrelation: {
					betId: "bet-au3-agent",
					teamId: "team-au3-agent",
					decomposerAgentId: "agent-au3-agent",
				},
			},
			{
				sourceKind: "routine" as const,
				sourceId: "routine-run-au3-agent",
				streamId: "routine:routine-au3-agent",
				taskId: null,
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				promptMode: "routine" as const,
				idempotencyKey: "au3:routine",
				sourceCorrelation: {
					routineId: "routine-au3-agent",
					routineRunId: "routine-run-au3-agent",
					teamId: "team-au3-agent",
				},
			},
			{
				sourceKind: "assistant" as const,
				sourceId: "msg-au3-agent",
				streamId: "thread:thread-au3-agent",
				taskId: null,
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				userId: "u-au3-agent",
				promptMode: "conversation" as const,
				idempotencyKey: "au3:assistant",
				sourceCorrelation: {
					threadId: "thread-au3-agent",
					messageId: "msg-au3-agent",
					userId: "u-au3-agent",
					assistantAgentId: "ast-u-au3-agent",
				},
			},
		];

		for (const source of sources) {
			const request = await createAgentSessionRequest(db, source);
			await consumeAgentSessionRequest(deps, request, { sandboxBasePath: "/tmp/au3-agent-layer" });
		}

		expect(admitSession).toHaveBeenCalledTimes(4);
		expect(runSession).toHaveBeenCalledTimes(4);
		const rows = await db.select().from(agentSessionRequests);
		expect(rows.map((row) => row.status).sort()).toEqual([
			"completed",
			"completed",
			"completed",
			"completed",
		]);
		for (const row of rows) {
			const [stored] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, row.id));
			expect(stored?.sessionId).toBe(`session-${row.sourceKind}`);
		}
	});
});
