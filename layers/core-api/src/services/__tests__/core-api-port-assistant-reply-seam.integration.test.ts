/**
 * Proves an assistant-turn write reaches the `CoreApiPort` seam
 * (`POST /threads/:id/messages`) under the ASSISTANT AGENT's own identity
 * (`ast-<userId>`, never the human sender, architecture.md §12), real-route,
 * real-DB, real `thread_message_appended` emission — exactly once, never a
 * double-fire from a stale locally-generated id.
 *
 * The assistant's ONLY way to post into its calling thread is the SAME
 * generic `reply` tool call every agent kind uses
 * (`reply-tool.integration.test.ts` proves that generically, via a
 * `task_run`-style agent). This file proves the assistant-specific
 * invariant: the assistant's OWN `reply` tool call — not an
 * orchestration-side write — crosses the seam under its own `ast-<userId>`
 * identity.
 */

import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import type { ThreadMessageAppendedEvent } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

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

const NOW = "2026-07-28T00:00:00.000Z";

async function seedFounderAndAssistantThread(
	db: HyperIdleDb,
	opts: { readonly founderId: string; readonly threadId: string },
): Promise<string> {
	const assistantAgentId = `ast-${opts.founderId}`;
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: assistantAgentId,
		kind: "ai",
		name: "Assistant",
		role: "assistant",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: "user",
		hostId: opts.founderId,
		initiatorId: opts.founderId,
		participants: JSON.stringify([opts.founderId, assistantAgentId]),
		pinned: false,
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return assistantAgentId;
}

describe("the assistant's own reply call crosses the CoreApiPort seam", () => {
	test("reply() posts through POST /threads/:id/messages under the assistant's OWN ast-<userId> identity — real route, real DB row, one thread_message_appended emission", async ({
		db,
		app,
		eventBus,
	}) => {
		const replyTool = buildReplyTool(app);
		const founderId = "founder-reply-seam";
		const threadId = "thread-reply-seam";
		const assistantAgentId = await seedFounderAndAssistantThread(db, { founderId, threadId });

		const fetchSpy = vi.spyOn(app, "fetch");
		const appendedEvents: ThreadMessageAppendedEvent[] = [];
		const unsubscribe = eventBus.on(
			"thread_message_appended",
			(event: ThreadMessageAppendedEvent) => {
				if (event.threadId === threadId) appendedEvents.push(event);
			},
		);

		const ctx: ToolContext<HyperIdleDb> = {
			db,
			eventBus: new EventBus(),
			agentId: assistantAgentId,
			sessionId: "session-reply-seam",
			taskId: "",
			threadId,
			sandboxPath: "",
			ingestion: { dispose: (): void => {} },
		};

		const result = await replyTool.handler({ text: "Here's what I found." }, ctx);
		unsubscribe();

		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { messageId: string; threadId: string };
		expect(data.threadId).toBe(threadId);

		// Same route + middleware a human/any other agent uses — never an
		// orchestration-side special write.
		const calledPost = fetchSpy.mock.calls.some(([req]) => {
			const r = req as Request;
			return r.method === "POST" && r.url.includes(`/threads/${threadId}/messages`);
		});
		expect(calledPost).toBe(true);

		const [inserted] = await db.select().from(messages).where(eq(messages.id, data.messageId));
		expect(inserted?.senderId).toBe(assistantAgentId);
		expect(inserted?.threadId).toBe(threadId);

		// The route is the canonical thread_message_appended emitter — the tool
		// must not also emit its own copy (a double-fire with a stale
		// locally-generated id matching no persisted row).
		expect(appendedEvents).toHaveLength(1);
		expect(appendedEvents[0]?.messageId).toBe(data.messageId);
	});
});
