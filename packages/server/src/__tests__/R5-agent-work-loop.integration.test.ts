/**
 * R5 RED — Integration tests for the Agent Work Loop.
 *
 * AC1: Agent creates tasks using skill tools. Created tasks appear in the
 *      WorkBet task table with correct title and status.
 * AC2: Agent submits a review message. Review renders as RichMessageCard in
 *      the bet's host thread.
 * AC3: User can submit a verdict (approve/reject). Verdict is persisted and
 *      readable by the agent.
 * AC4: Cost from harness adapter flows through and displays in WorkBet cost
 *      section.
 * AC5: Task status updates from agent reflected in WorkBet task table status
 *      chips.
 *
 * These tests FAIL until Tasks 1-4 implementation ships.
 */

import * as os from "node:os";
import * as path from "node:path";
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
import { clearDeduplicationCache, recordCostAndCheck } from "@hyperidle/server/app-runtime";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { test } from "../test-fixtures.js";
import { createTaskTool } from "../tools/create-task.js";
import { readInboxTool } from "../tools/read-inbox.js";
import { submitReviewTool } from "../tools/submit-review.js";
import type { ToolContext } from "../tools/tool-registry.js";

const TEST_API_KEY = "test-key-r5-agent-loop";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	// @lore U1: `teams` is the domain entity (formerly `products`).
	// `teamMembers` is the membership group (formerly `teams`).
	// bets/tasks.teamId references teams.id; users.teamId references teamMembers.id.
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		teamId: "team-1",
		description: "Implement feature X",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values([
		{
			id: "agent-a",
			name: "Builder Agent",
			role: "builder",
			teamId: "tm-1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: NOW,
		},
		{
			// @lore AF11-IDOR: kind="human" is required so createAuthMiddleware resolves
			// "founder-1" as the authenticated principal via `users WHERE kind = 'human' LIMIT 1`.
			// Previously relied on X-Identity header override; now uses auth principal directly.
			id: "founder-1",
			kind: "human",
			name: "Founder",
			role: "founder",
			teamId: "tm-1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: NOW,
		},
	]);
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "team-1",
		ownerAgentId: "agent-a",
		title: "Parent Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-r5-integration-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("R5: Agent Work Loop integration", () => {
	// Keep process.env assignment in beforeEach/afterEach — non-DB env work
	beforeEach(() => {
		process.env.HYPERIDLE_API_KEY = TEST_API_KEY;
	});

	afterEach(() => {
		delete process.env.HYPERIDLE_API_KEY;
	});

	// AC1, AC5: create_task tool inserts task visible in GET /api/bets/:id
	describe("AC1 & AC5: create_task tool — task visible in bet detail", () => {
		test("created task appears in GET /api/bets/:id tasks array", async ({ db, app, eventBus }) => {
			clearDeduplicationCache();
			await seedBase(db);
			const ctx = makeContext(db, eventBus);

			// Agent calls create_task
			const createResult = await createTaskTool.handler({ title: "Subtask 1" }, ctx);
			expect(createResult.success).toBe(true);
			if (!createResult.success) return;

			const { taskId: newTaskId } = createResult.data as { taskId: string };

			// GET /api/bets/:id should include both the original task and the new one
			const res = await app.request("/api/bets/b1", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				tasks: Array<{
					id: string;
					title: string;
					state: string;
					ownerAgentId: string | null;
					betId: string;
				}>;
			};

			expect(body.tasks).toHaveLength(2);

			const newTask = body.tasks.find((t) => t.id === newTaskId);
			expect(newTask).toBeDefined();
			expect(newTask?.title).toBe("Subtask 1");
			expect(newTask?.state).toBe("proposed");
			expect(newTask?.ownerAgentId).toBe("agent-a");
			expect(newTask?.betId).toBe("b1");
		});

		test("session's own task starts as in_progress in bet detail (AC5)", async ({ db, app }) => {
			await seedBase(db);

			const res = await app.request("/api/bets/b1", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				tasks: Array<{ id: string; state: string }>;
			};

			const sessionTask = body.tasks.find((t) => t.id === "task-1");
			expect(sessionTask).toBeDefined();
			expect(sessionTask?.state).toBe("in_progress");
		});
	});

	// AC2: submit_review tool posts a review message visible in the bet's thread
	describe("AC2: submit_review tool — review message in bet host thread", () => {
		test("submitted review message appears in bet host thread", async ({ db, eventBus }) => {
			await seedBase(db);
			const ctx = makeContext(db, eventBus);

			// Agent submits review (fallback path — no artifactRef)
			const reviewResult = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All tests pass", "Code reviewed"],
				},
				ctx,
			);
			expect(reviewResult.success).toBe(true);
			if (!reviewResult.success) return;

			const { threadId, messageId } = reviewResult.data as {
				threadId: string;
				messageId: string;
			};

			// Thread should exist with hostKind="bet"
			const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
			expect(thread).toBeDefined();
			expect(thread?.hostKind).toBe("bet");
			expect(thread?.hostId).toBe("b1");

			// Message should exist
			const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
			expect(msg).toBeDefined();
			expect(msg?.type).toBe("plain"); // fallback without artifactRef

			const payload = JSON.parse(msg?.payload ?? "{}") as { text: string };
			expect(payload.text).toContain("Work complete");
		});

		test("submitted review with artifactRef creates review-type message", async ({
			db,
			eventBus,
		}) => {
			await seedBase(db);
			const ctx = makeContext(db, eventBus);

			const reviewResult = await submitReviewTool.handler(
				{
					title: "Work complete with artifact",
					reasoning: ["Feature implemented"],
					artifactRef: { id: "art-123", kind: "content_preview" },
				},
				ctx,
			);
			expect(reviewResult.success).toBe(true);
			if (!reviewResult.success) return;

			const { messageId } = reviewResult.data as { messageId: string };
			const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
			expect(msg?.type).toBe("review");
		});
	});

	// AC3: Verdict round-trip — founder posts verdict, agent reads it via read_inbox
	describe("AC3: verdict round-trip", () => {
		test("founder verdict is readable by agent via read_inbox after review posted", async ({
			db,
			eventBus,
			app,
		}) => {
			await seedBase(db);
			const ctx = makeContext(db, eventBus);

			// Step 1: Agent submits review — establishes bet thread
			const reviewResult = await submitReviewTool.handler(
				{
					title: "Work complete",
					reasoning: ["All criteria met"],
					artifactRef: { id: "art-1", kind: "content_preview" },
				},
				ctx,
			);
			expect(reviewResult.success).toBe(true);
			if (!reviewResult.success) return;

			const { threadId, messageId: reviewMessageId } = reviewResult.data as {
				threadId: string;
				messageId: string;
			};

			// Ensure founder is a participant so they can post the verdict
			const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
			const participants = JSON.parse(thread?.participants ?? "[]") as string[];
			if (!participants.includes("founder-1")) {
				const updated = [...participants, "founder-1"];
				await db
					.update(threads)
					.set({ participants: JSON.stringify(updated) })
					.where(eq(threads.id, threadId));
			}

			// Step 2: Founder posts verdict via API
			const verdictClientKey = `verdict-${Date.now()}`;
			const verdictRes = await app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"X-Identity": "founder-1",
				},
				body: JSON.stringify({
					type: "verdict",
					payload: {
						decision: "approve",
						resolvesMessageId: reviewMessageId,
					},
					clientKey: verdictClientKey,
				}),
			});
			expect([200, 201]).toContain(verdictRes.status);

			// Step 3: Agent reads inbox — verdict should appear
			const inboxResult = await readInboxTool.handler({ limit: 20 }, ctx);
			expect(inboxResult.success).toBe(true);
			if (!inboxResult.success) return;

			const inboxData = inboxResult.data as {
				messages: Array<{ id: string; type: string }>;
			};
			const verdictMsg = inboxData.messages.find((m) => m.type === "verdict");
			expect(verdictMsg).toBeDefined();
		});
	});

	// AC4: Cost accumulation via recordCostAndCheck with taskId flows to bet
	describe("AC4: cost accumulation on bet", () => {
		test("recordCostAndCheck with taskId increments bets.costActualMinor", async ({
			db,
			eventBus,
			app,
		}) => {
			await seedBase(db);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "session-1",
				costMinor: 150,
				currency: "USD",
				agentId: "agent-a",
				teamId: "tm-1",
				taskId: "task-1",
			});

			const res = await app.request("/api/bets/b1", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				costActual: { minor: number; currency: string } | null;
			};

			expect(body.costActual).not.toBeNull();
			expect(body.costActual?.minor).toBeGreaterThanOrEqual(150);
			expect(body.costActual?.currency).toBe("USD");
		});

		test("multiple cost events accumulate cumulatively on the bet", async ({
			db,
			eventBus,
			app,
		}) => {
			await seedBase(db);

			await recordCostAndCheck(db, eventBus, {
				sessionId: "session-1",
				costMinor: 100,
				currency: "USD",
				agentId: "agent-a",
				teamId: "tm-1",
				taskId: "task-1",
			});

			// Second event on same session (dedup means this won't re-fire cap events,
			// but cost should still accumulate)
			// @lore R5: known debt — recordCostAndCheck passes totalCostCents (running
			// total) not delta. Bet accumulation inherits this behavior. See
			// plans/R5/architecture.md "Pre-existing cost over-counting".
			await recordCostAndCheck(db, eventBus, {
				sessionId: "session-2",
				costMinor: 75,
				currency: "USD",
				agentId: "agent-a",
				teamId: "tm-1",
				taskId: "task-1",
			});

			const res = await app.request("/api/bets/b1", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				costActual: { minor: number; currency: string } | null;
			};

			expect(body.costActual).not.toBeNull();
			expect(body.costActual?.minor).toBeGreaterThanOrEqual(175);
		});

		test("recordCostAndCheck without taskId does NOT affect bet cost", async ({ db, eventBus }) => {
			await seedBase(db);

			// Backward compat: no taskId => bet unchanged
			await recordCostAndCheck(db, eventBus, {
				sessionId: "session-no-task",
				costMinor: 500,
				currency: "USD",
				agentId: "agent-a",
				teamId: "tm-1",
				// taskId deliberately omitted
			});

			const [bet] = await db
				.select({ costActualMinor: bets.costActualMinor })
				.from(bets)
				.where(eq(bets.id, "b1"));
			// Bet cost should remain null (not incremented)
			expect(bet?.costActualMinor).toBeNull();
		});
	});

	// AC4: Token accumulation on bet at session teardown
	describe("AC4: token accumulation on bet (via session teardown)", () => {
		test("GET /api/bets/:id returns tokensActual with byTier after session with tokens", async ({
			db,
			app,
		}) => {
			await seedBase(db);

			// Directly write tokensActualJson to the bet to simulate teardown
			// This tests the GET /api/bets/:id parsing, which is already implemented.
			// The actual teardown (session-provisioning Phase 11) is tested by the
			// integration session tests — here we verify the API parses tokensActualJson.
			const tokenData = {
				byTier: {
					workhorse: { prompt: 1000, completion: 500 },
				},
			};
			await db
				.update(bets)
				.set({ tokensActualJson: JSON.stringify(tokenData) })
				.where(eq(bets.id, "b1"));

			const res = await app.request("/api/bets/b1", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				tokensActual: { byTier: Record<string, { prompt: number; completion: number }> } | null;
			};

			expect(body.tokensActual).not.toBeNull();
			expect(body.tokensActual?.byTier).toBeDefined();
			expect(body.tokensActual?.byTier.workhorse).toBeDefined();
			expect(body!.tokensActual?.byTier.workhorse?.prompt).toBeGreaterThanOrEqual(1000);
		});
	});
});
