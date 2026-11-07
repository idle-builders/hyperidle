/**
 * Lifecycle propagation engine tests. Assertions read state via EventBus
 * event capture (propagation_applied / propagation_failed) or direct state
 * reads — there is no propagation log table and no retry mechanism.
 *
 * `messages.senderId` references `agents.id` (FK) — any test that exercises
 * review-thread creation must seed a "system:propagation" agent row, or the
 * insert fails with a FK constraint violation.
 *
 * The ship-confirmation review posts through the composed `send_message.run`,
 * injected the same way `editTask` already is, below — never a raw store
 * write, so it gets a `changes` row, a websocket nudge and a `lastActiveAt`
 * bump like every other message.
 */

import {
	changes,
	type HyperIdleDb,
	tasks,
	teams,
	threads,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import type { ActionResult, SendMessageInput, ThreadView } from "@hyperidle/domain-model";
import { type EventBus, objectEvent } from "@hyperidle/event-bus";
import { type PolicyDeps, registerLifecyclePropagation } from "@hyperidle/policy";
import * as work from "@hyperidle/task";
import { listMessages } from "@hyperidle/thread";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";

/**
 * `registerLifecyclePropagation`'s `LifecyclePropagationDeps` is
 * `Pick<PolicyDeps, "work"|"editTask"|"sendMessage">` — no item-table reads,
 * no `users` founder lookup; the ship-confirmation thread posts into the
 * task's existing thread (`lifecycle-propagation.ts`'s
 * `createShipConfirmationThread`).
 */
function buildPolicyDeps(): PolicyDeps {
	const actions = buildCoreActions({});
	const editTaskAction = actions.find((a) => a.declaration.name === "edit_task");
	if (!editTaskAction) throw new Error("edit_task action not found");
	const sendMessageAction = actions.find((a) => a.declaration.name === "send_message");
	if (!sendMessageAction) throw new Error("send_message action not found");
	return {
		work: {
			getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
			listChildTasks: (exec: WriteExecutor, parentTaskId: string) =>
				work.list(exec, "task", { parentTaskId }),
			listAncestorIds: (exec: WriteExecutor, taskId: string) => work.listAncestorIds(exec, taskId),
		},
		conversation: {
			listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
				listMessages(db, {
					threadInitiatorId: initiatorId,
					types: ["verdict"],
					since: windowStart,
				}),
		},
		editTask: editTaskAction.run as PolicyDeps["editTask"],
		sendMessage: sendMessageAction.run as PolicyDeps["sendMessage"],
	};
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_PROPAGATION_ID = "system:propagation";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "prod-1", name: "Test Product", createdAt: now });

	// A root task (parentTaskId: null) — bets don't exist.
	await db.insert(threads).values({
		id: `thr-${"bet-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-1"}`,
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Test bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});

	// The system propagation agent — review-thread messages insert as it.
	await db.insert(users).values({
		id: SYSTEM_PROPAGATION_ID,
		name: "Propagation System",
		role: "system",
		status: "active",
		createdAt: now,
	});
}

async function seedTask(
	db: HyperIdleDb,
	id: string,
	state: string,
	parentTaskId = "bet-1",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id: `thr-${id}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${id}`,
		id,
		parentTaskId,
		teamId: "prod-1",
		title: `Task ${id}`,
		state,
		createdAt: now,
		updatedAt: now,
	});
}

