/**
 * `send_message`/`adjust_thread`/`search_threads`/`open_thread`'s own rules —
 * thread resolution and idempotency, verdict trio, direct-thread
 * find-or-create, computed titles, member replacement, search scoping and
 * the object events a change row fires. Real db via `@hyperidle/db/test-fixtures`,
 * `createThreadActions` over `threadDeps()` (`./_helpers.js`) — real queries
 * for every port thread-actions.ts owns the shape of, fakes only for the
 * ports that reach a sibling module (document search, the
 * agent-orchestration work-intent/review-verdict pipeline). Cases needing
 * one of those real cross-module effects stay at
 * `layers/core-api/src/__tests__/thread-actions.integration.test.ts`, the
 * layer that composes those modules together.
 */

import { type HyperIdleDb, messages, threads, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type {
	DocumentRow,
	ReviewVerdictOutcome,
	SendMessageInput,
	ThreadView,
} from "@hyperidle/domain-model";
import type { ObjectChangeEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import type { Action } from "../action-types.js";
import { createThreadActions } from "../thread-actions.js";
import {
	actionFor,
	ctxFor,
	FOUNDER_ID,
	readChanges,
	readThreadMembers,
	seedAgent,
	seedHuman,
	seedTaskWithThread,
	seedTeam,
	seedThreadRow,
	threadDeps,
} from "./_helpers.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{
		readonly code: string;
		readonly message: string;
		readonly path?: string;
	}>;
}

/** Dispatches straight to the action list — no HTTP hop, no fake of the port. */
async function call<T>(
	actions: readonly Action[],
	db: HyperIdleDb,
	eventBus: EventBus,
	name: string,
	body: Record<string, unknown>,
	actorId: string = FOUNDER_ID,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const action = actionFor<Record<string, unknown>, T>(actions, name);
	const result = await action.run(ctxFor(db, actorId, { eventBus }), body);
	return { status: result.ok ? 200 : 422, body: result as ActionEnvelope<T> };
}

/** The `ctx.caller`-dependent door — `actionsAsTools` is the only production code that fills it. */
function runnerFor<I, O>(actions: readonly Action[], name: string) {
	const found = actionFor<I, O>(actions, name);
	return found.run;
}

// ============================================================================
// send_message
// ============================================================================

describe("send_message — thread resolution and idempotency", () => {
	test("recipients create a thread with sender+recipients as members and write created+message rows", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-team-1");
		await seedHuman(db, "sm-human-1", "sm-team-1");

		const res = await call<{ message: { id: string }; thread: { id: string; members: string[] } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["sm-human-1"], text: "hello" },
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		const threadId = res.body.data?.thread.id as string;
		expect(res.body.data?.thread.members).toEqual(
			expect.arrayContaining([FOUNDER_ID, "sm-human-1"]),
		);

		const rows = await readChanges(db, threadId);
		expect(rows.map((r) => r.kind).sort()).toEqual(["created", "message"]);
		for (const row of rows) expect(row.actor).toBe(FOUNDER_ID);
	});

	test("a second send with the same clientKey returns the same message and writes no second row; a divergent payload conflicts", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-team-2");
		await seedHuman(db, "sm-recipient-2", "sm-team-2");
		const first = await call<{ message: { id: string }; thread: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{
				recipients: ["sm-recipient-2"],
				text: "one",
				clientKey: "sm-idem-key-1",
			},
		);
		expect(first.status).toBe(200);
		const threadId = first.body.data?.thread.id as string;
		const messageId = first.body.data?.message.id as string;

		const again = await call<{ message: { id: string } }>(actions, db, eventBus, "send_message", {
			threadId,
			text: "one",
			clientKey: "sm-idem-key-1",
		});
		expect(again.status).toBe(200);
		expect(again.body.data?.message.id).toBe(messageId);
		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(1);

		const divergent = await call(actions, db, eventBus, "send_message", {
			threadId,
			text: "different text",
			clientKey: "sm-idem-key-1",
		});
		expect(divergent.status).toBe(422);
		expect(divergent.body.problems?.[0]?.code).toBe("idempotency_conflict");
	});

	test("a messageId overwrites and writes a message row whose before carries the old payload", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-team-3");
		await seedHuman(db, "sm-recipient-3", "sm-team-3");
		const created = await call<{ message: { id: string }; thread: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{
				recipients: ["sm-recipient-3"],
				text: "original",
			},
		);
		const threadId = created.body.data?.thread.id as string;
		const messageId = created.body.data?.message.id as string;

		const overwritten = await call(actions, db, eventBus, "send_message", {
			threadId,
			messageId,
			text: "edited",
		});
		expect(overwritten.status).toBe(200);

		const rows = await readChanges(db, threadId);
		const messageRow = rows.find((r) => r.kind === "message" && r.before !== null);
		expect(messageRow).toBeDefined();
		const before = JSON.parse(messageRow?.before as string) as { payload: { text: string } };
		expect(before.payload.text).toBe("original");

		// the change row's after.clientKey is the message's OWN stored key —
		// an overwrite must never mint a fresh one just to fill this field.
		const [storedMessage] = await db.select().from(messages).where(eq(messages.id, messageId));
		const after = JSON.parse(messageRow?.after as string) as { clientKey: string };
		expect(after.clientKey).toBe(storedMessage?.clientKey);
	});
});

