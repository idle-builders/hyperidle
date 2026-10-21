/**
 * A person pauses a task: on hold, the agents finish what they are doing and then wait; stopped,
 * the running sessions stop at once. Either way every part not done says so, nothing is undone,
 * and lifting it picks the work up where it was.
 */

import {
	agentWorkIntents,
	type HyperIdleDb,
	messages,
	sessions,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import { eq, inArray } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEAM = "pause-team";
const AGENT = "pause-agent";
const ROOT = "pause-root";
/** Finished before the pause. */
const DONE = "pause-done";
/** An agent is working on it: its session is live. */
const WORKING = "pause-working";
/** Waits for READY to finish. */
const WAITING = "pause-waiting";
const READY = "pause-ready";
/** Its agent asked a question and waits for the answer. */
const ASKING = "pause-asking";

interface Envelope {
	readonly ok: boolean;
	readonly problems?: readonly { readonly code: string }[];
}

async function edit(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	body: Record<string, unknown>,
): Promise<Envelope> {
	const res = await app.request("/api/actions/edit_task", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return (await res.json()) as Envelope;
}

async function seedTree(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: TEAM, name: TEAM, createdAt: now });
	await db.insert(users).values([
		{
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{ id: AGENT, kind: "ai", name: "Builder", role: "builder", status: "active", createdAt: now },
		{
			id: "system:propagation",
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(userTeams).values({ userId: AGENT, teamId: TEAM });
	const parts: { id: string; parent: string | null; state: string; after?: string }[] = [
		{ id: ROOT, parent: null, state: "in_progress" },
		{ id: DONE, parent: ROOT, state: "done" },
		{ id: WORKING, parent: ROOT, state: "in_progress" },
		{ id: READY, parent: ROOT, state: "in_progress" },
		{ id: WAITING, parent: ROOT, state: "hold", after: READY },
		{ id: ASKING, parent: ROOT, state: "in_progress" },
	];
	await db.insert(threads).values(
		parts.map((p) => ({
			id: `thr-${p.id}`,
			hostKind: "team",
			hostId: TEAM,
			initiatorId: AGENT,
			participants: JSON.stringify([AGENT]),
			lastActiveAt: now,
			createdAt: now,
		})),
	);
	await db.insert(tasks).values(
		parts.map((p, i) => ({
			id: p.id,
			parentTaskId: p.parent,
			teamId: TEAM,
			ownerAgentId: AGENT,
			title: p.id,
			state: p.state,
			dependencies: p.after ? JSON.stringify([p.after]) : null,
			threadId: `thr-${p.id}`,
			position: i,
			createdAt: now,
			updatedAt: now,
		})),
	);
	await db.insert(sessions).values({
		id: "pause-session",
		taskId: WORKING,
		agentId: AGENT,
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});
	await db.insert(messages).values({
		id: "pause-question",
		threadId: `thr-${ASKING}`,
		senderId: AGENT,
		type: "questionnaire",
		payload: JSON.stringify({ title: "Which one?", question: "", options: ["A", "B"] }),
		clientKey: "pause-question",
		createdAt: now,
	});
}

async function pausedOf(db: HyperIdleDb): Promise<Record<string, string | null>> {
	const rows = await db.select().from(tasks).where(eq(tasks.teamId, TEAM));
	return Object.fromEntries(rows.map((r) => [r.id, r.paused]));
}

async function sessionState(db: HyperIdleDb): Promise<string | null> {
	const [row] = await db.select().from(sessions).where(eq(sessions.id, "pause-session"));
	return row?.state ?? null;
}

async function attemptsOn(db: HyperIdleDb, ids: readonly string[]) {
	return db.select().from(taskDispatchAttempts).where(inArray(taskDispatchAttempts.taskId, ids));
}

describe("stop and start again", () => {
	test("stopping a task stops its running sessions and marks every part not done, without moving any state", async ({
		db,
		app,
	}) => {
		await seedTree(db);
		const before = await db.select().from(tasks).where(eq(tasks.teamId, TEAM));

		expect((await edit(app, { id: ROOT, paused: "stopped" })).ok).toBe(true);

		expect(await pausedOf(db)).toEqual({
			[ROOT]: "stopped",
			[DONE]: null,
			[WORKING]: "stopped",
			[READY]: "stopped",
			[WAITING]: "stopped",
			[ASKING]: "stopped",
		});
		expect(await sessionState(db)).toBe("stopped");
		const after = await db.select().from(tasks).where(eq(tasks.teamId, TEAM));
		expect(Object.fromEntries(after.map((t) => [t.id, t.state]))).toEqual(
			Object.fromEntries(before.map((t) => [t.id, t.state])),
		);
	});

	test("nothing starts on a stopped task, even when what it waits for is done", async ({
		db,
		app,
	}) => {
		await seedTree(db);
		await edit(app, { id: ROOT, paused: "stopped" });
		expect((await edit(app, { id: READY, state: "done" })).ok).toBe(true);

		const refused = await edit(app, { id: WAITING, state: "accepted" });
		expect(refused.problems?.map((p) => p.code)).toEqual(["paused"]);
		expect(await attemptsOn(db, [WAITING])).toEqual([]);
	});

	test("starting again sends the agents back to the parts they were working on and frees what no longer waits", async ({
		db,
		app,
	}) => {
		await seedTree(db);
		await edit(app, { id: ROOT, paused: "stopped" });
		await edit(app, { id: READY, state: "done" });

		expect((await edit(app, { id: ROOT, paused: null })).ok).toBe(true);

		expect(Object.values(await pausedOf(db)).every((p) => p === null)).toBe(true);
		const [waiting] = await db.select().from(tasks).where(eq(tasks.id, WAITING));
		expect(waiting?.state).toBe("accepted");
		const attempts = await attemptsOn(db, [ROOT, WORKING, WAITING, ASKING]);
		expect(attempts.map((a) => [a.taskId, a.occasion]).sort()).toEqual([
			[WAITING, "retry"],
			[WORKING, "restart"],
		]);
		const restart = attempts.find((a) => a.taskId === WORKING);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, restart?.id ?? ""));
		expect(intents).toHaveLength(1);
	});

	test("a task stopped twice starts again twice", async ({ db, app }) => {
		await seedTree(db);
		for (const _ of [1, 2]) {
			await edit(app, { id: ROOT, paused: "stopped" });
			await edit(app, { id: ROOT, paused: null });
		}
		const restarts = (await attemptsOn(db, [WORKING])).filter((a) => a.occasion === "restart");
		expect(restarts).toHaveLength(2);
	});
});

describe("hold", () => {
	test("on hold, running sessions go on, new parts wait too, and taking it off hold starts nothing new", async ({
		db,
		app,
	}) => {
		await seedTree(db);
		expect((await edit(app, { id: ROOT, paused: "hold" })).ok).toBe(true);

		expect(await sessionState(db)).toBe("active");
		expect((await pausedOf(db))[WORKING]).toBe("hold");
		const res = await app.request("/api/actions/edit_task", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ parentTaskId: ROOT, title: "A new part", ownerAgentId: AGENT }),
		});
		const made = (await res.json()) as { data?: { task: { paused: string | null } } };
		expect(made.data?.task.paused).toBe("hold");

		expect((await edit(app, { id: ROOT, paused: null })).ok).toBe(true);
		expect((await pausedOf(db))[WORKING]).toBeNull();
		expect(await attemptsOn(db, [WORKING])).toEqual([]);
	});

	test("a finished task cannot be put on hold or stopped", async ({ db, app }) => {
		await seedTree(db);
		const refused = await edit(app, { id: DONE, paused: "hold" });
		expect(refused.problems?.map((p) => p.code)).toEqual(["paused_closed"]);
	});
});
