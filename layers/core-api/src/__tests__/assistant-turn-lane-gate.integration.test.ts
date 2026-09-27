/**
 * Service-integration tests for the assistant-turn trigger.
 *
 * The assistant flows through the SAME `agent_work_intents` -> durable-poller
 * path as every other kind. The load-bearing property the gate needs is:
 * **posting a message is what records the trigger** — an `agent_work_intents`
 * row of kind `assistant_turn` — and this fixture's bare `app` (no
 * `startRuntime` poller wired, see `test-fixtures.ts`) never drains it, so no
 * reply appears. Absence of a reply alone proves nothing (nothing drains ANY
 * intent in this fixture); the row's presence is what proves the trigger
 * actually fired.
 *
 * Two cases live elsewhere: the cassette-miss -> provider_error notice
 * mapping is covered by `persistTurnFailure` (no harness needed); the
 * empty-content -> verdict-false case is in
 * `assistant-lane-gate-verdict.test.ts` (unit, mock-scripted degenerate
 * output). A real-harness lane covers the normal-run sanity case end to end.
 *
 * No mocks, no harness doubles in this file.
 * Guard: this file is NOT in EXPLICIT_HARNESS_INTEGRATION (service-integration only).
 */

import { CORE_API_ACTOR_OVERRIDE_HEADER } from "@hyperidle/api-contract";
import {
	agentRunConfig,
	agentWorkIntents,
	type HyperIdleDb,
	messages,
	threads,
	users,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { makeAgentIdentityTestPort } from "../__testing__/document-read-test-ports.js";
import { test } from "../__testing__/test-fixtures.js";

const agentIdentity = makeAgentIdentityTestPort();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WELCOME_TEXT = "Welcome to HyperIdle! I'm your assistant.";
const PER_AGENT_MODEL_ID = "deepseek/deepseek-v4-flash";

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

async function seedFounderAndThread(
	db: HyperIdleDb,
	{
		founderId,
		threadId,
		triggerMsgId,
		withWelcomeMessage = false,
	}: {
		founderId: string;
		threadId: string;
		triggerMsgId: string;
		withWelcomeMessage?: boolean;
	},
): Promise<void> {
	const assistantId = `ast-${founderId}`;

	await db.insert(users).values({
		id: founderId,
		name: "Gate Test Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});

	await db.insert(users).values({
		id: assistantId,
		name: "Assistant",
		role: "assistant",
		kind: "ai",
		agentCategory: "individual",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	// The run config lives in `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType: "opencode",
		modelId: PER_AGENT_MODEL_ID,
		modelProvider: "openrouter",
	});
	// Who the agent is — an `agent_file` document bound to it, not a run-config field.
	await agentIdentity.upsertAgentIdentity(db, {
		agentId: assistantId,
		agentName: "Assistant",
		body: "You are a helpful assistant.",
		updatedBy: assistantId,
	});

	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: founderId,
		initiatorId: founderId,
		participants: JSON.stringify([founderId, assistantId]),
		pinned: false,
		createdAt: new Date().toISOString(),
		lastActiveAt: new Date().toISOString(),
	});

	if (withWelcomeMessage) {
		await db.insert(messages).values({
			id: `msg-welcome-${founderId}`,
			threadId,
			senderId: assistantId,
			type: "plain",
			payload: JSON.stringify({ text: WELCOME_TEXT }),
			clientKey: `ck-welcome-${founderId}`,
			createdAt: new Date(Date.now() - 60_000).toISOString(),
		});
	}

	await db.insert(messages).values({
		id: triggerMsgId,
		threadId,
		senderId: founderId,
		type: "plain",
		payload: JSON.stringify({ text: "What is 1 + 1?" }),
		clientKey: `ck-${triggerMsgId}`,
		createdAt: new Date().toISOString(),
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const GATE_API_KEY = "gate-test-key";

describe("the assistant-turn trigger (service-integration)", () => {
	beforeEach(() => {
		// Set the API key so the app fixture accepts requests with GATE_API_KEY
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// Term 1: a human message on the assistant thread records the trigger.
	// Service-integration: real route + real DB, no harness, no poller wired
	// on this fixture — proves the RECORDING is load-bearing, not a reply.
	// -------------------------------------------------------------------------

	test("Term 1: a human message on the assistant thread records an assistant_turn intent (trigger is load-bearing)", async ({
		db,
		app,
	}) => {
		const founderId = "gate-term1-founder";
		const assistantId = `ast-${founderId}`;
		const threadId = "gate-term1-thread";
		const triggerMsgId = "gate-term1-msg";

		await seedFounderAndThread(db, {
			founderId,
			threadId,
			triggerMsgId,
			withWelcomeMessage: false,
		});

		// Auth: X-API-Key resolves the sole seeded human (founderId) as the
		// principal in local mode (`resolveApiKeyActorUserId`) — no override
		// header needed for a human sender. The door is
		// `POST /api/actions/send_message`.
		const res = await app.request("/api/actions/send_message", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
			},
			body: JSON.stringify({
				threadId,
				text: "What is 1 + 1?",
				clientKey: crypto.randomUUID(),
			}),
		});

		// The action itself should succeed — message is stored.
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);

		// The load-bearing property is the
		// recorded intent, not a reply (this fixture never drains it —
		// `test-fixtures.ts` builds `app` with no `startRuntime` poller
		// wired). The intent kind is `thread_turn` now (the wake rule,
		// `@hyperidle/thread`'s `agentsToWake`, replaced `assistant_turn`),
		// and its `sourceId` is `"<messageId>:<agentId>"`.
		const recordedMessage = await db.select().from(messages).where(eq(messages.threadId, threadId));
		const humanMessage = recordedMessage.find(
			(m) => m.senderId === founderId && m.id !== triggerMsgId,
		);
		expect(humanMessage).toBeDefined();

		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(
					eq(agentWorkIntents.kind, "thread_turn"),
					eq(agentWorkIntents.sourceId, `${humanMessage?.id ?? ""}:${assistantId}`),
				),
			);
		expect(intents).toHaveLength(1);

		// Give a short window for any async processing that shouldn't happen —
		// no runtime is wired on this fixture, so nothing drains the intent.
		await new Promise((resolve) => setTimeout(resolve, 100));

		const assistantMessages = recordedMessage.filter((m) => m.senderId === assistantId);
		expect(assistantMessages).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Term 2: the assistant's OWN message never records a trigger (the
	// re-trigger guard, `routes/threads.ts`'s `!senderId.startsWith("ast-")`) —
	// the real-world case where "no agent_work_intents row" is the correct,
	// intended outcome, not a broken lane.
	// -------------------------------------------------------------------------

	test("Term 2: the assistant's own message records NO thread_turn intent (no self-retrigger)", async ({
		db,
		app,
	}) => {
		const founderId = "gate-term2-founder";
		const assistantId = `ast-${founderId}`;
		const threadId = "gate-term2-thread";
		const triggerMsgId = "gate-term2-msg";

		await seedFounderAndThread(db, {
			founderId,
			threadId,
			triggerMsgId,
			withWelcomeMessage: false,
		});

		// The assistant's own messages are attributed via the seam's actor-
		// override header (`CORE_API_ACTOR_OVERRIDE_HEADER`) — the SAME
		// mechanism `reply`'s `insertMessage` call uses internally
		// (`seamPortForActor(ctx.agentId)`). `X-Identity` does not control
		// senderId at all — only this header, consulted after
		// X-API-Key auth already succeeded, can attribute a write to a
		// non-human actor. The door is `POST /api/actions/send_message`.
		const res = await app.request("/api/actions/send_message", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
				[CORE_API_ACTOR_OVERRIDE_HEADER]: assistantId,
			},
			body: JSON.stringify({
				threadId,
				text: "Following up on my own message.",
				clientKey: crypto.randomUUID(),
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);

		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));
		const assistantOwnMessage = allMessages.find(
			(m) => m.senderId === assistantId && m.id !== triggerMsgId,
		);
		expect(assistantOwnMessage).toBeDefined();

		// The self-retrigger guard is structural — `agentsToWake`
		// only ever wakes an AGENT member, and in this 2-member thread the
		// other member (the founder) is human, so no wake is attempted at
		// all. The intent kind is `thread_turn` now, sourceId
		// `"<messageId>:<agentId>"`.
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(
					eq(agentWorkIntents.kind, "thread_turn"),
					eq(agentWorkIntents.sourceId, `${assistantOwnMessage?.id ?? ""}:${assistantId}`),
				),
			);
		expect(intents).toHaveLength(0);
	});
});
