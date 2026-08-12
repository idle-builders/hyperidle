import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, messages, teamMembers, teams, threads, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function buildReadInboxTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "read_inbox",
	)!;
}

async function seedFactory(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: ids("p1"), name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values([
		{
			id: ids("agent-a"),
			name: "Agent A",
			role: "builder",
			teamId: ids("t1"),
			status: "active",
			createdAt: now,
		},
		{
			id: ids("agent-b"),
			name: "Agent B",
			role: "builder",
			teamId: ids("t1"),
			status: "active",
			createdAt: now,
		},
	]);

	// L1a: thread participants now drive inbox routing (no more
	// messages.recipient_id). Thread A↔B serves the agent-a and agent-b
	// inboxes; thread A↔(orphan) is for the "addressed to other agents" test.
	await db.insert(threads).values([
		{
			id: ids("thread-ab"),
			hostKind: "agent",
			hostId: ids("agent-b"),
			initiatorId: ids("agent-a"),
			participants: JSON.stringify([ids("agent-a"), ids("agent-b")]),
			lastActiveAt: now,
			createdAt: now,
		},
		{
			id: ids("thread-ba"),
			hostKind: "agent",
			hostId: ids("agent-a"),
			initiatorId: ids("agent-b"),
			participants: JSON.stringify([ids("agent-a"), ids("agent-b")]),
			lastActiveAt: now,
			createdAt: now,
		},
	]);
}

function makeContext(db: HyperIdleDb, agentId: string): ToolContext<HyperIdleDb> {
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
	ids: ScopedIds,
	msgLabel: string,
	senderLabel: string,
	recipientLabel: string,
	body: string,
	createdAt: string,
): Promise<void> {
	const threadId = recipientLabel === "agent-a" ? ids("thread-ba") : ids("thread-ab");
	await db.insert(messages).values({
		id: ids(msgLabel),
		senderId: ids(senderLabel),
		threadId,
		type: "plain",
		payload: JSON.stringify({ text: body }),
		clientKey: ids(msgLabel),
		createdAt,
	});
}

describe("read_inbox tool", () => {
	describe("AC1: agent with 3 messages returns all 3", () => {
		test("returns all messages addressed to the agent", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			await insertMessage(db, ids, "m1", "agent-b", "agent-a", "Hello 1", "2026-01-01T00:00:01Z");
			await insertMessage(db, ids, "m2", "agent-b", "agent-a", "Hello 2", "2026-01-01T00:00:02Z");
			await insertMessage(db, ids, "m3", "agent-b", "agent-a", "Hello 3", "2026-01-01T00:00:03Z");

			const result = await readInboxTool.handler({}, makeContext(db, ids("agent-a")));

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string; body: string }> };
			expect(data.messages).toHaveLength(3);
			const returnedIds = data.messages.map((m) => m.id).sort();
			expect(returnedIds).toEqual([ids("m1"), ids("m2"), ids("m3")].sort());
		});

		test("orders messages newest first by createdAt DESC", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			await insertMessage(db, ids, "m-old", "agent-b", "agent-a", "Old", "2026-01-01T00:00:01Z");
			await insertMessage(db, ids, "m-mid", "agent-b", "agent-a", "Mid", "2026-01-01T00:00:02Z");
			await insertMessage(db, ids, "m-new", "agent-b", "agent-a", "New", "2026-01-01T00:00:03Z");

			const result = await readInboxTool.handler({}, makeContext(db, ids("agent-a")));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string }> };
			expect(data.messages.map((m) => m.id)).toEqual([ids("m-new"), ids("m-mid"), ids("m-old")]);
		});

		test("excludes messages addressed to other agents", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			await insertMessage(db, ids, "m1", "agent-b", "agent-a", "For A", "2026-01-01T00:00:01Z");
			await insertMessage(db, ids, "m2", "agent-a", "agent-b", "For B", "2026-01-01T00:00:02Z");

			const result = await readInboxTool.handler({}, makeContext(db, ids("agent-a")));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string }> };
			expect(data.messages).toHaveLength(1);
			expect(data!.messages[0]!.id).toBe(ids("m1"));
		});

		test("returns empty array when inbox is empty", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			const result = await readInboxTool.handler({}, makeContext(db, ids("agent-a")));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: unknown[] };
			expect(data.messages).toEqual([]);
		});
	});

	describe("limit parameter", () => {
		test("caps the number of messages returned", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			for (let i = 0; i < 5; i++) {
				await insertMessage(
					db,
					ids,
					`m${i}`,
					"agent-b",
					"agent-a",
					`Body ${i}`,
					`2026-01-01T00:00:0${i}Z`,
				);
			}
			const result = await readInboxTool.handler({ limit: 2 }, makeContext(db, ids("agent-a")));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: unknown[] };
			expect(data.messages).toHaveLength(2);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("rejects non-numeric limit with INVALID_INPUT", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			const result = await readInboxTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ limit: "huge" } as any,
				makeContext(db, ids("agent-a")),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("rejects negative limit with INVALID_INPUT", async ({ db, app, ids }) => {
			const readInboxTool = buildReadInboxTool(app);
			await seedFactory(db, ids);
			const result = await readInboxTool.handler({ limit: -5 }, makeContext(db, ids("agent-a")));
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