describe("send_message — verdict trio and races", () => {
	test("a verdict from a non-human returns verdict_not_human", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-vt-1");
		await seedAgent(db, "sm-agent-vt1", "sm-vt-1");
		const threadId = await seedTaskWithThread(db, "sm-vt1-task", "sm-vt-1");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["sm-agent-vt1"]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId, review: { title: "r1", reasoning: ["because"] } },
			"sm-agent-vt1",
		);
		expect(review.status).toBe(200);
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId, verdict: { decision: "approve", resolvesMessageId: reviewMessageId } },
			"sm-agent-vt1",
		);
		expect(verdict.status).toBe(422);
		expect((verdict.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("verdict_not_human");
	});

	test("a verdict from the review's own author returns verdict_self", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-vt-2");
		const threadId = await seedTaskWithThread(db, "sm-vt2-task", "sm-vt-2");
		await db
			.update(threads)
			.set({ participants: JSON.stringify([FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(actions, db, eventBus, "send_message", {
			threadId,
			review: { title: "r2", reasoning: ["because"] },
		});
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(actions, db, eventBus, "send_message", {
			threadId,
			verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
		});
		expect(verdict.status).toBe(422);
		expect((verdict.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("verdict_self");
	});

	test("naming a review in another thread returns verdict_foreign_review", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-vt-3");
		await seedAgent(db, "sm-agent-vt3", "sm-vt-3");
		const threadA = await seedTaskWithThread(db, "sm-vt3-task-a", "sm-vt-3");
		const threadB = await seedTaskWithThread(db, "sm-vt3-task-b", "sm-vt-3");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["sm-agent-vt3"]) })
			.where(eq(threads.id, threadA));
		await db
			.update(threads)
			.set({ participants: JSON.stringify([FOUNDER_ID]) })
			.where(eq(threads.id, threadB));

		const review = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId: threadA, review: { title: "r3", reasoning: ["because"] } },
			"sm-agent-vt3",
		);
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(actions, db, eventBus, "send_message", {
			threadId: threadB,
			verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
		});
		expect(verdict.status).toBe(422);
		expect((verdict.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe(
			"verdict_foreign_review",
		);
	});

	test("a second concurrent verdict returns verdict_race", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-vt-4");
		await seedAgent(db, "sm-agent-vt4", "sm-vt-4");
		await seedHuman(db, "sm-human-vt4", "sm-vt-4");
		const threadId = await seedTaskWithThread(db, "sm-vt4-task", "sm-vt-4");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["sm-agent-vt4", FOUNDER_ID, "sm-human-vt4"]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId, review: { title: "r4", reasoning: ["because"] } },
			"sm-agent-vt4",
		);
		const reviewMessageId = review.body.data?.message.id as string;

		const [first, second] = await Promise.all([
			call(actions, db, eventBus, "send_message", {
				threadId,
				verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
			}),
			call(
				actions,
				db,
				eventBus,
				"send_message",
				{
					threadId,
					verdict: { decision: "reject", resolvesMessageId: reviewMessageId, note: "Not yet." },
				},
				"sm-human-vt4",
			),
		]);
		const results = [first, second];
		const oks = results.filter((r) => r.status === 200);
		const races = results.filter(
			(r) =>
				r.status === 422 &&
				(r.body as ActionEnvelope<unknown>).problems?.[0]?.code === "verdict_race",
		);
		expect(oks).toHaveLength(1);
		expect(races).toHaveLength(1);
	});
});

