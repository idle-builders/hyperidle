/**
 * AU9 Remediation-2 — R2: this suite drives the real request state machine and
 * public `PATCH /sessions/:id` through the app fixture, plus the sanctioned
 * `startAgentLifecycleProjectionDrain`/`bootAgentLayer` entrypoints. It does
 * NOT import `transitionAgentRunLifecycle`, `recoverRequestedTerminations`, or
 * the `AGENT_LIFECYCLE_PROJECTORS` map directly — no existence/constant
 * assertion stands in for driving the real transition.
 */

import { bootAgentLayer } from "@hyperidle/agent-layer";
import { sessionRunRegistry, startAgentLifecycleProjectionDrain } from "@hyperidle/core-app";
import {
	agentLifecycleInbox,
	agentSessionRequests,
	bets,
	explicitSessionStarts,
	routineRuns,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-au9-lifecycle";
function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY));
afterEach(() => vi.unstubAllEnvs());

async function waitForProjection(
	db: import("@hyperidle/db").HyperIdleDb,
	requestIds: readonly string[],
): Promise<void> {
	const stop = startAgentLifecycleProjectionDrain(db, { pollIntervalMs: 10 });
	try {
		const deadline = Date.now() + 5_000;
		for (;;) {
			const rows = await db
				.select({
					requestId: agentLifecycleInbox.requestId,
					projectedAt: agentLifecycleInbox.projectedAt,
				})
				.from(agentLifecycleInbox);
			const pending = rows.filter(
				(row) => requestIds.includes(row.requestId) && row.projectedAt === null,
			);
			if (pending.length === 0) return;
			if (Date.now() > deadline) throw new Error(`Projection timed out for ${pending.length} rows`);
			await new Promise((resolve) => setTimeout(resolve, 15));
		}
	} finally {
		stop();
	}
}

async function seedTerminalRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	requestId: string,
	sourceKind: string,
	sourceId: string,
	sessionId?: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: `${requestId}-agent`,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id: requestId,
		sourceKind: "assistant",
		sourceId: `${requestId}-source`,
		streamId: `${requestId}-stream`,
		agentId: `${requestId}-agent`,
		promptMode: "conversation",
		sourceCorrelationJson: "{}",
		idempotencyKey: requestId,
		status: "completed",
		...(sessionId ? { sessionId } : {}),
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentLifecycleInbox).values({
		requestId,
		sourceKind,
		sourceId,
		state: "completed",
		...(sessionId ? { sessionId } : {}),
		occurredAt: now,
	});
}

