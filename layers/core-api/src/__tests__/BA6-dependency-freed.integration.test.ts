/**
 * BA6 RED — AC3/AC4: what happens when a task's last dependency finishes.
 *
 * AC3: an agent-owned task moves all the way into `in_progress` with no
 * human action — the existing chain (watcher hold->accepted, dispatch,
 * `session_started`, the promotion reaction) carries it the rest of the way.
 * AC4: an unowned task stops at `accepted` and waits for a human.
 *
 * Both tests create the dependent task through the real `POST /tasks` door
 * WITH a `dependencies` value, so they are red today for the same reason as
 * `BA6-task-dependencies.integration.test.ts`'s create-door test: the door
 * does not exist yet (`.strict()` rejects the key with 400) — before any
 * chain behavior is even reached.
 *
 * The "dispatch" and "session admission" steps are real production code
 * (`transitionTask`'s own dispatch-attempt bookkeeping via the real
 * `agentOrchestration` seam) — only the actual session process is simulated
 * by emitting `session_started` directly, the exact same sanctioned pattern
 * `work-session-started-reactions.integration.test.ts` already uses for this
 * reaction (session admission itself is a different layer, out of scope).
 */

import { type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import type { SessionStartedEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { registerWorkSessionStartedReactions } from "../services/work-session-started-reactions.js";

const TEST_API_KEY = "test-key-ba6-freed";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
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

describe("BA6 AC3: last dependency finishes, agent owns it -> in_progress with no human action", () => {
	test("hold -> accepted (watcher) -> in_progress (session_started reaction), unattended", async ({
		db,
		app,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "ba6-freed-owned");
		await seedRunnableAgent(db, "ba6-freed-agent", "ba6-freed-owned");

		// The dependency: created via the same real door, no dependencies.
		const depRes = await app.request("/api/tasks", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ teamId: "ba6-freed-owned", title: "Dependency" }),
		});
		expect(depRes.status).toBe(201);
		const dep = (await depRes.json()) as { id: string };

		// The dependent: created through the door under test, owned by a real agent.
		const dependentRes = await app.request("/api/tasks", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "ba6-freed-owned",
				title: "Dependent",
				ownerAgentId: "ba6-freed-agent",
				dependencies: JSON.stringify([dep.id]),
			}),
		});
		expect(dependentRes.status).toBe(201);
		const dependent = (await dependentRes.json()) as { id: string };
		expect(await readTaskState(db, dependent.id)).toBe("hold");

		registerWorkSessionStartedReactions(db, eventBus, agentOrchestration);

		// Finish the dependency — legal proposed -> done edge (BB1).
		const finishRes = await app.request(`/api/tasks/${dep.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(finishRes.status).toBe(200);

		// The existing watcher unblocks hold -> accepted and dispatches.
		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent.id)).toBe("accepted");
		});

		// Simulate the session that dispatch requested having actually started —
		// the real reaction promotes the task the rest of the way.
		const sessionStarted: SessionStartedEvent = {
			type: "session_started",
			streamId: "ba6-freed-session",
			sessionId: "ba6-freed-session",
			agentId: "ba6-freed-agent",
			taskId: dependent.id,
			timestamp: Date.now(),
		};
		eventBus.emit(sessionStarted);

		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent.id)).toBe("in_progress");
		});
	});
});

describe("BA6 AC4: last dependency finishes, nobody owns it -> waits at accepted", () => {
	test("hold -> accepted, and stays there with no dispatch", async ({ db, app }) => {
		await seedTeam(db, "ba6-freed-unowned");

		const depRes = await app.request("/api/tasks", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ teamId: "ba6-freed-unowned", title: "Dependency" }),
		});
		const dep = (await depRes.json()) as { id: string };

		const dependentRes = await app.request("/api/tasks", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "ba6-freed-unowned",
				title: "Dependent, unowned",
				dependencies: JSON.stringify([dep.id]),
			}),
		});
		expect(dependentRes.status).toBe(201);
		const dependent = (await dependentRes.json()) as { id: string };
		expect(await readTaskState(db, dependent.id)).toBe("hold");

		await app.request(`/api/tasks/${dep.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});

		await vi.waitFor(async () => {
			expect(await readTaskState(db, dependent.id)).toBe("accepted");
		});

		// Give any stray dispatch a beat, then confirm it never left accepted.
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(await readTaskState(db, dependent.id)).toBe("accepted");
	});
});
