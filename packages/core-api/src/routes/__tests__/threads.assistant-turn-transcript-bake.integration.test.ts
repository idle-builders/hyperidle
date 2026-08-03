/**
 * AU21 §9 Increment 11 (H2 re-derived) — RED phase.
 *
 * architecture.md §6 Decision H's H2 subsection + §9's Increment 11 paragraph:
 * "Core bakes the thread's conversational content onto the `assistant_turn`
 * event at emit (`routes/threads.ts`, reading its own `conversation` state —
 * the same content `loadRawTranscript` reads today)." This is the real emit
 * call site (`POST /:threadId/messages`'s `recordsAssistantIntent` branch,
 * `routes/threads.ts:1360`) — it must bake the FULL current transcript
 * (every prior message in the thread, in order, PLUS the just-appended
 * triggering message, since `insertMessage` runs before
 * `resolveAssistantTurnRequest` in the same transaction) onto the recorded
 * `agent_work_intents` row.
 *
 * Sibling file `threads.assistant-turn-baked-emit.integration.test.ts`
 * (Increment 3) already proves the identity fields
 * (`defaultAgentId`/`sourceKind`/`sourceId`/`streamId`/`userId`/
 * `sourceCorrelation`) are baked — this file is scoped narrowly to the NEW
 * Increment 11 content: the transcript.
 *
 * Currently RED: `resolveAssistantTurnRequest` does not read `messages` at
 * all yet, so the baked payload carries no `transcript` field —
 * `baked.transcript` is `undefined`.
 *
 * @lore naming: `transcript` (an array of `{senderId, payload, type}` raw
 * rows) is this wave's best-guess interpretation of the field name — see the
 * sibling `assistant-turn-resolver.transcript-bake.integration.test.ts` for
 * the same call-out.
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

const TEST_API_KEY = "test-key-au21-inc11-transcript-bake";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedAssistantThreadWithHistory(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly assistantId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: options.senderId,
			kind: "human",
			name: "Founder",
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

describe("assistant_turn bakes the thread's conversational transcript at emit time (Increment 11)", () => {
	test("the baked intent's transcript includes prior thread history AND the just-posted triggering message, in order", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const threadId = "thread-au21-inc11-transcript-1";
		const senderId = "user-au21-inc11-transcript-1";
		const assistantId = "ast-user-au21-inc11-transcript-1";
		await seedAssistantThreadWithHistory(db, { threadId, senderId, assistantId });

		// Prior turn: a human message + the assistant's earlier reply, posted
		// through the SAME real route so they carry real ids/ordering.
		const priorHuman = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "what is the weather like" },
				clientKey: "au21-inc11-prior-human",
			}),
		});
		expect(priorHuman.status).toBe(201);

		// The assistant's own prior reply — posted as the assistant identity so
		// this route's `recordsAssistantIntent` guard (`!senderId.startsWith("ast-")`)
		// does not fire a second intent for it.
		const priorAssistantReplyBody = JSON.stringify({
			type: "plain",
			payload: { text: "it is sunny today" },
			clientKey: "au21-inc11-prior-assistant-reply",
		});
		const priorAssistantReply = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: { ...authHeaders(), [ACTOR_OVERRIDE_HEADER]: assistantId },
			body: priorAssistantReplyBody,
		});
		expect(priorAssistantReply.status).toBe(201);

		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "thanks — and tomorrow?" },
				clientKey: "au21-inc11-trigger",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { message: { id: string } };
		const messageId = body.message.id;

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, messageId));
		expect(intent).toBeDefined();
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as {
					transcript?: ReadonlyArray<{
						readonly senderId: string;
						readonly payload: string;
						readonly type: string;
					}>;
				})
			: undefined;

		expect(baked?.transcript).toBeDefined();
		const texts = (baked?.transcript ?? []).map(
			(row) => (JSON.parse(row.payload) as { text?: string }).text,
		);
		expect(texts).toEqual([
			"what is the weather like",
			"it is sunny today",
			"thanks — and tomorrow?",
		]);
		expect(baked?.transcript?.map((row) => row.senderId)).toEqual([
			senderId,
			assistantId,
			senderId,
		]);
	});
});