describe("send_message — answering a question, approving or rejecting a review", () => {
	/** An agent asks in a task thread from its session; the founder is the other member. */
	async function seedAsk(db: HyperIdleDb, suffix: string) {
		const reviewVerdictRecorder = vi.fn(
			async (): Promise<ReviewVerdictOutcome> => ({ status: "queued" }),
		);
		const linkReviewToSession = vi.fn(async () => {});
		const agentWorkIntentRecorder = vi.fn(async () => ({ id: "intent", idempotencyKey: "key" }));
		const actions = createThreadActions(
			threadDeps({ reviewVerdictRecorder, linkReviewToSession, agentWorkIntentRecorder }),
		);
		const eventBus = new EventBus();
		const teamId = `sm-ans-${suffix}`;
		const agentId = `sm-agent-ans-${suffix}`;
		await seedTeam(db, teamId);
		await seedAgent(db, agentId, teamId);
		const threadId = await seedTaskWithThread(db, `sm-ans-task-${suffix}`, teamId);
		await db
			.update(threads)
			.set({ participants: JSON.stringify([agentId, FOUNDER_ID]) })
			.where(eq(threads.id, threadId));
		const ask = async (body: Record<string, unknown>): Promise<string> => {
			const result = await actionFor<Record<string, unknown>, { message: { id: string } }>(
				actions,
				"send_message",
			).run(
				ctxFor(db, agentId, {
					eventBus,
					caller: { sessionId: `sess-${suffix}`, taskId: `sm-ans-task-${suffix}`, threadId },
				}),
				{ threadId, ...body },
			);
			if (!result.ok) throw new Error(JSON.stringify(result.problems));
			return result.data.message.id;
		};
		const reply = (body: Record<string, unknown>) =>
			call(actions, db, eventBus, "send_message", { threadId, ...body });
		const resolvedAt = async (id: string) =>
			(await db.select().from(messages).where(eq(messages.id, id)))[0]?.resolvedAt ?? null;
		return {
			ask,
			reply,
			resolvedAt,
			reviewVerdictRecorder,
			linkReviewToSession,
			agentWorkIntentRecorder,
			agentId,
		};
	}

	const billing = {
		title: "Billing",
		question: "Monthly or yearly?",
		options: ["Monthly", "Yearly"],
	};

	test("picking one of the question's options resolves it and hands the pick to the agent's session", async ({
		db,
	}) => {
		const { ask, reply, resolvedAt, reviewVerdictRecorder, linkReviewToSession } = await seedAsk(
			db,
			"1",
		);
		const questionId = await ask({ questionnaire: billing });
		expect(linkReviewToSession).toHaveBeenCalledWith("sess-1", questionId);

		const answered = await reply({ answer: { resolvesMessageId: questionId, option: "Yearly" } });

		expect(answered.status).toBe(200);
		expect(await resolvedAt(questionId)).not.toBeNull();
		expect(reviewVerdictRecorder).toHaveBeenCalledWith(
			expect.objectContaining({
				reviewMessageId: questionId,
				decision: "answer",
				answer: { option: "Yearly" },
			}),
		);
	});

	test("a reject the asking session takes back does not also start a second run of that agent", async ({
		db,
	}) => {
		const { ask, reply, reviewVerdictRecorder, agentWorkIntentRecorder } = await seedAsk(db, "w");
		const reviewId = await ask({ review: { title: "Ship it?", reasoning: ["tests pass"] } });
		agentWorkIntentRecorder.mockClear();

		const rejected = await reply({
			verdict: { decision: "reject", resolvesMessageId: reviewId, note: "One more round." },
		});

		expect(rejected.status).toBe(200);
		expect(reviewVerdictRecorder).toHaveBeenCalledOnce();
		expect(agentWorkIntentRecorder).not.toHaveBeenCalled();
	});

	test("naming an option the question does not have is refused and leaves it open", async ({
		db,
	}) => {
		const { ask, reply, resolvedAt } = await seedAsk(db, "2");
		const questionId = await ask({ questionnaire: billing });

		const answered = await reply({ answer: { resolvesMessageId: questionId, option: "Weekly" } });

		expect(answered.status).toBe(422);
		expect(answered.body.problems?.[0]?.code).toBe("answer_unknown_option");
		expect(await resolvedAt(questionId)).toBeNull();
	});

	test("a reject with no reason is refused and leaves the review open", async ({ db }) => {
		const { ask, reply, resolvedAt } = await seedAsk(db, "3");
		const reviewId = await ask({ review: { title: "Ship it?", reasoning: ["tests pass"] } });

		const rejected = await reply({ verdict: { decision: "reject", resolvesMessageId: reviewId } });

		expect(rejected.status).toBe(422);
		expect(rejected.body.problems?.[0]?.code).toBe("reject_needs_reason");
		expect(await resolvedAt(reviewId)).toBeNull();
	});

	test("a reject with a reason resolves the review and hands the reason to the agent's session", async ({
		db,
	}) => {
		const { ask, reply, resolvedAt, reviewVerdictRecorder } = await seedAsk(db, "4");
		const reviewId = await ask({ review: { title: "Ship it?", reasoning: ["tests pass"] } });

		const rejected = await reply({
			verdict: { decision: "reject", resolvesMessageId: reviewId, note: "Wrong table." },
		});

		expect(rejected.status).toBe(200);
		expect(await resolvedAt(reviewId)).not.toBeNull();
		expect(reviewVerdictRecorder).toHaveBeenCalledWith(
			expect.objectContaining({
				reviewMessageId: reviewId,
				decision: "decline",
				note: "Wrong table.",
			}),
		);
	});

	const explainer = {
		title: "Trial-end explainer",
		reasoning: ["The page says the date and the amount."],
		parts: [
			{
				id: "mail",
				kind: "text",
				label: "Email",
				title: "Three-day warning",
				body: "Your trial ends on 1 September.",
			},
		],
	};

	test("a comment pinned to a review's part is kept with its pin; one pinned past the part is refused", async ({
		db,
	}) => {
		const { ask, reply } = await seedAsk(db, "6");
		const reviewId = await ask({ review: explainer });
		const pin = { id: "c1", review: reviewId, part: "mail", label: "1 September" };

		const fits = await reply({
			text: "Both dates?",
			anchor: { ...pin, spot: { kind: "range", start: 19, end: 30 } },
		});
		const past = await reply({
			text: "And this?",
			anchor: { ...pin, spot: { kind: "range", start: 19, end: 99 } },
		});
		const elsewhere = await reply({ text: "Here?", anchor: { ...pin, review: "no-such-review" } });

		expect(fits.status).toBe(200);
		expect(past.body.problems?.map((p) => p.code)).toEqual(["pin_range_outside"]);
		expect(elsewhere.body.problems?.map((p) => p.code)).toEqual(["anchor_review_unknown"]);
		const stored = await db.select().from(messages).where(eq(messages.type, "plain"));
		expect(stored.map((m) => JSON.parse(m.payload).anchor)).toEqual([
			{ ...pin, spot: { kind: "range", start: 19, end: 30 } },
		]);
	});

	test("a second round names the review it retries, which must be a review in the same thread", async ({
		db,
	}) => {
		const { ask, reply } = await seedAsk(db, "7");
		const round1 = await ask({ review: explainer });
		await reply({ verdict: { decision: "reject", resolvesMessageId: round1, note: "Email too." } });

		const round2 = await ask({
			review: { ...explainer, previousReviewId: round1, changed: ["New: the email"] },
		});
		const notAReview = ask({ review: { ...explainer, previousReviewId: "missing" } });

		const [stored] = await db.select().from(messages).where(eq(messages.id, round2));
		expect(JSON.parse(stored?.payload ?? "{}").previousReviewId).toBe(round1);
		await expect(notAReview).rejects.toThrow(/previous_review_unknown/);
	});

	test("a verdict cannot resolve a question", async ({ db }) => {
		const { ask, reply, resolvedAt } = await seedAsk(db, "5");
		const questionId = await ask({ questionnaire: billing });

		const verdict = await reply({
			verdict: { decision: "approve", resolvesMessageId: questionId },
		});

		expect(verdict.status).toBe(422);
		expect(verdict.body.problems?.[0]?.code).toBe("verdict_not_review");
		expect(await resolvedAt(questionId)).toBeNull();
	});
});