describe("durable lifecycle projection", () => {
	test("lifecycle ledger has durable custody, retry, and terminal fact columns", async ({ db }) => {
		const result = await db.execute(sql`
			select column_name as "columnName" from information_schema.columns
			where table_schema = 'public' and table_name = 'agent_lifecycle_inbox'
		`);
		const columns = new Set(
			(result as { rows: Array<{ columnName: string }> }).rows.map((row) => row.columnName),
		);
		expect(columns).toEqual(
			new Set([
				"request_id",
				"source_kind",
				"source_id",
				"state",
				"session_id",
				"failure_code",
				"occurred_at",
				"projected_at",
				"claim_token",
				"claim_expires_at",
				"attempts",
				"last_error",
			]),
		);
	});

	test("the real drain projects a completed fact into every family's own domain state (or acknowledges the no-op families)", async ({
		db,
	}) => {
		const now = new Date().toISOString();

		// routine family — real projection
		await db
			.insert(teams)
			.values({ id: "au9-lc-team", name: "AU9", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "au9-lc-member",
			teamId: "au9-lc-team",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: "au9-lc-owner",
			kind: "ai",
			name: "Owner",
			role: "builder",
			status: "active",
			teamId: "au9-lc-member",
			createdAt: now,
		});
		await db.insert(routines).values({
			id: "au9-lc-routine",
			teamId: "au9-lc-team",
			ownerAgentId: "au9-lc-owner",
			name: "AU9 routine",
			triggerType: "manual",
			active: true,
			state: "active",
			createdAt: now,
		});
		await db.insert(routineRuns).values({
			id: "au9-lc-routine-run",
			routineId: "au9-lc-routine",
			outcome: "running",
			startedAt: now,
		});
		await seedTerminalRequest(db, "au9-lc-routine-request", "routine", "au9-lc-routine-run");

		// explicit_session_start family — real projection
		await db.insert(bets).values({
			id: "au9-lc-bet",
			teamId: "au9-lc-team",
			description: "AU9",
			appetite: "small",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "au9-lc-task",
			betId: "au9-lc-bet",
			teamId: "au9-lc-team",
			title: "AU9",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(users).values({
			id: "au9-lc-human",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		await seedTerminalRequest(
			db,
			"au9-lc-explicit-request",
			"explicit_session_start",
			"au9-lc-explicit-request",
			"au9-lc-explicit-session",
		);
		await db.insert(sessions).values({
			id: "au9-lc-explicit-session",
			taskId: "au9-lc-task",
			agentId: "au9-lc-owner",
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
		await db.insert(explicitSessionStarts).values({
			id: "au9-lc-start",
			taskId: "au9-lc-task",
			requestedAgentId: "au9-lc-owner",
			requestedModelTier: "workhorse",
			requestedBy: "au9-lc-human",
			idempotencyKey: "au9-lc-start",
			status: "admitted",
			requestId: "au9-lc-explicit-request",
			sessionId: "au9-lc-explicit-session",
			createdAt: now,
			updatedAt: now,
		});

		// no-op families — acknowledged but no domain write expected.
		await seedTerminalRequest(
			db,
			"au9-lc-assistant-request",
			"assistant",
			"au9-lc-assistant-source",
		);
		await seedTerminalRequest(
			db,
			"au9-lc-knowledge-request",
			"knowledge",
			"au9-lc-knowledge-source",
		);
		await seedTerminalRequest(
			db,
			"au9-lc-proposed-call-request",
			"proposed_call",
			"au9-lc-proposed-call-source",
		);

		await waitForProjection(db, [
			"au9-lc-routine-request",
			"au9-lc-explicit-request",
			"au9-lc-assistant-request",
			"au9-lc-knowledge-request",
			"au9-lc-proposed-call-request",
		]);

		const [routineRun] = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.id, "au9-lc-routine-run"));
		expect(routineRun).toMatchObject({ outcome: "success" });

		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, "au9-lc-start"));
		expect(start).toMatchObject({ status: "completed" });

		const inbox = await db
			.select({
				requestId: agentLifecycleInbox.requestId,
				projectedAt: agentLifecycleInbox.projectedAt,
			})
			.from(agentLifecycleInbox);
		for (const requestId of [
			"au9-lc-routine-request",
			"au9-lc-explicit-request",
			"au9-lc-assistant-request",
			"au9-lc-knowledge-request",
			"au9-lc-proposed-call-request",
		]) {
			expect(inbox.find((row) => row.requestId === requestId)?.projectedAt).toBeTruthy();
		}
	});
});

describe("PATCH /api/sessions/:id drives request-level custody through the public route", () => {
	async function seedActiveSession(
		db: import("@hyperidle/db").HyperIdleDb,
		id: string,
	): Promise<void> {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: `${id}-agent`,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(agentSessionRequests).values({
			id: `${id}-request`,
			sourceKind: "assistant",
			sourceId: `${id}-source`,
			streamId: `${id}-stream`,
			agentId: `${id}-agent`,
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: id,
			status: "running",
			sessionId: id,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(sessions).values({
			id,
			requestId: `${id}-request`,
			agentId: `${id}-agent`,
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
	}

	test("no live registry: PATCH state=done terminalizes the correlated request to cancelled with one inbox fact", async ({
		db,
		app,
	}) => {
		await seedActiveSession(db, "au9-patch-done");
		const response = await app.request("/api/sessions/au9-patch-done", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(response.status).toBe(200);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "au9-patch-done-request"));
		expect(request).toMatchObject({ status: "cancelled" });
		const inbox = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, "au9-patch-done-request"));
		expect(inbox).toHaveLength(1);
		expect(inbox[0]).toMatchObject({ state: "cancelled" });
	});

	test("no live registry: PATCH state=crashed terminalizes the correlated request to failed", async ({
		db,
		app,
	}) => {
		await seedActiveSession(db, "au9-patch-crashed");
		const response = await app.request("/api/sessions/au9-patch-crashed", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "crashed" }),
		});
		expect(response.status).toBe(200);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "au9-patch-crashed-request"));
		expect(request).toMatchObject({ status: "failed" });
	});

	test("already-terminal session rejects the PATCH with 409", async ({ db, app }) => {
		await seedActiveSession(db, "au9-patch-terminal");
		await db
			.update(sessions)
			.set({ state: "done", outcome: "completed", endedAt: new Date().toISOString() })
			.where(eq(sessions.id, "au9-patch-terminal"));
		const response = await app.request("/api/sessions/au9-patch-terminal", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(response.status).toBe(409);
	});

	test("a competing already-stored termination cause conflicts instead of silently overwriting", async ({
		db,
		app,
	}) => {
		await seedActiveSession(db, "au9-patch-competing");
		// Simulate a handoff (or another PATCH) that already stored a different cause.
		await db
			.update(agentSessionRequests)
			.set({ terminationReason: "handoff", terminationRequestedAt: new Date().toISOString() })
			.where(eq(agentSessionRequests.id, "au9-patch-competing-request"));
		const response = await app.request("/api/sessions/au9-patch-competing", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(response.status).toBe(409);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "au9-patch-competing-request"));
		// The competing cause is untouched — never silently overwritten.
		expect(request).toMatchObject({ terminationReason: "handoff", status: "running" });
	});

	test("a live registry entry stores the cause before the async abort and returns 202", async ({
		db,
		app,
	}) => {
		await seedActiveSession(db, "au9-patch-live");
		sessionRunRegistry.register("au9-patch-live", {
			signalAbort: vi.fn(),
			handle: {} as never,
			adapter: { stopSession: vi.fn(async () => {}) } as never,
		});
		try {
			const response = await app.request("/api/sessions/au9-patch-live", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(response.status).toBe(202);
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "au9-patch-live-request"));
			// Reason persisted BEFORE the (mocked) async abort settles; request is
			// still durably "running" — the runtime teardown resolves it, not here.
			expect(request).toMatchObject({ terminationReason: "user_done", status: "running" });
		} finally {
			sessionRunRegistry.deregister("au9-patch-live");
		}
	});
});

