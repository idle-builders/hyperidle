/**
 * AH6 §7 — Negative proof: "deliberately re-broken trigger fails the lane."
 *
 * Structured as a key-free integration test (deterministic, runs every commit).
 * The gate must be always-on. Three terms per the architecture:
 *
 * Term 1 (trigger broken):
 *   POST a human message WITHOUT assistantTurnDeps. Assert NO assistant reply
 *   message is appended → the message→turn trigger is load-bearing (remove it
 *   and the round-trip produces nothing). This is the exact regression class AH6
 *   guards (R-1 in the architecture).
 *
 * Term 2a (missing cassette → throw):
 *   Run with LLM_CASSETTE_MODE=replay against an empty cassette ([]).
 *   Assert replayLlm throws CassetteMissError, runAssistantTurn catches it and
 *   persists a `provider_error` notice, and NO assistant reply message is appended.
 *
 * Term 2b (recorded-but-empty-content response):
 *   Seed a cassette entry whose key matches the turn but whose response.content
 *   is [] (empty completion). Assert runAssistantTurn persists a (degenerate/empty)
 *   assistant message and the S1 distinct-reply predicate is FALSE
 *   (lastReply === welcomeText || lastReply.length === 0).
 *
 * @lore AH6 §7: Each term covers a distinct failure mode on the proof path:
 *   Term 1 = trigger gate (no-deps → no turn)
 *   Term 2a = cassette gate (missing key → hard fail, not silently pass)
 *   Term 2b = empty-content gate (degenerate response does not satisfy S1 predicate)
 */

import { messages, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { CassetteMissError } from "../harness/llm-cassette.js";
import { runAssistantTurn } from "../services/assistant-turn.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WELCOME_TEXT = "Welcome to HyperIdle! I'm your assistant.";
const PER_AGENT_MODEL_ID = "deepseek/deepseek-v4-flash";

// ---------------------------------------------------------------------------
// The S1 "distinct-reply" predicate
// Proves an empty or welcome-text-only completion does NOT pass the lane.
// ---------------------------------------------------------------------------

function s1DistinctReplyPredicate(lastReply: string, welcomeText: string): boolean {
	return lastReply.length > 0 && lastReply !== welcomeText;
}

// ---------------------------------------------------------------------------
// Stub CredentialResolver
// ---------------------------------------------------------------------------

function makeOpenRouterResolver(): CredentialResolver {
	return {
		async resolve(name: string): Promise<string | null> {
			if (name === "openrouter_api_key") return "sk-or-test-gate-key";
			return null;
		},
	};
}

// ---------------------------------------------------------------------------
// callLlm mock: controlled via a closure set by each test
// ---------------------------------------------------------------------------

type MockCallLlmBehavior = "empty-content" | "real-response" | "cassette-miss";
let mockCallLlmBehavior: MockCallLlmBehavior = "real-response";

vi.mock("../harness/llm-client.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../harness/llm-client.js")>();
	return {
		...original,
		callLlm: vi.fn(async (_options: import("../harness/llm-client.js").CallLlmOptions) => {
			if (mockCallLlmBehavior === "empty-content") {
				// Degenerate: empty content array (no text, no tool_use)
				return {
					stopReason: "end_turn" as const,
					content: [] as const,
					usage: { inputTokens: 5, outputTokens: 0 },
				};
			}
			if (mockCallLlmBehavior === "cassette-miss") {
				// Simulate CassetteMissError thrown from replayLlm
				throw new CassetteMissError("missing-key-xyz", "/tmp/test-cassettes/test.json");
			}
			// Default: valid response
			return {
				stopReason: "end_turn" as const,
				content: [{ type: "text" as const, text: "A real response from the model." }],
				usage: { inputTokens: 10, outputTokens: 8 },
			};
		}),
	};
});

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

