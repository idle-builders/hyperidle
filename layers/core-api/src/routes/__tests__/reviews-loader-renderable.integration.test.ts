/**
 * A review with no evidence still loads a subject the review surface can render.
 *
 * BA2: this is the step the whole package exists for — a human answering. The
 * loader used to return `{...payload, threadId}`, so a real agent review (title
 * and reasoning, nothing attached) reached the page missing `artifacts`,
 * `conversation`, `intent`, `needs` and `resultKpis`. The surface calls
 * `.find`/`.filter`/`.map` on all five with no optionality, so the page threw
 * and rendered "Something went wrong" — with no way to approve or decline, and
 * therefore no way for the agent's session ever to be resumed.
 *
 * These assertions are about the CONTRACT the surface consumes, not about
 * `res.ok`: a 200 carrying a subject the page cannot render is the exact defect
 * that shipped.
 */

import { type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();
const TEAM_ID = "team-renderable";
const HUMAN_ID = "human-renderable";
const AGENT_ID = "agent-renderable";
const ROOT_TASK_ID = "task-renderable-root";
const TASK_ID = "task-renderable-child";
const THREAD_ID = "thread-renderable";
const REVIEW_ID = "msg-review-renderable";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM_ID, name: "Team", phase: "build", createdAt: NOW });
	await db.insert(users).values([
		{
			id: AGENT_ID,
			kind: "ai",
			name: "Aria",
			role: "builder",
			status: "active",
			teamId: TEAM_ID,
			createdAt: NOW,
		},
		{
			id: HUMAN_ID,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			teamId: TEAM_ID,
			createdAt: NOW,
		},
	]);
	await db.insert(tasks).values([
		{
			id: ROOT_TASK_ID,
			parentTaskId: null,
			teamId: TEAM_ID,
			title: "Ship the thing",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		},
		{
			id: TASK_ID,
			parentTaskId: ROOT_TASK_ID,
			teamId: TEAM_ID,
			title: "Pick and commit a licence",
			description: "This project has no licence yet. Choose one and commit it.",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		},
	]);
	await db.insert(threads).values({
		id: THREAD_ID,
		hostKind: "task",
		hostId: TASK_ID,
		initiatorId: AGENT_ID,
		participants: JSON.stringify([HUMAN_ID, AGENT_ID]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(messages).values({
		id: REVIEW_ID,
		senderId: AGENT_ID,
		threadId: THREAD_ID,
		type: "review",
		// Exactly what an agent asking for agreement files: no artifactRef, no
		// inline artifacts — it has not done the thing yet.
		payload: JSON.stringify({ title: "May I use MIT?", reasoning: ["no signal either way"] }),
		clientKey: REVIEW_ID,
		createdAt: NOW,
	});
}

describe("GET /api/reviews/:id — an evidence-free review is renderable", () => {
	test("every list the surface iterates is present", async ({ db, app }) => {
		await seed(db as HyperIdleDb);

		const res = await app.request(`/api/reviews/${REVIEW_ID}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		for (const field of ["artifacts", "conversation", "intent", "needs", "resultKpis", "tools"]) {
			expect(
				Array.isArray(body[field]),
				`the review surface calls an array method on \`${field}\` with no guard — a missing one throws the page`,
			).toBe(true);
		}
	});

	test("it carries the facts a human needs to decide", async ({ db, app }) => {
		await seed(db as HyperIdleDb);

		const res = await app.request(`/api/reviews/${REVIEW_ID}`);
		const body = (await res.json()) as Record<string, unknown>;

		expect(body.id).toBe(REVIEW_ID);
		expect(body.title).toBe("May I use MIT?");
		expect(body.taskId).toBe(TASK_ID);
		expect(body.taskTitle).toBe("Pick and commit a licence");
		expect(body.parentTaskId).toBe(ROOT_TASK_ID);
		expect(body.betTitle).toBe("Ship the thing");
		// What the agent was asked to do, and what it says about it. The reasoning
		// renders nowhere else on the surface, so a review that drops it is one a
		// human cannot judge.
		expect(body.prompt).toBe("This project has no licence yet. Choose one and commit it.");
		expect(body.outcome).toContain("no signal either way");
		expect(body.authorName).toBe("Aria");
		expect(body.reviewerName).toBe("Founder");
		// Unanswered, so the surface must offer the verdict controls.
		expect(body.blocking).toBe(true);
		expect(body.verdict).toBeUndefined();
	});

	test("once answered it reports the verdict, so the surface goes read-only", async ({
		db,
		app,
	}) => {
		await seed(db as HyperIdleDb);
		await (db as HyperIdleDb).insert(messages).values({
			id: "msg-verdict-renderable",
			senderId: HUMAN_ID,
			threadId: THREAD_ID,
			type: "verdict",
			payload: JSON.stringify({ decision: "approve", resolvesMessageId: REVIEW_ID }),
			clientKey: "msg-verdict-renderable",
			createdAt: NOW,
		});

		const res = await app.request(`/api/reviews/${REVIEW_ID}`);
		const body = (await res.json()) as { verdict?: { decision?: string }; blocking?: boolean };

		expect(body.verdict?.decision).toBe("approve");
		expect(body.blocking).toBe(false);
	});
});
