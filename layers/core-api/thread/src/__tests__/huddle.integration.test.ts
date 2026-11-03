/**
 * Huddle lifecycle: start → join → plain gets fold mark → leave → ended.
 * Server-side rules: agent refused, no other human refused, duplicate refused, concurrent leaves kept,
 * call signals only between people in the huddle, server start ends live huddles.
 */

import { type HyperIdleDb, messages } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { HuddlePayload } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { createThreadActions } from "../thread-actions.js";
import { canRelayHuddleSignal, endLiveHuddles } from "../thread-service.js";
import {
	actionFor,
	ctxFor,
	FOUNDER_ID,
	seedAgent,
	seedHuman,
	seedTeam,
	seedThreadRow,
	threadDeps,
} from "./_helpers.js";

async function liveHuddleId(db: HyperIdleDb, threadId: string): Promise<string> {
	const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
	return rows.find((r) => r.type === "huddle")?.id ?? "";
}

async function huddlePayload(db: HyperIdleDb, huddleId: string): Promise<HuddlePayload> {
	const [row] = await db.select().from(messages).where(eq(messages.id, huddleId));
	return JSON.parse(row?.payload ?? "{}") as HuddlePayload;
}

async function makeContext(db: HyperIdleDb) {
	const eventBus = new EventBus();
	const teamId = "team-hud";
	await seedTeam(db, teamId);
	const alice = FOUNDER_ID;
	const bob = "u-bob";
	await seedHuman(db, bob);
	const agent = "agent-x";
	await seedAgent(db, agent);
	const threadId = "thr-hud-1";
	await seedThreadRow(db, threadId, {
		hostKind: "team",
		hostId: teamId,
		initiatorId: alice,
		members: [alice, bob, agent],
	});
	const actions = createThreadActions(threadDeps());
	const sendMsg = actionFor<Record<string, unknown>, Record<string, unknown>>(
		actions,
		"send_message",
	);
	const adjustThr = actionFor<Record<string, unknown>, Record<string, unknown>>(
		actions,
		"adjust_thread",
	);

	async function send(
		body: Record<string, unknown>,
		actor = alice,
	): Promise<{
		ok: boolean;
		data?: Record<string, unknown>;
		problems?: ReadonlyArray<{ code: string }>;
	}> {
		const ctx = ctxFor(db, actor, { eventBus });
		const res = await sendMsg.run(ctx, body);
		return res as {
			ok: boolean;
			data?: Record<string, unknown>;
			problems?: ReadonlyArray<{ code: string }>;
		};
	}

	async function adjust(
		body: Record<string, unknown>,
		actor = alice,
	): Promise<{ ok: boolean; problems?: ReadonlyArray<{ code: string }> }> {
		const ctx = ctxFor(db, actor, { eventBus });
		return adjustThr.run(ctx, body) as Promise<{
			ok: boolean;
			problems?: ReadonlyArray<{ code: string }>;
		}>;
	}

	return { alice, bob, agent, threadId, send, adjust, db };
}

