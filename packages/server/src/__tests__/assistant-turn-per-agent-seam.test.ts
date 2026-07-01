/**
 * AR4 — Per-agent model seam: demoted from .integration.test.ts to .test.ts unit.
 *
 * The subject is model-resolution routing: does runAssistantTurn select
 * resolveAgentModel (per-agent branch) vs resolveModelTier (global branch)?
 * This is pure logic — vi.mock captures the model id at callLlm, no real
 * harness runs. A resolveAgentModel unit could also prove this without a DB;
 * retaining the DB fixture so assertions match the original file's shape.
 *
 * "message persisted" assertion (test-2 in the original) migrates to
 * AH3-assistant-turn-real.integration.test.ts H1 (real builtin turn, W-3).
 *
 * @lore AR4: Full demotion is correct — the callLlm capture is a model-routing
 *   probe, not harness behavior. Forcing 4 real LLMs to prove "model id X was
 *   selected" would be the exact over-engineering the demotion path avoids.
 *   See architecture.md §4 (per-agent-seam triage).
 */

import { messages, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { runAssistantTurn } from "../services/assistant-turn.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const FOUNDER_ID = "founder-per-agent-seam-test";
const ASSISTANT_ID = `ast-${FOUNDER_ID}`;
const THREAD_ID = "thread-per-agent-seam";
const TRIGGER_MSG_ID = "msg-trigger-per-agent-seam";

const PER_AGENT_MODEL_ID = "deepseek/deepseek-v4-flash";
const PER_AGENT_PROVIDER = "openrouter";
const BUILT_IN_TIER_IDS = new Set(["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"]);

// ─── Stub CredentialResolver ─────────────────────────────────────────────────

function makeCredentialResolver(openrouterKey = "sk-or-test-seam-key"): CredentialResolver {
	return {
		async resolve(name: string): Promise<string | null> {
			if (name === "openrouter_api_key") return openrouterKey;
			return null;
		},
	};
}

// ─── callLlm mock ─────────────────────────────────────────────────────────────

const capturedCallLlmModels: Array<{ model: string; provider: string }> = [];

vi.mock("../harness/llm-client.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../harness/llm-client.js")>();
	return {
		...original,
		callLlm: vi.fn(async (options: import("../harness/llm-client.js").CallLlmOptions) => {
			capturedCallLlmModels.push({
				model: options.model.model,
				provider: options.model.provider,
			});
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AH6: per-agent model seam (resolveAgentModel, not resolveModelTier)", () => {
	beforeEach(() => {
		capturedCallLlmModels.length = 0;
		vi.unstubAllEnvs();
		// AR4a: runAssistantTurn now delegates to provisionSession which calls getActiveStrategy().
		// The test uses {db} only (not {app}), so the fixture doesn't set strategy — set it here.
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("runAssistantTurn routes through resolveAgentModel when agent has modelProvider:openrouter + modelId", async ({
		db,
	}) => {
		await db.insert(users).values({
			id: FOUNDER_ID,
			name: "Seam Test Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

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

		await db.insert(messages).values({
			id: TRIGGER_MSG_ID,
			threadId: THREAD_ID,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: JSON.stringify({ text: "What is the per-agent model seam?" }),
			clientKey: `ck-${TRIGGER_MSG_ID}`,
			createdAt: new Date().toISOString(),
		});

		const adapterPool = new AdapterPool();
		adapterPool.register("builtin-seam-test", new BuiltinHarnessAdapter(), {
			name: "Builtin Seam Test",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const eventBus = new EventBus();
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver: makeCredentialResolver() },
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: TRIGGER_MSG_ID },
		);

		expect(capturedCallLlmModels.length).toBeGreaterThan(0);
		const capturedModel = capturedCallLlmModels[0]!;
		expect(capturedModel.model).toBe(PER_AGENT_MODEL_ID);
		expect(capturedModel.provider).toBe(PER_AGENT_PROVIDER);
		expect(BUILT_IN_TIER_IDS.has(capturedModel.model)).toBe(false);
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
		const anthropicModelId = "claude-haiku-4-5";

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

		await db.insert(threads).values({
			id: "thread-per-agent-seam-3",
			hostKind: "user",
			hostId: founderId,
			initiatorId: founderId,
			participants: JSON.stringify([founderId, assistantId3]),
			pinned: false,
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		await db.insert(messages).values({
			id: "msg-trigger-per-agent-seam-3",
			threadId: "thread-per-agent-seam-3",
			senderId: founderId,
			type: "plain",
			payload: JSON.stringify({ text: "Test anthropic per-agent path." }),
			clientKey: "ck-msg-trigger-per-agent-seam-3",
			createdAt: new Date().toISOString(),
		});

		const adapterPool = new AdapterPool();
		adapterPool.register("builtin-seam-test-3", new BuiltinHarnessAdapter(), {
			name: "Builtin Seam Test 3",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const anthropicCredentialResolver: CredentialResolver = {
			async resolve(name: string): Promise<string | null> {
				if (name === "anthropic_api_key") return "sk-ant-test-per-agent";
				return null;
			},
		};

		const eventBus = new EventBus();
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver: anthropicCredentialResolver },
			{
				userId: founderId,
				threadId: "thread-per-agent-seam-3",
				triggerMessageId: "msg-trigger-per-agent-seam-3",
			},
		);

		expect(capturedCallLlmModels.length).toBeGreaterThan(0);
		const captured = capturedCallLlmModels[0]!;
		expect(captured.model).toBe(anthropicModelId);
		expect(captured.provider).toBe("anthropic");
	});

	test("resolveAgentModel fails with MissingCredentialError when openrouter key absent → notice persisted", async ({
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

		await db.insert(messages).values({
			id: "msg-trigger-per-agent-seam-nokey",
			threadId: threadIdNoKey,
			senderId: founderId,
			type: "plain",
			payload: JSON.stringify({ text: "Test missing key path." }),
			clientKey: "ck-msg-trigger-per-agent-seam-nokey",
			createdAt: new Date().toISOString(),
		});

		const adapterPool = new AdapterPool();
		adapterPool.register("builtin-seam-nokey", new BuiltinHarnessAdapter(), {
			name: "Builtin Seam No Key",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const noKeyResolver: CredentialResolver = {
			async resolve(_name: string): Promise<string | null> {
				return null;
			},
		};

		const eventBus = new EventBus();
		await runAssistantTurn(
			{ db, eventBus, adapterPool, credentialResolver: noKeyResolver },
			{
				userId: founderId,
				threadId: threadIdNoKey,
				triggerMessageId: "msg-trigger-per-agent-seam-nokey",
			},
		);

		const threadMessages = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadIdNoKey));

		const noticeMessages = threadMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as { notice?: { kind: string } };
				return payload.notice?.kind === "missing_key";
			} catch {
				return false;
			}
		});

		expect(noticeMessages.length).toBeGreaterThan(0);

		const replyMessages = threadMessages.filter((m) => {
			try {
				const payload = JSON.parse(m.payload) as { notice?: unknown; text?: string };
				return !payload.notice && typeof payload.text === "string" && m.senderId !== founderId;
			} catch {
				return false;
			}
		});
		expect(replyMessages.length).toBe(0);
	});
});
