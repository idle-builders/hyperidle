/**
 * AD5 — Dependency Auto-Unblock via task_state_changed event (AC-2)
 *
 * Tests that when a task transitions to "done" via POST /api/tasks/:id/transition,
 * the dependency watcher fires automatically and unblocks downstream tasks
 * whose last dependency has cleared.
 *
 * Red phase: the event listener that calls checkAndUnblockDependents when
 * task_state_changed toState === "done" is NOT yet wired in app.ts.
 * These tests will FAIL until the listener is registered in app.ts.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { TaskStateChangedEvent } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ad5-dep";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: "team-ad5-dep",
		name: "AD5 Dep Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: "tm-ad5-dep",
		teamId: "team-ad5-dep",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: "agent-ad5-dep",
		name: "AD5 Dep Agent",
		role: "builder",
		status: "active",
		teamId: "tm-ad5-dep",
		createdAt: now,
	});

	await db.insert(bets).values({
		id: "bet-ad5-dep",
		teamId: "team-ad5-dep",
		description: "AD5 dep bet",
		status: "active",
		createdAt: now,
	});
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	state: string,
	dependencies?: string[],
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id,
		betId: "bet-ad5-dep",
		teamId: "team-ad5-dep",
		title: `Task ${id}`,
		state: state as (typeof tasks.$inferInsert)["state"],
		ownerAgentId: "agent-ad5-dep",
		dependencies: dependencies ? JSON.stringify(dependencies) : null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("AD5 — AC-2: Dependency auto-unblock via task_state_changed event", () => {
	test("auto-transitions downstream task from hold to accepted when last dep completes via API", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBase(db);

		// Set up: task A in "review" state (can transition to "done") and task B (hold, depends on A)
		// Note: in_progress → review → done is the valid path per VALID_TRANSITIONS
		await insertTask(db, "task-a-dep", "review");
		await insertTask(db, "task-b-dep", "hold", ["task-a-dep"]);

		// Transition task A to done via the API (review → done is a valid transition)
		const res = await app.request("/api/tasks/task-a-dep/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});

		expect(res.status).toBe(200);

		// Wait briefly for async fire-and-forget handler to complete
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Assert task B is now accepted (unblocked by auto-unblock listener)
		const [taskB] = await db.select().from(tasks).where(eq(tasks.id, "task-b-dep"));
		expect(taskB?.state).toBe("accepted");

		vi.unstubAllEnvs();
	});

	test("emits task_state_changed event for the unblocked downstream task", async ({
		db,
		app,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBase(db);

		// task-c-dep in "review" state so it can validly transition to "done"
		await insertTask(db, "task-c-dep", "review");
		await insertTask(db, "task-d-dep", "hold", ["task-c-dep"]);

		const stateChangedEvents: TaskStateChangedEvent[] = [];
		eventBus.on("task_state_changed", (e: unknown) =>
			stateChangedEvents.push(e as TaskStateChangedEvent),
		);

		const res = await app.request("/api/tasks/task-c-dep/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});

		expect(res.status).toBe(200);

		// Wait for async handler
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// There should be at least two events: one for task-c (in_progress→done)
		// and one for task-d (hold→accepted) emitted by checkAndUnblockDependents
		const unblockEvent = stateChangedEvents.find(
			(e) => e.taskId === "task-d-dep" && e.toState === "accepted",
		);
		expect(unblockEvent).toBeDefined();
		expect(unblockEvent?.fromState).toBe("hold");

		vi.unstubAllEnvs();
	});

	test("does NOT unblock a downstream task with multiple deps when only one completes", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBase(db);

		// task-e-dep in "review" (can go to "done"); task-f-dep in "in_progress" (not done yet)
		await insertTask(db, "task-e-dep", "review");
		await insertTask(db, "task-f-dep", "in_progress");
		await insertTask(db, "task-g-dep", "hold", ["task-e-dep", "task-f-dep"]);

		// Complete task E only (review → done is valid)
		const res = await app.request("/api/tasks/task-e-dep/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(res.status).toBe(200);

		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Task G must remain in hold (task F not done yet)
		const [taskG] = await db.select().from(tasks).where(eq(tasks.id, "task-g-dep"));
		expect(taskG?.state).toBe("hold");

		vi.unstubAllEnvs();
	});

	test("unblocks downstream task when ALL deps complete via sequential transitions", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBase(db);

		// Both upstream tasks in "review" so they can validly transition to "done"
		await insertTask(db, "task-h-dep", "review");
		await insertTask(db, "task-i-dep", "review");
		await insertTask(db, "task-j-dep", "hold", ["task-h-dep", "task-i-dep"]);

		// Complete task H (review → done)
		await app.request("/api/tasks/task-h-dep/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Task J still hold (task-i-dep not done yet)
		const [taskJMid] = await db.select().from(tasks).where(eq(tasks.id, "task-j-dep"));
		expect(taskJMid?.state).toBe("hold");

		// Complete task I (review → done)
		await app.request("/api/tasks/task-i-dep/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Now task J should be accepted (all deps done, auto-unblock fired)
		const [taskJFinal] = await db.select().from(tasks).where(eq(tasks.id, "task-j-dep"));
		expect(taskJFinal?.state).toBe("accepted");

		vi.unstubAllEnvs();
	});
});
