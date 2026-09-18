/**
 * AU26 J1 — the four core-api agent-run reads that serve nothing are deleted.
 *
 * Each of these four route decorations read the `sessions` table (an
 * `agent-orchestration` table) to produce a response field that **no production
 * consumer reads**. The founder ruled the reads out; this file pins the deletion
 * as observable behaviour on the wire, so a re-growth fails a test rather than
 * only a code review.
 *
 *   1. `GET /api/status`     — `activeSessions` (the root route has zero consumers)
 *   2. `GET /api/users`      — per-user `activeSessions` (the only consumer is
 *                              typed `{id,name,role,teamId}`)
 *   3. `GET /api/threads/:id`— `identities[].operationalStatus` (zero production
 *                              readers; also an N+1, one query per AI participant)
 *   4. `GET /api/teams`      — `activeAgentCount` + `agentHealthWarning` (read
 *                              only by stories/tests)
 *
 * Every assertion below seeds a **live** run first, so a route that still held
 * the read would return a non-zero/true value and fail — the deletion cannot be
 * faked by an empty fixture.
 */

import { type HyperIdleDb, messages, sessions, tasks, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au26-j1";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * A team with one AI agent, one task, and a **crashed** run plus an **active**
 * run for that agent. The crash is what would set `agentHealthWarning` /
 * `operationalStatus: "error"`; the active run is what would set
 * `activeSessions` / `activeAgentCount`.
 */
async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "prod-1", name: "Test", phase: "build", createdAt: now });
	await db.insert(users).values([
		{
			id: "agent-1",
			name: "Builder Bot",
			kind: "ai",
			role: "builder",
			status: "idle",
			teamId: "prod-1",
			createdAt: now,
		},
		{
			id: "user-1",
			name: "Human",
			kind: "human",
			role: "founder",
			status: "active",
			teamId: "prod-1",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
	id: `thr-${"bet-1"}`,
	hostKind: "team",
	hostId: "prod-1",
	initiatorId: "system:propagation",
	participants: "[]",
	lastActiveAt: now,
	createdAt: now,
	});
	await db.insert(tasks).values({
	threadId: `thr-${"bet-1"}`,
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Test",
		description: "Test",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
	id: `thr-${"task-1"}`,
	hostKind: "team",
	hostId: "prod-1",
	initiatorId: "system:propagation",
	participants: "[]",
	lastActiveAt: now,
	createdAt: now,
	});
	await db.insert(tasks).values({
	threadId: `thr-${"task-1"}`,
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "prod-1",
		title: "Test Task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(sessions).values([
		{
			id: "sess-crashed",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: now,
			endedAt: now,
			state: "done",
			outcome: "crashed",
		},
		{
			id: "sess-active",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		},
	]);
}

async function seedThreadWithAgentSender(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id: "thr-1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "user-1",
		participants: JSON.stringify(["agent-1", "user-1"]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(messages).values({
		id: "msg-1",
		threadId: "thr-1",
		senderId: "agent-1",
		type: "plain",
		payload: JSON.stringify({ text: "hello" }),
		clientKey: "ck-1",
		createdAt: now,
	});
}

describe("core-api serves no agent-run decorations", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// GET /api/status deleted (zero consumers, AU43) — test removed.

	test("GET /api/users does not report per-user activeSessions", async ({ db, app }) => {
		await seed(db);
		const res = await app.request("/api/users", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		expect(body.length).toBeGreaterThan(0);
		for (const row of body) {
			expect(row).not.toHaveProperty("activeSessions");
		}
		// The identity fields the one real consumer is typed against survive.
		const agent = body.find((r) => r.id === "agent-1");
		expect(agent?.name).toBe("Builder Bot");
		expect(agent?.role).toBe("builder");
	});

	test("GET /api/threads/:id identities carry no operationalStatus", async ({ db, app }) => {
		await seed(db);
		await seedThreadWithAgentSender(db);
		const res = await app.request("/api/threads/thr-1", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			identities: Record<string, Record<string, unknown>>;
		};
		const agentIdentity = body.identities["agent-1"];
		expect(agentIdentity).toBeTruthy();
		expect(agentIdentity).not.toHaveProperty("operationalStatus");
		// What the renderers actually read survives.
		expect(agentIdentity?.name).toBe("Builder Bot");
		expect(agentIdentity?.isAgent).toBe(true);
	});

	test("GET /api/teams items carry no activeAgentCount or agentHealthWarning", async ({
		db,
		app,
	}) => {
		await seed(db);
		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
		expect(body.teams.length).toBeGreaterThan(0);
		for (const team of body.teams) {
			expect(team).not.toHaveProperty("activeAgentCount");
			expect(team).not.toHaveProperty("agentHealthWarning");
		}
		// `agentCount` is a `users` read, not a run read — it stays.
		expect(body.teams[0]?.agentCount).toBe(1);
	});
});