describe("send_message — direct thread find-or-create", () => {
	test("two sends from the same sender to the same single recipient return the same thread.id and the thread holds both messages", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-1");
		await seedHuman(db, "b3-recipient-1", "b3-1");

		const first = await call<{ thread: { id: string } }>(actions, db, eventBus, "send_message", {
			recipients: ["b3-recipient-1"],
			text: "first",
		});
		expect(first.status).toBe(200);
		const threadId = first.body.data?.thread.id as string;

		const second = await call<{ thread: { id: string } }>(actions, db, eventBus, "send_message", {
			recipients: ["b3-recipient-1"],
			text: "second",
		});
		expect(second.status).toBe(200);
		expect(second.body.data?.thread.id).toBe(threadId);

		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(2);
	});

	test("two simultaneous first sends to the same recipient land in one thread, not an error", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-race-1");
		await seedHuman(db, "b3-race-recipient-1", "b3-race-1");

		const [first, second] = await Promise.all([
			call<{ thread: { id: string } }>(actions, db, eventBus, "send_message", {
				recipients: ["b3-race-recipient-1"],
				text: "racer one",
			}),
			call<{ thread: { id: string } }>(actions, db, eventBus, "send_message", {
				recipients: ["b3-race-recipient-1"],
				text: "racer two",
			}),
		]);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		const threadId = first.body.data?.thread.id;
		expect(threadId).toBeTruthy();
		expect(second.body.data?.thread.id).toBe(threadId);

		const rows = await db
			.select()
			.from(threads)
			.where(eq(threads.directKey, `${["b3-race-recipient-1", FOUNDER_ID].sort().join(":")}:user`));
		expect(rows).toHaveLength(1);
		const messageRows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId as string));
		expect(messageRows).toHaveLength(2);
	});

	test("the agent no-calling-thread fallback sent twice lands in one thread", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-2");
		await seedAgent(db, "b3-agent-2", "b3-2");
		await seedHuman(db, "b3-human-2", "b3-2");
		const run = runnerFor<SendMessageInput, { thread: { id: string } }>(actions, "send_message");

		const first = await run(
			{
				actor: "b3-agent-2",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "b3-sess-2a", taskId: null, threadId: null },
			},
			{ text: "first fallback" },
		);
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const second = await run(
			{
				actor: "b3-agent-2",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "b3-sess-2b", taskId: null, threadId: null },
			},
			{ text: "second fallback" },
		);
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.data.thread.id).toBe(first.data.thread.id);
	});

	test("A sending to B then B sending to A reuse the same thread", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-3");
		await seedHuman(db, "b3-a", "b3-3");
		await seedHuman(db, "b3-b", "b3-3");

		const aToB = await call<{ thread: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["b3-b"], text: "hi from a" },
			"b3-a",
		);
		expect(aToB.status).toBe(200);

		const bToA = await call<{ thread: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["b3-a"], text: "hi from b" },
			"b3-b",
		);
		expect(bToA.status).toBe(200);
		expect(bToA.body.data?.thread.id).toBe(aToB.body.data?.thread.id);
	});

	test("an agent sending to a human first hosts the thread on the agent, not whoever is named recipients", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-4");
		await seedAgent(db, "b3-agent-4", "b3-4");
		await seedHuman(db, "b3-human-4", "b3-4");

		const res = await call<{ thread: { id: string; hostKind: string; hostId: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["b3-human-4"], text: "hi from the agent" },
			"b3-agent-4",
		);
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("agent");
		expect(res.body.data?.thread.hostId).toBe("b3-agent-4");
	});

	test("a human sending to an agent first, then the same agent replying, land in the same agent-hosted thread", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-5");
		await seedAgent(db, "b3-agent-5", "b3-5");
		await seedHuman(db, "b3-human-5", "b3-5");

		const humanFirst = await call<{ thread: { id: string; hostKind: string; hostId: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["b3-agent-5"], text: "hi from the human" },
			"b3-human-5",
		);
		expect(humanFirst.status).toBe(200);
		expect(humanFirst.body.data?.thread.hostKind).toBe("agent");
		expect(humanFirst.body.data?.thread.hostId).toBe("b3-agent-5");

		const agentReply = await call<{ thread: { id: string; hostKind: string; hostId: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["b3-human-5"], text: "reply from the agent" },
			"b3-agent-5",
		);
		expect(agentReply.status).toBe(200);
		expect(agentReply.body.data?.thread.id).toBe(humanFirst.body.data?.thread.id);
		expect(agentReply.body.data?.thread.hostKind).toBe("agent");
		expect(agentReply.body.data?.thread.hostId).toBe("b3-agent-5");
	});

	test("the agent no-calling-thread fallback hosts the thread on the agent, and a human's first send to that same agent finds it", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "b3-6");
		await seedAgent(db, "b3-agent-6", "b3-6");
		await seedHuman(db, "b3-human-6", "b3-6");
		const run = runnerFor<
			SendMessageInput,
			{ thread: { id: string; hostKind: string; hostId: string } }
		>(actions, "send_message");

		const fallback = await run(
			{
				actor: "b3-agent-6",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "b3-sess-6", taskId: null, threadId: null },
			},
			{ text: "fallback reply" },
		);
		expect(fallback.ok).toBe(true);
		if (!fallback.ok) return;
		expect(fallback.data.thread.hostKind).toBe("agent");
		expect(fallback.data.thread.hostId).toBe("b3-agent-6");

		const humanSend = await call<{ thread: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["b3-agent-6"], text: "hi, replying to the fallback" },
			"b3-human-6",
		);
		expect(humanSend.status).toBe(200);
		expect(humanSend.body.data?.thread.id).toBe(fallback.data.thread.id);
	});
});

describe("open_thread — computedTitle reads real ownership", () => {
	test("a direct thread between the owner and their own agent titles 'Assistant' for the owner, and the agent's own name for someone else it also DMs", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "tw-1");
		await seedHuman(db, "tw-owner-1", "tw-1");
		await seedHuman(db, "tw-other-1", "tw-1");
		const now = new Date().toISOString();
		// An owned agent, in one of its owner's teams.
		await db.insert(users).values({
			id: "tw-agent-1",
			kind: "ai",
			name: "tw-agent-1",
			role: "builder",
			status: "active",
			ownerUserId: "tw-owner-1",
			createdAt: now,
		});
		await db.insert(userTeams).values({ userId: "tw-agent-1", teamId: "tw-1" });

		// Production shape: a direct thread between a human and their own agent
		// is hosted by the AGENT party (thread-actions.ts's single-agent
		// branch), never `hostKind:"user"` — go through the real `send_message`
		// action rather than hand-inserting a shape production no longer makes.
		const ownerSend = await call<{ thread: { id: string; hostKind: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["tw-agent-1"], text: "hi" },
			"tw-owner-1",
		);
		expect(ownerSend.status).toBe(200);
		expect(ownerSend.body.data?.thread.hostKind).toBe("agent");
		const ownerThreadId = ownerSend.body.data?.thread.id;
		if (ownerThreadId === undefined) throw new Error("send_message did not return a thread id");

		const otherSend = await call<{ thread: { id: string; hostKind: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: ["tw-agent-1"], text: "hi from someone else" },
			"tw-other-1",
		);
		expect(otherSend.status).toBe(200);
		expect(otherSend.body.data?.thread.hostKind).toBe("agent");
		const otherThreadId = otherSend.body.data?.thread.id;
		if (otherThreadId === undefined) throw new Error("send_message did not return a thread id");

		const asOwner = await call<ThreadView>(
			actions,
			db,
			eventBus,
			"open_thread",
			{ id: ownerThreadId },
			"tw-owner-1",
		);
		expect(asOwner.status).toBe(200);
		expect(asOwner.body.data?.thread.computedTitle).toBe("Assistant");

		const asOther = await call<ThreadView>(
			actions,
			db,
			eventBus,
			"open_thread",
			{ id: otherThreadId },
			"tw-other-1",
		);
		expect(asOther.status).toBe(200);
		expect(asOther.body.data?.thread.computedTitle).toBe("tw-agent-1");
	});
});

