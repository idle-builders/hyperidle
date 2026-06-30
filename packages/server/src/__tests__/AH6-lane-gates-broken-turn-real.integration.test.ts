/**
 * AR4 — AH6 real builtin-only lane-gate integration test.
 *
 * Proves the valid-lane leg of AC3: run a real builtin assistant turn, capture
 * real output, assert the S1 distinct-reply condition is TRUE over that real output.
 * Proves "the lane gate runs on real harness output."
 *
 * Builtin-only by construction (AR4 plan Q2, BUILTIN_ONLY_INTEGRATION carve-out).
 *
 * The broken-lane AC3 leg (empty/degenerate completion → S1 = false) is a
 * deterministic unit over a crafted empty transcript, NOT a harness test — see
 * AH6-lane-gate-verdict.test.ts (W-2 honest decomposition).
 *
 * No vi.mock in this file. Service-integration tests (Term-1 no-deps, Term-2a
 * cassette-miss error mapping) remain in AH6-lane-gates-broken-turn.integration.test.ts.
 *
 * W-2 fix: no local predicate function. Plain assertions on the actual text prove
 * the conditions directly — `length > 0` and `!== welcomeText` — without the
 * tautology of a locally-defined duplicate predicate.
 */

import { messages as messagesTable } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
	runAssistantTurnThroughHarness,
	seedAssistantTurnDomain,
} from "../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { test } from "../test-fixtures.js";

requireHarness("builtin");

const WELCOME_TEXT = "Welcome to HyperIdle! I'm your assistant.";
const NOW = new Date().toISOString();

// ─── Sanity (valid-lane): real builtin turn → S1 condition = true ─────────────

describe("[harness:builtin] AH6-real — valid-lane: S1 gate condition = true on real output (AC3)", () => {
	const userId = `ah6-real-gate-${Date.now()}`;
	const threadId = `ah6-real-gate-thread-${Date.now()}`;
	const triggerMessageId = `ah6-real-gate-msg-${Date.now()}`;

	test("real builtin turn produces a distinct, non-empty reply → S1 condition = true", async ({
		db,
		eventBus,
	}) => {
		await seedAssistantTurnDomain(db, {
			userId,
			threadId,
			triggerMessageId,
			now: NOW,
		});

		// Real turn — no vi.mock, no stub adapter
		await runAssistantTurnThroughHarness({ db, eventBus }, { userId, threadId, triggerMessageId });

		const allMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const assistantId = `ast-${userId}`;
		const replyMessages = allMessages.filter((m) => {
			if (m.senderId !== assistantId) return false;
			try {
				const payload = JSON.parse(m.payload) as { notice?: unknown; text?: string };
				return !payload.notice && typeof payload.text === "string" && payload.text.length > 0;
			} catch {
				return false;
			}
		});

		// Must have at least one real reply
		expect(replyMessages.length).toBeGreaterThan(0);

		const lastMsg = replyMessages[replyMessages.length - 1]!;
		const lastPayload = JSON.parse(lastMsg.payload) as { text: string };
		const lastReplyText = lastPayload.text;

		// AC3 valid-lane: real model produces a distinct, non-empty reply.
		// Plain assertions — no locally-defined predicate duplicate (W-2 fix).
		expect(lastReplyText.length).toBeGreaterThan(0);
		expect(lastReplyText).not.toBe(WELCOME_TEXT);
	}, 240_000);
});