describe("registerLifecyclePropagation — ship-confirmation review", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("posts the ship-confirmation review through send_message: a changes row on the root's thread, and open_thread returns it", async ({
		db,
		app,
		asPerson,
		eventBus,
	}) => {
		await seedBase(db);
		// seedBase inserts agent-1 (AI) but not a human. We need a person to call open_thread via HTTP.
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "lp-reader",
			kind: "human",
			name: "Reader",
			role: "member",
			status: "active",
			createdAt: now,
		});
		await asPerson("lp-reader");
		await seedTask(db, "task-1", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps());

		// Drive via task.changed — directly write task-1 to done then emit the event.
		// The task.changed handler in registerLifecyclePropagation will call
		// propagateTaskToParent("task-1") which finds bet-1's only child is terminal
		// and transitions the root to done, triggering the ship-confirmation post.
		await db.update(tasks).set({ state: "done", updatedAt: now }).where(eq(tasks.id, "task-1"));
		eventBus.emit(
			objectEvent({
				id: `test-change-task-1`,
				object: "task",
				objectId: "task-1",
				kind: "changed",
				actor: "agent-1",
				before: JSON.stringify({ state: "in_progress" }),
				after: JSON.stringify({ state: "done" }),
				at: now,
			}),
		);

		// "bet-1" (the root) has exactly one child, task-1 — finishing it closes
		// the root too, which is what triggers the ship-confirmation post.
		await vi.waitFor(async () => {
			const [root] = await db.select().from(tasks).where(eq(tasks.id, "bet-1"));
			expect(root?.state).toBe("done");
		});

		// A `changes` row of object `thread`, kind `message`, actor
		// `system:propagation` on the root's own thread — the ship-confirmation
		// posts through the action, never a raw table write, so it gets one.
		const rows = await db.select().from(changes).where(eq(changes.objectId, "thr-bet-1"));
		const messageChange = rows.find((r) => r.kind === "message");
		expect(messageChange).toBeDefined();
		expect(messageChange?.object).toBe("thread");
		expect(messageChange?.actor).toBe("system:propagation");

		// `open_thread` — the door every screen reads a thread through — sees
		// the review.
		const res = await app.request("/api/actions/open_thread", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: "thr-bet-1" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as ActionResult<ThreadView> & { ok: true };
		expect(body.ok).toBe(true);
		const review = body.data.messages.find((m) => m.type === "review");
		expect(review).toBeDefined();
		expect(review?.senderId).toBe(SYSTEM_PROPAGATION_ID);
	});
});

// ─── A person's approval and what closes the task ────────────────────────────

describe("a person's approval of a task review", () => {
	let unsubscribe: (() => void) | undefined;
	afterEach(() => unsubscribe?.());

	async function approve(
		db: HyperIdleDb,
		eventBus: EventBus,
		askerStatus: "active" | "paused" = "active",
	): Promise<void> {
		await seedBase(db);
		await db.update(users).set({ status: askerStatus }).where(eq(users.id, "agent-1"));
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "human-1",
			kind: "human",
			name: "Reviewer",
			role: "owner",
			status: "active",
			createdAt: now,
		});
		await seedTask(db, "task-ap", "in_progress");
		await db
			.update(tasks)
			.set({
				doneWhen: JSON.stringify([
					{ id: "r1", what: "Looks right", by: "review", state: "open", how: null },
				]),
			})
			.where(eq(tasks.id, "task-ap"));
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["agent-1", "human-1"]) })
			.where(eq(threads.id, "thr-task-ap"));
		const deps = buildPolicyDeps();
		unsubscribe = registerLifecyclePropagation(db, eventBus, deps);
		const send = deps.sendMessage as unknown as (
			ctx: unknown,
			input: SendMessageInput,
		) => Promise<ActionResult<{ message: { id: string } }>>;
		const ctx = (actor: string) => ({ actor, db, eventBus, now: new Date().toISOString() });
		const sent = await send(
			{
				...ctx("agent-1"),
				caller: { sessionId: "s-ap", taskId: "task-ap", threadId: "thr-task-ap" },
			},
			{ threadId: "thr-task-ap", review: { title: "Go ahead?", reasoning: ["plan"] } },
		);
		if (!sent.ok) throw new Error("review not sent");
		const decided = await send(ctx("human-1"), {
			threadId: "thr-task-ap",
			verdict: { resolvesMessageId: sent.data.message.id, decision: "approve" },
		});
		expect(decided.ok).toBe(true);
	}
	const stateOf = async (db: HyperIdleDb) =>
		(await db.select().from(tasks).where(eq(tasks.id, "task-ap")))[0];

	test("with no agent to come back the task closes at once", async ({ db, eventBus }) => {
		await approve(db, eventBus, "paused");
		expect((await stateOf(db))?.state).toBe("done");
	});
});
