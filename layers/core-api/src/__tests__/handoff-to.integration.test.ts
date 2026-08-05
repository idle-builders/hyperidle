import * as os from "node:os";
import * as path from "node:path";
import { findThread, insertThread, updateThread } from "@hyperidle/conversation";
import {
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	items,
	sessions,
	taskPlanningSignals,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { resolveReviewRecipients } from "@hyperidle/org";
import { type ReviewPorts, registerReviewSubscriptions } from "@hyperidle/review";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import type { EventBus, SessionEndedEvent, ToolContext } from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { findUser, listUsers, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { getTaskRiskTierByTaskId } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";

/**
 * @lore AU21 §9 Increment 2: this file's tool handler(s) now reach
 * `ports.coreApi.*` (the seam) — this file-scoped `auto:true` fixture
 * registers a real in-process `CoreApiPort` transport off THIS test's own
 * `app` for every test in this file, without forcing `app`'s full
 * subscriber wiring onto every OTHER test file that imports the bare
 * `test` from `test-fixtures.ts` (that fixture's `app` stays lazy — a
 * global auto-fixture there double-fired `app.ts`'s task-`done`
 * dep-watcher against tests that manually drive the same transition,
 * an AU21 Increment 2 GREEN-phase finding).
 */
const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

const handoffToTool = buildToolDefinitions(toolHandlersPorts).find((t) => t.name === "handoff_to")!;

async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });
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

/**
 * AU26 H1 (§D-M.1) — the production `review` wiring, so "a handoff creates no
 * review item" is proven against the REAL subscriber rather than against an
 * unwired bus. Mirrors `session-review-creator.integration.test.ts`.
 */
const reviewDeps: ReviewPorts = {
	work: {
		getTaskById: (exec, id) => work.get(exec, "task", id),
		updateTaskById: (exec, id, patch) => work.update(exec, "task", id, patch),
		createItem: (exec, values) => work.create(exec, "item", values),
		getRiskTierByTaskId: getTaskRiskTierByTaskId,
	},
	conversation: { insertThread, getThreadById: (db, id) => findThread(db, { id }), updateThread },
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		listUsersByKind: (db, kind) => listUsers(db, { kind }),
	},
	org: { resolveReviewRecipients },
	intentRecorder: { record: enqueueWorkIntent },
	requireRunnableAgent,
};

const baseMetadata = {
	contextId: "ctx-1",
	status: "in_progress" as const,
	reason: "needs builder",
	artifacts: [],
	remainingWork: [],
};

describe("handoff_to tool", () => {
	describe("AC5: handoff to agent B changes task owner and ends session", () => {
		test("transfers ownership to B and ends A's session", async ({ db, eventBus }) => {
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
		test("resolves toRole to an available teammate", async ({ db, eventBus }) => {
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
		test("creates a review item and transitions task to blocked", async ({ db, eventBus }) => {
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
		test("returns INVALID_INPUT when no target is specified", async ({ db, eventBus }) => {
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

		test("returns INVALID_INPUT when reason is missing", async ({ db, eventBus }) => {
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

		test("returns NOT_FOUND when target agent does not exist", async ({ db, eventBus }) => {
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
	test("emits no session_ended and creates no review item, even for a high-risk task", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		// High risk: without this the review creator returns early and the
		// "no review item" assertion below would be vacuous.
		await db
			.insert(taskPlanningSignals)
			.values({ id: "tps-task-1", taskId: "task-1", riskTier: "high" });
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);
		const sessionEnded: SessionEndedEvent[] = [];
		const offSessionEnded = eventBus.on("session_ended", (e) => sessionEnded.push(e));

		try {
			const result = await handoffToTool.handler(
				{ toAgent: "agent-b", ...baseMetadata },
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);

			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
			expect(session?.state).toBe("done");
			expect(session?.endedAt).toBeTruthy();
			// A handoff records no session-end outcome.
			expect(session?.outcome).toBeNull();

			expect(sessionEnded).toHaveLength(0);

			// Give the async review handler the same window it gets in
			// `session-review-creator.integration.test.ts` before concluding
			// nothing was created.
			await new Promise((r) => setTimeout(r, 50));
			const afterHandoff = await db.select().from(items);
			expect(afterHandoff.filter((i) => i.kind === "review")).toHaveLength(0);

			// Positive control — the guard above has teeth only if this SAME
			// wiring does create a review item when `session_ended` really fires.
			eventBus.emit({
				type: "session_ended",
				streamId: "session-1",
				sessionId: "session-1",
				agentId: "agent-a",
				taskId: "task-1",
				outcome: "completed",
				timestamp: Date.now(),
			} satisfies SessionEndedEvent);
			await vi.waitFor(async () => {
				const rows = await db.select().from(items);
				expect(rows.filter((i) => i.kind === "review")).toHaveLength(1);
			});
		} finally {
			offSessionEnded();
			unsubscribe();
		}
	});

	test("ends the run even when no agentSessionRequests row exists (trap a)", async ({
		db,
		eventBus,
	}) => {
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

	test("leaves the run untouched when the handoff transaction rolls back", async ({
		db,
		eventBus,
	}) => {
		await seed(db);
		// `review -> blocked` is not a legal task transition, so the toHuman
		// branch throws INSIDE the transaction, AFTER the run-end write. If the
		// write were not in the caller's transaction the run would already be
		// `done` here.
		await db.update(tasks).set({ state: "review" }).where(eq(tasks.id, "task-1"));

		await expect(
			handoffToTool.handler(
				{ toHuman: true, ...baseMetadata, status: "blocked", reason: "need a human" },
				makeContext(db, eventBus),
			),
		).rejects.toThrow("Invalid transition for task task-1: review -> blocked");

		const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
		expect(session?.state).toBe("active");
		expect(session?.endedAt).toBeNull();
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("review");
	});
});
