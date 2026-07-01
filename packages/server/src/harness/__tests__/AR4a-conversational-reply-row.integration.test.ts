/**
 * AR4a — Four-harness conversational reply-row test (the CRITICAL gate).
 *
 * This is the load-bearing test that gates the carve-out removal. It proves:
 *
 *   AC1 — A conversational turn through provisionSession (conversational mode)
 *         persists a non-empty assistant reply row on the DB, equal to the
 *         model's real completion text, on ALL FOUR harnesses.
 *
 * Per §5 AR4a: remove the assistant files from BUILTIN_ONLY_INTEGRATION
 * (scripts/lib/honest-harness-predicate.ts:70) ONLY AFTER this test is green
 * on all four lanes. Premature removal relocates the AT1 symmetry failure
 * instead of fixing it.
 *
 * Lanes:
 *   Lane 1 [harness:builtin]  — builtin adapter + OpenRouter deepseek-flash
 *   Lane 2 [harness:claude]   — real `claude` binary + haiku
 *   Lane 3 [harness:codex]    — real `codex` binary + gpt-5.4-mini
 *   Lane 4 [harness:opencode] — real `opencode` binary + glm-4.7-flash
 *
 * All four lanes use HARNESS_TEST_MODELS (locked tiny-baseline, AR7) and
 * requireHarness hard-fail (never skipIf).
 *
 * @lore AR4a: The test seeds a minimal conversational context: a human user,
 * an ast-* assistant agent row (harnessType per lane), an assistant thread,
 * and one trigger message ("Reply with PONG and nothing else"). After calling
 * runConversationalTurnThroughHarness (defined below), we assert the persisted
 * DB reply row is non-empty, non-notice, and contains the model's real answer.
 *
 * @lore AR4a: The stub taskId ("conv-stub-task") is the expected conversational-mode
 * stub. Callers ignore it (architecture §5 AR4a NIT — documented with @lore AR4a
 * in the implementation). This test does not assert on it.
 */

import * as os from "node:os";
import { messages as messagesTable } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import {
	runConversationalTurnThroughHarness,
	seedConversationalTurnDomain,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";

// ──────────────────────────────────────────────────────────────────────────────
// All four harnesses required — hard-fail, never skip (AR1 rule)
// ──────────────────────────────────────────────────────────────────────────────

requireHarness("builtin", "claude", "codex", "opencode");

const NOW = new Date().toISOString();

// ──────────────────────────────────────────────────────────────────────────────
// Lane 1 — [harness:builtin]
// ──────────────────────────────────────────────────────────────────────────────

describe("[harness:builtin] AR4a — conversational reply row (AC1)", () => {
	const userId = `ar4a-builtin-user-${Date.now()}`;
	const threadId = `ar4a-builtin-thread-${Date.now()}`;
	const triggerMessageId = `ar4a-builtin-msg-${Date.now()}`;
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = os.tmpdir();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
	});

	test("builtin conversational turn → persists non-empty ast-* reply row (real model, conversationalReply channel)", async ({
		db,
		eventBus,
	}) => {
		await seedConversationalTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			harnessType: "builtin",
			modelId: HARNESS_TEST_MODELS.builtin.model,
			modelProvider: "openrouter",
			now: NOW,
		});

		await runConversationalTurnThroughHarness(
			{ db, eventBus, tmpDir },
			{ userId, threadId, triggerMessageId, harnessName: "builtin" },
		);

		const assistantId = `ast-${userId}`;
		const msgs = await db.select().from(messagesTable).where(eq(messagesTable.threadId, threadId));
		const astReply = msgs.find((m) => m.senderId === assistantId && m.type === "plain");

		expect(astReply).toBeDefined();
		const payload = JSON.parse(astReply!.payload) as Record<string, unknown>;
		expect(payload.notice).toBeUndefined();
		const text = payload.text as string | undefined;
		expect(typeof text).toBe("string");
		expect((text ?? "").length).toBeGreaterThan(0);
	}, 240_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// Lane 2 — [harness:claude]
// ──────────────────────────────────────────────────────────────────────────────