describe("crash-after-202 recovery resolves a durably-stored termination cause", () => {
	async function seedRunningWithReason(
		db: import("@hyperidle/db").HyperIdleDb,
		id: string,
		reason: "shutdown" | "cost_cap" | "handoff" | "user_crashed",
	): Promise<void> {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: `${id}-agent`,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(agentSessionRequests).values({
			id: `${id}-request`,
			sourceKind: "assistant",
			sourceId: `${id}-source`,
			streamId: `${id}-stream`,
			agentId: `${id}-agent`,
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: id,
			status: "running",
			sessionId: `${id}-session`,
			terminationReason: reason,
			terminationRequestedAt: now,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(sessions).values({
			id: `${id}-session`,
			requestId: `${id}-request`,
			agentId: `${id}-agent`,
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
	}

	test("shutdown recovers to failed/RUNTIME_LOST", async ({ db, eventBus }) => {
		await seedRunningWithReason(db, "au9-recover-shutdown", "shutdown");
		const dispose = await bootAgentLayer({ db, eventBus });
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "au9-recover-shutdown-request"));
			expect(request).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });
		} finally {
			dispose();
		}
	});

	test("cost_cap recovers to failed/BUDGET_EXHAUSTED", async ({ db, eventBus }) => {
		await seedRunningWithReason(db, "au9-recover-costcap", "cost_cap");
		const dispose = await bootAgentLayer({ db, eventBus });
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "au9-recover-costcap-request"));
			expect(request).toMatchObject({ status: "failed", errorCode: "BUDGET_EXHAUSTED" });
		} finally {
			dispose();
		}
	});

	test("handoff recovers to completed — never cancelled", async ({ db, eventBus }) => {
		await seedRunningWithReason(db, "au9-recover-handoff", "handoff");
		const dispose = await bootAgentLayer({ db, eventBus });
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "au9-recover-handoff-request"));
			expect(request).toMatchObject({ status: "completed" });
		} finally {
			dispose();
		}
	});

	test("user_crashed recovers to failed with no stable failure code", async ({ db, eventBus }) => {
		await seedRunningWithReason(db, "au9-recover-usercrash", "user_crashed");
		const dispose = await bootAgentLayer({ db, eventBus });
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "au9-recover-usercrash-request"));
			expect(request).toMatchObject({ status: "failed", errorCode: null });
		} finally {
			dispose();
		}
	});
});
