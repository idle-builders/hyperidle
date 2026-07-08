import {
	agentSessionRequests,
	knowledgeItems,
	messages,
	sessions,
	tasks,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { disposeApp } from "../app.js";
import { runAssistantTurn } from "../services/assistant-turn.js";
import { runBetDecomposition } from "../services/bet-decomposition.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test as integrationTest } from "../test-fixtures.js";
import { createTestApp } from "../test-utils.js";
import {
	seedAssistantTurnFixture,
	seedDecompositionFixture,
	seedPublicTaskSessionFixture,
} from "./AU1-fixtures.js";

vi.mock("../services/session-provisioning.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../services/session-provisioning.js")>();
	return {
		...original,
		startSessionProvision: vi.fn(async () => {
			throw new Error("AU1 public session route must not bypass AgentSessionRequest");
		}),
		admitSession: vi.fn(async (deps, params) => {
			const dbModule = await import("@hyperidle/db");
			const sessionId = `session-${params.requestContext?.requestId ?? "au1"}`;
			await deps.db.insert(dbModule.sessions).values({
				id: sessionId,
				taskId: params.taskId,
				...(params.requestContext
					? {
							requestId: params.requestContext.requestId,
							sourceKind: params.requestContext.sourceKind,
							sourceId: params.requestContext.sourceId,
							sourceCorrelationJson: JSON.stringify(params.requestContext.sourceCorrelation),
						}
					: {}),
				agentId: params.agentId,
				modelTier: params.modelTier ?? "workhorse",
				startedAt: "2026-07-08T12:00:00.000Z",
				state: "active",
			});
			return {
				sessionId,
				sessionContext: {
					sessionId,
					agentId: params.agentId,
					taskId: params.taskId,
					sandboxPath: "/tmp/au1-domain-test",
					ingestion: { dispose: vi.fn() },
					traceId: "trace-au1",
					requestContext: params.requestContext,
				},
			};
		}),
		runSession: vi.fn(async () => ({
			sessionId: "session-au1-assistant",
			outcome: "completed",
			totalCostCents: 0,
			taskId: null,
			forceReturnCount: 0,
			conversationalReply: "AU1 assistant reply",
		})),
	};
});

