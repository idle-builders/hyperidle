/**
 * AV1 AC4a — After onboarding, the Assistant opens READY.
 *
 * Proves the headline deliverable: a properly-configured assistant (primary
 * harness set on the stub + onboarding key present) produces NO
 * `missing_key` / `missing_harness` notice card on its first turn.
 *
 * This is a builtin-only-by-construction path: `runAssistantTurn` has no
 * sandbox cwd and no .mcp.json bridge — CLI harnesses cannot run here
 * regardless of test configuration. Registered in BUILTIN_ONLY_INTEGRATION.
 *
 * Gate: requireHarness("builtin") — OPENROUTER_API_KEY must be present.
 * A missing key means the work is not done; hard-fail, never skip.
 *
 * Proves:
 *   1. Properly-configured assistant (harnessType + openrouter key) → NO
 *      missing_key or missing_harness notice on first turn. A real reply or a
 *      provider_error may be persisted (either proves the configured path ran;
 *      neither is the burst the AC guards against).
 *   2. SANITY-BREAK: assistant with harnessType=null → missing_harness notice
 *      IS persisted. Proves assertion (1) is meaningful, not trivially green.
 *
 * @lore AV1: The sanity-break uses harnessType="builtin" on the assistant row + an
 * EMPTY AdapterPool (no registered adapters). agent.harnessType set + pool.select()
 * returning null → session-provisioning.ts throws NoEligibleHarnessError(harnessType)
 * → missing_harness notice. This is the exact regression class the AC guards against.
 * (harnessType=null + empty pool takes a different code path → generic Error → provider_error.)
 */

import { messages, threads, users } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { runAssistantTurn } from "../services/assistant-turn.js";
import { EnvCredentialResolver } from "../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Gate: builtin harness requires OPENROUTER_API_KEY. Hard-fail if absent.
// ---------------------------------------------------------------------------
requireHarness("builtin");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

