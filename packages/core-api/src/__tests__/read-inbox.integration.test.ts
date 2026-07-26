import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, messages, teamMembers, teams, threads, users } from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { test } from "../test-fixtures.js";

const readInboxTool = buildToolDefinitions(toolHandlersPorts).find((t) => t.name === "read_inbox")!;

async function seedFactory(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values([
		{
			id: "agent-a",
			name: "Agent A",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		},
		{
			id: "agent-b",
			name: "Agent B",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		},
	]);

	// L1a: thread participants now drive inbox routing (no more
	// messages.recipient_id). Thread A↔B serves the agent-a and agent-b
	// inboxes; thread A↔(orphan) is for the "addressed to other agents" test.
	await db.insert(threads).values([
		{
			id: "thread-ab",
			hostKind: "agent",
			hostId: "agent-b",
			initiatorId: "agent-a",
			participants: JSON.stringify(["agent-a", "agent-b"]),
			lastActiveAt: now,
			createdAt: now,
		},
		{
			id: "thread-ba",
			hostKind: "agent",
			hostId: "agent-a",
			initiatorId: "agent-b",
			participants: JSON.stringify(["agent-a", "agent-b"]),
			lastActiveAt: now,
			createdAt: now,
		},
	]);
}

function makeContext(db: HyperIdleDb, agentId = "agent-a"): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-readinbox-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

// L1a: insertMessage now picks the thread by recipient — recipient is the
// non-sender participant of the (sender,recipient) direct pair. The agent
// inbox tool filters by participation, not by a recipient column.
async function insertMessage(
	db: HyperIdleDb,
	id: string,
	senderId: string,
	recipientId: string,
	body: string,
	createdAt: string,
): Promise<void> {
	const threadId = recipientId === "agent-a" ? "thread-ba" : "thread-ab";
	await db.insert(messages).values({
		id,
		senderId,
		threadId,
		type: "plain",
		payload: JSON.stringify({ text: body }),
		clientKey: id,
		createdAt,
	});
}

describe("read_inbox tool", () => {
	describe("AC1: agent with 3 messages returns all 3", () => {
		test("returns all messages addressed to the agent", async ({ db }) => {
			await seedFactory(db);
			await insertMessage(db, "m1", "agent-b", "agent-a", "Hello 1", "2026-01-01T00:00:01Z");
			await insertMessage(db, "m2", "agent-b", "agent-a", "Hello 2", "2026-01-01T00:00:02Z");
			await insertMessage(db, "m3", "agent-b", "agent-a", "Hello 3", "2026-01-01T00:00:03Z");

			const result = await readInboxTool.handler({}, makeContext(db));

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string; body: string }> };
			expect(data.messages).toHaveLength(3);
			const ids = data.messages.map((m) => m.id).sort();
			expect(ids).toEqual(["m1", "m2", "m3"]);
		});

		test("orders messages newest first by createdAt DESC", async ({ db }) => {
			await seedFactory(db);
			await insertMessage(db, "m-old", "agent-b", "agent-a", "Old", "2026-01-01T00:00:01Z");
			await insertMessage(db, "m-mid", "agent-b", "agent-a", "Mid", "2026-01-01T00:00:02Z");
			await insertMessage(db, "m-new", "agent-b", "agent-a", "New", "2026-01-01T00:00:03Z");

			const result = await readInboxTool.handler({}, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string }> };
			expect(data.messages.map((m) => m.id)).toEqual(["m-new", "m-mid", "m-old"]);
		});

		test("excludes messages addressed to other agents", async ({ db }) => {
			await seedFactory(db);
			await insertMessage(db, "m1", "agent-b", "agent-a", "For A", "2026-01-01T00:00:01Z");
			await insertMessage(db, "m2", "agent-a", "agent-b", "For B", "2026-01-01T00:00:02Z");

			const result = await readInboxTool.handler({}, makeContext(db, "agent-a"));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string }> };
			expect(data.messages).toHaveLength(1);
			expect(data!.messages[0]!.id).toBe("m1");
		});

		test("returns empty array when inbox is empty", async ({ db }) => {
			await seedFactory(db);
			const result = await readInboxTool.handler({}, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: unknown[] };
			expect(data.messages).toEqual([]);
		});
	});

	describe("limit parameter", () => {
		test("caps the number of messages returned", async ({ db }) => {
			await seedFactory(db);
			for (let i = 0; i < 5; i++) {
				await insertMessage(
					db,
					`m${i}`,
					"agent-b",
					"agent-a",
					`Body ${i}`,
					`2026-01-01T00:00:0${i}Z`,
				);
			}
			const result = await readInboxTool.handler({ limit: 2 }, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: unknown[] };
			expect(data.messages).toHaveLength(2);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("rejects non-numeric limit with INVALID_INPUT", async ({ db }) => {
			await seedFactory(db);
			const result = await readInboxTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ limit: "huge" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("rejects negative limit with INVALID_INPUT", async ({ db }) => {
			await seedFactory(db);
			const result = await readInboxTool.handler({ limit: -5 }, makeContext(db));
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
