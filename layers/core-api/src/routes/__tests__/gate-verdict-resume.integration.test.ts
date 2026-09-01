/**
 * Approving the review a gate caused sends the agent back to its work — and
 * approving anything else does not.
 *
 * These are the two halves of the same guarantee. A gate-caused review carries a
 * `gate_reviews` row, and a verdict on it queues the `session_resume` intent that
 * brings the agent back with the answer. An ordinary design review carries no
 * such row, so approving it queues nothing: no bypass is granted by filing a
 * review.
 *
 * The third case is the one this work package exists for. When the review WAS
 * gate-caused but the session cannot be resumed, the human who approved is told
 * in the thread they are in. An approval that reaches nobody, with the human
 * believing the action happened, is the defect being fixed — reproducing it in a
 * new place would fail this work.
 */

import {
	agentWorkIntents,
	gateReviews,
	type HyperIdleDb,
	messages,
	sessions,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-gate-verdict";
const NOW = "2026-09-01T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * A team, a founder who can decide, an agent that asked, a thread, and a review
 * message in it. `harnessSessionId` null models a session the harness never
 * reported an id for — one that genuinely cannot be resumed.
 */
async function seed(
	db: HyperIdleDb,
	opts: { readonly harnessSessionId: string | null },
): Promise<{ threadId: string; reviewId: string; sessionId: string }> {
	await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: NOW });
	await db.insert(users).values([
		{
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			teamId: "team-1",
			createdAt: NOW,
		},
		{
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: "team-1",
			createdAt: NOW,
		},
	]);
	await db.insert(sessions).values({
		id: "sess-1",
		agentId: "agent-1",
		modelTier: "balanced",
		startedAt: NOW,
		state: "done",
		harnessSessionId: opts.harnessSessionId,
	});
	await db.insert(threads).values({
		id: "thread-1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["u-founder", "agent-1"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(messages).values({
		id: "review-1",
		senderId: "agent-1",
		threadId: "thread-1",
		type: "review",
		payload: JSON.stringify({ title: "Let me push", reasoning: ["branch is green"] }),
		clientKey: "ck-review-1",
		createdAt: NOW,
	});
	return { threadId: "thread-1", reviewId: "review-1", sessionId: "sess-1" };
}

async function linkGateReview(db: HyperIdleDb): Promise<void> {
	await db.insert(gateReviews).values({
		id: "gr-1",
		reviewMessageId: "review-1",
		sessionId: "sess-1",
		ruleId: "rule-push",
		toolName: "Bash",
		createdAt: NOW,
	});
}

async function postVerdict(
	app: Hono,
	decision: "approve" | "approve-with-comments" | "reject",
): Promise<Response> {
	return app.request("/api/threads/thread-1/messages", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			type: "verdict",
			payload: { decision, resolvesMessageId: "review-1" },
			clientKey: `ck-verdict-${decision}`,
		}),
	});
}

describe("a verdict on a gate-caused review sends the agent back", () => {
	test("approving queues a resume carrying the cleared action", async ({ db, app }) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkGateReview(db as HyperIdleDb);

		const res = await postVerdict(app, "approve");
		expect(res.status).toBe(201);

		const intents = await (db as HyperIdleDb)
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "session_resume"));
		expect(intents).toHaveLength(1);
		expect(intents[0]?.sourceKind).toBe("gate_review");
		expect(intents[0]?.sourceId).toBe("review-1");

		const baked = JSON.parse(intents[0]?.bakedRequestJson ?? "{}") as Record<string, unknown>;
		expect(baked).toMatchObject({
			sessionId: "sess-1",
			harnessSessionId: "native-abc",
			ruleId: "rule-push",
			toolName: "Bash",
			decision: "approve",
			threadId: "thread-1",
			agentId: "agent-1",
		});
	});

	test("rejecting also queues a resume, so the agent learns the answer either way", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkGateReview(db as HyperIdleDb);

		expect((await postVerdict(app, "reject")).status).toBe(201);

		const intents = await (db as HyperIdleDb)
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "session_resume"));
		expect(intents).toHaveLength(1);
		const baked = JSON.parse(intents[0]?.bakedRequestJson ?? "{}") as { decision?: string };
		expect(baked.decision).toBe("decline");
	});

	test("approve-with-comments clears the action — the comments are for the agent to read", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkGateReview(db as HyperIdleDb);

		expect((await postVerdict(app, "approve-with-comments")).status).toBe(201);

		const intents = await (db as HyperIdleDb)
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "session_resume"));
		const baked = JSON.parse(intents[0]?.bakedRequestJson ?? "{}") as { decision?: string };
		expect(baked.decision).toBe("approve");
	});

	test("approving an ordinary review queues nothing — filing a review grants no bypass", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		// Deliberately NO gate_reviews row: nothing blocked this agent.

		expect((await postVerdict(app, "approve")).status).toBe(201);

		const intents = await (db as HyperIdleDb)
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "session_resume"));
		expect(intents, "an ordinary review must not queue a resume").toHaveLength(0);
	});

	test("a session that cannot be resumed is reported to the human who approved", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb, { harnessSessionId: null });
		await linkGateReview(db as HyperIdleDb);

		expect((await postVerdict(app, "approve")).status).toBe(201);

		const intents = await (db as HyperIdleDb)
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "session_resume"));
		expect(intents, "nothing to resume, so nothing queued").toHaveLength(0);

		const posted = await (db as HyperIdleDb)
			.select()
			.from(messages)
			.where(eq(messages.threadId, "thread-1"));
		const told = posted.find((m) => m.type === "plain" && m.payload.includes("could not be"));
		expect(
			told,
			"the human approved something that will not happen and must be told in the thread",
		).toBeDefined();
		expect(told?.payload).toContain("cannot be resumed");
	});
});
