/**
 * Proves that search_tasks and open_task return the correct `need` field,
 * and that open_task's TaskNode.openBelow counts descendant needs.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, messages, teams, users } from "@hyperidle/db";
import type {
	ActionResult,
	EditTaskInput,
	SearchTasksInput,
	SendMessageInput,
	SendMessageOutput,
	TaskListItem,
	TaskView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";

const ACTOR = "need-test-human";
const TEAM_ID = "need-test-team";
const AGENT = "need-test-agent";

function makeCtx(db: HyperIdleDb, eventBus: EventBus): ActionContext {
	return { actor: ACTOR, db, eventBus, now: new Date().toISOString() };
}

function makeRunners(agentOrchestration: AgentOrchestrationPort) {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const editTask = actions.find((a) => a.declaration.name === "edit_task")!.run as (
		ctx: ActionContext,
		input: EditTaskInput,
	) => Promise<ActionResult<TaskView>>;
	const sendMessage = actions.find((a) => a.declaration.name === "send_message")!.run as (
		ctx: ActionContext,
		input: SendMessageInput,
	) => Promise<ActionResult<SendMessageOutput>>;
	const searchTasks = actions.find((a) => a.declaration.name === "search_tasks")!.run as (
		ctx: ActionContext,
		input: SearchTasksInput,
	) => Promise<ActionResult<TaskListItem[]>>;
	const openTask = actions.find((a) => a.declaration.name === "open_task")!.run as (
		ctx: ActionContext,
		input: { id: string },
	) => Promise<ActionResult<TaskView>>;
	return { editTask, searchTasks, openTask, sendMessage };
}

async function seedActor(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: TEAM_ID, createdAt: now })
		.onConflictDoNothing();
	await db
		.insert(users)
		.values({
			id: ACTOR,
			name: ACTOR,
			role: "member",
			status: "active",
			kind: "human",
			teamId: TEAM_ID,
			createdAt: now,
		})
		.onConflictDoNothing();
}

async function insertMsg(
	db: HyperIdleDb,
	opts: { id: string; threadId: string; type: string; resolvedAt?: string | null },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(messages).values({
		id: opts.id,
		threadId: opts.threadId,
		senderId: ACTOR,
		type: opts.type,
		payload: "{}",
		clientKey: opts.id,
		resolvedAt: opts.resolvedAt ?? null,
		blockId: null,
		createdAt: now,
		deletedAt: null,
	});
}

describe("task need computation — search_tasks and open_task", () => {
	test("questionnaire message → need:input; resolving clears it", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedActor(db);
		const ctx = makeCtx(db, eventBus);
		const { editTask, searchTasks, openTask } = makeRunners(agentOrchestration);

		// Create a task (edit_task auto-creates a thread).
		const created = await editTask(ctx, { title: "Need test task", teamId: TEAM_ID });
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const taskId = created.data.task.id;
		const threadId = created.data.threadId;

		// No message yet → need is null.
		const beforeSearch = await searchTasks(ctx, { ids: [taskId] });
		expect(beforeSearch.ok).toBe(true);
		if (!beforeSearch.ok) return;
		expect(beforeSearch.data[0]?.need).toBeNull();

		// Insert an unresolved questionnaire message on the task's thread.
		await insertMsg(db, { id: "q-msg-1", threadId, type: "questionnaire" });

		// search_tasks reflects need:input.
		const afterSearch = await searchTasks(ctx, { ids: [taskId] });
		expect(afterSearch.ok).toBe(true);
		if (!afterSearch.ok) return;
		expect(afterSearch.data[0]?.need).toBe("input");

		// open_task.task also reflects need:input.
		const afterOpen = await openTask(ctx, { id: taskId });
		expect(afterOpen.ok).toBe(true);
		if (!afterOpen.ok) return;
		expect(afterOpen.data.task.need).toBe("input");

		// Resolve the message.
		const resolvedAt = new Date().toISOString();
		await db.update(messages).set({ resolvedAt }).where(eq(messages.id, "q-msg-1"));

		// need clears to null.
		const clearedSearch = await searchTasks(ctx, { ids: [taskId] });
		expect(clearedSearch.ok).toBe(true);
		if (!clearedSearch.ok) return;
		expect(clearedSearch.data[0]?.need).toBeNull();
	});

	test("an agent's question sent through send_message makes need:input; the person picking an option clears it", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedActor(db);
		await db.insert(users).values({
			id: AGENT,
			name: AGENT,
			role: "builder",
			status: "active",
			kind: "ai",
			teamId: TEAM_ID,
			createdAt: new Date().toISOString(),
		});
		const { editTask, searchTasks, sendMessage } = makeRunners(agentOrchestration);
		const created = await editTask(makeCtx(db, eventBus), { title: "Ask me", teamId: TEAM_ID });
		if (!created.ok) throw new Error(JSON.stringify(created.problems));
		const { task, threadId } = created.data;
		const needOf = async () => {
			const found = await searchTasks(makeCtx(db, eventBus), { ids: [task.id] });
			return found.ok ? found.data[0]?.need : "search failed";
		};

		const asked = await sendMessage(
			{ ...makeCtx(db, eventBus), actor: AGENT },
			{
				threadId,
				questionnaire: {
					title: "Billing",
					question: "Monthly or yearly?",
					options: ["Monthly", "Yearly"],
				},
			},
		);
		if (!asked.ok) throw new Error(JSON.stringify(asked.problems));
		expect(await needOf()).toBe("input");

		const answered = await sendMessage(makeCtx(db, eventBus), {
			threadId,
			answer: { resolvesMessageId: asked.data.message.id, option: "Yearly" },
		});

		expect(answered.ok).toBe(true);
		expect(await needOf()).toBeNull();
	});

	test("review message → need:review", async ({ db, eventBus, agentOrchestration }) => {
		await seedActor(db);
		const ctx = makeCtx(db, eventBus);
		const { editTask, searchTasks } = makeRunners(agentOrchestration);

		const created = await editTask(ctx, { title: "Review task", teamId: TEAM_ID });
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const taskId = created.data.task.id;
		const threadId = created.data.threadId;

		await insertMsg(db, { id: "r-msg-1", threadId, type: "review" });

		const res = await searchTasks(ctx, { ids: [taskId] });
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data[0]?.need).toBe("review");
	});

	test("state:blocked → need:stuck", async ({ db, eventBus, agentOrchestration }) => {
		await seedActor(db);
		const ctx = makeCtx(db, eventBus);
		const { editTask, searchTasks } = makeRunners(agentOrchestration);

		const created = await editTask(ctx, {
			title: "Blocked task",
			teamId: TEAM_ID,
			state: "in_progress",
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const taskId = created.data.task.id;

		const blocked = await editTask(ctx, { id: taskId, state: "blocked" });
		expect(blocked.ok).toBe(true);

		const res = await searchTasks(ctx, { ids: [taskId] });
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data[0]?.need).toBe("stuck");
	});

	test("child questionnaire → parent openBelow.input:1", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedActor(db);
		const ctx = makeCtx(db, eventBus);
		const { editTask, openTask } = makeRunners(agentOrchestration);

		// Parent task.
		const parentResult = await editTask(ctx, { title: "Parent task", teamId: TEAM_ID });
		expect(parentResult.ok).toBe(true);
		if (!parentResult.ok) return;
		const parentId = parentResult.data.task.id;

		// Child task.
		const childResult = await editTask(ctx, {
			title: "Child task",
			teamId: TEAM_ID,
			parentTaskId: parentId,
		});
		expect(childResult.ok).toBe(true);
		if (!childResult.ok) return;
		const childThreadId = childResult.data.threadId;

		// Insert questionnaire on child's thread.
		await insertMsg(db, { id: "q-child-1", threadId: childThreadId, type: "questionnaire" });

		// open_task on parent: child node has need:input, parent's openBelow.input is 1.
		const parentOpen = await openTask(ctx, { id: parentId });
		expect(parentOpen.ok).toBe(true);
		if (!parentOpen.ok) return;
		const childNode = parentOpen.data.children[0];
		expect(childNode?.need).toBe("input");
		expect(childNode?.openBelow).toEqual({ input: 0, review: 0 });
		expect(parentOpen.data.openBelow).toEqual({ input: 1, review: 0 });
	});
});