describe("adjust_thread", () => {
	test("with no id, creates a thread with the actor as its only member and host {user, actor}", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-0");
		const res = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {});
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("user");
		expect(res.body.data?.thread.hostId).toBe(FOUNDER_ID);
		expect(res.body.data?.members.map((m) => m.id)).toEqual([FOUNDER_ID]);
	});

	test("deleted:true hides the thread from search and makes open_thread return not_found; false restores it", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-1");
		await seedThreadRow(db, "at-thread-1", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		const del = await call(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-1",
			deleted: true,
		});
		expect(del.status).toBe(200);
		const searched = await call<unknown[]>(actions, db, eventBus, "search_threads", {
			ids: ["at-thread-1"],
		});
		expect(searched.body.data).toEqual([]);
		const opened = await call(actions, db, eventBus, "open_thread", { id: "at-thread-1" });
		expect(opened.status).toBe(422);

		const restored = await call(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-1",
			deleted: false,
		});
		expect(restored.status).toBe(200);
		const reopened = await call(actions, db, eventBus, "open_thread", { id: "at-thread-1" });
		expect(reopened.status).toBe(200);
	});

	test("a stored title wins over the computed one; title:null restores the fallback", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-2");
		await seedThreadRow(db, "at-thread-2", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		const withTitle = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-2",
			title: "My custom title",
		});
		expect(withTitle.body.data?.thread.title).toBe("My custom title");

		const cleared = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-2",
			title: null,
		});
		expect(cleared.body.data?.thread.title).toBeNull();
		expect(cleared.body.data?.thread.computedTitle).not.toBe("My custom title");
	});

	test("open_thread and adjust_thread's create-empty write no message rows", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-3");
		const before = await db.select().from(messages);
		const res = await call(actions, db, eventBus, "adjust_thread", {});
		expect(res.status).toBe(200);
		const after = await db.select().from(messages);
		expect(after).toHaveLength(before.length);
	});

	test("members is a full replacement — removing and adding in one call; a non-member cannot use it to add themselves", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-4");
		await seedHuman(db, "at-member-a", "at-4");
		await seedHuman(db, "at-member-b", "at-4");
		await seedHuman(db, "at-stranger", "at-4");
		await seedThreadRow(db, "at-thread-4", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, "at-member-a"],
		});

		const replaced = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-4",
			members: [FOUNDER_ID, "at-member-b"],
		});
		expect(replaced.status).toBe(200);
		expect((replaced.body.data?.members.map((m) => m.id) ?? []).sort()).toEqual(
			[FOUNDER_ID, "at-member-b"].sort(),
		);
		const membersAfterReplace = await readThreadMembers(db, "at-thread-4");
		expect(membersAfterReplace).not.toContain("at-member-a");

		const refused = await call(
			actions,
			db,
			eventBus,
			"adjust_thread",
			{ id: "at-thread-4", members: [FOUNDER_ID, "at-member-b", "at-stranger"] },
			"at-stranger",
		);
		expect(refused.status).toBe(422);
		expect((refused.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("not_a_member");
		const membersAfterRefusal = await readThreadMembers(db, "at-thread-4");
		expect(membersAfterRefusal).not.toContain("at-stranger");
	});

	test("pinned toggles and appends a changed row naming it", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-5");
		await seedThreadRow(db, "at-thread-5", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		const pinned = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-5",
			pinned: true,
		});
		expect(pinned.status).toBe(200);
		expect(pinned.body.data?.thread.pinned).toBe(true);

		const unpinned = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-5",
			pinned: false,
		});
		expect(unpinned.status).toBe(200);
		expect(unpinned.body.data?.thread.pinned).toBe(false);

		const rows = await readChanges(db, "at-thread-5");
		expect(rows.filter((r) => r.kind === "changed" && r.after.includes('"pinned"'))).toHaveLength(
			2,
		);
	});

	test("resolved:true resolves the thread; resolved:false reopens it", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "at-6");
		await seedThreadRow(db, "at-thread-6", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		const resolved = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-6",
			resolved: true,
		});
		expect(resolved.status).toBe(200);
		expect(resolved.body.data?.thread.resolvedAt).not.toBeNull();

		const reopened = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			id: "at-thread-6",
			resolved: false,
		});
		expect(reopened.status).toBe(200);
		expect(reopened.body.data?.thread.resolvedAt).toBeNull();
	});
});

