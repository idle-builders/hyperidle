import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, messages, teamMembers, teams, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { sendMessageTool } from "@hyperidle/agent-layer";
import type { ToolContext } from "@hyperidle/agent-layer";

async function seedFactory(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values([
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
	]);
}

function makeContext(db: HyperIdleDb, agentId = "agent-a"): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-sendmsg-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("send_message tool", () => {
	describe("AC2: sends to agent B appears in B's inbox", () => {
		test("creates a message row with correct sender and recipient", async ({ db }) => {
			await seedFactory(db);
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
			const [inserted] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			expect(inserted?.senderId).toBe("agent-a");
			const payload = JSON.parse(inserted?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Hello from A");
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread?.hostId).toBe("agent-b");
		});

		test("creates a new direct thread when none exists", async ({ db }) => {
			await seedFactory(db);
			const result = await sendMessageTool.handler(
				{ to: "agent-b", body: "First message" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { threadId: string };

			// L1a: legacy `kind='direct'` projects as host_kind='agent' with the
			// recipient as host_id (plan §5.3 thread-primitive projection).
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread?.hostKind).toBe("agent");
			expect(thread?.hostId).toBe("agent-b");
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants.sort()).toEqual(["agent-a", "agent-b"]);
		});

		test("reuses existing direct thread between the same two agents", async ({ db }) => {
			await seedFactory(db);
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

			const threadMsgs = await db.select().from(messages).where(eq(messages.threadId, t1));
			expect(threadMsgs).toHaveLength(2);
		});

		test("persists optional subject when provided", async ({ db }) => {
			await seedFactory(db);
			const result = await sendMessageTool.handler(
				{ to: "agent-b", subject: "Urgent", body: "Hi" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messageId: string };
			// L1a: legacy subject + body collapse into payload.text per the
			// thread-primitive projection rules (plan §5.3). Subject prefixes the body.
			const [inserted] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			const payload = JSON.parse(inserted?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Urgent\n\nHi");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when body is empty", async ({ db }) => {
			await seedFactory(db);
			const result = await sendMessageTool.handler(
				{ to: "agent-b", body: "" },
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when `to` is missing", async ({ db }) => {
			await seedFactory(db);
			const result = await sendMessageTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ body: "no recipient" } as any,
				makeContext(db, "agent-a"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns NOT_FOUND when recipient agent does not exist", async ({ db }) => {
			await seedFactory(db);
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