describe("huddle lifecycle", () => {
	test("start → join → plain gets fold mark → leave → ended", async ({ db }) => {
		const { alice, bob, threadId, send, adjust } = await makeContext(db);

		// Start a huddle.
		const startRes = await send({ threadId, huddle: {} }, alice);
		expect(startRes.ok).toBe(true);
		const [huddleRow] = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId))
			.then((rows) => rows.filter((r) => r.type === "huddle"));
		expect(huddleRow).toBeDefined();
		const huddleId = huddleRow?.id as string;
		const started = JSON.parse(huddleRow?.payload ?? "{}") as HuddlePayload;
		expect(started.endedAt).toBeNull();
		expect(started.people).toHaveLength(1);
		expect(started.people[0]?.id).toBe(alice);

		// Bob joins.
		const joinRes = await adjust({ id: threadId, message: { id: huddleId, huddle: "join" } }, bob);
		expect(joinRes.ok).toBe(true);
		const afterJoin = JSON.parse(
			(await db.select().from(messages).where(eq(messages.id, huddleId)))[0]?.payload ?? "{}",
		) as HuddlePayload;
		expect(afterJoin.people).toHaveLength(2);
		expect(afterJoin.people.find((p) => p.id === bob)?.leftAt).toBeNull();

		// Bob sends a plain message during the huddle — it must carry the fold mark.
		const plainRes = await send({ threadId, text: "hello from the huddle" }, bob);
		expect(plainRes.ok).toBe(true);
		const plainRows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId))
			.then((rows) => rows.filter((r) => r.type === "plain" && r.senderId === bob));
		const plain = plainRows[0];
		expect(plain).toBeDefined();
		const plainPayload = JSON.parse(plain?.payload ?? "{}") as { text: string; huddle?: string };
		expect(plainPayload.huddle).toBe(huddleId);

		// Alice leaves.
		const leaveAlice = await adjust(
			{ id: threadId, message: { id: huddleId, huddle: "leave" } },
			alice,
		);
		expect(leaveAlice.ok).toBe(true);
		const afterAliceLeave = JSON.parse(
			(await db.select().from(messages).where(eq(messages.id, huddleId)))[0]?.payload ?? "{}",
		) as HuddlePayload;
		expect(afterAliceLeave.endedAt).toBeNull(); // Bob still in.
		expect(afterAliceLeave.people.find((p) => p.id === alice)?.leftAt).not.toBeNull();

		// Bob leaves — last person out ends the huddle.
		const leaveBob = await adjust(
			{ id: threadId, message: { id: huddleId, huddle: "leave" } },
			bob,
		);
		expect(leaveBob.ok).toBe(true);
		const ended = JSON.parse(
			(await db.select().from(messages).where(eq(messages.id, huddleId)))[0]?.payload ?? "{}",
		) as HuddlePayload;
		expect(ended.endedAt).not.toBeNull();
	});

	test("agent can neither start nor join a huddle", async ({ db }) => {
		const { alice, agent, threadId, send, adjust } = await makeContext(db);
		const start = await send({ threadId, huddle: {} }, agent);
		expect(start.problems?.map((p) => p.code)).toEqual(["huddle_not_human"]);

		await send({ threadId, huddle: {} }, alice);
		const huddleId = await liveHuddleId(db, threadId);
		const join = await adjust({ id: threadId, message: { id: huddleId, huddle: "join" } }, agent);
		expect(join.problems?.map((p) => p.code)).toEqual(["huddle_not_human"]);
	});

	test("two people leaving at once both leave, and the huddle ends", async ({ db }) => {
		const { alice, bob, threadId, send, adjust } = await makeContext(db);
		await send({ threadId, huddle: {} }, alice);
		const huddleId = await liveHuddleId(db, threadId);
		await adjust({ id: threadId, message: { id: huddleId, huddle: "join" } }, bob);

		const results = await Promise.all(
			[alice, bob].map((who) =>
				adjust({ id: threadId, message: { id: huddleId, huddle: "leave" } }, who),
			),
		);
		expect(results.map((r) => r.ok)).toEqual([true, true]);
		const ended = await huddlePayload(db, huddleId);
		expect(ended.people.map((p) => p.leftAt === null)).toEqual([false, false]);
		expect(ended.endedAt).not.toBeNull();
	});

	test("at server start every live huddle ends with everyone out", async ({ db }) => {
		const { alice, bob, threadId, send, adjust } = await makeContext(db);
		await send({ threadId, huddle: {} }, alice);
		const huddleId = await liveHuddleId(db, threadId);
		await adjust({ id: threadId, message: { id: huddleId, huddle: "join" } }, bob);

		await endLiveHuddles(db, "2026-11-03T12:00:00.000Z");

		const ended = await huddlePayload(db, huddleId);
		expect(ended.endedAt).toBe("2026-11-03T12:00:00.000Z");
		expect(ended.people.map((p) => p.leftAt)).toEqual([
			"2026-11-03T12:00:00.000Z",
			"2026-11-03T12:00:00.000Z",
		]);
	});

	test("a call signal passes only between two people in the live huddle", async ({ db }) => {
		const { alice, bob, threadId, send, adjust } = await makeContext(db);
		await send({ threadId, huddle: {} }, alice);
		const huddleId = await liveHuddleId(db, threadId);
		await adjust({ id: threadId, message: { id: huddleId, huddle: "join" } }, bob);
		const outsider = "u-outsider";

		expect(await canRelayHuddleSignal(db, huddleId, alice, bob)).toBe(true);
		expect(await canRelayHuddleSignal(db, huddleId, outsider, bob)).toBe(false);
		await adjust({ id: threadId, message: { id: huddleId, huddle: "leave" } }, bob);
		expect(await canRelayHuddleSignal(db, huddleId, alice, bob)).toBe(false);
	});

	test("no second huddle when one is already live", async ({ db }) => {
		const { alice, threadId, send } = await makeContext(db);
		const first = await send({ threadId, huddle: {} }, alice);
		expect(first.ok).toBe(true);
		const second = await send({ threadId, huddle: {} }, alice);
		expect(second.ok).toBe(false);
		expect(second.problems?.map((p) => p.code)).toContain("huddle_already_live");
	});
});

describe("huddle server rules", () => {
	test("thread with no other human member refuses huddle", async ({ db }) => {
		const eventBus = new EventBus();
		const teamId = "team-solo";
		await seedTeam(db, teamId);
		const alice = FOUNDER_ID;
		const agent = "agent-solo";
		await seedAgent(db, agent);
		const threadId = "thr-solo";
		await seedThreadRow(db, threadId, {
			hostKind: "team",
			hostId: teamId,
			initiatorId: alice,
			members: [alice, agent],
		});
		const actions = createThreadActions(threadDeps());
		const sendMsg = actionFor<Record<string, unknown>, Record<string, unknown>>(
			actions,
			"send_message",
		);
		const ctx = ctxFor(db, alice, { eventBus });
		const res = await sendMsg.run(ctx, { threadId, huddle: {} });
		expect(res.ok).toBe(false);
		expect((res as { problems?: Array<{ code: string }> }).problems?.map((p) => p.code)).toContain(
			"huddle_no_other_human",
		);
	});
});
