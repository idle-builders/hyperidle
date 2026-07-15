/**
 * AC1 RED — Session effectiveness score API integration tests.
 *
 * AC-3:  PATCH /api/sessions/:id with effectivenessScore records the score
 * AC-11: Effectiveness score range [0,1] enforced (1.5 → 400, 0 → 200)
 * W-1:   Reviewer finding: state must be optional; effectiveness-only PATCH
 *        must NOT fail because state is absent.
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-ac1-session-eff";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedSession(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "t1", name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "tm1",
		teamId: "t1",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		teamId: "tm1",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: "b1",
		teamId: "t1",
		description: "Test bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "t1",
		title: "Test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(sessions).values({
		id: "session-1",
		taskId: "task-1",
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: NOW,
		state: "active",
	});
}

describe("PATCH /api/sessions/:id — AC1 session effectiveness (AC-3, AC-11, W-1)", () => {
	// W-1 (CRITICAL): Reviewer finding — effectiveness-only PATCH must work without state
	test("W-1: records effectivenessScore without state field (state is optional)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			// No `state` field — this is the key reviewer finding W-1
			body: JSON.stringify({ effectivenessScore: 0.85 }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		// effectiveness_score stored as text per @lore S-1
		expect(body.effectivenessScore).toBeTruthy();
		const score = Number.parseFloat(body.effectivenessScore as string);
		expect(score).toBeCloseTo(0.85, 5);
		vi.unstubAllEnvs();
	});

	// AC-3: Happy path — records effectiveness score at 0.85
	test("AC-3: records effectivenessScore 0.85 via PATCH", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ effectivenessScore: 0.85 }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.effectivenessScore).toBeTruthy();
		expect(Number.parseFloat(body.effectivenessScore as string)).toBeCloseTo(0.85, 5);
		expect(body.effectivenessRecordedAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// AC-11: Boundary value 0.0 is valid (lower bound)
	test("AC-11: accepts effectivenessScore of 0 (lower boundary)", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ effectivenessScore: 0 }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(Number.parseFloat(body.effectivenessScore as string)).toBeCloseTo(0, 5);
		vi.unstubAllEnvs();
	});

	// AC-11: Boundary value 1.0 is valid (upper bound)
	test("AC-11: accepts effectivenessScore of 1.0 (upper boundary)", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ effectivenessScore: 1.0 }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(Number.parseFloat(body.effectivenessScore as string)).toBeCloseTo(1.0, 5);
		vi.unstubAllEnvs();
	});

	// AC-11: Score 1.5 is out of range (400)
	test("AC-11: rejects effectivenessScore 1.5 (out of range) with 400", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ effectivenessScore: 1.5 }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-11: Negative score is out of range (400)
	test("AC-11: rejects effectivenessScore -0.1 (negative) with 400", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ effectivenessScore: -0.1 }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// W-1: Combining state + effectivenessScore still works
	test("W-1: combining state and effectivenessScore works correctly", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedSession(db);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done", effectivenessScore: 0.9 }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.state).toBe("done");
		expect(Number.parseFloat(body.effectivenessScore as string)).toBeCloseTo(0.9, 5);
		vi.unstubAllEnvs();
	});

	// 404 for non-existent session
	test("returns 404 for non-existent session", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/sessions/nonexistent", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ effectivenessScore: 0.5 }),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// 401 without auth
	test("returns 401 without authentication", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/sessions/session-1", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ effectivenessScore: 0.5 }),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});
