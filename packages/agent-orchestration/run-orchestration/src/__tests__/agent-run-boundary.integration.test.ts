/**
 * @lore AU19 Increment 3c: real cut-over — moved here from
 * `packages/server/src/services/__tests__/agent-run-boundary.test.ts`
 * (a `.test.ts` using `createTestDb()` directly — a pre-existing rule
 * violation, same shape session-requests' own `agent-session-requests.test.ts`
 * had before its Increment 3b fix). Converted to `@hyperidle/db/test-fixtures`'s
 * `{ db }`-only fixture pattern, renamed `.integration.test.ts` — same
 * DB-fixture naming convention every other migrated package's DB test
 * follows. `session-provisioning.js`'s module-level `vi.mock` (the harness-
 * execution boundary) becomes an explicit `sessionProvisioner` port override
 * per test — `test-ports.ts`'s `buildTestPorts()` supplies REAL
 * `sessionRequests` behavior (this Service's own real, same-layer target)
 * and a reproduced-but-real `sessionLifecycle.transitionAgentRunLifecycle`
 * (see that file's top `@lore`).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { agentSessionRequests, bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { claimSessionRequest, createSessionRequest } from "@hyperidle/session-requests";
import { type AgentSessionRequestInput, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import {
	executeAgentRunRequest,
	getAgentRunLifecycle,
	listAgentRunLifecycleBySource,
} from "../agent-run-boundary.js";
import { buildTestPorts, testMarkRequestRunning, testTerminalize } from "./test-ports.js";

const createRequestForTest = (db: HyperIdleDb, request: AgentSessionRequestInput) =>
	createSessionRequest(db, { kind: "direct", request });
const claimRequestForTest = (
	db: HyperIdleDb,
	requestId: string,
	workerId: string,
	options: { now: Date; leaseMs: number },
) => claimSessionRequest(db, { id: requestId }, { workerId, ...options });

async function seedBase(db: HyperIdleDb): Promise<void> {
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
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("normalizes request lifecycle for domain observers without runtime imports", async ({
		db,
	}) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const requests = await Promise.all(
			["pending", "claimed", "running", "completed", "failed", "cancelled"].map(async (status) => {
				const request = await createRequestForTest(db, sourceInput("task", `lifecycle-${status}`));
				if (status === "claimed") {
					await claimRequestForTest(db, request.id, "worker-au6", {
						now: new Date("2026-07-10T10:00:00.000Z"),
						leaseMs: 30_000,
					});
				}
				if (status === "running") await testMarkRequestRunning(db, request.id, "session-running");
				if (status === "completed" || status === "failed" || status === "cancelled") {
					const sessionId = `session-${status}`;
					await testMarkRequestRunning(db, request.id, sessionId);
					await testTerminalize(db, {
						requestId: request.id,
						precondition: "running",
						sessionId,
						to: status,
						...(status === "failed" ? { failureCode: "HarnessError", errorMessage: "boom" } : {}),
					});
				}
				return { status, id: request.id };
			}),
		);

		const observed = await Promise.all(
			requests.map(async ({ status, id }) => ({
				status,
				lifecycle: await getAgentRunLifecycle(db, id, ports),
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

	test("executes a durable request through the agent-layer boundary and publishes lifecycle", async ({
		db,
	}) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput("task", "execute"));
		vi.mocked(ports.sessionProvisioner.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-au6-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner.runSession).mockImplementationOnce(async () => {
			const lifecycle = await getAgentRunLifecycle(db, request.id, ports);
			expect(lifecycle).toMatchObject({ state: "running", sessionId: "session-au6-boundary" });
			return {
				sessionId: "session-au6-boundary",
				outcome: "completed",
				totalCostCents: 0,
				taskId: "task-au6",
				forceReturnCount: 0,
			};
		});

		await executeAgentRunRequest(
			{ db, eventBus: new EventBus() },
			request,
			{ sandboxBasePath: "/tmp/au6-boundary" },
			ports,
		);

		await expect(getAgentRunLifecycle(db, request.id, ports)).resolves.toMatchObject({
			requestId: request.id,
			sourceKind: "task",
			sourceId: "task-au6",
			state: "completed",
			sessionId: "session-au6-boundary",
		});
	});

	test("reports the same failed lifecycle shape for every LLM-capable source kind", async ({
		db,
	}) => {
		await seedBase(db);
		const ports = buildTestPorts();
		for (const sourceKind of [
			"task",
			"assistant",
			"routine",
			"knowledge",
			"decomposition",
			"proposed_call",
		] as const) {
			const request = await createRequestForTest(db, sourceInput(sourceKind, "failed"));
			const sessionId = `session-${sourceKind}-failed`;
			await testMarkRequestRunning(db, request.id, sessionId);
			await testTerminalize(db, {
				requestId: request.id,
				precondition: "running",
				sessionId,
				to: "failed",
				failureCode: "AgentRunFailed",
				errorMessage: `${sourceKind} failed`,
			});
			await expect(getAgentRunLifecycle(db, request.id, ports)).resolves.toMatchObject({
				sourceKind,
				state: "failed",
				error: { code: "AgentRunFailed", message: `${sourceKind} failed` },
			});
		}
	});

	test("lists lifecycle by source so domain code reacts without execution internals", async ({
		db,
	}) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput("assistant", "source-list"));
		await testMarkRequestRunning(db, request.id, "session-source-list");

		await expect(
			listAgentRunLifecycleBySource(db, "assistant", request.sourceId, ports),
		).resolves.toEqual([
			expect.objectContaining({
				requestId: request.id,
				sourceKind: "assistant",
				state: "running",
				sessionId: "session-source-list",
			}),
		]);
	});

	test("keeps failed execution lifecycle uniform when runtime throws", async ({ db }) => {
		await seedBase(db);
		const ports = buildTestPorts();
		const request = await createRequestForTest(db, sourceInput("routine", "throws"));
		vi.mocked(ports.sessionProvisioner.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-au6-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner.runSession).mockRejectedValueOnce(
			new Error("runtime exploded"),
		);

		await expect(
			executeAgentRunRequest(
				{ db, eventBus: new EventBus() },
				request,
				{ sandboxBasePath: "/tmp/au6-boundary" },
				ports,
			),
		).rejects.toThrow("runtime exploded");

		await expect(getAgentRunLifecycle(db, request.id, ports)).resolves.toMatchObject({
			sourceKind: "routine",
			state: "failed",
			error: { code: "Error", message: "runtime exploded" },
		});
	});

	test("all source kinds can enter the boundary from a durable request", async ({ db }) => {
		await seedBase(db);
		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-au6-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner.runSession).mockImplementation(async () => ({
			sessionId: "session-au6-boundary",
			outcome: "completed",
			totalCostCents: 0,
			taskId: "task-au6",
			forceReturnCount: 0,
		}));
		for (const sourceKind of [
			"task",
			"assistant",
			"routine",
			"knowledge",
			"decomposition",
			"proposed_call",
		] as const) {
			const request = await createRequestForTest(db, sourceInput(sourceKind, "boundary"));
			await executeAgentRunRequest(
				{ db, eventBus: new EventBus() },
				request,
				{ sandboxBasePath: "/tmp/au6-boundary" },
				ports,
			);
			const [row] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ sourceKind, status: "completed" });
		}
	});
});
