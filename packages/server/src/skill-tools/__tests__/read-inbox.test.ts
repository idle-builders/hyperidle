import * as os from "node:os";
import * as path from "node:path";
import {
	type HyperIdleDb,
	agents,
	createTestDb,
	messages,
	products,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { readInboxTool } from "../read-inbox.js";
import type { ToolContext } from "../tool-registry.js";

function seedFactory(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values([
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
		])
		.run();
	db.insert(threads).values({ id: "thread-1", kind: "direct", createdAt: now }).run();
}

function makeContext(db: HyperIdleDb, agentId = "agent-a"): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-d4-readinbox-${Date.now()}`),
	};
}

function insertMessage(
	db: HyperIdleDb,
	id: string,
	senderId: string,
	recipientId: string,
	body: string,
	createdAt: string,
): void {
	db.insert(messages)
		.values({
			id,
			senderId,
			recipientId,
			threadId: "thread-1",
			subject: null,
			body,
			createdAt,
		})
		.run();
}

describe("read_inbox tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedFactory(db);
	});

	describe("AC1: agent with 3 messages returns all 3", () => {
		it("returns all messages addressed to the agent", async () => {
			insertMessage(db, "m1", "agent-b", "agent-a", "Hello 1", "2026-01-01T00:00:01Z");
			insertMessage(db, "m2", "agent-b", "agent-a", "Hello 2", "2026-01-01T00:00:02Z");
			insertMessage(db, "m3", "agent-b", "agent-a", "Hello 3", "2026-01-01T00:00:03Z");

			const result = await readInboxTool.handler({}, makeContext(db));

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string; body: string }> };
			expect(data.messages).toHaveLength(3);
			const ids = data.messages.map((m) => m.id).sort();
			expect(ids).toEqual(["m1", "m2", "m3"]);
		});

		it("orders messages newest first by createdAt DESC", async () => {
			insertMessage(db, "m-old", "agent-b", "agent-a", "Old", "2026-01-01T00:00:01Z");
			insertMessage(db, "m-mid", "agent-b", "agent-a", "Mid", "2026-01-01T00:00:02Z");
			insertMessage(db, "m-new", "agent-b", "agent-a", "New", "2026-01-01T00:00:03Z");

			const result = await readInboxTool.handler({}, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string }> };
			expect(data.messages.map((m) => m.id)).toEqual(["m-new", "m-mid", "m-old"]);
		});

		it("excludes messages addressed to other agents", async () => {
			insertMessage(db, "m1", "agent-b", "agent-a", "For A", "2026-01-01T00:00:01Z");
			insertMessage(db, "m2", "agent-a", "agent-b", "For B", "2026-01-01T00:00:02Z");

			const result = await readInboxTool.handler({}, makeContext(db, "agent-a"));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: Array<{ id: string }> };
			expect(data.messages).toHaveLength(1);
			expect(data.messages[0].id).toBe("m1");
		});

		it("returns empty array when inbox is empty", async () => {
			const result = await readInboxTool.handler({}, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: unknown[] };
			expect(data.messages).toEqual([]);
		});
	});

	describe("limit parameter", () => {
		it("caps the number of messages returned", async () => {
			for (let i = 0; i < 5; i++) {
				insertMessage(db, `m${i}`, "agent-b", "agent-a", `Body ${i}`, `2026-01-01T00:00:0${i}Z`);
			}
			const result = await readInboxTool.handler({ limit: 2 }, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messages: unknown[] };
			expect(data.messages).toHaveLength(2);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("rejects non-numeric limit with INVALID_INPUT", async () => {
			const result = await readInboxTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ limit: "huge" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("rejects negative limit with INVALID_INPUT", async () => {
			const result = await readInboxTool.handler({ limit: -5 }, makeContext(db));
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
