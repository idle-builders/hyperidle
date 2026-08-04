/**
 * AU27 Increment 2 (Decision 1) — the generic `reply` tool.
 *
 * AC-1: available to every agent kind, posts through the SAME `CoreApiPort`
 * seam `send_message` uses (`POST /threads/:id/messages`) — never an
 * orchestration-side special write. Proven generically (a `task_run`-style
 * session posting into its task's thread), not assistant-specific.
 * AC-7: a session with no calling thread (`routine_run`/`knowledge_action`)
 * gets a clean typed error, never a crash.
 */
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, messages, teamMembers, teams, threads, users } from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { test as baseTest } from "../test-fixtures.js";

const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

const replyTool = buildToolDefinitions(toolHandlersPorts).find((t) => t.name === "reply")!;

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
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: opts.agentId,
		name: "Agent",
		role: "builder",
		teamId: "t1",
		status: "active",
		maxConcurrentSessions: 2,
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
		}) => {
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

	describe("AC-7: no calling thread — clean typed error, never a crash", () => {
		test("returns NO_CALLING_THREAD when ctx.threadId is absent (routine_run/knowledge_action)", async ({
			db,
		}) => {
			await db.insert(users).values({
				id: "agent-reply-no-thread",
				name: "Agent",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 2,
				createdAt: new Date().toISOString(),
			});

			const result = await replyTool.handler(
				{ text: "Nowhere to post this." },
				makeContext(db, { agentId: "agent-reply-no-thread" }),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NO_CALLING_THREAD");
		});
	});

	describe("AC-9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when text is empty", async ({ db }) => {
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
		test("declares reversibility: reversible (never fails closed to irreversible under AL7)", () => {
			expect(replyTool.reversibility).toBe("reversible");
		});

		test("input schema has no thread argument — reply always targets its own calling thread", () => {
			const shape = (replyTool.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
			expect(Object.keys(shape)).toEqual(["text"]);
		});
	});
});