describe("domain-to-runtime request boundary", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-au1-domain-boundary");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	integrationTest(
		"assistant turn creates a task-free request and no conv-stub task",
		async ({ db }) => {
			const fixture = await seedAssistantTurnFixture(db);
			setActiveStrategy(fixture.strategy);
			try {
				await runAssistantTurn(
					{
						db,
						eventBus: new EventBus(),
						adapterPool: fixture.adapterPool,
						credentialResolver: fixture.credentialResolver,
					},
					{
						userId: fixture.userId,
						threadId: fixture.threadId,
						triggerMessageId: fixture.messageId,
					},
				);
			} finally {
				clearActiveStrategy();
			}

			const requests = await db.select().from(agentSessionRequests);
			expect(requests).toHaveLength(1);
			expect(requests[0]).toMatchObject({
				sourceKind: "assistant",
				sourceId: fixture.messageId,
				taskId: null,
				promptMode: "conversation",
			});
			const stubTasks = await db.select().from(tasks).where(like(tasks.id, "conv-stub-task-%"));
			expect(stubTasks).toHaveLength(0);
			const replies = await db
				.select()
				.from(messages)
				.where(eq(messages.senderId, fixture.assistantId));
			expect(replies).toHaveLength(1);
		},
	);

	integrationTest(
		"bet decomposition records a decomposition request before any real PM run",
		async ({ db }) => {
			const fixture = await seedDecompositionFixture(db);
			setActiveStrategy(fixture.strategy);
			try {
				await runBetDecomposition(
					{
						db,
						eventBus: new EventBus(),
						adapterPool: fixture.adapterPool,
						sandbox: fixture.sandbox,
						sandboxBasePath: fixture.sandboxBasePath,
						resolveModel: async () => fixture.resolvedModel,
					},
					fixture.betId,
				);
			} finally {
				clearActiveStrategy();
			}

			const requests = await db.select().from(agentSessionRequests);
			expect(requests).toHaveLength(1);
			expect(requests[0]).toMatchObject({
				sourceKind: "decomposition",
				sourceId: fixture.betId,
				taskId: null,
				promptMode: "decomposition",
			});
		},
	);

	integrationTest(
		"public task-backed session route creates and consumes a task request",
		async ({ db, eventBus }) => {
			const provisioning = await import("../services/session-provisioning.js");
			const fixture = await seedPublicTaskSessionFixture(db);
			const app = await createTestApp({
				db,
				eventBus,
				adapterPool: fixture.adapterPool,
				workspaceAdapter: fixture.sandbox,
				credentialResolver: fixture.credentialResolver,
			});
			try {
				const res = await app.request("/api/sessions", {
					method: "POST",
					headers: {
						"X-API-Key": "test-key-au1-domain-boundary",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						agentId: fixture.agentId,
						taskId: fixture.taskId,
						modelTier: "workhorse",
					}),
				});

				expect(res.status).toBe(202);
				expect(provisioning.startSessionProvision).not.toHaveBeenCalled();

				const requests = await db.select().from(agentSessionRequests);
				expect(requests).toHaveLength(1);
				expect(requests[0]).toMatchObject({
					sourceKind: "task",
					sourceId: fixture.taskId,
					taskId: fixture.taskId,
					agentId: fixture.agentId,
					teamId: fixture.teamId,
				});
				expect(["running", "completed"]).toContain(requests[0]?.status);

				const rows = await db.select().from(sessions);
				expect(rows).toHaveLength(1);
				expect(rows[0]).toMatchObject({
					requestId: requests[0]?.id,
					sourceKind: "task",
					sourceId: fixture.taskId,
					taskId: fixture.taskId,
				});
				expect(JSON.parse(rows[0]?.sourceCorrelationJson ?? "{}")).toMatchObject({
					taskId: fixture.taskId,
					teamId: fixture.teamId,
				});
			} finally {
				disposeApp(app);
			}
		},
	);

	integrationTest(
		"knowledge flag-for-review action creates a knowledge request without provisioning",
		async ({ db, eventBus }) => {
			const agentId = "agent-au1-knowledge";
			const itemId = "knowledge-au1";
			await db.insert(users).values({
				id: agentId,
				kind: "ai",
				name: "AU1 Knowledge Reviewer",
				role: "practice_facilitator",
				status: "active",
				harnessType: "builtin",
				createdAt: "2026-07-08T12:00:00.000Z",
			});
			await db.insert(knowledgeItems).values({
				id: itemId,
				scopeKind: "factory",
				scopeId: null,
				topic: "AU1",
				title: "AU1 knowledge item",
				body: "Review me",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: agentId,
				createdAt: "2026-07-08T12:00:00.000Z",
				updatedAt: "2026-07-08T12:00:00.000Z",
			});
			const app = await createTestApp({ db, eventBus });
			try {
				const res = await app.request(`/api/knowledge/${itemId}/flag`, {
					method: "POST",
					headers: {
						"X-API-Key": "test-key-au1-domain-boundary",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						reason: "needs agent review",
						agentId,
					}),
				});

				expect(res.status).toBe(200);

				const requests = await db.select().from(agentSessionRequests);
				expect(requests).toHaveLength(1);
				expect(requests[0]).toMatchObject({
					sourceKind: "knowledge",
					sourceId: `knowledge:${itemId}`,
					taskId: null,
					agentId,
					promptMode: "knowledge",
					status: "pending",
				});
				expect(JSON.parse(requests[0]?.sourceCorrelationJson ?? "{}")).toMatchObject({
					knowledgeItemId: itemId,
					action: "review",
				});

				const sessionRows = await db.select().from(sessions);
				expect(sessionRows).toHaveLength(0);
			} finally {
				disposeApp(app);
			}
		},
	);

	integrationTest("knowledge events alone do not provision directly", async ({ db }) => {
		const eventBus = new EventBus();
		eventBus.emit({
			type: "knowledge_updated",
			streamId: "knowledge:item-1",
			itemId: "item-1",
			action: "review",
			timestamp: Date.now(),
		});
		await Promise.resolve();

		const requests = await db.select().from(agentSessionRequests);
		expect(requests).toHaveLength(0);
		const sessionRows = await db.select().from(sessions);
		expect(sessionRows).toHaveLength(0);
	});
});
