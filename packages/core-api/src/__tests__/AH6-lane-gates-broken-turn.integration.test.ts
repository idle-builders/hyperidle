/**
 * AH6 §7 — Service-integration tests for the assistant-turn trigger.
 *
 * AU27 Increment 6 rewrite: the old Term 1 premise ("without assistantTurnDeps,
 * no reply") named a mechanism (`assistantTurnDeps`, the `dispatch` package's
 * bespoke execution entry) that this WP deletes entirely — the assistant now
 * flows through the SAME `agent_work_intents` → durable-poller path as every
 * other kind (Increment 6, Decision 4). The load-bearing property the gate
 * actually needs is: **posting a message is what records the trigger** — an
 * `agent_work_intents` row of kind `assistant_turn` — and this fixture's bare
 * `app` (no `startRuntime` poller wired, see `test-fixtures.ts`) never drains
 * it, so no reply appears. Absence of a reply alone proved nothing before
 * (nothing drains ANY intent in this fixture); the row's presence is what
 * proves the trigger actually fired.
 *
 * ── What moved out of this file in AR4 ────────────────────────────────────────
 * Term 2a (cassette-miss → provider_error notice): depended on a llm-client mock
 *   to control callLlm behavior. The error→notice mapping is already covered by
 *   AH3 AC2 via persistTurnFailure (no harness needed). Demoted.
 * Term 2b (empty-content → S1 false): mock-scripted degenerate output.
 *   Moved to AH6-lane-gate-verdict.test.ts unit (W-2 honest decomposition).
 * Sanity (normal run → S1 true): covered by the real-harness lane
 * (AU9-assistant-handoff-realbinary.integration.test.ts).
 *
 * No mocks, no harness doubles in this file.
 * Guard: this file is NOT in EXPLICIT_HARNESS_INTEGRATION (service-integration only).
 */

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
import { CORE_API_ACTOR_OVERRIDE_HEADER } from "../services/actor-transport-header.js";
import { test } from "../test-fixtures.js";

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
	// AU26 G1: the run config lives in `agent_run_config` now.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType: "builtin",
		modelId: PER_AGENT_MODEL_ID,
		modelProvider: "openrouter",
		systemPrompt: "You are a helpful assistant.",
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

const GATE_API_KEY = "ah6-gate-test-key";

describe("AH6 §7 — the assistant-turn trigger (service-integration)", () => {
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
		// header needed for a human sender.
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "What is 1 + 1?" },
				clientKey: crypto.randomUUID(),
			}),
		});

		// The route itself should succeed (201) — message is stored
		expect([201, 200]).toContain(res.status);

		// AU27 Increment 6: the load-bearing property is the recorded intent,
		// not a reply (this fixture never drains it — `test-fixtures.ts` builds
		// `app` with no `startRuntime` poller wired).
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
					eq(agentWorkIntents.kind, "assistant_turn"),
					eq(agentWorkIntents.sourceId, humanMessage?.id ?? ""),
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

	test("Term 2: the assistant's own message records NO assistant_turn intent (no self-retrigger)", async ({
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
		// senderId at all (AF11-IDOR) — only this header, consulted after
		// X-API-Key auth already succeeded, can attribute a write to a
		// non-human actor.
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
				[CORE_API_ACTOR_OVERRIDE_HEADER]: assistantId,
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Following up on my own message." },
				clientKey: crypto.randomUUID(),
			}),
		});
		expect([201, 200]).toContain(res.status);

		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));
		const assistantOwnMessage = allMessages.find(
			(m) => m.senderId === assistantId && m.id !== triggerMsgId,
		);
		expect(assistantOwnMessage).toBeDefined();

		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(
					eq(agentWorkIntents.kind, "assistant_turn"),
					eq(agentWorkIntents.sourceId, assistantOwnMessage?.id ?? ""),
				),
			);
		expect(intents).toHaveLength(0);
	});
});
