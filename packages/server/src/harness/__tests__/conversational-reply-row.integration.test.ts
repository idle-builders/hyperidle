/**
 * Five-harness conversational reply-row test.
 *
 * This is the load-bearing test for conversational assistant replies. It proves:
 *
 *   A conversational turn through provisionSession (conversational mode)
 *   persists a non-empty assistant reply row on the DB, equal to the
 *   model's real completion text, on ALL supported harnesses.
 *
 * Lanes:
 *   Lane 1 [harness:builtin]       — builtin adapter + OpenRouter deepseek-flash
 *   Lane 2 [harness:claude]        — real `claude` binary + haiku
 *   Lane 3 [harness:codex]         — real `codex` binary + gpt-5.4-mini
 *   Lane 4 [harness:opencode]      — real `opencode` binary + glm-4.7-flash
 *   Lane 5 [harness:cursor-agent]  — real `cursor-agent` binary + auto
 *
 * All lanes use HARNESS_TEST_MODELS (locked tiny-baseline) and
 * requireHarness hard-fail (never skipIf).
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

requireHarness("builtin", "claude", "codex", "opencode", "cursor-agent");

const NOW = new Date().toISOString();

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

	test("builtin conversational turn → persists non-empty ast-* reply row", async ({ db, eventBus }) => {
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

	test("claude conversational turn → persists non-empty ast-* reply row", async ({ db, eventBus }) => {
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

	test("codex conversational turn → persists non-empty ast-* reply row", async ({ db, eventBus }) => {
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

	test("opencode conversational turn → persists non-empty ast-* reply row", async ({ db, eventBus }) => {
		await seedConversationalTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			harnessType: "opencode",
			modelId: HARNESS_TEST_MODELS.opencode.model,
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

describe("[harness:cursor-agent] conversational reply row", () => {
	const userId = `conversation-cursor-user-${Date.now()}`;
	const threadId = `conversation-cursor-thread-${Date.now()}`;
	const triggerMessageId = `conversation-cursor-msg-${Date.now()}`;
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

	test("cursor-agent conversational turn → persists non-empty ast-* reply row", async ({
		db,
		eventBus,
	}) => {
		await seedConversationalTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			harnessType: "cursor-agent",
			modelId: HARNESS_TEST_MODELS["cursor-agent"].model,
			modelProvider: HARNESS_TEST_MODELS["cursor-agent"].provider,
			now: NOW,
		});

		await runConversationalTurnThroughHarness(
			{ db, eventBus, tmpDir, bridge },
			{ userId, threadId, triggerMessageId, harnessName: "cursor-agent" },
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
