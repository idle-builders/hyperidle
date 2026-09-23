import type { HyperIdleDb } from "@hyperidle/db";
import { agentSessionRequests, tasks, teams, threads, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import type { AgentSessionRequestInput } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { runSession as executeAgentRunRequest } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

async function createRequestForTest(db: HyperIdleDb, request: AgentSessionRequestInput) {
	const now = new Date().toISOString();
	const [row] = await db
		.insert(agentSessionRequests)
		.values({
			id: `test-request-${request.idempotencyKey}`,
			sourceKind: request.sourceKind,
			sourceId: request.sourceId,
			streamId: request.streamId,
			agentId: request.agentId,
			userId: request.userId ?? null,
			promptMode: request.promptMode,
			payloadJson: request.payloadJson ?? null,
			idempotencyKey: request.idempotencyKey,
			teamId: request.teamId ?? null,
			taskId: request.taskId ?? null,
			sourceCorrelationJson: JSON.stringify(request.sourceCorrelation ?? {}),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}
async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "team-au6", name: "AU6", phase: "build", createdAt: now });
	await db.insert(users).values([
		{
			id: "agent-au6",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: "team-au6",
			createdAt: now,
		},
		{
			id: "user-au6",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: "thr-bet-au6",
		hostKind: "team",
		hostId: "team-au6",
		initiatorId: "agent-au6",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "bet-au6",
		threadId: "thr-bet-au6",
		parentTaskId: null,
		teamId: "team-au6",
		title: "Close agent execution boundary",
		description: "Close agent execution boundary",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: "thr-task-au6",
		hostKind: "team",
		hostId: "team-au6",
		initiatorId: "agent-au6",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-au6",
		threadId: "thr-task-au6",
		parentTaskId: "bet-au6",
		teamId: "team-au6",
		title: "Boundary task",
		state: "accepted",
		ownerAgentId: "agent-au6",
		createdAt: now,
		updatedAt: now,
	});
}

function sourceInput(
	sourceKind: AgentSessionRequestInput["sourceKind"],
	suffix: string,
): AgentSessionRequestInput {
	const base = {
		sourceId: `${sourceKind}-${suffix}`,
		streamId: `${sourceKind}:${suffix}`,
		agentId: "agent-au6",
		teamId: "team-au6",
		idempotencyKey: `${sourceKind}:${suffix}`,
	} as const;

	switch (sourceKind) {
		case "task":
			return {
				...base,
				sourceKind,
				sourceId: "task-au6",
				streamId: "task:task-au6",
				taskId: "task-au6",
				promptMode: "task",
				sourceCorrelation: { taskId: "task-au6", teamId: "team-au6" },
			};
		case "assistant":
			return {
				...base,
				sourceKind,
				userId: "user-au6",
				promptMode: "conversation",
				sourceCorrelation: {
					threadId: "thread-au6",
					messageId: `msg-${suffix}`,
					userId: "user-au6",
					agentId: "agent-au6",
				},
			};
		case "knowledge":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "knowledge",
				sourceCorrelation: {
					knowledgeItemId: `item-${suffix}`,
					action: "summarize",
					teamId: "team-au6",
				},
			};
		case "subscription":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "subscription",
				sourceCorrelation: {
					subscriptionId: `subscription-${suffix}`,
					changeId: `change-${suffix}`,
					teamId: "team-au6",
				},
			};
		case "review_resume":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "resume",
				sourceCorrelation: {
					reviewMessageId: `review-${suffix}`,
					threadId: "thread-au6",
					resumedSessionId: `sess-${suffix}`,
				},
			};
	}
}

describe("agent run boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("executes a durable request through the agent-layer boundary and publishes lifecycle", async ({
		db,
	}) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput("task", "execute"));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-au6-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementationOnce(async () => {
			const [ownerRow] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(ownerRow).toMatchObject({ status: "running", sessionId: "session-au6-boundary" });
			return {
				sessionId: "session-au6-boundary",
				outcome: "completed",
				taskId: "task-au6",
				forceReturnCount: 0,
			};
		});

		await executeAgentRunRequest(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au6-boundary" },
		);

		const [ownerRow] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(ownerRow).toMatchObject({
			id: request.id,
			sourceKind: "task",
			sourceId: "task-au6",
			status: "completed",
			sessionId: "session-au6-boundary",
		});
	});

	test("keeps failed execution lifecycle uniform when runtime throws", async ({ db }) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput("subscription", "throws"));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-au6-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockRejectedValueOnce(
			new Error("runtime exploded"),
		);

		await expect(
			executeAgentRunRequest(
				{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
				{ mode: "durable", request, sandboxBasePath: "/tmp/au6-boundary" },
			),
		).rejects.toThrow("runtime exploded");

		const [ownerRow] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(ownerRow).toMatchObject({
			sourceKind: "subscription",
			status: "failed",
			errorMessage: "runtime exploded",
		});
	});

	test("all source kinds can enter the boundary from a durable request", async ({ db }) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const eventBus = new EventBus();
		const lifecycle: Array<{ sourceKind: string; sourceId: string; state: string }> = [];
		eventBus.on("agent_run_lifecycle_changed", (event) => lifecycle.push(event));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-au6-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-au6-boundary",
			outcome: "completed",
			taskId: "task-au6",
			forceReturnCount: 0,
		}));
		for (const sourceKind of ["task", "assistant", "subscription", "knowledge"] as const) {
			const request = await createRequestForTest(db, sourceInput(sourceKind, "boundary"));
			await executeAgentRunRequest(
				{ db, eventBus, ports } as unknown as import("../contracts.js").RuntimeDeps,
				{ mode: "durable", request, sandboxBasePath: "/tmp/au6-boundary" },
			);
			const [row] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ sourceKind, status: "completed" });
		}
		expect(lifecycle).toHaveLength(4);
		expect(lifecycle.map(({ sourceKind, state }) => ({ sourceKind, state }))).toEqual(
			["task", "assistant", "subscription", "knowledge"].map((sourceKind) => ({
				sourceKind,
				state: "completed",
			})),
		);
		expect(lifecycle.filter(({ sourceKind }) => sourceKind === "assistant")).toEqual([
			expect.objectContaining({ sourceId: "assistant-boundary", state: "completed" }),
		]);
	});
});
