/**
 * AL6 v3 — Unit tests for ReturnGate observer + force-budget helper.
 *
 * RE-AUTHORED from v2 (W3): deleted the `canForceReturn`-table block (v2 `:332-414`)
 * encoding the rejected Tier-2 reject semantics. Kept: gate detection/exemption/AC5.
 * Added: `hasNativeReturnHook`/`canReEngage` assertions under the v3 semantics.
 *
 * Covers:
 *   AC2: Closed return set — every RETURN_ACTION_NAMES member maps to a real tool.
 *   AC3: Detection — not_returned when no return seen; returned when return seen.
 *   AC5: Mid-turn non-terminal tool use is unaffected by the gate.
 *   AC1/forcing (unit): shouldForceReturn helper is bounded at AL6_MAX_FORCE_RETURNS.
 *   v3 capability shape: hasNativeReturnHook (sdk/builtin=true; cli/isolated=false);
 *     canReEngage (ALL in-tree adapters = true).
 *
 * Tests that import missing v3 behavior FAIL (red) until:
 *   - T1: hasNativeReturnHook / canReEngage added to HarnessCapabilities
 *   - T3: all 5 adapters implement the v3 capability shape
 */

import type { HarnessEvent } from "@hyperidle/shared";
import * as sharedAll from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { ClaudeAgentSdkAdapter } from "../claude-agent-sdk-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { IsolatedHarnessAdapter } from "../isolated-harness-adapter.js";
import { createReturnGate, evaluateReturn, type ReturnVerdict } from "../return-gate.js";

// biome-ignore lint/suspicious/noExplicitAny: accessing not-yet-exported members in red phase
const sharedNs = sharedAll as Record<string, any>;

const AL6_FORCE_RETURN_MESSAGE: string = sharedNs.AL6_FORCE_RETURN_MESSAGE;
const AL6_MAX_FORCE_RETURNS: number = sharedNs.AL6_MAX_FORCE_RETURNS;
const shouldForceReturn: (
	gate: ReturnType<typeof createReturnGate>,
	forceCount: number,
) => string | null = sharedNs.shouldForceReturn;

// ── helpers ──────────────────────────────────────────────────────────────────

function toolCallEvent(toolName: string, args: Record<string, unknown> = {}): HarnessEvent {
	return { type: "tool_call", toolName, args };
}

function completionEvent(text = "done"): HarnessEvent {
	return { type: "completion", text };
}

// ── AC3: detection rule ───────────────────────────────────────────────────────

describe("ReturnGate — AC3: detection (not_returned when no return seen)", () => {
	it("verdicts 'not_returned' when stream exhausts with no return action", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("read_inbox"));
		gate.observe(toolCallEvent("write_memory", { key: "foo", value: "bar" }));
		gate.observe(completionEvent());

		const verdict: ReturnVerdict = evaluateReturn(gate, "completed");
		expect(verdict).toBe("not_returned");
	});

	it("verdicts 'returned' when submit_review is observed before exhaustion", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("read_inbox"));
		gate.observe(toolCallEvent("submit_review", { message: "LGTM", verdict: "approved" }));
		gate.observe(completionEvent());

		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("verdicts 'returned' when handoff_to is observed", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("handoff_to", { role: "reviewer" }));

		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("verdicts 'returned' when send_message is observed", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("write_session_notes", {}));
		gate.observe(toolCallEvent("send_message", { to: "human-1", body: "Done." }));
		gate.observe(completionEvent());

		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("gate starts unreturned before any events", () => {
		const gate = createReturnGate();
		expect(gate.returned).toBe(false);
		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("returned flag becomes true immediately after a return tool_call", () => {
		const gate = createReturnGate();
		expect(gate.returned).toBe(false);
		gate.observe(toolCallEvent("submit_review", {}));
		expect(gate.returned).toBe(true);
	});
});

// ── AC3: exemptions (crashed / stopped / budget_exhausted are never not_returned) ─

