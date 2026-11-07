/**
 * Every reason for an agent to act lands in its inbox, and its runner answers it through the
 * normal door: a mention, a task started, a schedule firing, a verdict on its review — and what
 * waited while the runner was off.
 *
 * Network edition: boots a real server over HTTP/WS; the runner calls it through the normal door.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	answersPong,
	bootRunnerWorld,
	makeCorePgDb,
	makeFailingBoot,
	type RunnerWorld,
	type RunScript,
} from "./agent-runner-test-support.js";

const TEAM = "team-inbox";
const PERSON = "person-inbox";
const BUILDER = "agent-builder";
const OTHER = "agent-other";
const PERSON_KEY = "person-inbox-key";

// ---- Setup ----

let tempDataDir: string;

beforeEach(() => {
	tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-inbox-test-"));
});

afterEach(async () => {
	vi.unstubAllEnvs();
	try {
		fs.rmSync(tempDataDir, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

// ---- Seed helpers ----

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

// ---- Test helpers ----

async function waitFor<T>(what: string, probe: () => Promise<T | undefined>): Promise<T> {
	const deadline = Date.now() + 15_000;
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

import type { AgentExecutionBoot } from "@hyperidle/agent-execution";

async function withWorld(
	script: RunScript,
	body: (world: RunnerWorld, db: HyperIdleDb) => Promise<void>,
	agentExecutionOverride?: AgentExecutionBoot,
): Promise<void> {
	const dbHandle = await makeCorePgDb(tempDataDir);
	try {
		await seedPeople(dbHandle.db);
		const world = await bootRunnerWorld(
			dbHandle.db,
			PERSON_KEY,
			script,
			tempDataDir,
			agentExecutionOverride,
		);
		try {
			await body(world, dbHandle.db);
		} finally {
			await world.stop();
		}
	} finally {
		await dbHandle.close();
	}
}

// ---- Tests ----

describe("an agent acts on its inbox", () => {
	test("a mention is a row for the agent named, and its runner answers in the thread", async () => {
		await withWorld(answersPong, async (world, db) => {
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
	}, 20_000);

	test("a task started for the agent is a row, and its run answers on the task", async () => {
		await withWorld(answersPong, async (world, db) => {
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
	}, 20_000);

	test("a schedule firing is a row with no change, and the agent answers it", async () => {
		await withWorld(answersPong, async (world, db) => {
			await asPerson(world, "edit_user", {
				id: BUILDER,
				subscriptions: { add: [{ schedule: "0 9 * * *", prompt: "Say pong." }] },
			});
			await db
				.update(subscriptions)
				.set({ nextRunAt: new Date(Date.now() - 1_000).toISOString() })
				.where(eq(subscriptions.userId, BUILDER));
			// Clock writes the inbox row with no wsPush — no nudge is sent.
			const clock = startSubscriptionClock(db, {}, { tickIntervalMs: 20 });
			try {
				// Wait for the row to appear, then start the runner so its startup
				// sweep finds the unread row without needing a nudge.
				await waitFor("subscription inbox row", async () => {
					const rows = await inboxOf(db, BUILDER);
					return rows.length > 0 ? rows : undefined;
				});
				clock.stop();
				await world.runner.start();
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
	}, 20_000);

	test("a verdict on the agent's review is a row for it, and the agent answers it", async () => {
		const filesReviewFirst: RunScript = async (run) => {
			if (run.index === 0) {
				await run.call("send_message", {
					review: { title: "Notes ready", reasoning: ["Done."] },
				});
				return;
			}
			await run.call("send_message", { text: "pong" });
		};
		await withWorld(filesReviewFirst, async (world, db) => {
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
			// No session takes the approval back here, so the runner closes the task.
			await waitFor("the approved task to close", async () => {
				const [task] = await db.select().from(tasks).where(eq(tasks.id, created.task.id));
				return task?.state === "done" ? task : undefined;
			});
		});
	}, 30_000);

	test("an approval leaves the task open while another of its lines is not met", async () => {
		const filesReviewFirst: RunScript = async (run) => {
			if (run.index === 0) {
				await run.call("send_message", {
					review: { title: "Notes ready", reasoning: ["Done."] },
				});
				return;
			}
			await run.call("send_message", { text: "pong" });
		};
		await withWorld(filesReviewFirst, async (world, db) => {
			await world.runner.start();
			const created = await asPerson<{ task: { id: string } }>(world, "edit_task", {
				title: "Write the notes",
				teamId: TEAM,
				ownerAgentId: BUILDER,
				doneWhen: [
					{
						id: "tests",
						what: "Tests pass",
						by: "check",
						state: "open",
						how: "npm test",
					},
					{ id: "look", what: "Looks right", by: "review", state: "open", how: null },
				],
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
				verdict: { decision: "approve", resolvesMessageId: review.id },
			});

			await waitFor("Builder's answer to the verdict", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			const [task] = await db.select().from(tasks).where(eq(tasks.id, created.task.id));
			expect(task?.state).toBe("in_progress");
		});
	}, 30_000);

	test("a rejection's note reaches the agent in the run that answers it", async () => {
		const prompts: string[] = [];
		const filesReviewFirst: RunScript = async (run) => {
			prompts.push(run.prompt);
			if (run.index === 0) {
				await run.call("send_message", {
					review: { title: "Notes ready", reasoning: ["Done."] },
				});
				return;
			}
			await run.call("send_message", { text: "pong" });
		};
		await withWorld(filesReviewFirst, async (world, db) => {
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
	}, 30_000);

	test("what waited while the runner was off is answered when it starts", async () => {
		await withWorld(answersPong, async (world, db) => {
			await asPerson(world, "send_message", {
				recipients: [BUILDER],
				text: "are you there?",
			});
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
	}, 20_000);

	test("a task handed on while its run waits starts for the new owner, and the old run is cancelled", async () => {
		// Builder's script blocks on its first run to hold a session slot
		// (maxConcurrentSessions defaults to 1, so the task run stays pending).
		let resolveBuilderStarted!: () => void;
		const builderFirstRunStarted = new Promise<void>((r) => {
			resolveBuilderStarted = r;
		});
		let releaseBuilderRun: (() => void) | undefined;

		const blockingScript: RunScript = async (run) => {
			if (run.index === 0) {
				// Signal that builder is now actively running.
				resolveBuilderStarted();
				// Block until released so the slot stays occupied.
				await new Promise<void>((r) => {
					releaseBuilderRun = r;
				});
				return;
			}
			await run.call("send_message", { text: "pong" });
		};

		await withWorld(blockingScript, async (world, db) => {
			await world.runner.start();

			// Trigger builder's first (blocking) run via a direct message.
			await asPerson<unknown>(world, "send_message", {
				recipients: [BUILDER],
				text: "Start blocking",
			});

			// Wait until builder has an active session (holds the slot).
			await builderFirstRunStarted;

			const created = await asPerson<{ task: { id: string; threadId: string } }>(
				world,
				"edit_task",
				{ title: "Hand me on", teamId: TEAM, ownerAgentId: BUILDER },
			);
			await asPerson(world, "edit_task", { id: created.task.id, state: "accepted" });

			// Give the inbox row time to be queued (pending, waiting for the busy slot).
			await new Promise((r) => setTimeout(r, 400));

			// Reassign to OTHER; builder's queued run is cancelled; OTHER runs it.
			await asPerson(world, "edit_task", {
				id: created.task.id,
				ownerAgentId: OTHER,
			});

			// Release builder's blocking run so the runner can shut down cleanly.
			releaseBuilderRun?.();

			const [reply] = await waitFor("Other's run on the task", async () => {
				const found = await saidBy(db, OTHER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(reply?.threadId).toBe(created.task.threadId);

			// Builder must not have replied on the task thread.
			const builderOnTask = (await saidBy(db, BUILDER, "pong")).filter(
				(m) => m.threadId === created.task.threadId,
			);
			expect(builderOnTask).toHaveLength(0);
		});
	}, 30_000);

	test("a task started while on hold waits, and runs once the hold is lifted", async () => {
		await withWorld(answersPong, async (world, db) => {
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

			await waitFor("Builder's run on the task", async () => {
				const found = await saidBy(db, BUILDER, "pong");
				return found.length > 0 ? found : undefined;
			});
			expect(world.runs).toHaveLength(1);
		});
	}, 30_000);

	test("when a thread turn is refused admission, the agent posts a notice only when humans are in the thread", async () => {
		// Use a failing boot so every session admission fails (PROVISIONING_FAILED).
		await withWorld(
			answersPong,
			async (world, db) => {
				await world.runner.start();
				// Direct message to builder: thread has PERSON + BUILDER as members.
				const sent = await asPerson<{ thread: { id: string } }>(world, "send_message", {
					recipients: [BUILDER],
					text: "hello",
				});

				await waitFor("admission-failed notice in thread", async () => {
					const rows = await db
						.select()
						.from(messages)
						.where(and(eq(messages.senderId, BUILDER), eq(messages.threadId, sent.thread.id)));
					return rows.length > 0 ? rows : undefined;
				});

				const notices = await db
					.select()
					.from(messages)
					.where(and(eq(messages.senderId, BUILDER), eq(messages.threadId, sent.thread.id)));
				const noticeText =
					(JSON.parse(notices[0]?.payload ?? "{}") as { text?: string }).text ?? "";
				expect(noticeText).toContain("could not start");
				// Idempotent: a second drain (triggered naturally by user.changed after
				// the row is marked read) posts no duplicate.
				await new Promise((r) => setTimeout(r, 300));
				const after = await db
					.select()
					.from(messages)
					.where(and(eq(messages.senderId, BUILDER), eq(messages.threadId, sent.thread.id)));
				expect(after).toHaveLength(1);
			},
			makeFailingBoot(),
		);
	}, 20_000);
});
