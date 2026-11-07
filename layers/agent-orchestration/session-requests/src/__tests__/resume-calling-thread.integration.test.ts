/**
 * A resumed session knows the thread the human answered in.
 *
 * The verdict is delivered by resuming the agent's own session, and the
 * agent's answer belongs back in the thread the human gave the verdict in. That
 * thread is also where the never-silent net posts when a turn ends without
 * returning anything. Without it a resumed agent that says nothing leaves the
 * person who approved staring at silence — the exact defect this package exists
 * to remove.
 *
 * Observed on codex before the fix: the resume ran, carried its context, ended
 * `not_returned`, and nothing was posted anywhere.
 */

import { users } from "@hyperidle/db";
import { agentSessionRequests } from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { queueResume } from "../index.js";

const NOW = "2026-09-01T00:00:00.000Z";
const AGENT_ID = "resume-agent";
const REVIEW_ID = "review-msg-1";
const THREAD_ID = "thread-the-human-answered-in";

describe("queueResume carries the calling thread", () => {
	test("the request carries the calling thread, so a silent resume still reaches the human", async ({
		db,
		runnerDb,
	}) => {
		await db.insert(users).values({
			id: AGENT_ID,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});

		await queueResume(runnerDb, {
			reviewMessageId: REVIEW_ID,
			idempotencyKey: `review-verdict:${REVIEW_ID}`,
			resume: {
				sessionId: "sess-original",
				harnessSessionId: "native-abc",
				sandboxPath: "/tmp/hyperidle-workspaces/local-sb-original",
				decision: "approve",
				threadId: THREAD_ID,
				agentId: AGENT_ID,
			},
		});

		const [request] = await runnerDb
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, REVIEW_ID));
		expect(request?.sourceKind).toBe("review_resume");

		const payload = JSON.parse(request?.payloadJson ?? "{}") as {
			callingThreadId?: string;
			resume?: { threadId?: string };
		};
		expect(
			payload.callingThreadId,
			"the provisioner reads callingThreadId from the payload; a resume without it has no thread to answer in",
		).toBe(THREAD_ID);
		expect(payload.resume?.threadId).toBe(THREAD_ID);
	});
});