// The locked tiny model for builtin — same as HARNESS_TEST_MODELS.builtin.
// Inline to avoid importing from the seam (this is a service test, not a
// 4-harness provisioning test, so provision-real-session.ts is not the entrypoint).
const BUILTIN_LOCKED_MODEL_ID = "deepseek/deepseek-v4-flash";
const BUILTIN_LOCKED_PROVIDER = "openrouter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real AdapterPool with the builtin harness registered. */
function makeBuiltinPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AV1 AC4a: onboarded assistant opens READY (no missing_key/missing_harness notice)", () => {
	beforeEach(() => {
		setActiveStrategy(minimalStrategy);
	});
	afterEach(() => {
		clearActiveStrategy();
	});

	// -------------------------------------------------------------------------
	// Test 1: properly-configured assistant → NO notice burst
	// -------------------------------------------------------------------------

	test("properly-configured assistant (harnessType + openrouter key) produces no missing_key or missing_harness notice", async ({
		db,
		eventBus,
	}) => {
		// --- Arrange: seed human user + assistant stub as onboarding would create ---
		const userId = "av1-ready-user";
		const assistantId = `ast-${userId}`;
		const threadId = `thr-ast-${userId}`;
		const triggerMsgId = `msg-av1-ready-trigger`;

		await db.insert(users).values({
			id: userId,
			kind: "human",
			name: "AV1 Ready User",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		// Assistant stub: harnessType set (as onboarding creates it) + openrouter model
		// @lore AV1: Uses openrouter/deepseek-v4-flash (the locked tiny model) so the
		// EnvCredentialResolver can satisfy the resolve("openrouter_api_key") call.
		await db.insert(users).values({
			id: assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: BUILTIN_LOCKED_MODEL_ID,
			modelProvider: BUILTIN_LOCKED_PROVIDER,
			systemPrompt: "You are a helpful AI assistant. Be concise.",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		});

		// Thread
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: userId,
			initiatorId: userId,
			participants: JSON.stringify([userId, assistantId]),
			pinned: false,
			createdAt: NOW,
			lastActiveAt: NOW,
		});

		// Trigger message (the human's first turn)
		await db.insert(messages).values({
			id: triggerMsgId,
			threadId,
			senderId: userId,
			type: "plain",
			payload: JSON.stringify({ text: "Hello" }),
			clientKey: `ck-${triggerMsgId}`,
			createdAt: NOW,
		});

		// --- Act: run the real assistant turn ---
		// EnvCredentialResolver reads OPENROUTER_API_KEY from env.
		// requireHarness("builtin") at the top of this file guarantees the key is present.
		const deps = {
			db,
			eventBus,
			adapterPool: makeBuiltinPool(),
			credentialResolver: new EnvCredentialResolver(),
		};

		await runAssistantTurn(deps, {
			userId,
			threadId,
			triggerMessageId: triggerMsgId,
		});

		// --- Assert: NO missing_key or missing_harness notice persisted ---
		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const assistantMessages = allMessages.filter((m) => m.senderId === assistantId);
		expect(assistantMessages.length).toBeGreaterThan(0); // At least one message was persisted

		const noticeMessages = assistantMessages.filter((m) => {
			try {
				const p = JSON.parse(m.payload) as Record<string, unknown>;
				const notice = p.notice as Record<string, unknown> | undefined;
				return notice?.kind === "missing_key" || notice?.kind === "missing_harness";
			} catch {
				return false;
			}
		});

		// The headline assertion: configured assistant MUST NOT produce these notices
		expect(noticeMessages).toHaveLength(0);
	}, 60_000);

	// -------------------------------------------------------------------------
	// Test 2: SANITY-BREAK — misconfigured assistant (null harnessType) → missing_harness notice
	// -------------------------------------------------------------------------

	test("SANITY-BREAK: assistant with no adapter in pool produces missing_harness notice (proves test-1 assertion is non-trivial)", async ({
		db,
		eventBus,
	}) => {
		// --- Arrange: assistant stub with harnessType="builtin" but NO builtin adapter in pool ---
		const userId = "av1-miscfg-user";
		const assistantId = `ast-${userId}`;
		const threadId = `thr-ast-${userId}`;
		const triggerMsgId = `msg-av1-miscfg-trigger`;

		await db.insert(users).values({
			id: userId,
			kind: "human",
			name: "AV1 Misconfigured User",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		// Assistant stub: harnessType="builtin" set on the row, but we pass an empty pool
		// that has NO registered builtin adapter.
		// @lore AV1 sanity-break: The key mechanism is agent.harnessType set + pool.select()
		// returns null → session-provisioning.ts throws NoEligibleHarnessError(agent.harnessType)
		// → mapErrorToNotice maps to missing_harness notice. If harnessType were null, the same
		// empty-pool scenario would throw a generic Error → provider_error (not missing_harness).
		// We need harnessType set to trigger the specific NoEligibleHarnessError code path.
		// This is the sanity-break: if test-1's production wiring were reverted to NOT set
		// harnessType on the stub, test-1 would pass trivially (no LLM call → no notice at all)
		// rather than proving the configured path ran without the notice burst.
		await db.insert(users).values({
			id: assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: BUILTIN_LOCKED_MODEL_ID,
			modelProvider: BUILTIN_LOCKED_PROVIDER,
			systemPrompt: "You are a helpful AI assistant.",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		});

		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: userId,
			initiatorId: userId,
			participants: JSON.stringify([userId, assistantId]),
			pinned: false,
			createdAt: NOW,
			lastActiveAt: NOW,
		});

		await db.insert(messages).values({
			id: triggerMsgId,
			threadId,
			senderId: userId,
			type: "plain",
			payload: JSON.stringify({ text: "Hello" }),
			clientKey: `ck-${triggerMsgId}`,
			createdAt: NOW,
		});

		// --- Act: run turn with an empty pool (no builtin adapter registered) ---
		// agent.harnessType="builtin" + pool.select() returns null →
		// session-provisioning throws NoEligibleHarnessError("builtin") →
		// mapErrorToNotice maps to missing_harness notice.
		const emptyPool = new AdapterPool();

		const deps = {
			db,
			eventBus,
			adapterPool: emptyPool,
			credentialResolver: new EnvCredentialResolver(),
		};

		await runAssistantTurn(deps, {
			userId,
			threadId,
			triggerMessageId: triggerMsgId,
		});

		// --- Assert: missing_harness notice IS persisted ---
		const allMessages = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const assistantMessages = allMessages.filter((m) => m.senderId === assistantId);
		expect(assistantMessages.length).toBeGreaterThan(0);

		const missingHarnessNotice = assistantMessages.find((m) => {
			try {
				const p = JSON.parse(m.payload) as Record<string, unknown>;
				const notice = p.notice as Record<string, unknown> | undefined;
				return notice?.kind === "missing_harness";
			} catch {
				return false;
			}
		});

		// The sanity-break assertion: misconfigured assistant MUST produce missing_harness
		expect(missingHarnessNotice).toBeDefined();
	}, 10_000);
});