describe("search_threads", () => {
	test("mine returns only threads the actor is in, each saying what it waits on from the actor and whether its newest message names them", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "st-1");
		await seedHuman(db, "st-outsider-1", "st-1");
		await seedAgent(db, "st-agent-1", "st-1");
		const mineWith = (id: string, other: string) =>
			seedThreadRow(db, id, {
				hostKind: "user",
				hostId: FOUNDER_ID,
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID, other],
			});
		await mineWith("st-review-1", "st-agent-1");
		await mineWith("st-asked-1", "st-agent-1");
		await mineWith("st-mention-1", "st-outsider-1");
		await mineWith("st-theirs-1", "st-agent-1");
		await seedThreadRow(db, "st-not-mine-1", {
			hostKind: "user",
			hostId: "st-outsider-1",
			initiatorId: "st-outsider-1",
			members: ["st-outsider-1"],
		});

		await call(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId: "st-review-1", review: { title: "open review", reasoning: ["x"] } },
			"st-agent-1",
		);
		const resolvedReview = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId: "st-review-1", review: { title: "resolved review", reasoning: ["y"] } },
			"st-agent-1",
		);
		await call(actions, db, eventBus, "send_message", {
			threadId: "st-review-1",
			verdict: {
				decision: "approve",
				resolvesMessageId: resolvedReview.body.data?.message.id as string,
			},
		});
		await call(
			actions,
			db,
			eventBus,
			"send_message",
			{
				threadId: "st-asked-1",
				questionnaire: { title: "Which?", question: "Which one?", options: ["A", "B"] },
			},
			"st-agent-1",
		);
		await call(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId: "st-mention-1", text: "@Founder can you read this?" },
			"st-outsider-1",
		);
		await call(
			actions,
			db,
			eventBus,
			"send_message",
			{
				threadId: "st-theirs-1",
				review: { title: "theirs", reasoning: ["z"], reviewer: "st-outsider-1" },
			},
			"st-agent-1",
		);

		const res = await call<
			Array<{ id: string; need: string | null; lastSenderId: string | null; mentionsYou: boolean }>
		>(actions, db, eventBus, "search_threads", { mine: true });
		expect(res.status).toBe(200);
		const byId = new Map(res.body.data?.map((r) => [r.id, r]));
		expect([...byId.keys()].sort()).toEqual([
			"st-asked-1",
			"st-mention-1",
			"st-review-1",
			"st-theirs-1",
		]);
		// The approval could not reach a session here, so the agent's notice is the newest message.
		expect(byId.get("st-review-1")).toMatchObject({
			need: "review",
			lastSenderId: "st-agent-1",
			mentionsYou: false,
		});
		expect(byId.get("st-asked-1")).toMatchObject({ need: "stuck", lastSenderId: "st-agent-1" });
		expect(byId.get("st-mention-1")).toMatchObject({
			need: null,
			lastSenderId: "st-outsider-1",
			mentionsYou: true,
		});
		expect(byId.get("st-theirs-1")).toMatchObject({ need: null });
	});

	test("member lists another user's threads that you can read, each saying what it waits on from them", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "sm-1");
		await seedHuman(db, "sm-maya", "sm-1");
		await seedAgent(db, "sm-agent", "sm-1");
		await seedThreadRow(db, "sm-team", {
			hostKind: "team",
			hostId: "sm-1",
			initiatorId: "sm-agent",
			members: ["sm-agent", "sm-maya"],
		});
		await seedThreadRow(db, "sm-direct", {
			hostKind: "agent",
			hostId: "sm-agent",
			initiatorId: "sm-agent",
			members: ["sm-agent", "sm-maya"],
		});
		for (const threadId of ["sm-team", "sm-direct"])
			await call(
				actions,
				db,
				eventBus,
				"send_message",
				{ threadId, review: { title: "Refund wording", reasoning: ["x"], reviewer: "sm-maya" } },
				"sm-agent",
			);

		const res = await call<Array<{ id: string; need: string | null }>>(
			actions,
			db,
			eventBus,
			"search_threads",
			{ member: "sm-maya" },
		);
		expect(res.body.data?.map((r) => [r.id, r.need])).toEqual([["sm-team", "review"]]);
	});

	test("an empty input ({}) takes the same mine branch as {mine:true} — the sentence's own promise", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "st-2");
		await seedHuman(db, "st-outsider-2", "st-2");
		await seedThreadRow(db, "st-mine-2", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		await seedThreadRow(db, "st-not-mine-2", {
			hostKind: "user",
			hostId: "st-outsider-2",
			initiatorId: "st-outsider-2",
			members: ["st-outsider-2"],
		});

		const res = await call<Array<{ id: string }>>(actions, db, eventBus, "search_threads", {});
		expect(res.status).toBe(200);
		const ids = res.body.data?.map((r) => r.id) ?? [];
		expect(ids).toContain("st-mine-2");
		expect(ids).not.toContain("st-not-mine-2");
	});

	test("lastMessagePreview is batched, not one query per thread, and is null for a thread with no messages", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "st-3");
		await seedThreadRow(db, "st-preview-a", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		await seedThreadRow(db, "st-preview-b", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		await seedThreadRow(db, "st-preview-c", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		await call(actions, db, eventBus, "send_message", {
			threadId: "st-preview-a",
			text: "a first",
		});
		await call(actions, db, eventBus, "send_message", {
			threadId: "st-preview-a",
			text: "a latest",
		});
		await call(actions, db, eventBus, "send_message", { threadId: "st-preview-b", text: "b only" });
		await seedThreadRow(db, "st-preview-d", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		await db.insert(messages).values({
			id: "st-preview-d-answer",
			senderId: FOUNDER_ID,
			threadId: "st-preview-d",
			type: "answer",
			payload: JSON.stringify({ resolvesMessageId: "asked", option: "B" }),
			clientKey: "st-preview-d-answer",
			createdAt: new Date().toISOString(),
		});
		for (const [id, verdict] of [
			["st-preview-e", { decision: "approve", resolvesMessageId: "r" }],
			["st-preview-f", { decision: "reject", resolvesMessageId: "r", note: "Email too." }],
		] as const) {
			await seedThreadRow(db, id, {
				hostKind: "user",
				hostId: FOUNDER_ID,
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID],
			});
			await db.insert(messages).values({
				id: `${id}-verdict`,
				senderId: FOUNDER_ID,
				threadId: id,
				type: "verdict",
				payload: JSON.stringify(verdict),
				clientKey: `${id}-verdict`,
				createdAt: new Date().toISOString(),
			});
		}
		// st-preview-c gets no message at all.

		const res = await call<Array<{ id: string; lastMessagePreview: string | null }>>(
			actions,
			db,
			eventBus,
			"search_threads",
			{
				ids: [
					"st-preview-a",
					"st-preview-b",
					"st-preview-c",
					"st-preview-d",
					"st-preview-e",
					"st-preview-f",
				],
			},
		);
		expect(res.status).toBe(200);
		const byId = new Map(res.body.data?.map((r) => [r.id, r.lastMessagePreview]));
		expect(byId.get("st-preview-a")).toBe("a latest");
		expect(byId.get("st-preview-b")).toBe("b only");
		expect(byId.get("st-preview-c")).toBeNull();
		expect(byId.get("st-preview-d")).toBe("B");
		expect(byId.get("st-preview-e")).toBe("Approved");
		expect(byId.get("st-preview-f")).toBe("Rejected: Email too.");
	});

	test("text matches message content across threads the actor can read, and canReadThread still filters a DM they are not in", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		// `searchConversations` (message-content matches) is already gated by a
		// participant-probe in its own SQL, so it can only ever return threads
		// the actor is in. `searchThreadsByTitle` carries no such probe — it is
		// the `readable = rows.filter(canReadThread...)` step afterwards that
		// does the actual access control, and this proves it: a stored-title
		// match on a host-scoped thread the actor never joined still comes
		// back (any signed-in principal may read a team-hosted thread), while
		// the same match on a user-hosted DM the actor is not a member of does
		// not.
		await seedTeam(db, "st-4");
		await seedHuman(db, "st-text-outsider", "st-4");
		await seedThreadRow(db, "st-text-mine", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
			title: "Zylophone Ops",
		});
		await seedThreadRow(db, "st-text-stranger-dm", {
			hostKind: "user",
			hostId: "st-text-outsider",
			initiatorId: "st-text-outsider",
			members: ["st-text-outsider"],
			title: "Zylophone Secret",
		});
		await seedThreadRow(db, "st-text-team", {
			hostKind: "team",
			hostId: "st-4",
			initiatorId: "system:propagation",
			members: [],
			title: "Zylophone Team Channel",
		});

		const res = await call<Array<{ id: string }>>(actions, db, eventBus, "search_threads", {
			text: "Zylophone",
		});
		expect(res.status).toBe(200);
		const ids = res.body.data?.map((r) => r.id) ?? [];
		expect(ids).toContain("st-text-mine");
		expect(ids).toContain("st-text-team");
		expect(ids).not.toContain("st-text-stranger-dm");
	});
});

