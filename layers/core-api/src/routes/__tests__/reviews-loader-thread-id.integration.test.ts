/**
 * The reviews loader returns the review's OWN threadId.
 *
 * `GET /api/reviews/:id` used to spread `JSON.parse(reviewMsg.payload)`
 * verbatim — `{title, reasoning, artifactRef}` — and never read the
 * message's own `threadId` column at all. `ReviewPage` derived a host from
 * `subject.taskId ?? subject.rootTaskId` and looked the thread up BY HOST, which
 * resolves the first thread for that host — the WRONG thread when a host
 * has more than one. The fix is for the loader to hand back the thread the
 * review message actually lives in, so the page can fetch it directly
 * instead of guessing through a host lookup.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function seedAgent(db: HyperIdleDb, agentId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Aria",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
}

async function seedThread(
	db: HyperIdleDb,
	opts: { id: string; hostId: string; initiatorId: string; lastActiveAt: string },
): Promise<void> {
	await db.insert(threads).values({
		id: opts.id,
		hostKind: "task",
		hostId: opts.hostId,
		initiatorId: opts.initiatorId,
		participants: JSON.stringify([opts.initiatorId]),
		lastActiveAt: opts.lastActiveAt,
		createdAt: opts.lastActiveAt,
	});
}

async function seedReviewMessage(
	db: HyperIdleDb,
	opts: { id: string; threadId: string; senderId: string },
): Promise<void> {
	await db.insert(messages).values({
		id: opts.id,
		senderId: opts.senderId,
		threadId: opts.threadId,
		type: "review",
		payload: JSON.stringify({ title: "Approve the deploy", reasoning: ["it works"] }),
		clientKey: opts.id,
		createdAt: NOW,
	});
}

describe("GET /api/reviews/:id — returns the review's own threadId", () => {
	test("the response carries threadId equal to the message's own thread", async ({ db, app }) => {
		const taskId = `task-single-thread-${crypto.randomUUID()}`;
		const agentId = `agent-reviewer-${crypto.randomUUID()}`;
		const threadId = `thread-own-${crypto.randomUUID()}`;
		const reviewId = `msg-review-${crypto.randomUUID()}`;

		await seedAgent(db, agentId);
		await seedThread(db, { id: threadId, hostId: taskId, initiatorId: agentId, lastActiveAt: NOW });
		await seedReviewMessage(db, { id: reviewId, threadId, senderId: agentId });

		const res = await app.request(`/api/reviews/${reviewId}`);
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		// Red today: the handler never reads reviewMsg.threadId at all, so the
		// field is simply absent from the response.
		expect(body.threadId).toBe(threadId);
	});

	test("threadId names the review's OWN thread even when the task host has an earlier, different thread", async ({
		db,
		app,
	}) => {
		// Two threads on the SAME task host, so a "pick the first/most-recent
		// thread for this host" strategy (the client's current by-host lookup)
		// would resolve to the WRONG one. The loader must name the review
		// message's actual thread, never guess from the host.
		const taskId = `task-two-threads-${crypto.randomUUID()}`;
		const agentId = `agent-two-threads-${crypto.randomUUID()}`;
		const earlierThreadId = `thread-earlier-${crypto.randomUUID()}`;
		const ownThreadId = `thread-own-${crypto.randomUUID()}`;
		const reviewId = `msg-review-${crypto.randomUUID()}`;

		await seedAgent(db, agentId);
		await seedThread(db, {
			id: earlierThreadId,
			hostId: taskId,
			initiatorId: agentId,
			lastActiveAt: "2020-01-01T00:00:00.000Z",
		});
		await seedThread(db, {
			id: ownThreadId,
			hostId: taskId,
			initiatorId: agentId,
			lastActiveAt: NOW,
		});
		await seedReviewMessage(db, { id: reviewId, threadId: ownThreadId, senderId: agentId });

		const res = await app.request(`/api/reviews/${reviewId}`);
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.threadId).toBe(ownThreadId);
		expect(body.threadId).not.toBe(earlierThreadId);
	});
});