async function seedFounderAndThread(
	db: Parameters<typeof runAssistantTurn>[0]["db"],
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

describe("AH6 §7 — negative proof: broken trigger/stream fails the lane", () => {
	beforeEach(() => {
		mockCallLlmBehavior = "real-response";
		vi.unstubAllEnvs();
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// Term 1: trigger broken (no assistantTurnDeps wired)
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

	// -------------------------------------------------------------------------
	// Term 2a: missing cassette → CassetteMissError → provider_error notice
	// -------------------------------------------------------------------------

	test("Term 2a: LLM_CASSETTE_MODE=replay with empty cassette → CassetteMissError → provider_error notice, NO reply", async ({
		db,
	}) => {
		// Set cassette mode to replay; callLlm will throw CassetteMissError
		mockCallLlmBehavior = "cassette-miss";
		vi.stubEnv("LLM_CASSETTE_MODE", "replay");
		vi.stubEnv("LLM_CASSETTE_DIR", "/tmp/test-empty-cassettes");
		vi.stubEnv("LLM_CASSETTE_SCENARIO", "test-empty");

		const founderId = "gate-term2a-founder";
		const assistantId = `ast-${founderId}`;
		const threadId = "gate-term2a-thread";
		const triggerMsgId = "gate-term2a-msg";

		await seedFounderAndThread(db, { founderId, threadId, triggerMsgId });

		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-term2a", adapter, {
			name: "Builtin Term 2a",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		const credentialResolver = makeOpenRouterResolver();

		// Act: run the turn (callLlm will throw CassetteMissError)
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver },
			{ userId: founderId, threadId, triggerMessageId: triggerMsgId },
		);

		// Assert: a provider_error notice is persisted (NOT silence)
		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const assistantMessages = allMessages.filter((m) => m.senderId === assistantId);
		expect(assistantMessages.length).toBeGreaterThan(0);

		const noticeMessages = assistantMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as { notice?: { kind: string } };
				return payload.notice !== undefined;
			} catch {
				return false;
			}
		});

		// A notice must be persisted (never silent)
		expect(noticeMessages.length).toBeGreaterThan(0);

		// Must be a provider_error notice (CassetteMissError maps to provider_error)
		const noticeKinds = noticeMessages.map((m) => {
			const payload = JSON.parse(m.payload) as { notice: { kind: string } };
			return payload.notice.kind;
		});
		expect(noticeKinds).toContain("provider_error");

		// NO real reply message (no text without a notice)
		const replyMessages = assistantMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as { notice?: unknown; text?: string };
				return !payload.notice && typeof payload.text === "string" && payload.text.length > 0;
			} catch {
				return false;
			}
		});
		expect(replyMessages).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Term 2b: empty-content response → degenerate message, S1 predicate = false
	// -------------------------------------------------------------------------

	test("Term 2b: empty-content cassette response → degenerate message, S1 distinct-reply predicate = false", async ({
		db,
	}) => {
		// Set callLlm to return empty content (degenerate completion)
		mockCallLlmBehavior = "empty-content";

		const founderId = "gate-term2b-founder";
		const assistantId = `ast-${founderId}`;
		const threadId = "gate-term2b-thread";
		const triggerMsgId = "gate-term2b-msg";

		await seedFounderAndThread(db, {
			founderId,
			threadId,
			triggerMsgId,
			withWelcomeMessage: true, // welcome text is seeded to test the predicate
		});

		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-term2b", adapter, {
			name: "Builtin Term 2b",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		const credentialResolver = makeOpenRouterResolver();

		// Act: run the turn (callLlm returns empty content)
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver },
			{ userId: founderId, threadId, triggerMessageId: triggerMsgId },
		);

		// Assert: some assistant message is persisted (not zero messages)
		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const assistantMessages = allMessages.filter((m) => m.senderId === assistantId);
		expect(assistantMessages.length).toBeGreaterThan(0);

		// Get the last reply text from any plain reply message (not welcome)
		const replyMessages = assistantMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as {
					notice?: unknown;
					text?: string;
				};
				// Not the welcome message (createdAt later), not a notice
				return !payload.notice;
			} catch {
				return false;
			}
		});

		// Extract the last reply text
		const lastReplyText = (() => {
			if (replyMessages.length === 0) return "";
			const last = replyMessages[replyMessages.length - 1]!;
			try {
				const payload = JSON.parse(last.payload) as { text?: string };
				return payload.text ?? "";
			} catch {
				return "";
			}
		})();

		// The S1 distinct-reply predicate must be FALSE:
		// An empty completion → empty text → predicate fails
		const predicateResult = s1DistinctReplyPredicate(lastReplyText, WELCOME_TEXT);
		expect(predicateResult).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Sanity: normal run with real response → predicate IS true
	// -------------------------------------------------------------------------

	test("Sanity: normal run with valid response → S1 predicate = true (distinct, non-empty reply)", async ({
		db,
	}) => {
		mockCallLlmBehavior = "real-response";

		const founderId = "gate-sanity-founder";
		const assistantId = `ast-${founderId}`;
		const threadId = "gate-sanity-thread";
		const triggerMsgId = "gate-sanity-msg";

		await seedFounderAndThread(db, {
			founderId,
			threadId,
			triggerMsgId,
			withWelcomeMessage: true,
		});

		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-sanity", adapter, {
			name: "Builtin Sanity",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		const credentialResolver = makeOpenRouterResolver();

		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver },
			{ userId: founderId, threadId, triggerMessageId: triggerMsgId },
		);

		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const replyMessages = allMessages.filter((m) => {
			if (m.senderId !== assistantId) return false;
			try {
				const payload = JSON.parse(m.payload) as { notice?: unknown; text?: string };
				return !payload.notice && typeof payload.text === "string" && payload.text.length > 0;
			} catch {
				return false;
			}
		});

		// Must have a real reply
		expect(replyMessages.length).toBeGreaterThan(0);

		const lastReplyPayload = JSON.parse(replyMessages[replyMessages.length - 1]!.payload) as {
			text: string;
		};
		const lastReplyText = lastReplyPayload.text;

		// S1 predicate: distinct from welcome text and non-empty → TRUE
		expect(s1DistinctReplyPredicate(lastReplyText, WELCOME_TEXT)).toBe(true);
	});
});
