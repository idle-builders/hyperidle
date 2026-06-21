/**
 * AH6 A2 — Per-agent model seam integration test.
 *
 * Proves that when the assistant agent has modelProvider:"openrouter" + modelId set,
 * runAssistantTurn routes through resolveAgentModel (per-agent branch) — not the
 * global resolveModelTier path — and the resolved model.model that reaches callLlm
 * equals the seeded per-agent modelId (not a BUILT_IN_GATEWAY_CONFIG tier id).
 *
 * This is a key-free, deterministic everyday guard (runs on every commit).
 * The live run in smoke:ah6 is the periodic real proof.
 *
 * The stub callLlm captures options.model.model so we can assert on what model
 * reached the interception point. No real LLM call is made.
 *
 * Per architecture §4 / SUGGESTION-1: assert on the resolved model.model, NOT
 * a hardcoded string and NOT BUILT_IN_GATEWAY_CONFIG tier ids.
 *
 * @lore AH6: This test imports llm-cassette.ts (which doesn't exist yet) to set
 * LLM_CASSETTE_MODE=replay so callLlm dispatches through the stub path rather than
 * the real network. The stub cassette returns a minimal response.
 */

import { messages, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { runAssistantTurn } from "../services/assistant-turn.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOUNDER_ID = "founder-per-agent-seam-test";
const ASSISTANT_ID = `ast-${FOUNDER_ID}`;
const THREAD_ID = "thread-per-agent-seam";
const TRIGGER_MSG_ID = "msg-trigger-per-agent-seam";

// The per-agent model we seed — must be an OpenRouter model id (not a BUILT_IN tier id)
const PER_AGENT_MODEL_ID = "deepseek/deepseek-v4-flash";
const PER_AGENT_PROVIDER = "openrouter";

// BUILT_IN tier ids from model-gateway.ts — per-agent seam must NOT use these
const BUILT_IN_TIER_IDS = new Set(["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"]);

// ---------------------------------------------------------------------------
// Stub CredentialResolver that returns an openrouter key
// ---------------------------------------------------------------------------

function makeCredentialResolver(openrouterKey = "sk-or-test-seam-key"): CredentialResolver {
	return {
		async resolve(name: string): Promise<string | null> {
			if (name === "openrouter_api_key") return openrouterKey;
			return null;
		},
	};
}

// ---------------------------------------------------------------------------
// Captured callLlm call tracking
// The green impl must expose a way to intercept callLlm for testing.
// We use vi.mock at the module level to capture what model reaches callLlm.
// This is the per-agent seam observation (Design-it-twice §B).
// ---------------------------------------------------------------------------

// We capture the model that reached callLlm via a module mock.
// The mock returns a minimal valid LlmResponse so runAssistantTurn can complete.
const capturedCallLlmModels: Array<{ model: string; provider: string }> = [];

vi.mock("../harness/llm-client.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../harness/llm-client.js")>();
	return {
		...original,
		callLlm: vi.fn(async (options: import("../harness/llm-client.js").CallLlmOptions) => {
			// Capture what model reached the interception point
			capturedCallLlmModels.push({
				model: options.model.model,
				provider: options.model.provider,
			});
			// Return a minimal valid response so the turn completes
			return {
				stopReason: "end_turn" as const,
				content: [
					{ type: "text" as const, text: "Seam test reply: AH6 per-agent path confirmed." },
				],
				usage: { inputTokens: 10, outputTokens: 8 },
			};
		}),
	};
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AH6: per-agent model seam (resolveAgentModel, not resolveModelTier)", () => {
	beforeEach(() => {
		capturedCallLlmModels.length = 0;
		// Ensure no cassette mode bleeds in from environment
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("runAssistantTurn routes through resolveAgentModel when agent has modelProvider:openrouter + modelId", async ({
		db,
	}) => {
		// Arrange: seed founder user
		await db.insert(users).values({
			id: FOUNDER_ID,
			name: "Seam Test Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		// Seed assistant agent with per-agent openrouter model
		await db.insert(users).values({
			id: ASSISTANT_ID,
			name: "Assistant",
			role: "assistant",
			kind: "ai",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: PER_AGENT_MODEL_ID,
			modelProvider: PER_AGENT_PROVIDER,
			systemPrompt: "You are a helpful assistant.",
			maxConcurrentSessions: 1,
			createdAt: new Date().toISOString(),
		});

		// Seed the assistant thread
		await db.insert(threads).values({
			id: THREAD_ID,
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			participants: JSON.stringify([FOUNDER_ID, ASSISTANT_ID]),
			pinned: false,
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		// Seed the trigger message (human message)
		await db.insert(messages).values({
			id: TRIGGER_MSG_ID,
			threadId: THREAD_ID,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: JSON.stringify({ text: "What is the per-agent model seam?" }),
			clientKey: `ck-${TRIGGER_MSG_ID}`,
			createdAt: new Date().toISOString(),
		});

		// Build an adapter pool with a real BuiltinHarnessAdapter
		// (it will call the mocked callLlm, not a real LLM)
		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-seam-test", adapter, {
			name: "Builtin Seam Test",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		const credentialResolver = makeCredentialResolver();

		// Act: run the assistant turn
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver },
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: TRIGGER_MSG_ID },
		);

		// Assert: callLlm was called (the per-agent path reached the interception point)
		expect(capturedCallLlmModels.length).toBeGreaterThan(0);

		// The model that reached callLlm must be the per-agent model id
		const capturedModel = capturedCallLlmModels[0]!;
		expect(capturedModel.model).toBe(PER_AGENT_MODEL_ID);
		expect(capturedModel.provider).toBe(PER_AGENT_PROVIDER);

		// Must NOT be a BUILT_IN tier id (which would indicate resolveModelTier was used)
		expect(BUILT_IN_TIER_IDS.has(capturedModel.model)).toBe(false);
	});

	test("per-agent seam: assistant agent message is persisted (turn completes, not silently dropped)", async ({
		db,
	}) => {
		await db.insert(users).values({
			id: `${FOUNDER_ID}-2`,
			name: "Seam Test Founder 2",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		const assistantId2 = `ast-${FOUNDER_ID}-2`;
		await db.insert(users).values({
			id: assistantId2,
			name: "Assistant",
			role: "assistant",
			kind: "ai",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: PER_AGENT_MODEL_ID,
			modelProvider: PER_AGENT_PROVIDER,
			systemPrompt: "You are a helpful assistant.",
			maxConcurrentSessions: 1,
			createdAt: new Date().toISOString(),
		});

		const threadId2 = "thread-per-agent-seam-2";
		await db.insert(threads).values({
			id: threadId2,
			hostKind: "user",
			hostId: `${FOUNDER_ID}-2`,
			initiatorId: `${FOUNDER_ID}-2`,
			participants: JSON.stringify([`${FOUNDER_ID}-2`, assistantId2]),
			pinned: false,
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		const triggerMsgId2 = "msg-trigger-per-agent-seam-2";
		await db.insert(messages).values({
			id: triggerMsgId2,
			threadId: threadId2,
			senderId: `${FOUNDER_ID}-2`,
			type: "plain",
			payload: JSON.stringify({ text: "Test per-agent seam completion." }),
			clientKey: `ck-${triggerMsgId2}`,
			createdAt: new Date().toISOString(),
		});

		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-seam-test-2", adapter, {
			name: "Builtin Seam Test 2",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		const credentialResolver = makeCredentialResolver();

		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver },
			{ userId: `${FOUNDER_ID}-2`, threadId: threadId2, triggerMessageId: triggerMsgId2 },
		);

		// Assert: an assistant reply message was persisted on the thread
		const threadMessages = await db.select().from(messages).where(eq(messages.threadId, threadId2));

		const assistantMessages = threadMessages.filter(
			(m) => m.senderId === assistantId2 && m.type === "plain",
		);

		// There should be at least one assistant reply (or a notice)
		expect(assistantMessages.length).toBeGreaterThan(0);
	});

	test("per-agent seam: with anthropic provider and modelId set, callLlm receives anthropic model", async ({
		db,
	}) => {
		capturedCallLlmModels.length = 0;

		const founderId = `${FOUNDER_ID}-3`;
		await db.insert(users).values({
			id: founderId,
			name: "Seam Test Founder 3",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		const assistantId3 = `ast-${founderId}`;
		const anthropicModelId = "claude-haiku-4-5"; // a current anthropic model (not a tier id alias)

		await db.insert(users).values({
			id: assistantId3,
			name: "Assistant",
			role: "assistant",
			kind: "ai",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: anthropicModelId,
			modelProvider: "anthropic",
			systemPrompt: "You are a helpful assistant.",
			maxConcurrentSessions: 1,
			createdAt: new Date().toISOString(),
		});

		const threadId3 = "thread-per-agent-seam-3";
		await db.insert(threads).values({
			id: threadId3,
			hostKind: "user",
			hostId: founderId,
			initiatorId: founderId,
			participants: JSON.stringify([founderId, assistantId3]),
			pinned: false,
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		const triggerMsgId3 = "msg-trigger-per-agent-seam-3";
		await db.insert(messages).values({
			id: triggerMsgId3,
			threadId: threadId3,
			senderId: founderId,
			type: "plain",
			payload: JSON.stringify({ text: "Test anthropic per-agent path." }),
			clientKey: `ck-${triggerMsgId3}`,
			createdAt: new Date().toISOString(),
		});

		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-seam-test-3", adapter, {
			name: "Builtin Seam Test 3",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		// Credential resolver that returns an anthropic key
		const anthropicCredentialResolver: CredentialResolver = {
			async resolve(name: string): Promise<string | null> {
				if (name === "anthropic_api_key") return "sk-ant-test-per-agent";
				return null;
			},
		};

		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver: anthropicCredentialResolver },
			{ userId: founderId, threadId: threadId3, triggerMessageId: triggerMsgId3 },
		);

		// The model that reached callLlm should be the per-agent anthropic model id
		expect(capturedCallLlmModels.length).toBeGreaterThan(0);
		const captured = capturedCallLlmModels[0]!;
		expect(captured.model).toBe(anthropicModelId);
		expect(captured.provider).toBe("anthropic");
	});

	test("resolveAgentModel fails with MissingCredentialError when openrouter key absent", async ({
		db,
	}) => {
		const founderId = `${FOUNDER_ID}-nokey`;
		await db.insert(users).values({
			id: founderId,
			name: "No Key Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		const assistantIdNoKey = `ast-${founderId}`;
		await db.insert(users).values({
			id: assistantIdNoKey,
			name: "Assistant",
			role: "assistant",
			kind: "ai",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: PER_AGENT_MODEL_ID,
			modelProvider: PER_AGENT_PROVIDER,
			systemPrompt: "You are a helpful assistant.",
			maxConcurrentSessions: 1,
			createdAt: new Date().toISOString(),
		});

		const threadIdNoKey = "thread-per-agent-seam-nokey";
		await db.insert(threads).values({
			id: threadIdNoKey,
			hostKind: "user",
			hostId: founderId,
			initiatorId: founderId,
			participants: JSON.stringify([founderId, assistantIdNoKey]),
			pinned: false,
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		const triggerMsgIdNoKey = "msg-trigger-per-agent-seam-nokey";
		await db.insert(messages).values({
			id: triggerMsgIdNoKey,
			threadId: threadIdNoKey,
			senderId: founderId,
			type: "plain",
			payload: JSON.stringify({ text: "Test missing key path." }),
			clientKey: `ck-${triggerMsgIdNoKey}`,
			createdAt: new Date().toISOString(),
		});

		const adapterPool = new AdapterPool();
		const adapter = new BuiltinHarnessAdapter();
		adapterPool.register("builtin-seam-nokey", adapter, {
			name: "Builtin Seam No Key",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		// Credential resolver that returns null for all keys (no credentials configured)
		const noKeyResolver: CredentialResolver = {
			async resolve(_name: string): Promise<string | null> {
				return null;
			},
		};

		// runAssistantTurn never throws — it persists a notice message instead
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver: noKeyResolver },
			{ userId: founderId, threadId: threadIdNoKey, triggerMessageId: triggerMsgIdNoKey },
		);

		// Assert: a missing_key notice is persisted (not silence)
		const threadMessages = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadIdNoKey));

		const noticeMessages = threadMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as {
					notice?: { kind: string };
				};
				return payload.notice?.kind === "missing_key";
			} catch {
				return false;
			}
		});

		// Must have persisted a missing_key notice (never silent)
		expect(noticeMessages.length).toBeGreaterThan(0);
		// No assistant reply (not a real turn result)
		const replyMessages = threadMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as { notice?: unknown; text?: string };
				return !payload.notice && typeof payload.text === "string";
			} catch {
				return false;
			}
		});
		expect(replyMessages.length).toBe(0);
	});
});
