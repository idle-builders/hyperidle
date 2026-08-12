/**
 * R5 RED — Unit tests for submit_review skill tool.
 *
 * AC2: Agent submits review message. The review renders as a RichMessageCard
 * in the bet's host thread.
 * AC3: User can submit verdict. Verdict is persisted and readable by agent.
 *
 * These tests FAIL until the submit-review.ts implementation ships.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	bets,
	type HyperIdleDb,
	messages,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §3.2/B2: this file's tool handler(s) reach `ports.coreApi.*`
 * (the seam) — the tool is built fresh per test off THIS test's own `app`
 * (`createInProcessCoreApiTransport`), never an ambient transport global.
 */
function buildSubmitReviewTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "submit_review",
	)!;
}

const NOW = new Date().toISOString();

async function seed(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	// @lore U1: teams = domain entity (formerly products); teamMembers = membership group (formerly teams).
	await db
		.insert(teams)
		.values({ id: ids("team-1"), name: "Test Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: ids("tm-1"), teamId: ids("team-1"), capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: ids("b1"),
		teamId: ids("team-1"),
		description: "Implement feature X",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: ids("agent-a"),
		name: "Builder Agent",
		role: "builder",
		teamId: ids("tm-1"),
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: ids("task-1"),
		betId: ids("b1"),
		teamId: ids("team-1"),
		ownerAgentId: ids("agent-a"),
		title: "Parent Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, ids: ScopedIds): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: ids("agent-a"),
		sessionId: ids("session-1"),
		taskId: ids("task-1"),
		sandboxPath: path.join(os.tmpdir(), `hi-r5-submitreview-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("submit_review tool", () => {
	// AC2 happy path: full ReviewPayload with artifactRef
	describe("AC2: review message with artifactRef", () => {
		test("creates review-type message on bet host thread", async ({ db, app, ids }) => {
			const submitReviewTool = buildSubmitReviewTool(app);
			await seed(db, ids);
			const result = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All tests pass", "Code reviewed"],
					artifactRef: { id: "art-1", kind: "content_preview" },
				},
				makeContext(db, ids),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { messageId: string; threadId: string; betId: string };
			expect(typeof data.messageId).toBe("string");
			expect(typeof data.threadId).toBe("string");
			expect(data.betId).toBe(ids("b1"));

			// Message exists with type "review"
			const [msg] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			expect(msg).toBeDefined();
			expect(msg?.type).toBe("review");
			expect(msg?.senderId).toBe(ids("agent-a"));
			expect(msg?.threadId).toBe(data.threadId);

			// Payload has correct structure
			const payload = JSON.parse(msg?.payload ?? "{}") as {
				title: string;
				reasoning: string[];
				artifactRef: { id: string; kind: string };
			};
			expect(payload.title).toBe("Work complete");
			expect(payload.reasoning).toEqual(["All tests pass", "Code reviewed"]);
			expect(payload.artifactRef.id).toBe("art-1");
			expect(payload.artifactRef.kind).toBe("content_preview");

			// Thread has hostKind="bet", hostId=b1
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();
			expect(thread?.hostKind).toBe("bet");
			expect(thread?.hostId).toBe(ids("b1"));

			// Agent is in participants
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain(ids("agent-a"));
		});
	});

	// AC2 fallback: plain message when no artifactRef
	describe("AC2: fallback plain message without artifactRef", () => {
		test("creates plain-type fallback message when no artifactRef provided", async ({
			db,
			app,
			ids,
		}) => {
			const submitReviewTool = buildSubmitReviewTool(app);
			await seed(db, ids);
			const result = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All tests pass"],
				},
				makeContext(db, ids),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { messageId: string };
			const [msg] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			expect(msg).toBeDefined();
			expect(msg?.type).toBe("plain");

			const payload = JSON.parse(msg?.payload ?? "{}") as { text: string };
			expect(payload.text).toContain("Review requested");
			expect(payload.text).toContain("Work complete");
		});
	});

	// Thread reuse: second call reuses existing bet thread
	describe("thread reuse", () => {
		test("second call reuses existing bet thread (idempotent thread creation)", async ({
			db,
			app,
			ids,
		}) => {
			const submitReviewTool = buildSubmitReviewTool(app);
			await seed(db, ids);
			const first = await submitReviewTool.handler(
				{ title: "First review", reasoning: ["Reason A"] },
				makeContext(db, ids),
			);
			const second = await submitReviewTool.handler(
				{ title: "Second review", reasoning: ["Reason B"] },
				makeContext(db, ids),
			);

			expect(first.success).toBe(true);
			expect(second.success).toBe(true);
			if (!(first.success && second.success)) return;

			const d1 = first.data as { threadId: string };
			const d2 = second.data as { threadId: string };
			expect(d1.threadId).toBe(d2.threadId);
		});

		test("adds agent to participants when existing bet thread does not include agent", async ({
			db,
			app,
			ids,
		}) => {
			const submitReviewTool = buildSubmitReviewTool(app);
			await seed(db, ids);
			// Create a bet thread that does NOT include agent-a
			await db.insert(threads).values({
				id: ids("existing-bet-thread"),
				hostKind: "bet",
				hostId: ids("b1"),
				initiatorId: ids("other-agent"),
				participants: JSON.stringify([ids("other-agent")]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});

			const result = await submitReviewTool.handler(
				{ title: "Join review", reasoning: ["Test"] },
				makeContext(db, ids),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { threadId: string };
			expect(data.threadId).toBe(ids("existing-bet-thread"));

			const [thread] = await db
				.select()
				.from(threads)
				.where(eq(threads.id, ids("existing-bet-thread")));
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain(ids("agent-a"));
		});
	});

	// Error cases
	describe("error cases", () => {
		test("returns NOT_FOUND when ctx.taskId does not exist", async ({ db, app, ids }) => {
			const submitReviewTool = buildSubmitReviewTool(app);
			await seed(db, ids);
			const ctx: ToolContext<HyperIdleDb> = {
				...makeContext(db, ids),
				taskId: ids("ghost-task"),
			};

			const result = await submitReviewTool.handler(
				{ title: "Will fail", reasoning: ["Because"] },
				ctx,
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});

		test("returns INVALID_INPUT when reasoning array is empty", async ({ db, app, ids }) => {
			const submitReviewTool = buildSubmitReviewTool(app);
			await seed(db, ids);
			const result = await submitReviewTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "No reasoning", reasoning: [] } as any,
				makeContext(db, ids),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
