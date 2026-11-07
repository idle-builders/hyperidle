import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { agentRunConfig, agentRunnerKeys, serviceConnections, sessions } from "../schema.js";

describe("runner-db schema", () => {
	test("inserts and reads sessions without server FK dependency", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(sessions).values({
			id: "sess-1",
			taskId: "task-1",
			agentId: "agent-1",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const result = await db.select().from(sessions).where(eq(sessions.id, "sess-1"));
		expect(result[0]).toMatchObject({
			id: "sess-1",
			taskId: "task-1",
			agentId: "agent-1",
			modelTier: "workhorse",
			state: "active",
		});
	});

	test("inserts and reads agentRunConfig", async ({ db }) => {
		await db.insert(agentRunConfig).values({
			agentUserId: "agent-1",
			maxConcurrentSessions: 1,
		});

		const result = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-1"));
		expect(result[0]).toMatchObject({
			agentUserId: "agent-1",
			maxConcurrentSessions: 1,
		});
	});

	test("inserts and reads serviceConnections", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(serviceConnections).values({
			id: "conn-1",
			userId: "user-1",
			service: "github",
			authSource: "token",
			createdAt: now,
			updatedAt: now,
		});

		const result = await db
			.select()
			.from(serviceConnections)
			.where(eq(serviceConnections.id, "conn-1"));
		expect(result[0]).toMatchObject({
			id: "conn-1",
			userId: "user-1",
			service: "github",
			authSource: "token",
		});
	});

	test("inserts and reads agentRunnerKeys", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(agentRunnerKeys).values({
			agentId: "agent-1",
			agentKey: "key-abc123",
			createdAt: now,
			updatedAt: now,
		});

		const result = await db
			.select()
			.from(agentRunnerKeys)
			.where(eq(agentRunnerKeys.agentId, "agent-1"));
		expect(result[0]).toMatchObject({
			agentId: "agent-1",
			agentKey: "key-abc123",
			movedAway: 0,
		});
	});
});
