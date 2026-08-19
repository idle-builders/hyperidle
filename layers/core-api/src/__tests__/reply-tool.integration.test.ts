/**
 * AU27 Increment 2 (Decision 1) — the generic `reply` tool.
 *
 * AC-1: available to every agent kind, posts through the SAME `CoreApiPort`
 * seam `send_message` uses (`POST /threads/:id/messages`) — never an
 * orchestration-side special write. Proven generically (a `task_run`-style
 * session posting into its task's thread), not assistant-specific.
 * AC-7 (superseded, 2026-08-04): a session with no calling thread
 * (`routine_run`) falls back to a direct thread with the sole human user —
 * `reply` always lands somewhere, it never returns a typed "nowhere to
 * post" error.
 */
import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, messages, teams, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §3.2/B2: `reply` reaches `ports.coreApi.*` (the seam) — the
 * tool is built fresh per test off THIS test's own `app`
 * (`createInProcessCoreApiTransport`), never an ambient transport global.
 */
function buildReplyTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "reply",
	)!;
}

function makeContext(
	db: HyperIdleDb,
	opts: { readonly agentId: string; readonly threadId?: string },
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: opts.agentId,
		sessionId: "session-1",
		taskId: "task-reply-1",
		...(opts.threadId !== undefined ? { threadId: opts.threadId } : {}),
		sandboxPath: path.join(os.tmpdir(), `hi-au27-reply-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedTaskWithAgentAndThread(
	db: HyperIdleDb,
	opts: { readonly agentId: string; readonly taskId: string; readonly threadId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: opts.agentId,
		name: "Agent",
		role: "builder",
		teamId: "p1",
		status: "active",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: "task",
		hostId: opts.taskId,
		initiatorId: opts.agentId,
		participants: JSON.stringify([opts.agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("reply tool", () => {
	describe("AC-1: generic — a task_run-style session posts into its task's own thread", () => {
		test("posts through the CoreApiPort seam (POST /threads/:id/messages) — never an orchestration-side write", async ({
			db,
			app,
		}) => {
			const replyTool = buildReplyTool(app);
			await seedTaskWithAgentAndThread(db, {
				agentId: "agent-reply-1",
				taskId: "task-reply-1",
				threadId: "thread-reply-1",
			});
			const fetchSpy = vi.spyOn(app, "fetch");

			const result = await replyTool.handler(
				{ text: "Task update from the builder agent." },
				makeContext(db, { agentId: "agent-reply-1", threadId: "thread-reply-1" }),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messageId: string; threadId: string };
			expect(data.threadId).toBe("thread-reply-1");

			// Same route + middleware a human/any other agent uses.
			const calledPost = fetchSpy.mock.calls.some(([req]) => {
				const r = req as Request;
				return r.method === "POST" && r.url.includes("/threads/thread-reply-1/messages");
			});
			expect(calledPost).toBe(true);

			const [inserted] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			expect(inserted?.senderId).toBe("agent-reply-1");
			expect(inserted?.threadId).toBe("thread-reply-1");
			const payload = JSON.parse(inserted?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Task update from the builder agent.");
		});

		test("proves the capability is generic, not assistant-specific — a plain builder agent can reply", async ({
			db,
			app,
		}) => {
			const replyTool = buildReplyTool(app);
			await seedTaskWithAgentAndThread(db, {
				agentId: "agent-reply-2",
				taskId: "task-reply-2",
				threadId: "thread-reply-2",
			});

			const result = await replyTool.handler(
				{ text: "Comment on my own task's thread." },
				makeContext(db, { agentId: "agent-reply-2", threadId: "thread-reply-2" }),
			);

			expect(result.success).toBe(true);
			const threadMsgs = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "thread-reply-2"));
			expect(threadMsgs).toHaveLength(1);
		});
	});

	describe("AC-7 (superseded): no calling thread — falls back to a direct thread with the human", () => {
		test("a routine_run-style session (no ctx.threadId) lands its reply in a direct thread with the sole human", async ({
			db,
			app,
		}) => {
			const replyTool = buildReplyTool(app);
			const now = new Date().toISOString();
			await db.insert(users).values({
				id: "founder-reply-fallback",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			});
			await db.insert(users).values({
				id: "agent-reply-no-thread",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			});

			const result = await replyTool.handler(
				{ text: "Routine finished; nowhere baked to post this." },
				makeContext(db, { agentId: "agent-reply-no-thread" }),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { messageId: string; threadId: string };

			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain("agent-reply-no-thread");
			expect(participants).toContain("founder-reply-fallback");

			const [inserted] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			expect(inserted?.senderId).toBe("agent-reply-no-thread");
			expect(inserted?.threadId).toBe(data.threadId);
			const payload = JSON.parse(inserted?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Routine finished; nowhere baked to post this.");
		});

		test("a second reply from the same thread-less agent reuses the same direct thread", async ({
			db,
			app,
		}) => {
			const replyTool = buildReplyTool(app);
			const now = new Date().toISOString();
			await db.insert(users).values({
				id: "founder-reply-fallback-2",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			});
			await db.insert(users).values({
				id: "agent-reply-no-thread-2",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			});

			const first = await replyTool.handler(
				{ text: "First routine reply." },
				makeContext(db, { agentId: "agent-reply-no-thread-2" }),
			);
			const second = await replyTool.handler(
				{ text: "Second routine reply." },
				makeContext(db, { agentId: "agent-reply-no-thread-2" }),
			);

			expect(first.success).toBe(true);
			expect(second.success).toBe(true);
			if (!(first.success && second.success)) return;
			const firstData = first.data as { threadId: string };
			const secondData = second.data as { threadId: string };
			expect(secondData.threadId).toBe(firstData.threadId);
		});
	});

	describe("AC-9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when text is empty", async ({ db, app }) => {
			const replyTool = buildReplyTool(app);
			await seedTaskWithAgentAndThread(db, {
				agentId: "agent-reply-invalid",
				taskId: "task-reply-invalid",
				threadId: "thread-reply-invalid",
			});
			const result = await replyTool.handler(
				{ text: "" },
				makeContext(db, { agentId: "agent-reply-invalid", threadId: "thread-reply-invalid" }),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});

	describe("tool declaration", () => {
		test("declares reversibility: reversible (never fails closed to irreversible under AL7)", ({
			app,
		}) => {
			const replyTool = buildReplyTool(app);
			expect(replyTool.reversibility).toBe("reversible");
		});

		test("input schema has no thread argument — reply always targets its own calling thread", ({
			app,
		}) => {
			const replyTool = buildReplyTool(app);
			const shape = (replyTool.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
			expect(Object.keys(shape)).toEqual(["text"]);
		});
	});
});
