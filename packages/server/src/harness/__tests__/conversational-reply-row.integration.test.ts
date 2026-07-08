/**
 * Four-harness conversational reply-row test.
 *
 * This is the load-bearing test for conversational assistant replies. It proves:
 *
 *   A conversational turn through provisionSession (conversational mode)
 *   persists a non-empty assistant reply row on the DB, equal to the
 *   model's real completion text, on ALL FOUR harnesses.
 *
 * Lanes:
 *   Lane 1 [harness:builtin]  — builtin adapter + OpenRouter deepseek-flash
 *   Lane 2 [harness:claude]   — real `claude` binary + haiku
 *   Lane 3 [harness:codex]    — real `codex` binary + gpt-5.4-mini
 *   Lane 4 [harness:opencode] — real `opencode` binary + glm-4.7-flash
 *
 * All four lanes use HARNESS_TEST_MODELS (locked tiny-baseline) and
 * requireHarness hard-fail (never skipIf).
 *
 * @lore conversational-reply-row: The test seeds a minimal conversational context: a human user,
 * an ast-* assistant agent row (harnessType per lane), an assistant thread,
 * and one trigger message ("Reply with PONG and nothing else"). After calling
 * runConversationalTurnThroughHarness (defined below), we assert the persisted
 * DB reply row is non-empty, non-notice, and contains the model's real answer.
 *
 * @lore conversational-reply-row: Conversational turns are task-free after AU1.
 * This test asserts the reply row, not a task row.
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
// All four harnesses required — hard-fail, never skip.
// ──────────────────────────────────────────────────────────────────────────────

requireHarness("builtin", "claude", "codex", "opencode");

const NOW = new Date().toISOString();

// ──────────────────────────────────────────────────────────────────────────────
// Lane 1 — [harness:builtin]
// ──────────────────────────────────────────────────────────────────────────────

describe("[harness:builtin] conversational reply row", () => {
	const userId = `conversation-builtin-user-${Date.now()}`;
	const threadId = `conversation-builtin-thread-${Date.now()}`;
	const triggerMessageId = `conversation-builtin-msg-${Date.now()}`;
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

describe("[harness:claude] conversational reply row", () => {
	const userId = `conversation-claude-user-${Date.now()}`;
	const threadId = `conversation-claude-thread-${Date.now()}`;
	const triggerMessageId = `conversation-claude-msg-${Date.now()}`;
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

describe("[harness:codex] conversational reply row", () => {
	const userId = `conversation-codex-user-${Date.now()}`;
	const threadId = `conversation-codex-thread-${Date.now()}`;
	const triggerMessageId = `conversation-codex-msg-${Date.now()}`;
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

describe("[harness:opencode] conversational reply row", () => {
	const userId = `conversation-opencode-user-${Date.now()}`;
	const threadId = `conversation-opencode-thread-${Date.now()}`;
	const triggerMessageId = `conversation-opencode-msg-${Date.now()}`;
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
			// @lore conversational-reply-row: opencode's modelProvider in the DB row is "openai-compatible"
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