describe("send_message / adjust_thread — object events fire from the change rows", () => {
	test("thread.created, thread.message, thread.changed fire from send_message's own appended rows", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "lb-1");
		await seedAgent(db, "lb-agent-1", "lb-1");

		const seen: ObjectChangeEvent[] = [];
		const handler = (event: ObjectChangeEvent) => seen.push(event);
		const unsubscribers = [
			eventBus.on("thread.created", handler),
			eventBus.on("thread.message", handler),
			eventBus.on("thread.changed", handler),
		];

		const created = await call<{ message: { id: string }; thread: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ recipients: [FOUNDER_ID], review: { title: "will be resolved", reasoning: ["x"] } },
			"lb-agent-1",
		);
		const threadId = created.body.data?.thread.id as string;
		const reviewMessageId = created.body.data?.message.id as string;
		await call(actions, db, eventBus, "send_message", {
			threadId,
			verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
		});
		await call(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId, review: { title: "reopens it", reasoning: ["y"] } },
			"lb-agent-1",
		);

		const types = seen.map((e) => e.type);
		expect(types).toContain("thread.created");
		expect(types).toContain("thread.message");
		expect(types).toContain("thread.changed");
		expect(seen.every((e) => e.change.objectId === threadId)).toBe(true);
		expect(seen.every((e) => e.change.object === "thread")).toBe(true);
		for (const unsubscribe of unsubscribers) unsubscribe();
	});

	test("adjust_thread's own create and edit each fire their own object event", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "lb-2");

		const seen: ObjectChangeEvent[] = [];
		const unsubCreated = eventBus.on("thread.created", (e) => seen.push(e));
		const unsubChanged = eventBus.on("thread.changed", (e) => seen.push(e));

		const created = await call<ThreadView>(actions, db, eventBus, "adjust_thread", {
			title: "New thread",
		});
		const threadId = created.body.data?.thread.id as string;

		await call(actions, db, eventBus, "adjust_thread", { id: threadId, pinned: true });

		unsubCreated();
		unsubChanged();

		const createdEvent = seen.find((e) => e.type === "thread.created");
		const changedEvent = seen.find((e) => e.type === "thread.changed");
		expect(createdEvent?.change.objectId).toBe(threadId);
		expect(changedEvent?.change.objectId).toBe(threadId);
		expect(changedEvent?.change.after).toMatchObject({ pinned: true });
	});
});

