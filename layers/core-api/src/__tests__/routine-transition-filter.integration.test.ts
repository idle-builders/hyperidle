/**
 * BA9d D11 — routine transition constraint: API round-trip tests.
 *
 * A routine may declare `eventTransitionTo` alongside its event type; the
 * API stores it in `trigger_config` and returns it via GET. POST and PATCH
 * both accept and persist the constraint. A routine without the constraint
 * returns `eventTransitionTo: null`.
 */
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-transition-filter";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "team-tf-1",
		name: "Transition Filter Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: "agent-tf-1",
		name: "Filter Bot",
		role: "builder",
		status: "idle",
		teamId: "team-tf-1",
		createdAt: new Date().toISOString(),
	});
}

describe("BA9d D11 — routine transition constraint API", () => {
	beforeEach(() => {
		process.env.HYPERIDLE_API_KEY = TEST_API_KEY;
	});

	afterEach(() => {
		delete process.env.HYPERIDLE_API_KEY;
	});

	test("POST /api/routines stores eventTransitionTo in trigger_config and GET returns it", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Task done notifier",
				ownerAgentId: "agent-tf-1",
				triggerType: "event",
				eventType: "task_state_changed",
				eventTransitionTo: "done",
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };

		const getRes = await app.request(`/api/routines/${id}`, {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { routine: { eventTransitionTo: string | null } };
		// The constraint must round-trip exactly.
		expect(body.routine.eventTransitionTo).toBe("done");
	});

	test("POST /api/routines without eventTransitionTo returns eventTransitionTo: null", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "All task changes",
				ownerAgentId: "agent-tf-1",
				triggerType: "event",
				eventType: "task_state_changed",
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };

		const getRes = await app.request(`/api/routines/${id}`, {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { routine: { eventTransitionTo: string | null } };
		expect(body.routine.eventTransitionTo).toBeNull();
	});

	test("PATCH /api/routines/:id sets eventTransitionTo", async ({ db, app }) => {
		await seedBase(db);

		// Create without constraint first.
		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Task event routine",
				ownerAgentId: "agent-tf-1",
				triggerType: "event",
				eventType: "task_state_changed",
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };

		// Patch to add the constraint.
		const patchRes = await app.request(`/api/routines/${id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ eventTransitionTo: "in_progress" }),
		});
		expect(patchRes.status).toBe(200);

		const getRes = await app.request(`/api/routines/${id}`, {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { routine: { eventTransitionTo: string | null } };
		expect(body.routine.eventTransitionTo).toBe("in_progress");
	});

	test("PATCH /api/routines/:id clears eventTransitionTo with null", async ({ db, app }) => {
		await seedBase(db);

		// Create with a constraint.
		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Task done notifier",
				ownerAgentId: "agent-tf-1",
				triggerType: "event",
				eventType: "task_state_changed",
				eventTransitionTo: "done",
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };

		// Clear the constraint.
		const patchRes = await app.request(`/api/routines/${id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ eventTransitionTo: null }),
		});
		expect(patchRes.status).toBe(200);

		const getRes = await app.request(`/api/routines/${id}`, {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { routine: { eventTransitionTo: string | null } };
		// Constraint cleared — fires on every occurrence now.
		expect(body.routine.eventTransitionTo).toBeNull();
	});

	test("calendar routine always returns eventTransitionTo: null", async ({ db, app }) => {
		await seedBase(db);

		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Daily digest",
				ownerAgentId: "agent-tf-1",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };

		const getRes = await app.request(`/api/routines/${id}`, {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as { routine: { eventTransitionTo: string | null } };
		// Calendar routines have no transition concept — always null.
		expect(body.routine.eventTransitionTo).toBeNull();
	});
});
