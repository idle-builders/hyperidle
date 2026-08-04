/**
 * Q1 — AC2: GET /api/recipients — recipient picker aggregation endpoint.
 *
 * Architecture plan §3.3: aggregates users + agents into a single list
 * for the recipient picker. Supports ?q=<search> and ?kind=agent|user filters.
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-recipients";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

async function seedRecipients(db: HyperIdleDb): Promise<void> {
	const NOW = new Date().toISOString();

	// Seed required FK chain for sessions
	await db
		.insert(teams)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: NOW });

	await db
		.insert(teamMembers)
		.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 0, formedAt: NOW });

	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "prod-1",
		title: "Task 1",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// Seed users (P2: agents → users table; kind:"ai" for AI agents)
	await db.insert(users).values({
		id: "agent-builder",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		kind: "ai",
		teamId: "team-1",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-growth",
		name: "Growth Engine",
		role: "growth",
		status: "idle",
		kind: "ai",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-founder",
		name: "Founder Self",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-retired",
		name: "Retired Bot",
		role: "builder",
		status: "retired",
		kind: "ai",
		createdAt: NOW,
	});

	// Give agent-builder an active session
	await db.insert(sessions).values({
		id: "sess-active",
		agentId: "agent-builder",
		taskId: "task-1",
		modelTier: "workhorse",
		state: "active",
		startedAt: NOW,
	});
}

describe("GET /api/recipients (Q1 §3.3)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC2: endpoint returns all agents
	test("returns all agents as recipients", async ({ db, app }) => {
		await seedRecipients(db);
		const res = await app.request("/api/recipients", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { recipients: Array<{ id: string }> };
		expect(Array.isArray(body.recipients)).toBe(true);
		expect(body.recipients.length).toBeGreaterThanOrEqual(4);
	});

	// AC2: each recipient has the required fields
	//
	// @lore AU26 J4: `hasActiveSession` is GONE — it was core-api reading
	// `agent-orchestration`'s `sessions` table so the picker could show a live
	// busy dot. `useRecipients` fetches
	// `GET /api/agent-orchestration/runs/active-counts` and stamps the flag
	// itself. The seed below gives `agent-builder` a live run, so a route that
	// still held the read would fail this assertion.
	test("returns recipients with id, kind, name, role, status, avatarUrl", async ({ db, app }) => {
		await seedRecipients(db);
		const res = await app.request("/api/recipients", { headers: authHeaders() });
		const body = (await res.json()) as {
			recipients: Array<Record<string, unknown>>;
		};

		const builder = body.recipients.find((r) => r.id === "agent-builder");
		expect(builder).toBeDefined();
		expect(builder?.kind).toBe("agent");
		expect(builder?.name).toBe("Builder Bot");
		expect(builder?.role).toBe("builder");
		expect(builder?.status).toBe("active");
		expect(builder?.avatarUrl).toBeNull();
		expect(builder).not.toHaveProperty("hasActiveSession");
	});

	// AC2: ?q=<search> filters by name (case-insensitive)
	test("?q=builder filters by name (case-insensitive)", async ({ db, app }) => {
		await seedRecipients(db);
		const res = await app.request("/api/recipients?q=builder", { headers: authHeaders() });
		const body = (await res.json()) as { recipients: Array<{ id: string; name: string }> };
		expect(body.recipients.every((r) => r.name.toLowerCase().includes("builder"))).toBe(true);
		expect(body.recipients.find((r) => r.id === "agent-growth")).toBeUndefined();
	});

	// AC2: ?q= empty string returns all
	test("?q= (empty) returns all recipients", async ({ db, app }) => {
		await seedRecipients(db);
		const res = await app.request("/api/recipients?q=", { headers: authHeaders() });
		const body = (await res.json()) as { recipients: Array<{ id: string }> };
		expect(body.recipients.length).toBeGreaterThanOrEqual(4);
	});

	// AC2: ?kind=agent returns only agents
	test("?kind=agent returns only agents", async ({ db, app }) => {
		await seedRecipients(db);
		const res = await app.request("/api/recipients?kind=agent", { headers: authHeaders() });
		const body = (await res.json()) as { recipients: Array<{ kind: string }> };
		expect(body.recipients.every((r) => r.kind === "agent")).toBe(true);
	});

	// Auth: requires API key
	test("returns 401 without API key", async ({ app }) => {
		const res = await app.request("/api/recipients");
		expect(res.status).toBe(401);
	});

	// No match: search with no results returns empty array
	test("returns empty array when ?q= matches nothing", async ({ db, app }) => {
		await seedRecipients(db);
		const res = await app.request("/api/recipients?q=zzz-no-match-xxx", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as { recipients: Array<unknown> };
		expect(body.recipients).toEqual([]);
	});
});
