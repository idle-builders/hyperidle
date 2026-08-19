import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	items,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function buildHandoffToTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "handoff_to",
	)!;
}

async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values([
		{
			id: "agent-a",
			name: "A",
			role: "builder",
			teamId: "t1",
			status: "active",
			createdAt: now,
		},
		{
			id: "agent-b",
			name: "B",
			role: "builder",
			teamId: "t1",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: "thread-task-1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-a",
		participants: JSON.stringify(["agent-a"]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		ownerAgentId: "agent-a",
		title: "T",
		state: "in_progress",
		threadId: "thread-task-1",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(sessions).values({
		id: "session-1",
		taskId: "task-1",
		agentId: "agent-a",
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});
}

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-handoff-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

const baseMetadata = {
	contextId: "ctx-1",
	status: "in_progress" as const,
	reason: "needs builder",
	artifacts: [],
	remainingWork: [],
};

describe("handoff_to tool", () => {
	describe("AC5: handoff to agent B changes task owner and ends session", () => {
		test("transfers ownership to B and ends A's session", async ({ db, eventBus, app }) => {
			const handoffToTool = buildHandoffToTool(app);
			await seed(db);
			const result = await handoffToTool.handler(
				{ toAgent: "agent-b", ...baseMetadata },
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string; targetAgentId?: string };
			expect(data.status).toBe("success");
			expect(data.targetAgentId).toBe("agent-b");

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.ownerAgentId).toBe("agent-b");

			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
			expect(session?.state).toBe("done");
		});
	});

	describe("handoff by role", () => {
		test("resolves toRole to an available teammate", async ({ db, eventBus, app }) => {
			const handoffToTool = buildHandoffToTool(app);
			await seed(db);
			const ctx = makeContext(db, eventBus);
			// agent-a is also builder; handoff to role builder should pick agent-b (excludes self)
			const result = await handoffToTool.handler({ toRole: "builder", ...baseMetadata }, ctx);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string; targetAgentId?: string };
			expect(data.status).toBe("success");
			expect(data.targetAgentId).toBe("agent-b");
		});
	});

	describe("handoff to human", () => {
		test("creates a review item and transitions task to blocked", async ({ db, eventBus, app }) => {
			const handoffToTool = buildHandoffToTool(app);
			await seed(db);
			const result = await handoffToTool.handler(
				{ toHuman: true, ...baseMetadata, status: "blocked", reason: "need a human" },
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string };
			expect(data.status).toBe("success");

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("blocked");

			const reviewItems = await db.select().from(items);
			expect(reviewItems.length).toBeGreaterThanOrEqual(1);
			expect(reviewItems.some((i) => i.kind === "review")).toBe(true);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when no target is specified", async ({ db, eventBus, app }) => {
			const handoffToTool = buildHandoffToTool(app);
			await seed(db);
			const result = await handoffToTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ ...baseMetadata } as any,
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when reason is missing", async ({ db, eventBus, app }) => {
			const handoffToTool = buildHandoffToTool(app);
			await seed(db);
			const result = await handoffToTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ toAgent: "agent-b", contextId: "x", status: "in_progress" } as any,
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns NOT_FOUND when target agent does not exist", async ({ db, eventBus, app }) => {
			const handoffToTool = buildHandoffToTool(app);
			await seed(db);
			const result = await handoffToTool.handler(
				{ toAgent: "ghost", ...baseMetadata },
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});

/**
 * AU26 H1 (§D-M.1) — the run-end write moves down to
 * `run-orchestration.endRunForHandoff(tx, sessionId, endedAt)`. These four
 * assertions are the whole contract of the move, and each one is a trap a
 * previous design hit:
 *
 *  - **terminal at commit** — the write rides the handoff's OWN transaction,
 *    so a handoff can never commit leaving a live run (trap (a): the existing
 *    `session_handoff_completed` subscriber transitions the *request*, never
 *    `sessions.state`, and runs post-commit).
 *  - **no `session_ended`** — `endSession`'s caller emits it (trap (b)); a
 *    handoff that emitted it would create a spurious review item on EVERY
 *    handoff.
 *  - **no review item** — the observable consequence of the above, proven
 *    against the real `registerReviewSubscriptions` subscriber.
 *  - **unconditional** — the row is written whether or not a matching
 *    `agentSessionRequests` row exists (trap (a) again), and there is no
 *    safety net behind it (trap (c): `runtime-reapers.ts` is routine-only).
 */
describe("AU26 H1 — handoff's run-end write", () => {
	test("ends the run even when no agentSessionRequests row exists (trap a)", async ({
		db,
		eventBus,
		app,
	}) => {
		const handoffToTool = buildHandoffToTool(app);
		await seed(db);
		// The handoff path must not depend on a session-request row: the
		// `session_handoff_completed` subscriber that transitions the request
		// silently does nothing when there is none.
		expect(await db.select().from(agentSessionRequests)).toHaveLength(0);

		const result = await handoffToTool.handler(
			{ toAgent: "agent-b", ...baseMetadata },
			makeContext(db, eventBus),
		);
		expect(result.success).toBe(true);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(session?.state).toBe("done");
		expect(await db.select().from(agentSessionRequests)).toHaveLength(0);
	});

	// AU31 §3.1 site 7 — INVERTED. `endRunForHandoff` now runs BEFORE the
	// handoff's transaction opens (the "free lever" reorder — no safety net
	// exists behind that write, so relinquishing it in the default post-commit
	// order would strand the agent's session slot forever on a failure; see
	// `handoff-protocol.ts`'s `@lore` above `deps.runOrchestration
	// .endRunForHandoff`). So a rolled-back handoff now leaves an
	// ALREADY-ENDED run and an untouched task — the named residue, repaired by
	// the same `hold`/re-dispatch path site 6 already uses. This test's twin,
	// `handoff-protocol.integration.test.ts`'s "rolls back session, task,
	// auditTrail when messages INSERT throws", asserts the identical window.
	test("ends the run even when the handoff transaction rolls back (AU31 §3.1 site 7)", async ({
		db,
		eventBus,
		app,
	}) => {
		const handoffToTool = buildHandoffToTool(app);
		await seed(db);
		// `review -> blocked` is not a legal task transition, so the toHuman
		// branch throws INSIDE the transaction — AFTER the run-end write, which
		// now runs before the transaction opens at all.
		await db.update(tasks).set({ state: "review" }).where(eq(tasks.id, "task-1"));

		await expect(
			handoffToTool.handler(
				{ toHuman: true, ...baseMetadata, status: "blocked", reason: "need a human" },
				makeContext(db, eventBus),
			),
		).rejects.toThrow("Invalid transition for task task-1: review -> blocked");

		const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(session?.state).toBe("done");
		expect(session?.endedAt).toBeTruthy();
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("review");
	});
});
