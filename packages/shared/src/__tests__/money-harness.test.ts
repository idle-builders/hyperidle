/**
 * L17 — Harness contract change tests.
 *
 * AC9:  SessionResult returns structured { tokenUsage: TokenUsage }
 * AC10: TokenUsageEvent carries optional tier field
 *
 * @lore AU21 (harness-telemetry narrowing): AC9's harness-level $-estimate
 * (`SessionResult.cost`) and AC11 (`CostUpdateEvent`) are REMOVED — founder
 * ruling: "the session itself can claim... token usage from the harness...
 * just the token usage and not the cost since very few harness can actually
 * report cost." This file used to assert `SessionResult.cost: WireMoney` and
 * `CostUpdateEvent`'s optional currency field (AC11); those assertions are
 * replaced with proof that no $ figure exists anywhere on the type/event
 * surface. TokenUsageEvent (AC10) is unaffected and still asserted below.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type { SessionResult } from "../harness/harness-adapter.js";
import type { HarnessEvent, TokenUsageEvent } from "../harness/harness-events.js";
import { MockHarnessAdapter } from "../harness/mock-harness-adapter.js";
import type { TokenUsage } from "../types/money.js";

// ── AC9: SessionResult structured shape ───────────────────────────────────────

describe("SessionResult (AC9)", () => {
	it("mock adapter returns tokenUsage with byTier breakdown", async () => {
		const adapter = new MockHarnessAdapter();
		const handle = await adapter.startSession({
			sessionId: "test-session",
			sandboxPath: "/tmp/ws",
			systemPromptPath: "/tmp/system-prompt.md",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});
		const result = await adapter.stopSession(handle);
		expect(result.tokenUsage).toBeDefined();
		expect(result.tokenUsage.byTier).toBeDefined();
		// At minimum one tier should be present
		const tierCount = Object.keys(result.tokenUsage.byTier).length;
		expect(tierCount).toBeGreaterThan(0);
	});

	it("mock adapter's SessionResult has no cost field", async () => {
		const adapter = new MockHarnessAdapter();
		const handle = await adapter.startSession({
			sessionId: "test-session",
			sandboxPath: "/tmp/ws",
			systemPromptPath: "/tmp/system-prompt.md",
			assembledPrompt: "",
			modelTier: "workhorse",
			tools: [],
		});
		const result = await adapter.stopSession(handle);
		expect(result).not.toHaveProperty("cost");
	});

	it("SessionResult.tokenUsage type is TokenUsage (not number)", () => {
		expectTypeOf<SessionResult["tokenUsage"]>().toEqualTypeOf<TokenUsage>();
	});

	it("SessionResult does NOT have a cost field of any type", () => {
		// @lore AU21 harness-telemetry narrowing: the $-cost field is REMOVED, not renamed.
		type HasCost = "cost" extends keyof SessionResult ? true : false;
		expectTypeOf<HasCost>().toEqualTypeOf<false>();
	});

	it("SessionResult does NOT have totalCost: number field", () => {
		// If totalCost were still on the type, this would pass — but after L17 it must not exist
		type HasTotalCost = "totalCost" extends keyof SessionResult ? true : false;
		expectTypeOf<HasTotalCost>().toEqualTypeOf<false>();
	});

	it("SessionResult does NOT have totalTokens: number field", () => {
		type HasTotalTokens = "totalTokens" extends keyof SessionResult ? true : false;
		expectTypeOf<HasTotalTokens>().toEqualTypeOf<false>();
	});
});

// ── AC10: TokenUsageEvent tier field ─────────────────────────────────────────

describe("TokenUsageEvent (AC10)", () => {
	it("TokenUsageEvent type has optional tier field", () => {
		const event: TokenUsageEvent = {
			type: "token_usage",
			inputTokens: 100,
			outputTokens: 50,
		};
		// tier is optional — should be able to construct without it
		expect(event.type).toBe("token_usage");
	});

	it("TokenUsageEvent type accepts tier field", () => {
		const event: TokenUsageEvent = {
			type: "token_usage",
			inputTokens: 100,
			outputTokens: 50,
			tier: "workhorse",
		};
		expect(event.tier).toBe("workhorse");
	});

	it("TokenUsageEvent accepts reasoning tier", () => {
		const event: TokenUsageEvent = {
			type: "token_usage",
			inputTokens: 200,
			outputTokens: 100,
			tier: "reasoning",
		};
		expect(event.tier).toBe("reasoning");
	});

	it("TokenUsageEvent accepts fast tier", () => {
		const event: TokenUsageEvent = {
			type: "token_usage",
			inputTokens: 50,
			outputTokens: 25,
			tier: "fast",
		};
		expect(event.tier).toBe("fast");
	});

	it("TokenUsageEvent.tier type is ModelTier | undefined", () => {
		type TierType = TokenUsageEvent["tier"];
		// Should be optional ModelTier (not required, not string)
		expectTypeOf<TierType>().toEqualTypeOf<"reasoning" | "workhorse" | "fast" | undefined>();
	});
});

// ── AU21 (harness-telemetry narrowing): CostUpdateEvent no longer exists ─────

describe("HarnessEvent — no $-cost event type (token usage only)", () => {
	it("HarnessEvent union does NOT include a cost_update variant", () => {
		type HasCostUpdate =
			Extract<HarnessEvent, { type: "cost_update" }> extends never ? false : true;
		expectTypeOf<HasCostUpdate>().toEqualTypeOf<false>();
	});
});
