/**
 * The task action list — search_tasks / open_task / edit_task — proven end
 * to end against the real `{ db, app, eventBus }` fixture. See the
 * architecture doc §11.
 */

import {
	agentSessionRequests,
	agentWorkIntents,
	changes,
	type HyperIdleDb,
	sessions,
	taskDispatchAttempts,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { buildCoreActions } from "../actions/compose.js";
import { test } from "../__testing__/test-fixtures.js";
import { registerWorkSessionStartedReactions } from "../services/work-session-started-reactions.js";

/**
 * B7 fix: `edit_task`'s own bound `run`, for registering the started
 * reaction inline — the only way this seam test can drive a real
 * `session_started` event through `markRunning` instead of hand-seeding
 * `taskDispatchAttempts.sessionId`.
 */
function editTaskFrom(
	agentOrchestration: Parameters<typeof buildCoreActions>[0],
): Parameters<typeof registerWorkSessionStartedReactions>[2] {
	const editTaskAction = buildCoreActions(agentOrchestration).find(
		(a) => a.declaration.name === "edit_task",
	);
	if (!editTaskAction) throw new Error("edit_task action not found");
	return editTaskAction.run as Parameters<typeof registerWorkSessionStartedReactions>[2];
}

const TEST_API_KEY = "test-key-task-actions";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/** The agent actor-override header the seam already uses (§12). */
function agentHeaders(agentId: string): Record<string, string> {
	return authHeaders({ "x-hyperidle-actor-id": agentId });
}

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

interface TaskRow {
	readonly id: string;
	readonly parentTaskId: string | null;
	readonly teamId: string;
	readonly ownerAgentId: string | null;
	readonly title: string;
	readonly state: string;
	readonly dependencies: string | null;
	readonly notes: string | null;
}

interface TaskViewBody {
	readonly task: TaskRow;
	readonly ancestors: readonly TaskRow[];
	readonly children: readonly (TaskRow & { readonly children: readonly unknown[] })[];
	readonly tokensActualRollup: number | null;
	readonly threadId: string | null;
	readonly attachments: readonly string[];
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = authHeaders(),
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/** The human actor `findUser(db, {kind:"human"})` falls back to when none exists — see `middleware/auth.ts`. `changes.actor` FKs to `users`, so a real row must exist under this id. */
const FOUNDER_ID = "u-founder";

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: now });
	await db
		.insert(users)
		.values([
			{
				id: FOUNDER_ID,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "system:propagation",
				name: "Propagation System",
				role: "system",
				status: "active",
				createdAt: now,
			},
		])
		.onConflictDoNothing();
}

async function seedAgent(db: HyperIdleDb, agentId: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		teamId,
		status: "active",
		createdAt: now,
	});
}

async function readTask(db: HyperIdleDb, id: string): Promise<TaskRow | undefined> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
	return row as TaskRow | undefined;
}

describe("edit_task — create, human and agent", () => {
	test("create as human (API key, no actor header) and as agent (actor header) produce identical rows", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "ta-team-1");
		await seedAgent(db, "ta-agent-1", "ta-team-1");

		const human = await call<TaskViewBody>(app, "edit_task", {
			teamId: "ta-team-1",
			title: "Human-created",
		});
		expect(human.status).toBe(200);
		expect(human.body.ok).toBe(true);

		const agent = await call<TaskViewBody>(
			app,
			"edit_task",
			{ teamId: "ta-team-1", title: "Agent-created" },
			agentHeaders("ta-agent-1"),
		);
		expect(agent.status).toBe(200);
		expect(agent.body.ok).toBe(true);

		const humanRow = await readTask(db, human.body.data?.task.id ?? "");
		const agentRow = await readTask(db, agent.body.data?.task.id ?? "");
		expect(humanRow?.state).toBe("proposed");
		expect(agentRow?.state).toBe("proposed");
		expect(humanRow?.teamId).toBe("ta-team-1");
		expect(agentRow?.teamId).toBe("ta-team-1");
	});
});

