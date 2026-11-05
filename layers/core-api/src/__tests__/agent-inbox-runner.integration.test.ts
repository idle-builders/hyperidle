/**
 * Every reason for an agent to act lands in its inbox, and its runner answers it through the
 * normal door: a mention, a task started, a schedule firing, a verdict on its review — and what
 * waited while the runner was off.
 */

import {
	type HyperIdleDb,
	inbox,
	messages,
	subscriptions,
	tasks,
	teams,
	users,
	userTeams,
} from "@hyperidle/db";
import { giveUserKey, startSubscriptionClock } from "@hyperidle/user";
import { and, eq } from "drizzle-orm";
import {
	answersPong,
	bootRunnerWorld,
	type RunnerWorld,
	type RunnerWorldOptions,
	type RunScript,
} from "../__testing__/agent-runner-test-support.js";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

const TEAM = "team-inbox";
const PERSON = "person-inbox";
const BUILDER = "agent-builder";
const OTHER = "agent-other";
const PERSON_KEY = "person-inbox-key";

async function seedPeople(db: HyperIdleDb): Promise<void> {
	const at = new Date(Date.now() - 60_000).toISOString();
	await db.insert(teams).values({ id: TEAM, name: "Inbox", createdAt: at });
	await db.insert(users).values([
		{ id: PERSON, kind: "human", name: "Pat", role: "founder", status: "active", createdAt: at },
		{
			id: BUILDER,
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			ownerUserId: PERSON,
			createdAt: at,
		},
		{
			id: OTHER,
			kind: "ai",
			name: "Other",
			role: "builder",
			status: "active",
			ownerUserId: PERSON,
			createdAt: at,
		},
	]);
	await db.insert(userTeams).values([
		{ userId: PERSON, teamId: TEAM },
		{ userId: BUILDER, teamId: TEAM },
		{ userId: OTHER, teamId: TEAM },
	]);
	await giveUserKey(db, PERSON, PERSON_KEY);
}

async function waitFor<T>(what: string, probe: () => Promise<T | undefined>): Promise<T> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const found = await probe();
		if (found !== undefined) return found;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

async function inboxOf(db: HyperIdleDb, userId: string) {
	return db.select().from(inbox).where(eq(inbox.userId, userId));
}

/** The agent's messages that say `text`, wherever it said them. */
async function saidBy(db: HyperIdleDb, agentId: string, text: string) {
	const rows = await db.select().from(messages).where(eq(messages.senderId, agentId));
	return rows.filter((m) => (JSON.parse(m.payload) as { text?: unknown }).text === text);
}

async function asPerson<O>(world: RunnerWorld, action: string, input: unknown): Promise<O> {
	const result = await world.door.call<O>(PERSON_KEY, action, input);
	if (!result.ok) throw new Error(`${action}: ${JSON.stringify(result.problems)}`);
	return result.data;
}

async function withWorld(
	db: HyperIdleDb,
	eventBus: Parameters<typeof bootRunnerWorld>[1],
	script: RunScript,
	body: (world: RunnerWorld) => Promise<void>,
): Promise<void> {
	await seedPeople(db);
	const world = await bootRunnerWorld(db, eventBus, PERSON_KEY, script);
	try {
		await body(world);
	} finally {
		await world.stop();
	}
}

async function withWorldOpts(
	db: HyperIdleDb,
	eventBus: Parameters<typeof bootRunnerWorld>[1],
	script: RunScript,
	options: RunnerWorldOptions,
	body: (world: RunnerWorld) => Promise<void>,
): Promise<void> {
	await seedPeople(db);
	const world = await bootRunnerWorld(db, eventBus, PERSON_KEY, script, options);
	try {
		await body(world);
	} finally {
		await world.stop();
	}
}

