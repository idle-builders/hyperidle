/**
 * The wake rule's bake (`@hyperidle/thread`'s `resolveThreadTurnRequest`)
 * carries the FULL current transcript (every prior message in the thread,
 * in order, PLUS the just-appended triggering message) onto the recorded
 * `agent_work_intents` row.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

async function callAs<T>(
	name: string,
	body: Record<string, unknown>,
	actorId: string,
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const action = actions.find((a) => a.declaration.name === name);
	if (!action) throw new Error(`action not found: ${name}`);
	const ctx: ActionContext = { actor: actorId, db, eventBus, now: new Date().toISOString() };
	const result = await action.run(ctx, body);
	return result.ok
		? { status: 200, body: { ok: true, data: result.data as T } }
		: { status: 422, body: { ok: false } };
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
		eventBus,
		agentOrchestration,
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
		const priorAgentReply = await callAs(
			"send_message",
			{ threadId, text: "it is sunny today" },
			agentId,
			db,
			eventBus,
			agentOrchestration,
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