describe("edit_task — refused transition", () => {
	test("an illegal state transition returns 422 with a Problem", async ({ db, app }) => {
		await seedTeam(db, "ta-team-2");
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id: "ta-done-task",
			parentTaskId: null,
			teamId: "ta-team-2",
			title: "Done task",
			state: "done",
			createdAt: now,
			updatedAt: now,
		});

		const res = await call<TaskViewBody>(app, "edit_task", {
			id: "ta-done-task",
			state: "accepted",
		});

		expect(res.status).toBe(422);
		expect(res.body.ok).toBe(false);
		expect(res.body.problems?.[0]?.code).toBe("invalid_transition");
	});
});

describe("open_task", () => {
	test("returns ancestors (root-first), the nested children subtree, tokensActualRollup, attachments, and no sessions field", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "ta-team-3");
		const now = new Date().toISOString();
		await db.insert(tasks).values([
			{
				id: "ta-root",
				parentTaskId: null,
				teamId: "ta-team-3",
				title: "Root",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-mid",
				parentTaskId: "ta-root",
				teamId: "ta-team-3",
				title: "Mid",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-leaf",
				parentTaskId: "ta-mid",
				teamId: "ta-team-3",
				title: "Leaf",
				state: "in_progress",
				tokensActualJson: JSON.stringify({ byTier: { fast: { prompt: 10, completion: 5 } } }),
				createdAt: now,
				updatedAt: now,
			},
		]);

		const res = await call<TaskViewBody>(app, "open_task", { id: "ta-mid" });

		expect(res.status).toBe(200);
		const data = res.body.data;
		expect(data?.task.id).toBe("ta-mid");
		expect(data?.ancestors.map((a) => a.id)).toEqual(["ta-root"]);
		expect(data?.children).toHaveLength(1);
		expect(data?.children[0]?.id).toBe("ta-leaf");
		expect(data?.tokensActualRollup).toBe(15);
		expect(data?.attachments).toEqual([]);
		expect(Object.hasOwn(data ?? {}, "sessions")).toBe(false);
	});
});

describe("search_tasks", () => {
	test("filters, including ids and excludeIds", async ({ db, app }) => {
		await seedTeam(db, "ta-team-4");
		const now = new Date().toISOString();
		await db.insert(tasks).values([
			{
				id: "ta-s1",
				parentTaskId: null,
				teamId: "ta-team-4",
				title: "Search one",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-s2",
				parentTaskId: null,
				teamId: "ta-team-4",
				title: "Search two",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-s3",
				parentTaskId: null,
				teamId: "ta-team-4",
				title: "Search three",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			},
		]);

		const byIds = await call<TaskRow[]>(app, "search_tasks", { ids: ["ta-s1", "ta-s2", "ta-s3"] });
		expect(byIds.body.data?.map((t) => t.id).sort()).toEqual(["ta-s1", "ta-s2", "ta-s3"]);

		const withExclude = await call<TaskRow[]>(app, "search_tasks", {
			ids: ["ta-s1", "ta-s2", "ta-s3"],
			excludeIds: ["ta-s2"],
		});
		expect(withExclude.body.data?.map((t) => t.id).sort()).toEqual(["ta-s1", "ta-s3"]);

		const byTeam = await call<TaskRow[]>(app, "search_tasks", { teamId: "ta-team-4" });
		expect(byTeam.body.data).toHaveLength(3);
	});
});