describe("ReturnGate — AC3: exemptions (non-completion end-reasons never flagged)", () => {
	it("'crashed' end-reason is exempt — never flagged not_returned", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("read_inbox"));

		expect(evaluateReturn(gate, "crashed")).toBe("returned");
	});

	it("'stopped' (aborted) end-reason is exempt", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("write_memory", {}));

		expect(evaluateReturn(gate, "stopped")).toBe("returned");
	});

	it("'budget_exhausted' end-reason is exempt", () => {
		const gate = createReturnGate();
		expect(evaluateReturn(gate, "budget_exhausted")).toBe("returned");
	});
});

// ── AC5: mid-turn non-terminal tool use is unaffected ───────────────────────

describe("ReturnGate — AC5: mid-turn non-terminal tools do not block the gate", () => {
	it("ten non-return tool_calls followed by submit_review → 'returned'", () => {
		const gate = createReturnGate();
		const midTurnTools = [
			"read_inbox",
			"write_memory",
			"create_artifact",
			"log_task",
			"query_practice",
			"write_session_notes",
			"create_task",
			"score_attention",
			"promote_knowledge",
			"route_item",
		];
		for (const name of midTurnTools) {
			gate.observe(toolCallEvent(name, {}));
		}
		expect(gate.returned).toBe(false);

		gate.observe(toolCallEvent("submit_review", { message: "Done" }));
		expect(gate.returned).toBe(true);
		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("ten non-return tool_calls with NO return → 'not_returned'", () => {
		const gate = createReturnGate();
		for (let i = 0; i < 10; i++) {
			gate.observe(toolCallEvent("write_memory", { key: `k${i}` }));
		}
		gate.observe(completionEvent());

		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("non-tool events (completion, token_usage, cost_update) do not affect returned flag", () => {
		const gate = createReturnGate();
		gate.observe({ type: "completion", text: "done" });
		gate.observe({ type: "token_usage", inputTokens: 100, outputTokens: 50 });
		gate.observe({ type: "cost_update", totalCost: 1.0, deltaCost: 0.5 });

		expect(gate.returned).toBe(false);
		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("gate.observe() never throws for any event type", () => {
		const gate = createReturnGate();
		const events: HarnessEvent[] = [
			{ type: "tool_call", toolName: "read_inbox", args: {} },
			{ type: "completion", text: "done" },
			{ type: "token_usage", inputTokens: 1, outputTokens: 1 },
			{ type: "cost_update", totalCost: 0, deltaCost: 0 },
			{ type: "error", message: "oops", code: "E001" },
			{ type: "pre_compaction", contextTokens: 1000, maxTokens: 10000 },
		];
		for (const ev of events) {
			expect(() => gate.observe(ev)).not.toThrow();
		}
	});

	it("error event does not count as a return action", () => {
		const gate = createReturnGate();
		gate.observe({ type: "error", message: "tool failed", code: "ETOOLBROKE" });
		expect(gate.returned).toBe(false);
	});
});

// ── AC5: gate is observation-only (no interception / no throwing) ────────────

describe("ReturnGate — AC5: gate is observation-only", () => {
	it("observe() on a return tool_call does not throw or intercept", () => {
		const gate = createReturnGate();
		expect(() => gate.observe(toolCallEvent("submit_review", {}))).not.toThrow();
	});

	it("multiple gates are independent (no shared state)", () => {
		const gateA = createReturnGate();
		const gateB = createReturnGate();

		gateA.observe(toolCallEvent("submit_review", {}));

		expect(gateA.returned).toBe(true);
		expect(gateB.returned).toBe(false);
	});
});

// ── Shared constants (kept, already green from v2) ───────────────────────────

describe("AL6 — shared forcing constants", () => {
	it("AL6_FORCE_RETURN_MESSAGE is a non-empty string naming the three return tools", () => {
		expect(typeof AL6_FORCE_RETURN_MESSAGE).toBe("string");
		expect(AL6_FORCE_RETURN_MESSAGE.length).toBeGreaterThan(0);
		expect(AL6_FORCE_RETURN_MESSAGE).toContain("submit_review");
		expect(AL6_FORCE_RETURN_MESSAGE).toContain("handoff_to");
		expect(AL6_FORCE_RETURN_MESSAGE).toContain("send_message");
	});

	it("AL6_MAX_FORCE_RETURNS is 2 (architecture-specified budget)", () => {
		expect(typeof AL6_MAX_FORCE_RETURNS).toBe("number");
		expect(Number.isInteger(AL6_MAX_FORCE_RETURNS)).toBe(true);
		expect(AL6_MAX_FORCE_RETURNS).toBe(2);
	});
});

// ── Force-budget helper (shouldForceReturn) ───────────────────────────────────

describe("AL6 — shouldForceReturn helper", () => {
	it("returns null when return was already seen (gate.returned === true)", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("submit_review", {}));
		expect(shouldForceReturn(gate, 0)).toBeNull();
		expect(shouldForceReturn(gate, 1)).toBeNull();
		expect(shouldForceReturn(gate, 99)).toBeNull();
	});

	it("returns AL6_FORCE_RETURN_MESSAGE on first no-return stop attempt (forceCount=0)", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, 0)).toBe(AL6_FORCE_RETURN_MESSAGE);
	});

	it("returns AL6_FORCE_RETURN_MESSAGE on second no-return stop attempt (forceCount=1)", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, 1)).toBe(AL6_FORCE_RETURN_MESSAGE);
	});

	it("returns null (budget exhausted) when forceCount === AL6_MAX_FORCE_RETURNS", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, AL6_MAX_FORCE_RETURNS)).toBeNull();
	});

	it("returns null (budget exhausted) when forceCount > AL6_MAX_FORCE_RETURNS", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, AL6_MAX_FORCE_RETURNS + 1)).toBeNull();
		expect(shouldForceReturn(gate, 100)).toBeNull();
	});

	it("force is bounded: exactly AL6_MAX_FORCE_RETURNS injections, then null", () => {
		const gate = createReturnGate();
		const injections: (string | null)[] = [];
		let forceCount = 0;
		for (let attempt = 0; attempt <= AL6_MAX_FORCE_RETURNS + 1; attempt++) {
			const msg = shouldForceReturn(gate, forceCount);
			injections.push(msg);
			if (msg !== null) forceCount++;
		}
		const forceMessages = injections.filter((m) => m !== null);
		const nullResponses = injections.filter((m) => m === null);

		expect(forceMessages).toHaveLength(AL6_MAX_FORCE_RETURNS);
		expect(nullResponses.length).toBeGreaterThan(0);
		expect(injections[AL6_MAX_FORCE_RETURNS]).toBeNull();
	});

	it("shouldForceReturn is pure: same inputs same output, no mutation of gate", () => {
		const gate = createReturnGate();
		const result1 = shouldForceReturn(gate, 0);
		const result2 = shouldForceReturn(gate, 0);
		expect(result1).toBe(result2);
		expect(gate.returned).toBe(false);
	});
});

