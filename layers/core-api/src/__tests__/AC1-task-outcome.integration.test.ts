/**
 * AC1 RED — Task outcome API integration tests.
 *
 * AC-2:  PATCH /api/tasks/:id records task outcome verdict
 * AC-10: Invalid verdict values rejected at API boundary (400)
 * AC-12: Outcome revision tracked in audit trail
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ac1-task-outcome";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedTask(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "t1", name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "tm1",
		teamId: "t1",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
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
		state: "done",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("PATCH /api/tasks/:id — AC1 task outcome (AC-2, AC-10, AC-12)", () => {
	// AC-2: Happy path — records task outcome verdict
	test("AC-2: records task outcome verdict 'met'", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedTask(db);
		const res = await app.request("/api/tasks/task-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ outcomeVerdict: "met" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBe("met");
		expect(body.outcomeRecordedAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// AC-2: Records all valid task outcome verdicts
	test("AC-2: all valid task verdict values are accepted", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedTask(db);
		for (const verdict of ["met", "met_with_rework", "partially_met", "not_met"] as const) {
			const res = await app.request("/api/tasks/task-1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ outcomeVerdict: verdict }),
			});
			expect(res.status, `Expected 200 for outcomeVerdict="${verdict}"`).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.outcomeVerdict).toBe(verdict);
		}
		vi.unstubAllEnvs();
	});

	// AC-10: Invalid verdict value rejected
	test("AC-10: rejects invalid task outcome verdict with 400", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedTask(db);
		const res = await app.request("/api/tasks/task-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ outcomeVerdict: "not_a_valid_verdict" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-10: 404 for non-existent task
	test("returns 404 for non-existent task", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/tasks/nonexistent", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ outcomeVerdict: "met" }),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// AC-12: Audit trail updated when outcome verdict is set
	test("AC-12: updates audit trail when outcomeVerdict is set", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedTask(db);
		const res = await app.request("/api/tasks/task-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ outcomeVerdict: "met_with_rework" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.auditTrail).toBeTruthy();
		const auditTrail = JSON.parse(body.auditTrail as string) as Array<Record<string, unknown>>;
		const outcomeEntry = auditTrail.find((e) => e.field === "outcomeVerdict");
		expect(outcomeEntry).toBeDefined();
		expect(outcomeEntry?.new_value).toBe("met_with_rework");
		vi.unstubAllEnvs();
	});

	// Existing task fields still patchable
	test("existing task fields still patchable alongside outcomeVerdict", async ({
		app,
		db
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedTask(db);
		const res = await app.request("/api/tasks/task-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ title: "Updated title", outcomeVerdict: "met" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.title).toBe("Updated title");
		expect(body.outcomeVerdict).toBe("met");
		vi.unstubAllEnvs();
	});

	// 401 without auth
	test("returns 401 without authentication", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/tasks/task-1", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ outcomeVerdict: "met" }),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});
