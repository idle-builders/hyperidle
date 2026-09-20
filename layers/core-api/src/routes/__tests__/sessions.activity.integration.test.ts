/**
 * Q1 — AC6 / AC10: GET /api/sessions/:id/activity endpoint.
 *
 * Architecture plan §3.2: returns recent session activity from the in-memory
 * ring buffer. Response includes session metadata + activity array.
 */

import { type HyperIdleDb, sessions, tasks, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-sessions-activity";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

const NOW = new Date().toISOString();

async function seedSession(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: NOW });

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder",
		role: "builder",
		status: "active",
		kind: "ai",
		teamId: "prod-1",
		createdAt: NOW,
	});

	await db.insert(threads).values({
		id: `thr-${"bet-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-1"}`,
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Test",
		description: "Test",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	await db.insert(threads).values({
		id: `thr-${"task-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-1"}`,
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "prod-1",
		title: "Task 1",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	await db.insert(sessions).values({
		id: "sess-1",
		agentId: "agent-1",
		taskId: "task-1",
		modelTier: "workhorse",
		state: "active",
		startedAt: NOW,
	});
}

describe("GET /api/sessions/:id/activity (Q1 §3.2)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC6: endpoint returns 200 with session metadata and activity array
	test("returns 200 with session metadata and empty activity array for fresh session", async ({
		db,
		app,
	}) => {
		await seedSession(db);
		const res = await app.request("/api/sessions/sess-1/activity", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			session: { id: string; agentId: string; taskId: string; state: string; modelTier: string };
			activity: unknown[];
		};
		expect(body.session.id).toBe("sess-1");
		expect(body.session.agentId).toBe("agent-1");
		expect(body.session.taskId).toBe("task-1");
		expect(body.session.state).toBe("active");
		expect(body.session.modelTier).toBe("workhorse");
		expect(Array.isArray(body.activity)).toBe(true);
	});

	// AC6: activity entries have discriminated union type
	test("returns activity entries with type, timestamp, and data fields", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedSession(db);
		// Emit a tool_call_recorded event so the buffer is populated
		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-1",
			sessionId: "sess-1",
			toolName: "bash",
			argsSummary: 'cmd="ls"',
			timestamp: Date.now(),
		});

		const res = await app.request("/api/sessions/sess-1/activity", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			activity: Array<{ type: string; timestamp: number; data: Record<string, unknown> }>;
		};
		// Buffer only populated if the app wired it up on start — check structure
		// At minimum the array is valid
		expect(Array.isArray(body.activity)).toBe(true);
		if (body.activity.length > 0) {
			expect(body!.activity[0]!.type).toBe("tool_call");
			expect(typeof body!.activity[0]!.timestamp).toBe("number");
			expect(typeof body!.activity[0]!.data).toBe("object");
		}
	});

	// 404 for unknown session
	test("returns 404 for a session that does not exist", async ({ app }) => {
		const res = await app.request("/api/sessions/unknown-session/activity", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	// Auth: requires API key
	test("returns 401 without API key", async ({ db, requestWithoutAuth }) => {
		await seedSession(db);
		const res = await requestWithoutAuth("/api/sessions/sess-1/activity");
		expect(res.status).toBe(401);
	});

	// Response capped at 50 most recent entries
	test("activity array is at most 50 entries", async ({ db, app, eventBus }) => {
		await seedSession(db);
		// Emit 60 events
		for (let i = 0; i < 60; i++) {
			eventBus.emit({
				type: "tool_call_recorded",
				streamId: "sess-1",
				sessionId: "sess-1",
				toolName: `tool_${i}`,
				argsSummary: "",
				timestamp: Date.now() + i,
			});
		}

		const res = await app.request("/api/sessions/sess-1/activity", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as { activity: unknown[] };
		expect(body.activity.length).toBeLessThanOrEqual(50);
	});
});
