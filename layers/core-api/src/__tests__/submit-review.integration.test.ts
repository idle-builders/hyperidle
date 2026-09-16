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
import { NO_LINK_REVIEW_ACCESSOR } from "@hyperidle/agent-orchestration/testing";
import {
	type HyperIdleDb,
	knowledgeItems,
	messages,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { seedKnowledgeItem } from "./_helpers.js";

/**
 * @lore AU31 §3.2/B2: this file's tool handler(s) reach `ports.coreApi.*`
 * (the seam) — the tool is built fresh per test off THIS test's own `app`
 * (`createInProcessCoreApiTransport`), never an ambient transport global.
 *
 * @lore §8 B1: `submit_review` unconditionally opens the calling task
 * (`ports.coreApi.openTask(ctx.taskId, …)`, no `ctx.teamId` shortcut) — this
 * whole file is "a test about submit_review's task-reading behaviour", the
 * documented case an `openTask` binding is injected for, not
 * `THROWING_OPEN_TASK`.
 */
function realOpenTask(
	db: HyperIdleDb,
): (
	id: string,
	actorId: string,
) => Promise<
	{ readonly task: { readonly parentTaskId: string | null; readonly teamId: string } } | undefined
> {
	return async (id) => {
		const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
		if (!row) return undefined;
		return { task: { parentTaskId: row.parentTaskId, teamId: row.teamId } };
	};
}

function buildSubmitReviewTool(
	app: Hono,
	db: HyperIdleDb,
): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(
		createInProcessCoreApiTransport(app),
		NO_LINK_REVIEW_ACCESSOR,
		realOpenTask(db),
	).find((t) => t.name === "submit_review")!;
}

const NOW = new Date().toISOString();

async function seed(db: HyperIdleDb): Promise<void> {
	// @lore U1: teams = domain entity (formerly products); teamMembers = membership group (formerly teams).
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: NOW });
	await db.insert(tasks).values({
		id: "b1",
		parentTaskId: null,
		teamId: "team-1",
		title: "Implement feature X",
		description: "Implement feature X",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-a",
		name: "Builder Agent",
		role: "builder",
		teamId: "team-1",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		parentTaskId: "b1",
		teamId: "team-1",
		ownerAgentId: "agent-a",
		title: "Parent Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	// `submit_review` checks a named `producedItemId` exists AND is parented to
	// the calling task before attaching it; a real row is required for the AC2
	// happy-path test below.
	await seedKnowledgeItem(db, { id: "ki-1", title: "Produced item", scopeKind: "team" });
	await db
		.update(knowledgeItems)
		.set({ parentKind: "task", parentId: "task-1" })
		.where(eq(knowledgeItems.id, "ki-1"));
}

function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-r5-submitreview-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("submit_review tool", () => {
	// AC2 happy path: full ReviewPayload naming the item this task produced
	describe("AC2: review message with producedItemId", () => {
		test("creates review-type message on the task's own thread (founder ruling 7: never the bet's)", async ({
			db,
			app,
		}) => {
			const submitReviewTool = buildSubmitReviewTool(app, db);
			await seed(db);
			const result = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All tests pass", "Code reviewed"],
					producedItemId: "ki-1",
				},
				makeContext(db),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { messageId: string; threadId: string; rootTaskId: string };
			expect(typeof data.messageId).toBe("string");
			expect(typeof data.threadId).toBe("string");
			expect(data.rootTaskId).toBe("b1");

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
				producedItemId: string;
			};
			expect(payload.title).toBe("Work complete");
			expect(payload.reasoning).toEqual(["All tests pass", "Code reviewed"]);
			expect(payload.producedItemId).toBe("ki-1");

			// Founder ruling 7: the review lands on the TASK's own thread, never
			// the bet's.
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();
			expect(thread?.hostKind).toBe("task");
			expect(thread?.hostId).toBe("task-1");

			// Agent is in participants
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain("agent-a");
		});
	});

	/**
	 * @lore BA2: this used to assert the opposite — that a review with no
	 * evidence produced a `plain` message reading "Review requested: …".
	 * That fallback was the defect. Only a `review` message renders the card
	 * carrying the verdict buttons, so the ordinary case — an agent asking for
	 * agreement BEFORE it acts, with nothing built yet to attach — could never
	 * be approved or declined, and the session that filed it was never resumed.
	 * Evidence is optional; the message type is not.
	 */
	describe("a review with no evidence attached", () => {
		test("is still a review, so a human has something to answer", async ({ db, app }) => {
			const submitReviewTool = buildSubmitReviewTool(app, db);
			await seed(db);
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
			expect(
				msg?.type,
				"a plain message renders no verdict buttons, so the human can never answer",
			).toBe("review");

			const payload = JSON.parse(msg?.payload ?? "{}") as {
				title: string;
				reasoning: ReadonlyArray<string>;
			};
			expect(payload.title).toBe("Work complete");
			expect(payload.reasoning).toEqual(["All tests pass"]);
		});
	});

	// Thread reuse: second call reuses existing task thread
	describe("thread reuse", () => {
		test("second call reuses existing task thread (idempotent thread creation)", async ({
			db,
			app,
		}) => {
			const submitReviewTool = buildSubmitReviewTool(app, db);
			await seed(db);
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

		test("adds agent to participants when existing task thread does not include agent", async ({
			db,
			app,
		}) => {
			const submitReviewTool = buildSubmitReviewTool(app, db);
			await seed(db);
			// Founder ruling 7: the review anchors on the TASK's thread — create
			// a task thread (not a bet thread) that does NOT include agent-a.
			await db.insert(threads).values({
				id: "existing-task-thread",
				hostKind: "task",
				hostId: "task-1",
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
			expect(data.threadId).toBe("existing-task-thread");

			const [thread] = await db
				.select()
				.from(threads)
				.where(eq(threads.id, "existing-task-thread"));
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			expect(participants).toContain("agent-a");
		});
	});

	// Error cases
	describe("error cases", () => {
		test("returns NOT_FOUND when ctx.taskId does not exist", async ({ db, app }) => {
			const submitReviewTool = buildSubmitReviewTool(app, db);
			await seed(db);
			const ctx: ToolContext<HyperIdleDb> = {
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

		test("returns INVALID_INPUT when reasoning array is empty", async ({ db, app }) => {
			const submitReviewTool = buildSubmitReviewTool(app, db);
			await seed(db);
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