describe("the changes table", () => {
	test("a changes row exists after each edit, carrying the field diff", async ({ db, app }) => {
		await seedTeam(db, "ta-team-5");

		const created = await call<TaskViewBody>(app, "edit_task", {
			teamId: "ta-team-5",
			title: "Changes row test",
		});
		const taskId = created.body.data?.task.id ?? "";

		const createdRows = await db.select().from(changes).where(eq(changes.objectId, taskId));
		expect(createdRows).toHaveLength(1);
		expect(createdRows[0]?.kind).toBe("created");

		await call<TaskViewBody>(app, "edit_task", { id: taskId, title: "Renamed" });

		const afterEdit = await db.select().from(changes).where(eq(changes.objectId, taskId));
		expect(afterEdit).toHaveLength(2);
		const editRow = afterEdit.find((r) => r.kind === "changed");
		expect(editRow).toBeDefined();
		const after = JSON.parse(editRow?.after ?? "{}") as { title?: string };
		expect(after.title).toBe("Renamed");
	});

	test("a cascade kill writes one changes row per killed descendant with the root's actor, and one per freed dependent with system:propagation", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "ta-team-6");
		const now = new Date().toISOString();
		await db.insert(tasks).values([
			{
				id: "ta-kill-root",
				parentTaskId: null,
				teamId: "ta-team-6",
				title: "Kill root",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-kill-child",
				parentTaskId: "ta-kill-root",
				teamId: "ta-team-6",
				title: "Kill child",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-kill-dependent",
				parentTaskId: null,
				teamId: "ta-team-6",
				title: "Dependent on the killed child",
				state: "hold",
				dependencies: JSON.stringify(["ta-kill-child"]),
				createdAt: now,
				updatedAt: now,
			},
		]);

		const res = await call<TaskViewBody>(app, "edit_task", {
			id: "ta-kill-root",
			state: "killed",
		});
		expect(res.status).toBe(200);

		const rootRow = await readTask(db, "ta-kill-root");
		const childRow = await readTask(db, "ta-kill-child");
		expect(rootRow?.state).toBe("killed");
		expect(childRow?.state).toBe("killed");

		const rootChanges = await db.select().from(changes).where(eq(changes.objectId, "ta-kill-root"));
		const childChanges = await db
			.select()
			.from(changes)
			.where(eq(changes.objectId, "ta-kill-child"));
		const killEntry = rootChanges.find((c) => c.kind === "changed");
		const childKillEntry = childChanges.find((c) => c.kind === "changed");
		expect(killEntry?.actor).toBe("u-founder");
		expect(childKillEntry?.actor).toBe("u-founder");

		const dependentChanges = await db
			.select()
			.from(changes)
			.where(eq(changes.objectId, "ta-kill-dependent"));
		const freedEntry = dependentChanges.find((c) => c.kind === "changed");
		expect(freedEntry?.actor).toBe("system:propagation");
		const dependentRow = await readTask(db, "ta-kill-dependent");
		expect(dependentRow?.state).toBe("proposed");
		expect(JSON.parse(dependentRow?.dependencies ?? "[]")).toEqual([]);
	});
});

describe("appendNote", () => {
	test("two concurrent appendNote calls both survive", async ({ db, app }) => {
		await seedTeam(db, "ta-team-7");
		const created = await call<TaskViewBody>(app, "edit_task", {
			teamId: "ta-team-7",
			title: "Note target",
		});
		const taskId = created.body.data?.task.id ?? "";

		await Promise.all([
			call<TaskViewBody>(app, "edit_task", { id: taskId, appendNote: "first note" }),
			call<TaskViewBody>(app, "edit_task", { id: taskId, appendNote: "second note" }),
		]);

		const row = await readTask(db, taskId);
		expect(row?.notes).toContain("first note");
		expect(row?.notes).toContain("second note");
	});
});

describe("task_state_changed", () => {
	test("emits on state change", async ({ db, app, eventBus }) => {
		await seedTeam(db, "ta-team-8");
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id: "ta-emit-task",
			parentTaskId: null,
			teamId: "ta-team-8",
			title: "Emits on change",
			state: "proposed",
			createdAt: now,
			updatedAt: now,
		});

		const events: Array<{ readonly toState: string }> = [];
		eventBus.on("task_state_changed", (e) => events.push(e));

		const res = await call<TaskViewBody>(app, "edit_task", {
			id: "ta-emit-task",
			state: "hold",
		});

		expect(res.status).toBe(200);
		expect(events.some((e) => e.toState === "hold")).toBe(true);
	});
});

