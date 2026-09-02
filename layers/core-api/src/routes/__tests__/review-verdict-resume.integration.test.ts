/**
 * A verdict on a review brings the agent back to its own session.
 *
 * The agent elected to ask — nothing blocked it — so what a verdict does is
 * resume the session that filed the review, carrying the answer. A review no
 * session filed resumes nothing, and a session that cannot be brought back is
 * reported to the human who answered rather than silently dropped: a human
 * believing something happened when it did not is the defect this package exists
 * to remove.
 */

import {
	agentWorkIntents,
	type HyperIdleDb,
	messages,
	reviewSessions,
	sessions,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-review-verdict";
const NOW = "2026-09-02T00:00:00.000Z";
/** The directory the original session ran in — cursor-agent finds its chat by this exact string. */
const ORIGINAL_SANDBOX = "/tmp/hyperidle-workspaces/local-sb-original";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seed(
	db: HyperIdleDb,
	opts: { readonly harnessSessionId: string | null },
): Promise<void> {
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
		sandboxSnapshot: ORIGINAL_SANDBOX,
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
		payload: JSON.stringify({ title: "May I deploy?", reasoning: ["the branch is green"] }),
		clientKey: "ck-review-1",
		createdAt: NOW,
	});
}

/** The link `submit_review` writes: this session filed this review. */
async function linkSession(db: HyperIdleDb): Promise<void> {
	await db.insert(reviewSessions).values({
		id: "rs-1",
		reviewMessageId: "review-1",
		sessionId: "sess-1",
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

async function resumeIntent(db: HyperIdleDb) {
	const [intent] = await db
		.select()
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.kind, "session_resume"));
	return intent;
}

describe("a verdict resumes the session that filed the review", () => {
	test("approving queues a resume carrying what the resume needs", async ({ db, app }) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkSession(db as HyperIdleDb);

		expect((await postVerdict(app, "approve")).status).toBe(201);

		const intent = await resumeIntent(db as HyperIdleDb);
		expect(intent?.sourceKind).toBe("review_verdict");
		expect(intent?.sourceId).toBe("review-1");
		const baked = JSON.parse(intent?.bakedRequestJson ?? "{}") as Record<string, unknown>;
		expect(baked).toMatchObject({
			sessionId: "sess-1",
			harnessSessionId: "native-abc",
			decision: "approve",
			threadId: "thread-1",
			agentId: "agent-1",
		});
	});

	/**
	 * @lore BA2: cursor-agent keys a chat on an md5 of the cwd STRING. Resuming
	 * from any other directory exits 0, echoes back the correct session id, and
	 * runs with no context — no error, nothing in the stream. The resume therefore
	 * has to carry the directory the original session ran in.
	 */
	test("the resume carries the directory the original session ran in", async ({ db, app }) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkSession(db as HyperIdleDb);

		expect((await postVerdict(app, "approve")).status).toBe(201);

		const baked = JSON.parse((await resumeIntent(db as HyperIdleDb))?.bakedRequestJson ?? "{}") as {
			sandboxPath?: string;
		};
		expect(
			baked.sandboxPath,
			"without the original directory a cursor resume loses all context, silently",
		).toBe(ORIGINAL_SANDBOX);
	});

	test("rejecting resumes too, so the agent learns the answer either way", async ({ db, app }) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkSession(db as HyperIdleDb);

		expect((await postVerdict(app, "reject")).status).toBe(201);

		const baked = JSON.parse((await resumeIntent(db as HyperIdleDb))?.bakedRequestJson ?? "{}") as {
			decision?: string;
		};
		expect(baked.decision).toBe("decline");
	});

	test("approve-with-comments is an approval — the comments are for the agent to read", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		await linkSession(db as HyperIdleDb);

		expect((await postVerdict(app, "approve-with-comments")).status).toBe(201);

		const baked = JSON.parse((await resumeIntent(db as HyperIdleDb))?.bakedRequestJson ?? "{}") as {
			decision?: string;
		};
		expect(baked.decision).toBe("approve");
	});

	test("a review no session filed resumes nothing", async ({ db, app }) => {
		await seed(db as HyperIdleDb, { harnessSessionId: "native-abc" });
		// Deliberately no link row.

		expect((await postVerdict(app, "approve")).status).toBe(201);

		expect(await resumeIntent(db as HyperIdleDb)).toBeUndefined();
	});

	test("a session that cannot be resumed is reported to the human who answered", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb, { harnessSessionId: null });
		await linkSession(db as HyperIdleDb);

		expect((await postVerdict(app, "approve")).status).toBe(201);
		expect(await resumeIntent(db as HyperIdleDb)).toBeUndefined();

		const posted = await (db as HyperIdleDb)
			.select()
			.from(messages)
			.where(eq(messages.threadId, "thread-1"));
		const told = posted.find((m) => m.type === "plain" && m.payload.includes("could not be"));
		expect(
			told,
			"answering something that reaches nobody must not look like it worked",
		).toBeDefined();
		expect(told?.payload).toContain("cannot be resumed");
	});
});
