/**
 * Integration tests for recordReviewVerdict's tryDeliverToLive path.
 *
 * When a session is live (tryDeliverToLive returns "delivered"), the verdict
 * must go via stdin, not via a new resume intent.
 */

import { sessions, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { recordReviewSession, recordReviewVerdict } from "../review-sessions.js";

describe("recordReviewVerdict — live-session delivery", () => {
	test("delivers verdict to live session instead of queuing a resume intent", async ({ db }) => {
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent One",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		// Seed a real session row with a harnessSessionId (so the queue path would normally work too)
		await db.insert(sessions).values({
			id: "sess-live",
			agentId: "agent-1",
			state: "active" as const,
			modelTier: "workhorse" as const,
			startedAt: new Date().toISOString(),
			harnessSessionId: "harness-native-id",
			sandboxSnapshot: "/tmp/sandbox",
		});

		// Link a review message to the session
		await recordReviewSession(
			db,
			{ reviewMessageId: "review-msg-1", sessionId: "sess-live" },
			new Date().toISOString(),
		);

		let enqueueCallCount = 0;
		let deliverCallCount = 0;

		const outcome = await recordReviewVerdict(
			db,
			{
				reviewMessageId: "review-msg-1",
				decision: "approve" as const,
				decidedBy: "user-1",
				threadId: "thread-1",
			},
			async (_input) => {
				enqueueCallCount++;
				return { id: "intent-1", idempotencyKey: "key-1" };
			},
			async (_sessionId, _text) => {
				deliverCallCount++;
				return "delivered" as const;
			},
		);

		expect(outcome.status).toBe("queued");
		// Delivered via live session — enqueue NOT called
		expect(enqueueCallCount).toBe(0);
		expect(deliverCallCount).toBe(1);
	});

	test("falls through to enqueue when tryDeliverToLive returns not_found", async ({ db }) => {
		await db.insert(users).values({
			id: "agent-2",
			kind: "ai",
			name: "Agent Two",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await db.insert(sessions).values({
			id: "sess-live-2",
			agentId: "agent-2",
			state: "active" as const,
			modelTier: "workhorse" as const,
			startedAt: new Date().toISOString(),
			harnessSessionId: "harness-native-id-2",
			sandboxSnapshot: "/tmp/sandbox2",
		});

		await recordReviewSession(
			db,
			{ reviewMessageId: "review-msg-2", sessionId: "sess-live-2" },
			new Date().toISOString(),
		);

		let enqueueCallCount = 0;

		const outcome = await recordReviewVerdict(
			db,
			{
				reviewMessageId: "review-msg-2",
				decision: "approve" as const,
				decidedBy: "user-1",
				threadId: "thread-1",
			},
			async (_input) => {
				enqueueCallCount++;
				return { id: "intent-2", idempotencyKey: "key-2" };
			},
			async (_sessionId, _text) => "not_found" as const,
		);

		expect(outcome.status).toBe("queued");
		// Not delivered via live — enqueue called
		expect(enqueueCallCount).toBe(1);
	});

	test("returns not_resumable when no harnessSessionId and no live deliver", async ({ db }) => {
		await db.insert(users).values({
			id: "agent-3",
			kind: "ai",
			name: "Agent Three",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await db.insert(sessions).values({
			id: "sess-no-harness",
			agentId: "agent-3",
			state: "active" as const,
			modelTier: "workhorse" as const,
			startedAt: new Date().toISOString(),
			// No harnessSessionId
		});

		await recordReviewSession(
			db,
			{ reviewMessageId: "review-msg-3", sessionId: "sess-no-harness" },
			new Date().toISOString(),
		);

		const outcome = await recordReviewVerdict(
			db,
			{
				reviewMessageId: "review-msg-3",
				decision: "approve" as const,
				decidedBy: "user-1",
				threadId: "thread-1",
			},
			async (_input) => ({ id: "intent-3", idempotencyKey: "key-3" }),
		);

		expect(outcome.status).toBe("not_resumable");
	});
});
