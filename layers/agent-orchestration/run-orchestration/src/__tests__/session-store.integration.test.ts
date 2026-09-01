/**
 * `endSessionByCas` — the no-live-runtime terminal transition, at the owner.
 *
 * This used to sit in an HTTP route in the layer above: the compare-and-set
 * write, the `session_ended` emit gated on its rowcount, and the read-back.
 * Three properties hold it together, and none of them is local to any one line:
 *
 *   - the write may only move an `active` row, so a concurrent runtime teardown
 *     cannot be overwritten;
 *   - the emit fires only when the CAS actually moved a row, so a settled
 *     session cannot be re-ended;
 *   - the persisted `outcome` and the emitted `outcome` are NOT the same value.
 *
 * That last one is the trap. The row takes the caller's override when there is
 * one; the event always carries the value derived from `state`. They coincide
 * on every path but the override path, which is exactly the path no existing
 * test exercised — so "tidying" them into one variable would have shipped
 * green.
 *
 * @lore The accessor takes an `EventBus`, not just a db handle, and that is the
 * whole reason it is a transition rather than a setter. Splitting them — a
 * `setTerminal(db, …)` here and an emit at the caller — puts the rowcount and
 * the thing gated on the rowcount in two different packages, which is the
 * arrangement this replaced.
 */

import { type HyperIdleDb, sessions, tasks, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { endSessionByCas } from "../session-store.js";

const AGENT_ID = "agent-session-store";
const TEAM_ID = "team-session-store";
const ROOT_TASK_ID = "bet-session-store";
const TASK_ID = "task-session-store";

async function seedWorld(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Session agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(teams).values({ id: TEAM_ID, name: TEAM_ID, phase: "build", createdAt: now });
	await db.insert(tasks).values({
		id: ROOT_TASK_ID,
		parentTaskId: null,
		teamId: TEAM_ID,
		title: "Session-store bet",
		description: "Session-store bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(tasks).values({
		id: TASK_ID,
		parentTaskId: ROOT_TASK_ID,
		teamId: TEAM_ID,
		ownerAgentId: AGENT_ID,
		title: "Session-store task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

async function seedSession(
	db: HyperIdleDb,
	options: { readonly id: string; readonly state: string; readonly outcome?: string },
): Promise<void> {
	await db.insert(sessions).values({
		id: options.id,
		taskId: TASK_ID,
		agentId: AGENT_ID,
		modelTier: "standard",
		startedAt: new Date().toISOString(),
		state: options.state,
		outcome: options.outcome ?? null,
	});
}

function captureSessionEnded(eventBus: EventBus): SessionEndedEvent[] {
	const emitted: SessionEndedEvent[] = [];
	eventBus.on("session_ended", (event) => emitted.push(event));
	return emitted;
}

async function readSession(
	db: HyperIdleDb,
	id: string,
): Promise<typeof sessions.$inferSelect | undefined> {
	const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
	return row;
}

describe("endSessionByCas — the terminal transition lives with the table", () => {
	test("refuses a session that is no longer active, and emits nothing", async ({ db }) => {
		await seedWorld(db);
		await seedSession(db, { id: "s-settled", state: "done", outcome: "completed" });
		const before = await readSession(db, "s-settled");
		const eventBus = new EventBus();
		const emitted = captureSessionEnded(eventBus);

		await endSessionByCas(db, eventBus, {
			sessionId: "s-settled",
			agentId: AGENT_ID,
			taskId: TASK_ID,
			state: "crashed",
			now: new Date().toISOString(),
		});

		expect(await readSession(db, "s-settled")).toEqual(before);
		expect(emitted).toHaveLength(0);
	});

	test("emits session_ended exactly once for one real transition", async ({ db }) => {
		await seedWorld(db);
		await seedSession(db, { id: "s-active", state: "active" });
		const eventBus = new EventBus();
		const emitted = captureSessionEnded(eventBus);
		const now = new Date().toISOString();

		await endSessionByCas(db, eventBus, {
			sessionId: "s-active",
			agentId: AGENT_ID,
			taskId: TASK_ID,
			state: "done",
			now,
		});

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			type: "session_ended",
			streamId: "s-active",
			sessionId: "s-active",
			agentId: AGENT_ID,
			taskId: TASK_ID,
			outcome: "completed",
		});

		const afterFirst = await readSession(db, "s-active");
		expect(afterFirst?.state).toBe("done");
		expect(afterFirst?.endedAt).toBe(now);

		// A repeat of the same call finds a settled row: no write, no second emit.
		await endSessionByCas(db, eventBus, {
			sessionId: "s-active",
			agentId: AGENT_ID,
			taskId: TASK_ID,
			state: "crashed",
			now: new Date(Date.now() + 1000).toISOString(),
		});

		expect(emitted).toHaveLength(1);
		expect(await readSession(db, "s-active")).toEqual(afterFirst);
	});

	test("returns the row as it stands after the write", async ({ db }) => {
		await seedWorld(db);
		await seedSession(db, { id: "s-readback", state: "active" });
		const eventBus = new EventBus();
		const now = new Date().toISOString();

		const returned = await endSessionByCas(db, eventBus, {
			sessionId: "s-readback",
			agentId: AGENT_ID,
			taskId: TASK_ID,
			state: "crashed",
			notes: "ran out of budget",
			effectivenessScore: 0.25,
			actor: "user-1",
			now,
		});

		expect(returned).toEqual(await readSession(db, "s-readback"));
		expect(returned?.state).toBe("crashed");
		expect(returned?.outcome).toBe("crashed");
		expect(returned?.notes).toBe("ran out of budget");
		expect(returned?.effectivenessScore).toBe("0.25");
		expect(returned?.effectivenessRecordedAt).toBe(now);
		expect(returned?.effectivenessRecordedBy).toBe("user-1");
	});

	test("persists the caller's outcome override while the event carries the derived one", async ({
		db,
	}) => {
		await seedWorld(db);
		await seedSession(db, { id: "s-override", state: "active" });
		const eventBus = new EventBus();
		const emitted = captureSessionEnded(eventBus);

		const returned = await endSessionByCas(db, eventBus, {
			sessionId: "s-override",
			agentId: AGENT_ID,
			taskId: TASK_ID,
			state: "done",
			outcome: "stopped",
			now: new Date().toISOString(),
		});

		expect(returned?.outcome).toBe("stopped");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.outcome).toBe("completed");
	});
});
