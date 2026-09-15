/**
 * What happens when a task's last dependency finishes.
 *
 * AC3: an agent-owned task moves all the way into `in_progress` with no
 * human action — the existing chain (watcher hold->accepted, dispatch,
 * `session_started`, the promotion reaction) carries it the rest of the way.
 * AC4: an unowned task stops at `accepted` and waits for a human.
 *
 * re-pointed off the deleted `POST/PATCH /tasks` routes — both tasks
 * are created and edited through `POST /api/actions/edit_task` now.
 *
 * The "dispatch" and "session admission" steps are real production code
 * (`edit_task`'s own dispatch-attempt bookkeeping via the real
 * `agentOrchestration` seam) — only the actual session process is simulated
 * by emitting `session_started` directly, the exact same sanctioned pattern
 * `work-session-started-reactions.integration.test.ts` already uses for this
 * reaction (session admission itself is a different layer, out of scope).
 */

import { type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import type { SessionStartedEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { buildCoreActions } from "../actions/compose.js";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { registerWorkSessionStartedReactions } from "../services/work-session-started-reactions.js";

const TEST_API_KEY = "test-key-dependency-freed";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function editTaskRequest(
	app: Hono,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly json: { readonly data?: { readonly task: { readonly id: string } } } }> {
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

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db
		.insert(teams)
		.values({ id: teamId, name: `Team ${teamId}`, phase: "build", createdAt: NOW });
}

async function seedRunnableAgent(db: HyperIdleDb, agentId: string, teamId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Runnable Agent",
		role: "builder",
		teamId,
		status: "active",
		createdAt: NOW,
	});
}

describe("AC3: last dependency finishes, agent owns it -> in_progress with no human action", () => {
	test("hold -> accepted (watcher) -> in_progress (session_started reaction), unattended", async ({
		db,
		app,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "dep-freed-owned");
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

		const editTaskAction = buildCoreActions(agentOrchestration).find(
			(a) => a.declaration.name === "edit_task",
		);
		if (!editTaskAction) throw new Error("edit_task action not found");
		registerWorkSessionStartedReactions(
			db,
			eventBus,
			editTaskAction.run as Parameters<typeof registerWorkSessionStartedReactions>[2],
		);

		// Finish the dependency — legal proposed -> done edge.
		const finishRes = await editTaskRequest(app, { id: dep?.id, state: "done" });
		expect(finishRes.status).toBe(200);

		// The existing watcher unblocks hold -> accepted and dispatches.
		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent?.id ?? "")).toBe("accepted");
		});

		// Simulate the session that dispatch requested having actually started —
		// the real reaction promotes the task the rest of the way.
		const sessionStarted: SessionStartedEvent = {
			type: "session_started",
			streamId: "dep-freed-session",
			sessionId: "dep-freed-session",
			agentId: "dep-freed-agent",
			taskId: dependent?.id ?? "",
			timestamp: Date.now(),
		};
		eventBus.emit(sessionStarted);

		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent?.id ?? "")).toBe("in_progress");
		});
	});
});

describe("AC4: last dependency finishes, nobody owns it -> waits at accepted", () => {
	test("hold -> accepted, and stays there with no dispatch", async ({ db, app }) => {
		await seedTeam(db, "dep-freed-unowned");

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

		await editTaskRequest(app, { id: dep?.id, state: "done" });

		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent?.id ?? "")).toBe("accepted");
		});

		// Give any stray dispatch a beat, then confirm it never left accepted.
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(await readTaskState(db, dependent?.id ?? "")).toBe("accepted");
	});
});
