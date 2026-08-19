/**
 * AU21 §9 Increment 11 (H2 re-derived) — RED phase.
 *
 * architecture.md §6 Decision H's H2 subsection: "core bakes the thread's
 * conversational content onto the `assistant_turn` event at emit (reading its
 * own `conversation` state — legal; the same content `loadRawTranscript`
 * reads today)." This test proves the emit-time resolver
 * (`resolveAssistantTurnRequest`, `assistant-turn-resolver.ts`) grows a
 * `transcript` field carrying exactly that content — the same raw row shape
 * `dispatch`'s `loadRawTranscript` reads today
 * (`{ senderId, payload, type }`, ordered by `createdAt` ascending) — so the
 * real emit site (`routes/threads.ts`) can bake it onto the intent instead of
 * `dispatch` reading it live at execution.
 *
 * Currently RED: `BakedAssistantTurnRequest` has no `transcript` field and
 * `resolveAssistantTurnRequest` never reads `messages` at all — `baked
 * .transcript` is `undefined` today.
 *
 * @lore naming: the architecture doc does not pin an exact field name for the
 * baked transcript. `transcript` (an array of `{senderId, payload, type}` raw
 * rows, matching `loadRawTranscript`'s existing return shape verbatim) is
 * this wave's best-guess interpretation, flagged for reviewer confirmation.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent, readServerConfig: async () => ({ harnessDisabled: [] }) } from "@hyperidle/users";

async function seedThread(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly assistantId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: options.senderId,
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: options.assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "user",
		hostId: options.senderId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.assistantId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

async function seedMessage(
	db: HyperIdleDb,
	options: {
		readonly messageId: string;
		readonly threadId: string;
		readonly senderId: string;
		readonly text: string;
		readonly createdAt: string;
	},
): Promise<void> {
	await db.insert(messages).values({
		id: options.messageId,
		senderId: options.senderId,
		threadId: options.threadId,
		type: "plain",
		payload: JSON.stringify({ text: options.text }),
		clientKey: `client-${options.messageId}`,
		createdAt: options.createdAt,
	});
}

describe("resolveAssistantTurnRequest — bakes the thread's conversational transcript (Increment 11, H2)", () => {
	test("transcript carries every message in the thread, in createdAt order, including the triggering message", async ({
		db,
	}) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		const threadId = "thread-transcript-bake-1";
		const senderId = "user-transcript-bake-1";
		const assistantId = "ast-user-transcript-bake-1";
		await seedThread(db, { threadId, senderId, assistantId });

		await seedMessage(db, {
			messageId: "msg-transcript-bake-1a",
			threadId,
			senderId,
			text: "first human message",
			createdAt: "2026-07-31T00:00:00.000Z",
		});
		await seedMessage(db, {
			messageId: "msg-transcript-bake-1b",
			threadId,
			senderId: assistantId,
			text: "first assistant reply",
			createdAt: "2026-07-31T00:00:01.000Z",
		});
		await seedMessage(db, {
			messageId: "msg-transcript-bake-1c",
			threadId,
			senderId,
			text: "the triggering message",
			createdAt: "2026-07-31T00:00:02.000Z",
		});

		const baked = await resolveAssistantTurnRequest(db, "msg-transcript-bake-1c", {
			requireRunnableAgent,
		});

		expect(baked.transcript).toEqual([
			{
				senderId,
				payload: JSON.stringify({ text: "first human message" }),
				type: "plain",
			},
			{
				senderId: assistantId,
				payload: JSON.stringify({ text: "first assistant reply" }),
				type: "plain",
			},
			{
				senderId,
				payload: JSON.stringify({ text: "the triggering message" }),
				type: "plain",
			},
		]);
	});

	test("transcript excludes messages from other threads", async ({ db }) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		const threadId = "thread-transcript-bake-2";
		const senderId = "user-transcript-bake-2";
		const assistantId = "ast-user-transcript-bake-2";
		await seedThread(db, { threadId, senderId, assistantId });

		const otherThreadId = "thread-transcript-bake-2-other";
		const otherSenderId = "user-transcript-bake-2-other";
		const otherAssistantId = "ast-user-transcript-bake-2-other";
		await seedThread(db, {
			threadId: otherThreadId,
			senderId: otherSenderId,
			assistantId: otherAssistantId,
		});
		await seedMessage(db, {
			messageId: "msg-transcript-bake-2-decoy",
			threadId: otherThreadId,
			senderId: otherSenderId,
			text: "decoy message in a different thread",
			createdAt: "2026-07-31T00:00:00.000Z",
		});

		await seedMessage(db, {
			messageId: "msg-transcript-bake-2-trigger",
			threadId,
			senderId,
			text: "the only message in this thread",
			createdAt: "2026-07-31T00:00:01.000Z",
		});

		const baked = await resolveAssistantTurnRequest(db, "msg-transcript-bake-2-trigger", {
			requireRunnableAgent,
		});

		expect(baked.transcript).toEqual([
			{
				senderId,
				payload: JSON.stringify({ text: "the only message in this thread" }),
				type: "plain",
			},
		]);
	});
});
