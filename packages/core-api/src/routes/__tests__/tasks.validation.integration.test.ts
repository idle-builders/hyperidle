/**
 * I2 — V1: `transitionTaskSchema.state` must be a Zod enum, not a free-form
 * string. An invalid state ("banana") must surface as a 400 from Zod, not
 * a 409 from the state-machine.
 *
 * Red phase: today's schema is `z.string()`, so bad states fall through to
 * `transitionTask(...)` and return 409 (InvalidTransitionError) — not 400.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-tasks-validation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedTask(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: "bet1",
		teamId: "p1",
		description: "x",
		appetite: "small",
		status: "active",
		createdAt: now,
	});

	await db
		.insert(users)
		.values({ id: "a1", name: "A", role: "builder", status: "active", createdAt: now });

	await db.insert(tasks).values({
		id: "task1",
		betId: "bet1",
		teamId: "p1",
		title: "Task",
		state: "proposed",
		createdAt: now,
		updatedAt: now,
	});
}

describe("I2 V1 — POST /api/tasks/:id/transition Zod enum", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 400 (Zod) when state is not a valid TaskState", async ({ db, app }) => {
		await seedTask(db);
		const res = await app.request("/api/tasks/task1/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "banana" }),
		});

		// Today this returns 409 (InvalidTransitionError from the state
		// machine). I2 makes the schema enum-typed so it surfaces as a
		// pre-machine 400.
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	test("accepts every legal TaskState value (smoke)", async ({ db, app }) => {
		await seedTask(db);
		// proposed -> accepted is a legal first transition; if the enum is
		// too narrow this fails on the schema check.
		const res = await app.request("/api/tasks/task1/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "accepted" }),
		});
		expect(res.status).not.toBe(400);
	});
});