describe("[harness:claude] AR4a — conversational reply row (AC1)", () => {
	const userId = `ar4a-claude-user-${Date.now()}`;
	const threadId = `ar4a-claude-thread-${Date.now()}`;
	const triggerMessageId = `ar4a-claude-msg-${Date.now()}`;
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;

	beforeEach(async () => {
		tmpDir = os.tmpdir();
		bridge = await startMcpBridgeServer();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
	});

	test("claude conversational turn → persists non-empty ast-* reply row (real claude binary, conversationalReply channel)", async ({
		db,
		eventBus,
	}) => {
		await seedConversationalTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			harnessType: "claude-code",
			modelId: HARNESS_TEST_MODELS.claude.model,
			modelProvider: "anthropic",
			now: NOW,
		});

		await runConversationalTurnThroughHarness(
			{ db, eventBus, tmpDir, bridge },
			{ userId, threadId, triggerMessageId, harnessName: "claude" },
		);

		const assistantId = `ast-${userId}`;
		const msgs = await db.select().from(messagesTable).where(eq(messagesTable.threadId, threadId));
		const astReply = msgs.find((m) => m.senderId === assistantId && m.type === "plain");

		expect(astReply).toBeDefined();
		const payload = JSON.parse(astReply!.payload) as Record<string, unknown>;
		expect(payload.notice).toBeUndefined();
		const text = payload.text as string | undefined;
		expect(typeof text).toBe("string");
		expect((text ?? "").length).toBeGreaterThan(0);
	}, 240_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// Lane 3 — [harness:codex]
// ──────────────────────────────────────────────────────────────────────────────

describe("[harness:codex] AR4a — conversational reply row (AC1)", () => {
	const userId = `ar4a-codex-user-${Date.now()}`;
	const threadId = `ar4a-codex-thread-${Date.now()}`;
	const triggerMessageId = `ar4a-codex-msg-${Date.now()}`;
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;

	beforeEach(async () => {
		tmpDir = os.tmpdir();
		bridge = await startMcpBridgeServer();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
	});

	test("codex conversational turn → persists non-empty ast-* reply row (real codex binary, conversationalReply channel)", async ({
		db,
		eventBus,
	}) => {
		await seedConversationalTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			harnessType: "codex",
			modelId: HARNESS_TEST_MODELS.codex.model,
			modelProvider: "openai-compatible",
			now: NOW,
		});

		await runConversationalTurnThroughHarness(
			{ db, eventBus, tmpDir, bridge },
			{ userId, threadId, triggerMessageId, harnessName: "codex" },
		);

		const assistantId = `ast-${userId}`;
		const msgs = await db.select().from(messagesTable).where(eq(messagesTable.threadId, threadId));
		const astReply = msgs.find((m) => m.senderId === assistantId && m.type === "plain");

		expect(astReply).toBeDefined();
		const payload = JSON.parse(astReply!.payload) as Record<string, unknown>;
		expect(payload.notice).toBeUndefined();
		const text = payload.text as string | undefined;
		expect(typeof text).toBe("string");
		expect((text ?? "").length).toBeGreaterThan(0);
	}, 240_000);
});

// ──────────────────────────────────────────────────────────────────────────────
// Lane 4 — [harness:opencode]
// ──────────────────────────────────────────────────────────────────────────────

describe("[harness:opencode] AR4a — conversational reply row (AC1)", () => {
	const userId = `ar4a-opencode-user-${Date.now()}`;
	const threadId = `ar4a-opencode-thread-${Date.now()}`;
	const triggerMessageId = `ar4a-opencode-msg-${Date.now()}`;
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;

	beforeEach(async () => {
		tmpDir = os.tmpdir();
		bridge = await startMcpBridgeServer();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
	});

	test("opencode conversational turn → persists non-empty ast-* reply row (real opencode binary, conversationalReply channel)", async ({
		db,
		eventBus,
	}) => {
		await seedConversationalTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			harnessType: "opencode",
			modelId: HARNESS_TEST_MODELS.opencode.model,
			// @lore AR4a: opencode's modelProvider in the DB row is "openai-compatible"
			// (per HARNESS_TEST_MODELS). runConversationalTurnThroughHarness bypasses
			// resolveAgentModel by passing deps.resolvedModel directly (the locked
			// harnessTestResolvedModel), so this value is not used for model resolution.
			modelProvider: HARNESS_TEST_MODELS.opencode.provider,
			now: NOW,
		});

		await runConversationalTurnThroughHarness(
			{ db, eventBus, tmpDir, bridge },
			{ userId, threadId, triggerMessageId, harnessName: "opencode" },
		);

		const assistantId = `ast-${userId}`;
		const msgs = await db.select().from(messagesTable).where(eq(messagesTable.threadId, threadId));
		const astReply = msgs.find((m) => m.senderId === assistantId && m.type === "plain");

		expect(astReply).toBeDefined();
		const payload = JSON.parse(astReply!.payload) as Record<string, unknown>;
		expect(payload.notice).toBeUndefined();
		const text = payload.text as string | undefined;
		expect(typeof text).toBe("string");
		expect((text ?? "").length).toBeGreaterThan(0);
	}, 240_000);
});
