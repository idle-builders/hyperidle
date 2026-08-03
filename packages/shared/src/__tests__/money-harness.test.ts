/**
 * L17 RED — Harness contract change tests.
 *
 * AC9:  SessionResult returns structured { cost: WireMoney, tokenUsage: TokenUsage }
 * AC10: TokenUsageEvent carries optional tier field
 * AC11: CostUpdateEvent carries optional currency field
 *
 * @lore AU21 Increment 14a: AC19 (ArtifactCostFromSession) is deleted along
 * with the rest of the artifact-cost display feature. AC9/AC11's harness-
 * level $-estimate (`SessionResult.cost`/`CostUpdateEvent`) is kept — it is
 * a CI real-spend safety readout for the `eval` harness, structurally
 * distinct from the deleted product cost-cap feature.
 *
 * These tests will FAIL until Task 1 implementation ships.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type { SessionResult } from "../harness/harness-adapter.js";
import type { CostUpdateEvent, TokenUsageEvent } from "../harness/harness-events.js";
import { MockHarnessAdapter } from "../harness/mock-harness-adapter.js";
import type { TokenUsage, WireMoney } from "../types/money.js";

// ── AC9: SessionResult structured shape ───────────────────────────────────────

describe("SessionResult (AC9)", () => {
	it("mock adapter returns cost as WireMoney with minor and currency", async () => {
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
		expect(result.cost).toBeDefined();
		expect(typeof result.cost.minor).toBe("number");
		expect(typeof result.cost.currency).toBe("string");
		expect(result.cost.currency).toBe("USD");
	});

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

	it("SessionResult.cost type is WireMoney (not number)", () => {
		// Type-level: SessionResult.cost should not be assignable from a bare number
		expectTypeOf<SessionResult["cost"]>().toEqualTypeOf<WireMoney>();
	});

	it("SessionResult.tokenUsage type is TokenUsage (not number)", () => {
		expectTypeOf<SessionResult["tokenUsage"]>().toEqualTypeOf<TokenUsage>();
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

// ── AC11: CostUpdateEvent currency field ─────────────────────────────────────

describe("CostUpdateEvent (AC11)", () => {
	it("CostUpdateEvent type has optional currency field", () => {
		const event: CostUpdateEvent = {
			type: "cost_update",
			totalCost: 0.1,
			deltaCost: 0.1,
		};
		// currency is optional — should be able to construct without it
		expect(event.type).toBe("cost_update");
	});

	it("CostUpdateEvent type accepts currency field", () => {
		const event: CostUpdateEvent = {
			type: "cost_update",
			totalCost: 0.1,
			deltaCost: 0.1,
			currency: "USD",
		};
		expect(event.currency).toBe("USD");
	});

	it("CostUpdateEvent accepts EUR currency", () => {
		const event: CostUpdateEvent = {
			type: "cost_update",
			totalCost: 0.1,
			deltaCost: 0.05,
			currency: "EUR",
		};
		expect(event.currency).toBe("EUR");
	});

	it("CostUpdateEvent.currency type is CurrencyCode | undefined", () => {
		type CurrencyType = CostUpdateEvent["currency"];
		expectTypeOf<CurrencyType>().toEqualTypeOf<"USD" | "EUR" | "GBP" | "JPY" | undefined>();
	});
});
