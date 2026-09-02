/**
 * A resumed session knows the thread the human answered in.
 *
 * BA2: the verdict is delivered by resuming the agent's own session, and the
 * agent's answer belongs back in the thread the human gave the verdict in. That
 * thread is also where the never-silent net posts when a turn ends without
 * returning anything. Without it a resumed agent that says nothing leaves the
 * person who approved staring at silence — the exact defect this package exists
 * to remove.
 *
 * Observed on codex before the fix: the resume ran, carried its context, ended
 * `not_returned`, and nothing was posted anywhere.
 */

import { agentSessionRequests, agentWorkIntents, type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { drainIntents } from "../index.js";

const NOW = "2026-09-01T00:00:00.000Z";
const AGENT_ID = "resume-agent";
const REVIEW_ID = "review-msg-1";
const THREAD_ID = "thread-the-human-answered-in";

async function seedResumeIntent(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(agentWorkIntents).values({
		id: "intent-resume-1",
		kind: "session_resume",
		sourceKind: "review_verdict",
		sourceId: REVIEW_ID,
		requestedBy: "human-1",
		idempotencyKey: `review-verdict:${REVIEW_ID}`,
		status: "pending",
		bakedRequestJson: JSON.stringify({
			sessionId: "sess-original",
			harnessSessionId: "native-abc",
			sandboxPath: "/tmp/hyperidle-workspaces/local-sb-original",
			decision: "approve",
			threadId: THREAD_ID,
			agentId: AGENT_ID,
		}),
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("draining a review verdict into a session request", () => {
	test("the request carries the calling thread, so a silent resume still reaches the human", async ({
		db,
	}) => {
		await seedResumeIntent(db as HyperIdleDb);

		await drainIntents({ db: db as HyperIdleDb, eventBus: new EventBus() });

		const [intent] = await (db as HyperIdleDb)
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, "intent-resume-1"));
		expect(intent?.status).toBe("handed_off");

		const [request] = await (db as HyperIdleDb)
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
