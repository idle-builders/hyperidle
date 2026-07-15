/**
 * AH6 §7 — Service-integration tests for the assistant-turn trigger gate.
 *
 * Term 1 (trigger broken):
 *   POST a human message WITHOUT assistantTurnDeps. Assert NO assistant reply
 *   message is appended → the message→turn trigger is load-bearing (remove it
 *   and the round-trip produces nothing). This is the exact regression class AH6
 *   guards (R-1 in the architecture).
 *
 * ── What moved out of this file in AR4 ────────────────────────────────────────
 * Term 2a (cassette-miss → provider_error notice): depended on a llm-client mock
 *   to control callLlm behavior. The error→notice mapping is already covered by
 *   AH3 AC2 via persistTurnFailure (no harness needed). Demoted.
 * Term 2b (empty-content → S1 false): mock-scripted degenerate output.
 *   Moved to AH6-lane-gate-verdict.test.ts unit (W-2 honest decomposition).
 * Sanity (normal run → S1 true): covered by the full-matrix conversational
 *   harness path in AR4a-conversational-reply-row.integration.test.ts.
 *
 * No mocks, no harness doubles in this file.
 * Guard: this file is NOT in EXPLICIT_HARNESS_INTEGRATION (service-integration only).
 */

import { messages, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
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
	db: import("@hyperidle/dispatch").AssistantTurnDeps["db"],
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
		harnessType: "builtin",
		modelId: PER_AGENT_MODEL_ID,
		modelProvider: "openrouter",
		systemPrompt: "You are a helpful assistant.",
		maxConcurrentSessions: 1,
		createdAt: new Date().toISOString(),
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

describe("AH6 §7 — negative proof: broken trigger fails the lane (service-integration)", () => {
	beforeEach(() => {
		// Set the API key so the app fixture accepts requests with GATE_API_KEY
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// Term 1: trigger broken (no assistantTurnDeps wired)
	// Service-integration: real route + real DB, no harness.
	// -------------------------------------------------------------------------

	test("Term 1: without assistantTurnDeps, POST message → NO assistant reply appended (trigger is load-bearing)", async ({
		db,
		app,
	}) => {
		// This test posts a message via the real app HTTP route WITHOUT assistantTurnDeps.
		// The POST /api/threads/:id/messages handler will NOT call runAssistantTurn
		// because createApp is invoked without assistantTurnDeps (the default fixture).
		//
		// Prove: after the POST returns, the thread has exactly the trigger message
		// (no assistant reply, no notice), because the trigger was never fired.

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

		// The fixture app is created WITHOUT assistantTurnDeps (createApp default).
		// POST a message — the route should accept it but NOT trigger a turn.
		// Auth: X-API-Key + X-Identity (the real auth mechanism, per M3 pattern).
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
				"X-Identity": founderId,
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "What is 1 + 1?" },
				clientKey: crypto.randomUUID(),
			}),
		});

		// The route itself should succeed (201) — message is stored
		expect([201, 200]).toContain(res.status);

		// Give a short window for any async processing that shouldn't happen
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Assert: NO assistant reply message was appended to the thread
		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const assistantMessages = allMessages.filter((m) => m.senderId === assistantId);

		// Without assistantTurnDeps, NO assistant messages should exist
		// (the trigger was never called)
		expect(assistantMessages).toHaveLength(0);
	});
});
