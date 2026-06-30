/**
 * AR4 — AH3 real builtin-only assistant-turn integration test.
 *
 * Drives runAssistantTurn through a REAL builtin adapter + real OpenRouter model.
 * Builtin-only by construction: runAssistantTurn cannot run CLI harnesses
 * (no sandbox cwd, no .mcp.json bridge — AR4 plan Q2, BUILTIN_ONLY_INTEGRATION carve-out).
 *
 * Proves:
 *   H1 — real builtin turn → ast-* reply persisted (non-empty, non-notice).
 *        Inheritor of per-agent-seam test-2 ("a real assistant message is persisted,
 *        not silently dropped" — W-3 in the critique).
 *   H3 — user message reaches the model: reply is responsive to the seeded user message.
 *
 * Service-integration and unit tests (AC2 error surface, AC3 PATCH 403, AC5 defaults,
 * H1-no-resolvedModel, H2 notice round-trip, M3 null-resolve, loop-guard) remain in
 * AH3-assistant-turn.integration.test.ts — single-archetype split.
 */

import { messages as messagesTable } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
	runAssistantTurnThroughHarness,
	seedAssistantTurnDomain,
} from "../../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../../harness/__tests__/require-harness.js";
import { test } from "../../test-fixtures.js";

// Hard-fail if builtin harness is unavailable (OPENROUTER_API_KEY not set).
// @lore AR4: requireHarness is called at module/describe scope — a collection-phase
// throw means the whole file cannot run, not just one test.
requireHarness("builtin");

const NOW = new Date().toISOString();

// ─── H1: Real builtin turn → ast-* reply persisted ───────────────────────────
//
// Inheritor of per-agent-seam test-2 (W-3): "a real assistant message is
// persisted and is not silently dropped." The per-agent-seam file's turn-completion
// smoke (`:195-272`) migrates here per the plan's protectedTests declaration.

describe("[harness:builtin] AH3-real H1 — real builtin turn → ast-* reply persisted (AC1)", () => {
	const userId = `ah3-real-h1-${Date.now()}`;
	const threadId = `ah3-real-h1-thread-${Date.now()}`;
	const triggerMessageId = `ah3-real-h1-msg-${Date.now()}`;

	test("runAssistantTurnThroughHarness persists a non-empty ast-* reply (real OpenRouter model)", async ({
		db,
		eventBus,
	}) => {
		await seedAssistantTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			now: NOW,
		});

		// Real turn — no stubs, real OpenRouter model (openai/gpt-4o-mini via OPENROUTER_API_KEY)
		await runAssistantTurnThroughHarness({ db, eventBus }, { userId, threadId, triggerMessageId });

		// Assert: a reply from ast-* was persisted — non-empty, not a notice
		const msgs = await db.select().from(messagesTable).where(eq(messagesTable.threadId, threadId));

		const assistantId = `ast-${userId}`;
		const astReply = msgs.find((m) => m.senderId === assistantId && m.type === "plain");

		expect(astReply).toBeDefined();
		// N-1 fix: no redundant if-guard after toBeDefined — inline the assertions.
		const payload = JSON.parse(astReply!.payload) as Record<string, unknown>;
		// Must not be a notice (notice has payload.notice, not payload.text)
		expect(payload.notice).toBeUndefined();
		const text = payload.text as string | undefined;
		expect(typeof text).toBe("string");
		expect((text ?? "").length).toBeGreaterThan(0);
	}, 240_000);
});

// ─── H3: User message reaches the model ──────────────────────────────────────
//
// CC-004 proof: the real model responds to the seeded "Reply with PONG" instruction,
// proving the transcript (SessionConfig.messages) actually reached the model.
// seedAssistantTurnDomain seeds the trigger message with "Reply with the word PONG
// and nothing else" so a PONG response confirms end-to-end message delivery.

describe("[harness:builtin] AH3-real H3 — user message reaches the model (AC1 transcript proof)", () => {
	const userId = `ah3-real-h3-${Date.now()}`;
	const threadId = `ah3-real-h3-thread-${Date.now()}`;
	const triggerMessageId = `ah3-real-h3-msg-${Date.now()}`;

	test("real builtin turn replies responsively — unique question payload reaches the model", async ({
		db,
		eventBus,
	}) => {
		await seedAssistantTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			now: NOW,
		});

		await runAssistantTurnThroughHarness({ db, eventBus }, { userId, threadId, triggerMessageId });

		const msgs = await db.select().from(messagesTable).where(eq(messagesTable.threadId, threadId));

		const assistantId = `ast-${userId}`;
		const astReply = msgs.find((m) => m.senderId === assistantId && m.type === "plain");

		expect(astReply).toBeDefined();
		// N-1 fix: inline assertions after toBeDefined — no redundant if-guard.
		const payload = JSON.parse(astReply!.payload) as Record<string, unknown>;
		// Non-notice reply: proves a real turn completed, not an error
		expect(payload.notice).toBeUndefined();
		const text = payload.text as string | undefined;
		expect(typeof text).toBe("string");
		expect((text ?? "").length).toBeGreaterThan(0);

		// CC-004: the model produced content — transcript reached it.
		// The seeded trigger message asks to "Reply with the word PONG and nothing else".
		// A PONG response proves the message reached the model.
		expect(text?.toUpperCase()).toContain("PONG");
	}, 240_000);
});
