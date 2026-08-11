import type { HyperIdleDb } from "@hyperidle/db";
import { agentSessionRequests, bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { expect, type ScopedIds, test } from "@hyperidle/db/test-fixtures";
import type { AgentSessionRequestInput } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { createSessionRequest } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { runSession as executeAgentRunRequest } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

const createRequestForTest = (db: HyperIdleDb, request: AgentSessionRequestInput) =>
	createSessionRequest(db, { kind: "direct", request });
async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("team-au6"), name: "AU6", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: ids("member-au6"),
		teamId: ids("team-au6"),
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: ids("agent-au6"),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: ids("member-au6"),
			createdAt: now,
		},
		{
			id: ids("user-au6"),
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: ids("bet-au6"),
		teamId: ids("team-au6"),
		description: "Close agent execution boundary",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: ids("task-au6"),
		betId: ids("bet-au6"),
		teamId: ids("team-au6"),
		title: "Boundary task",
		state: "accepted",
		ownerAgentId: ids("agent-au6"),
		createdAt: now,
		updatedAt: now,
	});
}

function sourceInput(
	ids: ScopedIds,
	sourceKind: AgentSessionRequestInput["sourceKind"],
	suffix: string,
): AgentSessionRequestInput {
	const base = {
		sourceId: `${sourceKind}-${suffix}`,
		streamId: `${sourceKind}:${suffix}`,
		agentId: ids("agent-au6"),
		teamId: ids("team-au6"),
		idempotencyKey: `${sourceKind}:${suffix}`,
	} as const;

	switch (sourceKind) {
		case "task":
			return {
				...base,
				sourceKind,
				sourceId: ids("task-au6"),
				streamId: `task:${ids("task-au6")}`,
				taskId: ids("task-au6"),
				promptMode: "task",
				sourceCorrelation: { taskId: ids("task-au6"), teamId: ids("team-au6") },
			};
		case "assistant":
			return {
				...base,
				sourceKind,
				userId: ids("user-au6"),
				promptMode: "conversation",
				sourceCorrelation: {
					threadId: ids("thread-au6"),
					messageId: `msg-${suffix}`,
					userId: ids("user-au6"),
					assistantAgentId: ids("agent-au6"),
				},
			};
		case "routine":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "routine",
				sourceCorrelation: {
					routineId: `routine-${suffix}`,
					routineRunId: `routine-run-${suffix}`,
					teamId: ids("team-au6"),
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
					teamId: ids("team-au6"),
				},
			};
		case "proposed_call":
			return {
				...base,
				sourceKind,
				taskId: ids("task-au6"),
				promptMode: "proposed_call",
				sourceCorrelation: {
					taskId: ids("task-au6"),
					proposedCallId: `proposed-call-${suffix}`,
					grantedAgentId: ids("agent-au6"),
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
		ids,
	}) => {
		await seedBase(db, ids);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput(ids, "task", ids("execute")));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-au6-boundary"),
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementationOnce(async () => {
			const [ownerRow] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(ownerRow).toMatchObject({
				status: "running",
				sessionId: ids("session-au6-boundary"),
			});
			return {
				sessionId: ids("session-au6-boundary"),
				outcome: "completed",
				taskId: ids("task-au6"),
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
			sourceId: ids("task-au6"),
			status: "completed",
			sessionId: ids("session-au6-boundary"),
		});
	});

	test("keeps failed execution lifecycle uniform when runtime throws", async ({ db, ids }) => {
		await seedBase(db, ids);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput(ids, "routine", ids("throws")));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-au6-boundary"),
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
			sourceKind: "routine",
			status: "failed",
			errorMessage: "runtime exploded",
		});
	});

	test("all source kinds can enter the boundary from a durable request", async ({ db, ids }) => {
		await seedBase(db, ids);
		const ports = buildTestPorts();
		const eventBus = new EventBus();
		const lifecycle: Array<{ sourceKind: string; sourceId: string; state: string }> = [];
		eventBus.on("agent_run_lifecycle_changed", (event) => lifecycle.push(event));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-au6-boundary"),
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: ids("session-au6-boundary"),
			outcome: "completed",
			taskId: ids("task-au6"),
			forceReturnCount: 0,
		}));
		for (const sourceKind of [
			"task",
			"assistant",
			"routine",
			"knowledge",
			"proposed_call",
		] as const) {
			const request = await createRequestForTest(db, sourceInput(ids, sourceKind, ids("boundary")));
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
		expect(lifecycle).toHaveLength(5);
		expect(lifecycle.map(({ sourceKind, state }) => ({ sourceKind, state }))).toEqual(
			["task", "assistant", "routine", "knowledge", "proposed_call"].map((sourceKind) => ({
				sourceKind,
				state: "completed",
			})),
		);
		expect(lifecycle.filter(({ sourceKind }) => sourceKind === "assistant")).toEqual([
			expect.objectContaining({
				sourceId: `assistant-${ids("boundary")}`,
				state: "completed",
			}),
		]);
	});
});
