/**
 * What happens when a task's last dependency finishes.
 *
 * An agent-owned task moves to `accepted` and gets a dispatch attempt — the
 * watcher (hold->accepted) and dispatch bookkeeping inside `edit_task` handle
 * that automatically. Promotion to `in_progress` happens in the runner layer
 * (via `session_started`) and is out of scope here.
 * An unowned task stops at `accepted` with no dispatch.
 *
 * Both tasks are created and edited through `POST /api/actions/edit_task`.
 */

import {
	type HyperIdleDb,
	taskDispatchAttempts,
	tasks,
	teams,
	users,
	userTeams,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-dependency-freed";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function editTaskRequest(
	app: Hono,
	body: Record<string, unknown>,
): Promise<{
	readonly status: number;
	readonly json: { readonly data?: { readonly task: { readonly id: string } } };
}> {
	const res = await app.request("/api/actions/edit_task", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(body),
	});
	return { status: res.status, json: await res.json() };
}

async function readTaskState(db: HyperIdleDb, taskId: string): Promise<string | undefined> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
	return row?.state;
}

async function hasDispatchAttempt(db: HyperIdleDb, taskId: string): Promise<boolean> {
	const rows = await db
		.select()
		.from(taskDispatchAttempts)
		.where(eq(taskDispatchAttempts.taskId, taskId));
	return rows.length > 0;
}

async function seedTeam(
	db: HyperIdleDb,
	teamId: string,
	asPerson?: (id: string) => Promise<void>,
): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: `Team ${teamId}`, createdAt: NOW });
	// `changes.actor` FKs to `users` — HTTP requests through the test app resolve
	// "u-founder" as the actor (via asPerson), and the dependency watcher's own
	// edit_task calls write as "system:propagation". Both need real rows.
	await db
		.insert(users)
		.values([
			{
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
			{
				id: "system:propagation",
				name: "Propagation System",
				role: "system",
				status: "active",
				createdAt: NOW,
			},
		])
		.onConflictDoNothing();
	await asPerson?.("u-founder");
}

async function seedRunnableAgent(db: HyperIdleDb, agentId: string, teamId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Runnable Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: agentId, teamId });
}

describe("last dependency finishes, agent owns it -> accepted + dispatched", () => {
	test("hold -> accepted (watcher) + dispatch attempt created, no human action", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedTeam(db, "dep-freed-owned", asPerson);
		await seedRunnableAgent(db, "dep-freed-agent", "dep-freed-owned");

		// The dependency: created via the same real door, no dependencies.
		const depRes = await editTaskRequest(app, { teamId: "dep-freed-owned", title: "Dependency" });
		expect(depRes.status).toBe(200);
		const dep = depRes.json.data?.task;

		// The dependent: created through the door under test, owned by a real agent.
		const dependentRes = await editTaskRequest(app, {
			teamId: "dep-freed-owned",
			title: "Dependent",
			ownerAgentId: "dep-freed-agent",
			dependencies: [dep?.id],
		});
		expect(dependentRes.status).toBe(200);
		const dependent = dependentRes.json.data?.task;
		expect(await readTaskState(db, dependent?.id ?? "")).toBe("hold");

		// Finish the dependency — legal proposed -> done edge.
		const finishRes = await editTaskRequest(app, { id: dep?.id, state: "done" });
		expect(finishRes.status).toBe(200);

		// The watcher unblocks hold -> accepted and creates a dispatch attempt.
		// Promotion to in_progress happens in the runner layer (session_started).
		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent?.id ?? "")).toBe("accepted");
		});
		expect(await hasDispatchAttempt(db, dependent?.id ?? "")).toBe(true);
	});
});

describe("last dependency finishes, nobody owns it -> waits at accepted", () => {
	test("hold -> accepted, and stays there with no dispatch", async ({ db, app, asPerson }) => {
		await seedTeam(db, "dep-freed-unowned", asPerson);
		await seedRunnableAgent(db, "dep-freed-sentinel-agent", "dep-freed-unowned");

		const depRes = await editTaskRequest(app, { teamId: "dep-freed-unowned", title: "Dependency" });
		const dep = depRes.json.data?.task;

		const dependentRes = await editTaskRequest(app, {
			teamId: "dep-freed-unowned",
			title: "Dependent, unowned",
			dependencies: [dep?.id],
		});
		expect(dependentRes.status).toBe(200);
		const dependent = dependentRes.json.data?.task;
		expect(await readTaskState(db, dependent?.id ?? "")).toBe("hold");

		// An owned sentinel, freed the same way, DOES dispatch — its real
		// `task_dispatch_attempts` row is the completion signal that the
		// watcher's fire-and-forget reaction has run its course, in place of
		// a fixed wait "hoping" the unowned task's chain settled by then too.
		const sentinelDepRes = await editTaskRequest(app, {
			teamId: "dep-freed-unowned",
			title: "Sentinel dependency",
		});
		const sentinelDep = sentinelDepRes.json.data?.task;
		const sentinelRes = await editTaskRequest(app, {
			teamId: "dep-freed-unowned",
			title: "Sentinel dependent, owned",
			ownerAgentId: "dep-freed-sentinel-agent",
			dependencies: [sentinelDep?.id],
		});
		const sentinel = sentinelRes.json.data?.task;

		await editTaskRequest(app, { id: dep?.id, state: "done" });
		await editTaskRequest(app, { id: sentinelDep?.id, state: "done" });

		await vi.waitFor(async () => {
			expect(await hasDispatchAttempt(db, sentinel?.id ?? "")).toBe(true);
		});

		expect(await readTaskState(db, dependent?.id ?? "")).toBe("accepted");
		expect(await hasDispatchAttempt(db, dependent?.id ?? "")).toBe(false);
	});
});
