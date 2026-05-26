import * as os from "node:os";
import * as path from "node:path";
import {
	createTestDb,
	type HyperIdleDb,
	messages,
	products,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { sendMessageTool } from "../send-message.js";
import type { ToolContext } from "../tool-registry.js";

function seedFactory(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(users)
		.values([
			{
				id: "agent-a",
				name: "A",
				role: "builder",
				teamId: "t1",
				status: "active",
				maxConcurrentSessions: 2,
				createdAt: now,
			},
			{
				id: "agent-b",
				name: "B",
				role: "builder",
				teamId: "t1",
				status: "active",
				maxConcurrentSessions: 2,
				createdAt: now,
			},
		])
		.run();
}

function makeContext(db: HyperIdleDb, agentId = "agent-a"): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-d4-sendmsg-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("send_message tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedFactory(db);
	});

	describe("AC2: sends to agent B appears in B's inbox", () => {
		it("creates a message row with correct sender and recipient", async () => {
			const result = await sendMessageTool.handler(
				{ to: "agent-b", body: "Hello from A" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messageId: string; threadId: string };

			// L1a: messages now carry sender + payload (JSON). Recipient is
			// derived from the host_id/participants on the thread (legacy
			// `recipient_id` column dropped — see plan §5.3).
			const inserted = db.select().from(messages).where(eq(messages.id, data.messageId)).get();
			expect(inserted?.senderId).toBe("agent-a");
			const payload = JSON.parse(inserted?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Hello from A");
			const thread = db.select().from(threads).where(eq(threads.id, data.threadId)).get();
			expect(thread?.hostId).toBe("agent-b");
		});

		it("creates a new direct thread when none exists", async () => {
			const result = await sendMessageTool.handler(
				{ to: "agent-b", body: "First message" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { threadId: string };

			// L1a: legacy `kind='direct'` projects as host_kind='agent' with the
			// recipient as host_id (plan §5.3 thread-primitive projection).
			const thread = db.select().from(threads).where(eq(threads.id, data.threadId)).get();
			expect(thread?.hostKind).toBe("agent");
			expect(thread?.hostId).toBe("agent-b");
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants.sort()).toEqual(["agent-a", "agent-b"]);
		});

		it("reuses existing direct thread between the same two agents", async () => {
			const first = await sendMessageTool.handler(
				{ to: "agent-b", body: "Message 1" },
				makeContext(db, "agent-a"),
			);
			const second = await sendMessageTool.handler(
				{ to: "agent-b", body: "Message 2" },
				makeContext(db, "agent-a"),
			);
			expect(first.success).toBe(true);
			expect(second.success).toBe(true);
			if (!(first.success && second.success)) return;
			const t1 = (first.data as { threadId: string }).threadId;
			const t2 = (second.data as { threadId: string }).threadId;
			expect(t1).toBe(t2);

			const threadMsgs = db.select().from(messages).where(eq(messages.threadId, t1)).all();
			expect(threadMsgs).toHaveLength(2);
		});

		it("persists optional subject when provided", async () => {
			const result = await sendMessageTool.handler(
				{ to: "agent-b", subject: "Urgent", body: "Hi" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messageId: string };
			// L1a: legacy subject + body collapse into payload.text per the
			// thread-primitive projection rules (plan §5.3). Subject prefixes the body.
			const inserted = db.select().from(messages).where(eq(messages.id, data.messageId)).get();
			const payload = JSON.parse(inserted?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Urgent\n\nHi");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("returns INVALID_INPUT when body is empty", async () => {
			const result = await sendMessageTool.handler(
				{ to: "agent-b", body: "" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when `to` is missing", async () => {
			const result = await sendMessageTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ body: "no recipient" } as any,
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns NOT_FOUND when recipient agent does not exist", async () => {
			const result = await sendMessageTool.handler(
				{ to: "ghost", body: "anyone?" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});