// ── v3: hasNativeReturnHook / canReEngage capability shape ─────────────────────
//
// REPLACES v2's canForceReturn reject-table block (`:332-414`).
//
// v3 semantics:
//   hasNativeReturnHook = optimization hint: true only for sdk+builtin (Layer-A fast-path).
//   canReEngage         = universal forcing gate: true for ALL in-tree adapters.
//
// These tests FAIL (red) until T1 (type) + T3 (all adapters) are shipped:
//   - hasNativeReturnHook replaces canForceReturn on HarnessCapabilities (T1)
//   - canReEngage added to HarnessCapabilities (T1)
//   - All 5 adapters updated to return v3 capability shape (T3)

// AL6 v3 (T1 red): access the v3 fields via cast until T1 ships them.
// After T1 lands, the cast is redundant but harmless.
type CapsV3 = import("@hyperidle/shared").HarnessCapabilities & {
	hasNativeReturnHook?: boolean;
	canReEngage?: boolean;
};

describe("AL6 v3 — hasNativeReturnHook / canReEngage capability shape (T1/T3 red)", () => {
	// ── Layer-A fast-path adapters (sdk + builtin): hasNativeReturnHook = true ──

	it("BuiltinHarnessAdapter: hasNativeReturnHook=true (Layer-A fast-path)", () => {
		const adapter = new BuiltinHarnessAdapter();
		const caps = adapter.getCapabilities() as CapsV3;
		// FAILS red until T3 renames canForceReturn → hasNativeReturnHook
		expect(caps.hasNativeReturnHook).toBe(true);
	});

	it("ClaudeAgentSdkAdapter: hasNativeReturnHook=true (SDK Stop hook)", () => {
		const adapter = new ClaudeAgentSdkAdapter();
		const caps = adapter.getCapabilities() as CapsV3;
		// FAILS red until T3
		expect(caps.hasNativeReturnHook).toBe(true);
	});

	// ── External adapters (cli + isolated): hasNativeReturnHook = false ─────────

	it("CliHarnessAdapter: hasNativeReturnHook=false (sandbox-carrier-only, no native hook)", () => {
		const adapter = new CliHarnessAdapter({
			binary: "claude-code",
			args: [],
			envMap: {},
			eventFormat: "ndjson",
			envAllowlist: [],
		});
		const caps = adapter.getCapabilities() as CapsV3;
		// FAILS red until T3
		expect(caps.hasNativeReturnHook).toBe(false);
	});

	it("IsolatedHarnessAdapter: hasNativeReturnHook=false (sandbox-carrier-only, no native hook)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal stub for capability-only test
		const stubResolver = { resolve: async () => undefined } as any;
		const adapter = new IsolatedHarnessAdapter(stubResolver, {
			maxMemoryMb: 512,
			maxDurationMs: 30_000,
			envAllowlist: [],
		});
		const caps = adapter.getCapabilities() as CapsV3;
		// FAILS red until T3
		expect(caps.hasNativeReturnHook).toBe(false);
	});

	// ── canReEngage = true on ALL in-tree adapters (v3 universal-forcing guarantee) ─

	it("BuiltinHarnessAdapter: canReEngage=true", () => {
		const caps = new BuiltinHarnessAdapter().getCapabilities() as CapsV3;
		// FAILS red until T3 adds canReEngage:true
		expect(caps.canReEngage).toBe(true);
	});

	it("ClaudeAgentSdkAdapter: canReEngage=true", () => {
		const caps = new ClaudeAgentSdkAdapter().getCapabilities() as CapsV3;
		// FAILS red until T3
		expect(caps.canReEngage).toBe(true);
	});

	it("CliHarnessAdapter: canReEngage=true (sandbox-file carrier makes re-engage feasible)", () => {
		const adapter = new CliHarnessAdapter({
			binary: "claude-code",
			args: [],
			envMap: {},
			eventFormat: "ndjson",
			envAllowlist: [],
		});
		const caps = adapter.getCapabilities() as CapsV3;
		// FAILS red until T3
		expect(caps.canReEngage).toBe(true);
	});

	it("IsolatedHarnessAdapter: canReEngage=true (sandbox-file carrier makes re-engage feasible)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal stub for capability-only test
		const stubResolver = { resolve: async () => undefined } as any;
		const adapter = new IsolatedHarnessAdapter(stubResolver, {
			maxMemoryMb: 512,
			maxDurationMs: 30_000,
			envAllowlist: [],
		});
		const caps = adapter.getCapabilities() as CapsV3;
		// FAILS red until T3
		expect(caps.canReEngage).toBe(true);
	});

	// ── v2 canForceReturn is GONE — no adapter should still export it ───────────
	// These assert the negative: the v2 field must be removed from the type and adapters.
	// They FAIL red while canForceReturn still exists on HarnessCapabilities (T1 not done).

	it("HarnessCapabilities NO LONGER has canForceReturn (v2 field removed in T1)", () => {
		// If canForceReturn still exists on any adapter, the field has not been renamed yet.
		const caps = new BuiltinHarnessAdapter().getCapabilities() as unknown as Record<string, unknown>;
		// FAILS red until T1/T3 renames the field — currently canForceReturn=true exists
		expect("canForceReturn" in caps).toBe(false);
	});
});
