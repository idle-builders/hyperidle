import {
	agentSessionRequests,
	bets,
	createTestDb,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import {
	claimAgentSessionRequestById,
	createAgentSessionRequest,
} from "@hyperidle/session-requests";
import { type AgentSessionRequestInput, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdapterPool } from "../../harness/adapter-pool.js";
import type { SandboxAdapter } from "../../harness/sandbox-adapter.js";
import { runSession } from "../session-provisioning.js";
import {
	markRequestRunning,
	terminalizeAgentSessionRequest,
} from "../session-requests-bindings.js";

vi.mock("../session-provisioning.js", () => ({
	admitSession: vi.fn(async (_deps, params) => ({
		sessionId: "session-au6-boundary",
		sessionContext: {
			sessionId: "session-au6-boundary",
			agentId: params.agentId,
			taskId: params.taskId,
			sandboxPath: "/tmp/au6-boundary/session-au6-boundary",
			ingestion: { dispose: vi.fn() },
			traceId: "trace-au6-boundary",
			requestContext: params.requestContext,
		},
	})),
	runSession: vi.fn(async () => ({
		sessionId: "session-au6-boundary",
		outcome: "completed",
		totalCostCents: 0,
		taskId: "task-au6",
		forceReturnCount: 0,
	})),
}));

async function loadBoundary() {
	return import("../agent-run-boundary.js");
}

async function seedBase(db: TestDbHandle["db"]): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "team-au6", name: "AU6", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: "member-au6",
		teamId: "team-au6",
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: "agent-au6",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: "member-au6",
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
	await db.insert(bets).values({
		id: "bet-au6",
		teamId: "team-au6",
		description: "Close agent execution boundary",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-au6",
		betId: "bet-au6",
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
					assistantAgentId: "agent-au6",
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
					teamId: "team-au6",
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
		case "decomposition":
			return {
				...base,
				sourceKind,
				taskId: null,
				sourceId: "bet-au6",
				promptMode: "decomposition",
				sourceCorrelation: {
					betId: "bet-au6",
					teamId: "team-au6",
					decomposerAgentId: "agent-au6",
				},
			};
		case "proposed_call":
			return {
				...base,
				sourceKind,
				taskId: "task-au6",
				promptMode: "proposed_call",
				sourceCorrelation: {
					taskId: "task-au6",
					proposedCallId: `proposed-call-${suffix}`,
					grantedAgentId: "agent-au6",
				},
			};
	}
}

describe("agent run boundary", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		await seedBase(handle.db);
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await handle.close();
	});

	test("normalizes request lifecycle for domain observers without runtime imports", async () => {
		const boundary = await loadBoundary();
		const requests = await Promise.all(
			["pending", "claimed", "running", "completed", "failed", "cancelled"].map(async (status) => {
				const request = await createAgentSessionRequest(
					handle.db,
					sourceInput("task", `lifecycle-${status}`),
				);
				if (status === "claimed") {
					await claimAgentSessionRequestById(handle.db, request.id, "worker-au6", {
						now: new Date("2026-07-10T10:00:00.000Z"),
						leaseMs: 30_000,
					});
				}
				if (status === "running")
					await markRequestRunning(handle.db, request.id, "session-running");
				if (status === "completed" || status === "failed" || status === "cancelled") {
					const sessionId = `session-${status}`;
					await markRequestRunning(handle.db, request.id, sessionId);
					await terminalizeAgentSessionRequest(handle.db, {
						requestId: request.id,
						precondition: "running",
						sessionId,
						state: status,
						...(status === "failed" ? { failureCode: "HarnessError", errorMessage: "boom" } : {}),
					});
				}
				return { status, id: request.id };
			}),
		);

		const observed = await Promise.all(
			requests.map(async ({ status, id }) => ({
				status,
				lifecycle: await boundary.getAgentRunLifecycle(handle.db, id),
			})),
		);

		expect(
			Object.fromEntries(observed.map(({ status, lifecycle }) => [status, lifecycle?.state])),
		).toEqual({
			pending: "requested",
			claimed: "requested",
			running: "running",
			completed: "completed",
			failed: "failed",
			cancelled: "cancelled",
		});
		expect(observed.find(({ status }) => status === "failed")?.lifecycle).toMatchObject({
			error: { code: "HarnessError", message: "boom" },
		});
	});

	test("executes a durable request through the agent-layer boundary and publishes lifecycle", async () => {
		const boundary = await loadBoundary();
		const request = await createAgentSessionRequest(handle.db, sourceInput("task", "execute"));
		vi.mocked(runSession).mockImplementationOnce(async () => {
			const lifecycle = await boundary.getAgentRunLifecycle(handle.db, request.id);
			expect(lifecycle).toMatchObject({ state: "running", sessionId: "session-au6-boundary" });
			return {
				sessionId: "session-au6-boundary",
				outcome: "completed",
				totalCostCents: 0,
				taskId: "task-au6",
				forceReturnCount: 0,
			};
		});

		await boundary.executeAgentRunRequest(
			{
				db: handle.db,
				eventBus: new EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			request,
			{ sandboxBasePath: "/tmp/au6-boundary" },
		);

		await expect(boundary.getAgentRunLifecycle(handle.db, request.id)).resolves.toMatchObject({
			requestId: request.id,
			sourceKind: "task",
			sourceId: "task-au6",
			state: "completed",
			sessionId: "session-au6-boundary",
		});
	});

	test("reports the same failed lifecycle shape for every LLM-capable source kind", async () => {
		const boundary = await loadBoundary();
		for (const sourceKind of [
			"task",
			"assistant",
			"routine",
			"knowledge",
			"decomposition",
			"proposed_call",
		] as const) {
			const request = await createAgentSessionRequest(handle.db, sourceInput(sourceKind, "failed"));
			const sessionId = `session-${sourceKind}-failed`;
			await markRequestRunning(handle.db, request.id, sessionId);
			await terminalizeAgentSessionRequest(handle.db, {
				requestId: request.id,
				precondition: "running",
				sessionId,
				state: "failed",
				failureCode: "AgentRunFailed",
				errorMessage: `${sourceKind} failed`,
			});
			await expect(boundary.getAgentRunLifecycle(handle.db, request.id)).resolves.toMatchObject({
				sourceKind,
				state: "failed",
				error: { code: "AgentRunFailed", message: `${sourceKind} failed` },
			});
		}
	});

	test("lists lifecycle by source so domain code reacts without execution internals", async () => {
		const boundary = await loadBoundary();
		const request = await createAgentSessionRequest(
			handle.db,
			sourceInput("assistant", "source-list"),
		);
		await markRequestRunning(handle.db, request.id, "session-source-list");

		await expect(
			boundary.listAgentRunLifecycleBySource(handle.db, "assistant", request.sourceId),
		).resolves.toEqual([
			expect.objectContaining({
				requestId: request.id,
				sourceKind: "assistant",
				state: "running",
				sessionId: "session-source-list",
			}),
		]);
	});

	test("keeps failed execution lifecycle uniform when runtime throws", async () => {
		const boundary = await loadBoundary();
		const request = await createAgentSessionRequest(handle.db, sourceInput("routine", "throws"));
		vi.mocked(runSession).mockRejectedValueOnce(new Error("runtime exploded"));

		await expect(
			boundary.executeAgentRunRequest(
				{
					db: handle.db,
					eventBus: new EventBus(),
					adapterPool: {} as AdapterPool,
					workspace: {} as SandboxAdapter,
				},
				request,
				{ sandboxBasePath: "/tmp/au6-boundary" },
			),
		).rejects.toThrow("runtime exploded");

		await expect(boundary.getAgentRunLifecycle(handle.db, request.id)).resolves.toMatchObject({
			sourceKind: "routine",
			state: "failed",
			error: { code: "Error", message: "runtime exploded" },
		});
	});

	test("all source kinds can enter the boundary from a durable request", async () => {
		const boundary = await loadBoundary();
		for (const sourceKind of [
			"task",
			"assistant",
			"routine",
			"knowledge",
			"decomposition",
			"proposed_call",
		] as const) {
			const request = await createAgentSessionRequest(
				handle.db,
				sourceInput(sourceKind, "boundary"),
			);
			await boundary.executeAgentRunRequest(
				{
					db: handle.db,
					eventBus: new EventBus(),
					adapterPool: {} as AdapterPool,
					workspace: {} as SandboxAdapter,
				},
				request,
				{ sandboxBasePath: "/tmp/au6-boundary" },
			);
			const [row] = await handle.db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ sourceKind, status: "completed" });
		}
	});
});