describe("an agent acts on its inbox", () => {
	test("a mention is a row for the agent named, and its runner answers in the thread", async ({
		db,
		eventBus,
	}) => {
		await withWorld(db, eventBus, answersPong, async (world) => {
			await world.runner.start();
			const sent = await asPerson<{ thread: { id: string } }>(world, "send_message", {
				recipients: [BUILDER, OTHER],
				text: "@Builder ping",
			});

			const [reply] = await waitFor("Builder's reply", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(reply?.threadId).toBe(sent.thread.id);
			const rows = await inboxOf(db, BUILDER);
			expect(rows.map((r) => [r.reason, r.objectId, r.readAt !== null])).toEqual([
				["message", sent.thread.id, true],
			]);
			expect(await inboxOf(db, OTHER)).toEqual([]);
		});
	});

	test("a task started for the agent is a row, and its run answers on the task", async ({
		db,
		eventBus,
	}) => {
		await withWorld(db, eventBus, answersPong, async (world) => {
			await world.runner.start();
			const created = await asPerson<{ task: { id: string; threadId: string } }>(
				world,
				"edit_task",
				{ title: "Write the notes", teamId: TEAM, ownerAgentId: BUILDER },
			);
			await asPerson(world, "edit_task", { id: created.task.id, state: "accepted" });

			const [reply] = await waitFor("Builder's reply on the task", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(reply?.threadId).toBe(created.task.threadId);
			const rows = await inboxOf(db, BUILDER);
			expect(rows.map((r) => [r.reason, r.objectId])).toContainEqual(["task_run", created.task.id]);
		});
	});

	test("a schedule firing is a row with no change, and the agent answers it", async ({
		db,
		eventBus,
	}) => {
		await withWorld(db, eventBus, answersPong, async (world) => {
			await world.runner.start();
			await asPerson(world, "edit_user", {
				id: BUILDER,
				subscriptions: { add: [{ schedule: "0 9 * * *", prompt: "Say pong." }] },
			});
			await db
				.update(subscriptions)
				.set({ nextRunAt: new Date(Date.now() - 1_000).toISOString() })
				.where(eq(subscriptions.userId, BUILDER));
			const clock = startSubscriptionClock(db, { wsPush: world.nudge }, { tickIntervalMs: 20 });
			try {
				await waitFor("Builder's reply to its schedule", async () => {
					const found = await saidBy(db, BUILDER, "pong");
					return found.length > 0 ? found : undefined;
				});
			} finally {
				clock.stop();
			}
			const [row] = await inboxOf(db, BUILDER);
			expect([row?.reason, row?.changeId, row?.readAt !== null]).toEqual([
				"subscription",
				null,
				true,
			]);
		});
	});

	test("a verdict on the agent's review is a row for it, and the agent answers it", async ({
		db,
		eventBus,
	}) => {
		const filesReviewFirst: RunScript = async (run) => {
			if (run.index === 0) {
				await run.call("send_message", { review: { title: "Notes ready", reasoning: ["Done."] } });
				return;
			}
			await run.call("send_message", { text: "pong" });
		};
		await withWorld(db, eventBus, filesReviewFirst, async (world) => {
			await world.runner.start();
			const created = await asPerson<{ task: { id: string; threadId: string } }>(
				world,
				"edit_task",
				{ title: "Write the notes", teamId: TEAM, ownerAgentId: BUILDER },
			);
			await asPerson(world, "edit_task", { id: created.task.id, state: "accepted" });
			const review = await waitFor("Builder's review", async () => {
				const [found] = await db
					.select()
					.from(messages)
					.where(and(eq(messages.senderId, BUILDER), eq(messages.type, "review")));
				return found;
			});

			await asPerson(world, "send_message", {
				threadId: review.threadId,
				verdict: { decision: "approve", resolvesMessageId: review.id },
			});

			const [reply] = await waitFor("Builder's answer to the verdict", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(reply?.threadId).toBe(review.threadId);
			const rows = await inboxOf(db, BUILDER);
			expect(rows.map((r) => [r.reason, r.objectId])).toContainEqual([
				"review_answered",
				review.id,
			]);
			// The answering run carries the task, so its end closes the approved task.
			await waitFor("the approved task to close", async () => {
				const [task] = await db.select().from(tasks).where(eq(tasks.id, created.task.id));
				return task?.state === "done" ? task : undefined;
			});
		});
	});

	test("a rejection's note reaches the agent in the run that answers it", async ({
		db,
		eventBus,
	}) => {
		const prompts: string[] = [];
		const filesReviewFirst: RunScript = async (run) => {
			prompts.push(run.prompt);
			if (run.index === 0) {
				await run.call("send_message", { review: { title: "Notes ready", reasoning: ["Done."] } });
				return;
			}
			await run.call("send_message", { text: "pong" });
		};
		await withWorld(db, eventBus, filesReviewFirst, async (world) => {
			await world.runner.start();
			const created = await asPerson<{ task: { id: string } }>(world, "edit_task", {
				title: "Write the notes",
				teamId: TEAM,
				ownerAgentId: BUILDER,
			});
			await asPerson(world, "edit_task", { id: created.task.id, state: "accepted" });
			const review = await waitFor("Builder's review", async () => {
				const [found] = await db
					.select()
					.from(messages)
					.where(and(eq(messages.senderId, BUILDER), eq(messages.type, "review")));
				return found;
			});

			await asPerson(world, "send_message", {
				threadId: review.threadId,
				verdict: {
					decision: "reject",
					resolvesMessageId: review.id,
					note: "Add the refund dates.",
				},
			});

			await waitFor("Builder's answer to the rejection", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(prompts[1]).toContain("Add the refund dates.");
		});
	});

	test("what waited while the runner was off is answered when it starts", async ({
		db,
		eventBus,
	}) => {
		await withWorld(db, eventBus, answersPong, async (world) => {
			await asPerson(world, "send_message", { recipients: [BUILDER], text: "are you there?" });
			const [waiting] = await inboxOf(db, BUILDER);
			expect([waiting?.reason, waiting?.readAt]).toEqual(["message", null]);
			expect(world.runs).toEqual([]);

			await world.runner.start();

			await waitFor("Builder's reply after it came on", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			const [answered] = await inboxOf(db, BUILDER);
			expect(answered?.readAt).not.toBeNull();
		});
	});

	test("a row that keeps failing is given up after 3 tries and later rows are still acted on", async ({
		db,
		eventBus,
	}) => {
		let failTaskId = "";
		let interceptCount = 0;
		// Intercept open_task for the failing task to simulate a server error.
		const fetchInterceptor = async (req: Request): Promise<Response | null> => {
			if (!failTaskId) return null;
			const url = new URL(req.url);
			if (!url.pathname.endsWith("/actions/open_task")) return null;
			const body = (await req.clone().json()) as { id?: string };
			if (body.id !== failTaskId || interceptCount >= 3) return null;
			interceptCount++;
			return new Response("server error", { status: 500 });
		};
		await withWorldOpts(db, eventBus, answersPong, { fetchInterceptor }, async (world) => {
			// Task row: open_task returns 500 each time, so this row keeps failing
			const failTask = await asPerson<{ task: { id: string } }>(world, "edit_task", {
				title: "Failing task",
				teamId: TEAM,
				ownerAgentId: BUILDER,
			});
			await asPerson(world, "edit_task", { id: failTask.task.id, state: "accepted" });
			failTaskId = failTask.task.id;

			// Message row: succeeds normally
			await asPerson(world, "send_message", { recipients: [BUILDER], text: "ping" });

			await world.runner.start();

			// Pass 1: task row errors (count=1), message row succeeds → pong sent
			await waitFor("Builder's pong on the message row", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});

			// Trigger 2 more passes to reach the failure limit (count=3)
			world.nudge(`user:${BUILDER}`, {});
			world.nudge(`user:${BUILDER}`, {});

			// Wait for the task row to be marked read (given up after 3 failures)
			await waitFor("task_run row to be given up after 3 failures", async () => {
				const rows = await inboxOf(db, BUILDER);
				const row = rows.find((r) => r.reason === "task_run" && r.objectId === failTask.task.id);
				return row && row.readAt !== null ? row : undefined;
			});

			expect(interceptCount).toBe(3);
		});
	});

	test("a task started while on hold waits, and runs once the hold is lifted", async ({
		db,
		eventBus,
	}) => {
		await withWorld(db, eventBus, answersPong, async (world) => {
			const created = await asPerson<{ task: { id: string } }>(world, "edit_task", {
				title: "Held work",
				teamId: TEAM,
				ownerAgentId: BUILDER,
			});
			await asPerson(world, "edit_task", { id: created.task.id, state: "accepted" });
			await asPerson(world, "edit_task", { id: created.task.id, paused: "hold" });

			await world.runner.start();
			const [waiting] = (await inboxOf(db, BUILDER)).filter((r) => r.reason === "task_run");
			expect([waiting?.readAt, world.runs]).toEqual([null, []]);

			await asPerson(world, "edit_task", { id: created.task.id, paused: null });
			world.nudge(`user:${BUILDER}`, {});

			await waitFor("Builder's run on the task", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(world.runs).toHaveLength(1);
		});
	});
});
