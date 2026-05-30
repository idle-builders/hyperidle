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
	bets,
	createTestDb,
	type HyperIdleDb,
	messages,
	products,
	type TestDbHandle,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { submitReviewTool } from "../submit-review.js";
import type { ToolContext } from "../tool-registry.js";

const NOW = new Date().toISOString();

async function seed(db: HyperIdleDb): Promise<void> {
	await db
		.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW });
	await db
		.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		productId: "p1",
		teamId: "t1",
		pitch: "Implement feature X",
		status: "committed",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-a",
		name: "Builder Agent",
		role: "builder",
		teamId: "t1",
		status: "active",
		maxConcurrentSessions: 2,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		productId: "p1",
		teamId: "t1",
		ownerAgentId: "agent-a",
		title: "Parent Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, eventBus?: EventBus): ToolContext {
	return {
		db,
		eventBus: eventBus ?? new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-r5-submitreview-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("submit_review tool", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seed(db);
	});

	afterEach(async () => {
		await handle?.close();
	});

	// AC2 happy path: full ReviewPayload with artifactRef
	describe("AC2: review message with artifactRef", () => {
		it("creates review-type message on bet host thread", async () => {
			const result = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All tests pass", "Code reviewed"],
					artifactRef: { id: "art-1", kind: "content_preview" },
				},
				makeContext(db),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { messageId: string; threadId: string; betId: string };
			expect(typeof data.messageId).toBe("string");
			expect(typeof data.threadId).toBe("string");
			expect(data.betId).toBe("b1");

			// Message exists with type "review"
			const [msg] = await db.select().from(messages).where(eq(messages.id, data.messageId));
			expect(msg).toBeDefined();
			expect(msg?.type).toBe("review");
			expect(msg?.senderId).toBe("agent-a");
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

			// Thread has hostKind="bet", hostId="b1"
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();
			expect(thread?.hostKind).toBe("bet");
			expect(thread?.hostId).toBe("b1");

			// Agent is in participants
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain("agent-a");
		});
	});

	// AC2 fallback: plain message when no artifactRef
	describe("AC2: fallback plain message without artifactRef", () => {
		it("creates plain-type fallback message when no artifactRef provided", async () => {
			const result = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All tests pass"],
				},
				makeContext(db),
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
		it("second call reuses existing bet thread (idempotent thread creation)", async () => {
			const first = await submitReviewTool.handler(
				{ title: "First review", reasoning: ["Reason A"] },
				makeContext(db),
			);
			const second = await submitReviewTool.handler(
				{ title: "Second review", reasoning: ["Reason B"] },
				makeContext(db),
			);

			expect(first.success).toBe(true);
			expect(second.success).toBe(true);
			if (!(first.success && second.success)) return;

			const d1 = first.data as { threadId: string };
			const d2 = second.data as { threadId: string };
			expect(d1.threadId).toBe(d2.threadId);
		});

		it("adds agent to participants when existing bet thread does not include agent", async () => {
			// Create a bet thread that does NOT include agent-a
			await db.insert(threads).values({
				id: "existing-bet-thread",
				hostKind: "bet",
				hostId: "b1",
				initiatorId: "other-agent",
				participants: JSON.stringify(["other-agent"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});

			const result = await submitReviewTool.handler(
				{ title: "Join review", reasoning: ["Test"] },
				makeContext(db),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { threadId: string };
			expect(data.threadId).toBe("existing-bet-thread");

			const [thread] = await db.select().from(threads).where(eq(threads.id, "existing-bet-thread"));
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain("agent-a");
		});
	});

	// Error cases
	describe("error cases", () => {
		it("returns NOT_FOUND when ctx.taskId does not exist", async () => {
			const ctx: ToolContext = {
				...makeContext(db),
				taskId: "ghost-task-does-not-exist",
			};

			const result = await submitReviewTool.handler(
				{ title: "Will fail", reasoning: ["Because"] },
				ctx,
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});

		it("returns INVALID_INPUT when reasoning array is empty", async () => {
			const result = await submitReviewTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "No reasoning", reasoning: [] } as any,
				makeContext(db),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
