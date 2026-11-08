/**
 * A person pauses a task: on hold, the agents finish what they are doing and then wait; stopped,
 * the running sessions stop at once. Either way every part not done says so, nothing is undone,
 * and lifting it picks the work up where it was.
 */

import {
	type HyperIdleDb,
	messages,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import { listInboxRows } from "@hyperidle/user";
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

async function seedTree(db: HyperIdleDb, asPerson?: (id: string) => Promise<void>): Promise<void> {
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
	await asPerson?.("u-founder");
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

async function attemptsOn(db: HyperIdleDb, ids: readonly string[]) {
	return db.select().from(taskDispatchAttempts).where(inArray(taskDispatchAttempts.taskId, ids));
}

describe("stop and start again", () => {
	test("nothing starts on a stopped task, even when what it waits for is done", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedTree(db, asPerson);
		await edit(app, { id: ROOT, paused: "stopped" });
		expect((await edit(app, { id: READY, state: "done" })).ok).toBe(true);

		const refused = await edit(app, { id: WAITING, state: "accepted" });
		expect(refused.problems?.map((p) => p.code)).toEqual(["paused"]);
		expect(await attemptsOn(db, [WAITING])).toEqual([]);
	});

	test("starting again sends the agents back to the parts they were working on and frees what no longer waits", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedTree(db, asPerson);
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
		const inboxRows = await listInboxRows(db, { userId: AGENT });
		// WORKING restart + WAITING retry each create a task_run inbox row.
		expect(inboxRows.filter((r) => r.reason === "task_run")).toHaveLength(2);
	});
});

describe("hold", () => {
	test("a finished task cannot be put on hold or stopped", async ({ db, app, asPerson }) => {
		await seedTree(db, asPerson);
		const refused = await edit(app, { id: DONE, paused: "hold" });
		expect(refused.problems?.map((p) => p.code)).toEqual(["paused_closed"]);
	});
});