describe("comments on a document's text, and the changes they propose", () => {
	const BODY = "Trials run 14 days.\n\n- Most cancellations happen on day 13.";
	const doc: DocumentRow = {
		id: "doc-c-1",
		title: "Should trials be 10 days?",
		body: BODY,
		format: "markdown",
		status: "proposed",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "cm-team",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: FOUNDER_ID,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		discipline: null,
		icon: null,
		as: "document",
	};
	const start = BODY.indexOf("day 13");
	const pin = {
		id: "c1",
		part: "doc-c-1",
		label: "day 13",
		spot: { kind: "range", start, end: start + 6 },
	} as const;

	async function seedDocThread(db: HyperIdleDb) {
		const actions = createThreadActions(
			threadDeps({ searchDocuments: async () => ({ ok: true, data: [doc] }) }),
		);
		const eventBus = new EventBus();
		await seedTeam(db, "cm-team");
		await seedHuman(db, "cm-other", "cm-team");
		await seedThreadRow(db, "cm-thread", {
			hostKind: "document",
			hostId: doc.id,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		const as = (actor: string) => (name: string, body: Record<string, unknown>) =>
			call<{ message: { id: string } }>(actions, db, eventBus, name, body, actor);
		const stored = async (id: string) => {
			const [row] = await db.select().from(messages).where(eq(messages.id, id));
			return { resolvedAt: row?.resolvedAt ?? null, payload: JSON.parse(row?.payload ?? "{}") };
		};
		return { you: as(FOUNDER_ID), other: as("cm-other"), stored };
	}

	test("a comment points at a stretch of the document's text; one past its end is refused", async ({
		db,
	}) => {
		const { you, stored } = await seedDocThread(db);

		const fits = await you("send_message", { threadId: "cm-thread", text: "Why?", anchor: pin });
		const past = await you("send_message", {
			threadId: "cm-thread",
			text: "And here?",
			anchor: { ...pin, spot: { kind: "range", start, end: 999 } },
		});

		expect(past.body.problems?.map((p) => p.code)).toEqual(["pin_range_outside"]);
		const id = fits.body.data?.message.id ?? "";
		expect((await stored(id)).payload.anchor).toEqual(pin);
	});

	test("a proposed change is applied once, by anyone, and says who applied it", async ({ db }) => {
		const { you, other, stored } = await seedDocThread(db);
		const sent = await you("send_message", {
			threadId: "cm-thread",
			text: "",
			anchor: pin,
			change: { from: "day 13", to: "day 13, and 1 in 5 decide on days 11–14" },
		});
		const id = sent.body.data?.message.id ?? "";

		const applied = await other("adjust_thread", {
			id: "cm-thread",
			message: { id, change: "applied" },
		});
		const again = await you("adjust_thread", {
			id: "cm-thread",
			message: { id, change: "dismissed" },
		});

		expect(applied.status).toBe(200);
		expect(again.body.problems?.map((p) => p.code)).toEqual(["change_settled"]);
		const { payload } = await stored(id);
		expect(payload.change.settled).toMatchObject({ state: "applied", by: "cm-other" });
		expect(payload.change.to).toBe("day 13, and 1 in 5 decide on days 11–14");
	});

	test("a message with no change has nothing to apply", async ({ db }) => {
		const { you } = await seedDocThread(db);
		const sent = await you("send_message", { threadId: "cm-thread", text: "Hm", anchor: pin });

		const applied = await you("adjust_thread", {
			id: "cm-thread",
			message: { id: sent.body.data?.message.id ?? "", change: "applied" },
		});

		expect(applied.body.problems?.map((p) => p.code)).toEqual(["no_change"]);
	});

	test("resolving a comment marks its first message, and undo clears it", async ({ db }) => {
		const { you, stored } = await seedDocThread(db);
		const sent = await you("send_message", { threadId: "cm-thread", text: "Why?", anchor: pin });
		const id = sent.body.data?.message.id ?? "";

		await you("adjust_thread", { id: "cm-thread", message: { id, resolved: true } });
		const resolved = (await stored(id)).resolvedAt;
		await you("adjust_thread", { id: "cm-thread", message: { id, resolved: false } });

		expect(resolved).not.toBeNull();
		expect((await stored(id)).resolvedAt).toBeNull();
	});
});

// ============================================================================
// mark_review_opened
// ============================================================================

describe("mark_review_opened", () => {
	test("opening a review drops the 'review' need for that viewer", async ({ db }) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "mro-team");
		await seedHuman(db, "mro-reviewer", "mro-team");
		await seedAgent(db, "mro-agent", "mro-team");
		await seedThreadRow(db, "mro-thread", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, "mro-reviewer", "mro-agent"],
		});

		const sent = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId: "mro-thread", review: { title: "Please review", reasoning: ["Looks good"] } },
			"mro-agent",
		);
		const reviewId = sent.body.data?.message.id as string;

		const before = await call<Array<{ id: string; need: string | null }>>(
			actions,
			db,
			eventBus,
			"search_threads",
			{ ids: ["mro-thread"] },
			"mro-reviewer",
		);
		expect(before.body.data?.find((r) => r.id === "mro-thread")?.need).toBe("review");

		await call(
			actions,
			db,
			eventBus,
			"mark_review_opened",
			{ reviewMessageId: reviewId },
			"mro-reviewer",
		);

		const after = await call<Array<{ id: string; need: string | null }>>(
			actions,
			db,
			eventBus,
			"search_threads",
			{ ids: ["mro-thread"] },
			"mro-reviewer",
		);
		expect(after.body.data?.find((r) => r.id === "mro-thread")?.need).toBeNull();
	});

	test("opening the current round drops need even when an older round is still unresolved (superseded)", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const actions = createThreadActions(threadDeps());
		await seedTeam(db, "mro2-team");
		await seedAgent(db, "mro2-agent", "mro2-team");
		await seedThreadRow(db, "mro2-thread", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, "mro2-agent"],
		});

		const r1 = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{ threadId: "mro2-thread", review: { title: "Round 1", reasoning: ["First pass"] } },
			"mro2-agent",
		);
		const r1Id = r1.body.data?.message.id as string;

		const r2 = await call<{ message: { id: string } }>(
			actions,
			db,
			eventBus,
			"send_message",
			{
				threadId: "mro2-thread",
				review: { title: "Round 2", reasoning: ["Second pass"], previousReviewId: r1Id },
			},
			"mro2-agent",
		);
		const r2Id = r2.body.data?.message.id as string;

		// Viewer opens the current round. Need should drop to null because:
		// - R2 is opened (not counted for this viewer)
		// - R1 is superseded by R2 (not counted either)
		await call(actions, db, eventBus, "mark_review_opened", { reviewMessageId: r2Id });

		const after = await call<Array<{ id: string; need: string | null }>>(
			actions,
			db,
			eventBus,
			"search_threads",
			{ ids: ["mro2-thread"] },
		);
		expect(after.body.data?.find((r) => r.id === "mro2-thread")?.need).toBeNull();
	});
});
