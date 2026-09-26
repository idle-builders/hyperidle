/**
 * The wake rule's bake (`@hyperidle/thread`'s `resolveThreadTurnRequest`)
 * carries the FULL current transcript (every prior message in the thread,
 * in order, PLUS the just-appended triggering message) onto the recorded
 * `agent_work_intents` row.
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/**
 * A 2-member thread (human + agent) — `agentsToWake` wakes the other member
 * with no @-mention needed once the thread has exactly two members.
 */
async function seedTwoMemberThread(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly agentId: string },
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
			id: options.agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "agent",
		hostId: options.agentId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.agentId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("the wake rule bakes the thread's conversational transcript at emit time", () => {
	test("the baked intent's transcript includes prior thread history AND the just-posted triggering message, in order", async ({
		db,
		app,
	}) => {
		const threadId = "thread-transcript-bake-1";
		const senderId = "user-transcript-bake-1";
		const agentId = "agent-transcript-bake-1";
		await seedTwoMemberThread(db, { threadId, senderId, agentId });

		// Prior turn: a human message + the agent's earlier reply, posted
		// through the same real action so they carry real ids/ordering.
		const priorHuman = await call(app, "send_message", {
			threadId,
			text: "what is the weather like",
		});
		expect(priorHuman.status).toBe(200);

		// The agent's own prior reply — posted as the agent identity so its
		// wake (the OTHER member, the human, is not an agent) fires no intent
		// for it, and the trigger below stays the only new wake.
		const priorAgentReply = await call(
			app,
			"send_message",
			{ threadId, text: "it is sunny today" },
			{ [ACTOR_OVERRIDE_HEADER]: agentId },
		);
		expect(priorAgentReply.status).toBe(200);

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId,
			text: "thanks — and tomorrow?",
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, `${messageId}:${agentId}`));
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
		expect(baked?.transcript?.map((row) => row.senderId)).toEqual([senderId, agentId, senderId]);
	});
});
