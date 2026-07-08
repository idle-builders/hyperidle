import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { agentSessionRequests, sessions, teams, users } from "../schema.js";

describe("session request schema", () => {
	test("creates durable request rows with source-scoped idempotency", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		await db.insert(agentSessionRequests).values({
			id: "req-1",
			sourceKind: "assistant",
			sourceId: "msg-1",
			streamId: "thread:thread-1",
			agentId: "agent-1",
			promptMode: "conversation",
			sourceCorrelationJson: JSON.stringify({
				threadId: "thread-1",
				messageId: "msg-1",
				userId: "user-1",
				assistantAgentId: "agent-1",
			}),
			idempotencyKey: "assistant:msg-1",
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});

		await expect(
			db.insert(agentSessionRequests).values({
				id: "req-2",
				sourceKind: "assistant",
				sourceId: "msg-1",
				streamId: "thread:thread-1",
				agentId: "agent-1",
				promptMode: "conversation",
				sourceCorrelationJson: "{}",
				idempotencyKey: "assistant:msg-1",
				status: "pending",
				createdAt: now,
				updatedAt: now,
			}),
		).rejects.toThrow();

		const rows = await db.select().from(agentSessionRequests);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ sourceKind: "assistant", status: "pending" });
	});

	test("sessions can be task-free while retaining request/source correlation", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "assistant",
			status: "active",
			createdAt: now,
		});
		await db.insert(agentSessionRequests).values({
			id: "req-1",
			sourceKind: "assistant",
			sourceId: "msg-1",
			streamId: "thread:thread-1",
			agentId: "agent-1",
			promptMode: "conversation",
			sourceCorrelationJson: JSON.stringify({
				threadId: "thread-1",
				messageId: "msg-1",
				userId: "user-1",
				assistantAgentId: "agent-1",
			}),
			idempotencyKey: "assistant:msg-1",
			status: "running",
			createdAt: now,
			updatedAt: now,
		});

		await db.insert(sessions).values({
			id: "session-1",
			taskId: null,
			requestId: "req-1",
			sourceKind: "assistant",
			sourceId: "msg-1",
			sourceCorrelationJson: JSON.stringify({ threadId: "thread-1", messageId: "msg-1" }),
			agentId: "agent-1",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const [row] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(row?.taskId).toBeNull();
		expect(row?.requestId).toBe("req-1");
		expect(row?.sourceKind).toBe("assistant");
	});
});