describe("dispatch", () => {
	test("accept-with-owner inserts one dispatch attempt and records the work intent", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "ta-team-9");
		await seedAgent(db, "ta-agent-9", "ta-team-9");
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id: "ta-accept-task",
			parentTaskId: null,
			teamId: "ta-team-9",
			ownerAgentId: "ta-agent-9",
			title: "Accept me",
			state: "proposed",
			createdAt: now,
			updatedAt: now,
		});

		const res = await call<TaskViewBody>(app, "edit_task", {
			id: "ta-accept-task",
			state: "accepted",
		});
		expect(res.status).toBe(200);

		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "ta-accept-task"));
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?.occasion).toBe("accepted");

		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempts[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
	});

	test("an owner change on an in_progress task inserts a second attempt with occasion owner_handoff, ends the predecessor's run, and records a second intent", async ({
		db,
		app,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "ta-team-10");
		await seedAgent(db, "ta-agent-10a", "ta-team-10");
		await seedAgent(db, "ta-agent-10b", "ta-team-10");
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id: "ta-handoff-task",
			parentTaskId: null,
			teamId: "ta-team-10",
			ownerAgentId: "ta-agent-10a",
			title: "Hand me off",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(sessions).values({
			id: "ta-handoff-session",
			taskId: "ta-handoff-task",
			agentId: "ta-agent-10a",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});
		await db.insert(agentSessionRequests).values({
			id: "ta-handoff-req",
			sourceKind: "task",
			sourceId: "ta-handoff-task",
			streamId: "task:ta-handoff-task",
			taskId: "ta-handoff-task",
			agentId: "ta-agent-10a",
			promptMode: "task",
			sourceCorrelationJson: "{}",
			idempotencyKey: "ta-handoff-req",
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});
		// The predecessor's live dispatch attempt, seeded the way `insertAttempt`
		// really leaves it — no `requestId`/`sessionId` yet. B7 fix: those are
		// filled by a REAL `session_started` event through `markRunning`
		// (§1's repair), never hand-seeded — the exact shape that let the
		// original defect (§1) ship unnoticed.
		await db.insert(taskDispatchAttempts).values({
			id: "ta-handoff-attempt-1",
			taskId: "ta-handoff-task",
			occasion: "accepted",
			agentId: "ta-agent-10a",
			ordinal: 1,
			status: "requested",
			createdAt: now,
			updatedAt: now,
		});
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));
		eventBus.emit({
			type: "session_started",
			streamId: "ta-handoff-session",
			sessionId: "ta-handoff-session",
			agentId: "ta-agent-10a",
			taskId: "ta-handoff-task",
			requestId: "ta-handoff-req",
			timestamp: Date.now(),
		});
		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, "ta-handoff-attempt-1"));
			expect(row?.status).toBe("running");
			expect(row?.sessionId).toBe("ta-handoff-session");
		});

		const res = await call<TaskViewBody>(app, "edit_task", {
			id: "ta-handoff-task",
			ownerAgentId: "ta-agent-10b",
		});
		expect(res.status).toBe(200);

		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "ta-handoff-task"));
		expect(attempts).toHaveLength(2);
		const handoffAttempt = attempts.find((a) => a.occasion === "owner_handoff");
		expect(handoffAttempt).toBeDefined();
		expect(handoffAttempt?.predecessorSessionId).toBe("ta-handoff-session");
		expect(handoffAttempt?.agentId).toBe("ta-agent-10b");

		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, handoffAttempt?.id ?? ""));
		expect(intents).toHaveLength(1);

		const [predecessorSession] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, "ta-handoff-session"));
		expect(predecessorSession?.state).toBe("done");
	});

	test("a kill calls stopRunsForTasks with every killed id, including a done root", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "ta-team-11");
		await seedAgent(db, "ta-agent-11", "ta-team-11");
		const now = new Date().toISOString();
		await db.insert(tasks).values([
			{
				id: "ta-kill-done-root",
				parentTaskId: null,
				teamId: "ta-team-11",
				title: "Done root",
				state: "done",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ta-kill-live-child",
				parentTaskId: "ta-kill-done-root",
				teamId: "ta-team-11",
				title: "Live child",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			},
		]);
		await db.insert(sessions).values({
			id: "ta-kill-session",
			taskId: "ta-kill-live-child",
			agentId: "ta-agent-11",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const res = await call<TaskViewBody>(app, "edit_task", {
			id: "ta-kill-done-root",
			state: "killed",
		});
		expect(res.status).toBe(200);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, "ta-kill-session"));
		// `stopForTasks` was called with the done root included — its live
		// child's run is stopped as a result.
		expect(session?.state).not.toBe("active");
		const rootRow = await readTask(db, "ta-kill-done-root");
		const childRow = await readTask(db, "ta-kill-live-child");
		expect(rootRow?.state).toBe("killed");
		expect(childRow?.state).toBe("killed");
	});
});
