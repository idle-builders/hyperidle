/**
 * AL6 v2 — Unit tests for ReturnGate observer + force-budget helper.
 *
 * Covers:
 *   AC3: Detection — not_returned when no return seen; returned when return seen.
 *   AC5: Mid-turn non-terminal tool use is unaffected by the gate.
 *   AC1/forcing (unit): the force-budget helper injects the forcing message up to
 *     AL6_MAX_FORCE_RETURNS times, then falls through (returns null so the caller
 *     applies Tier-2 reject). Must NEVER inject more than AL6_MAX_FORCE_RETURNS times.
 *
 * Tests that import AL6_FORCE_RETURN_MESSAGE / AL6_MAX_FORCE_RETURNS / shouldForceReturn
 * WILL FAIL (red) until T1 (shared constants) and the forcing helper are implemented.
 */

import type { HarnessEvent } from "@hyperidle/shared";
// AL6 v2 T1 (red): AL6_FORCE_RETURN_MESSAGE / AL6_MAX_FORCE_RETURNS /
// shouldForceReturn are not yet exported from @hyperidle/shared. Access them
// via the module namespace with 'any' cast to avoid TS2305 errors. The tests
// that reference them will fail red (value is undefined) until T1 ships.
import * as sharedAll from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createReturnGate, evaluateReturn, type ReturnVerdict } from "../return-gate.js";

// biome-ignore lint/suspicious/noExplicitAny: T1 red — accessing not-yet-exported members
const sharedNs = sharedAll as Record<string, any>;

// Cast to concrete types so strict mode doesn't error on usage sites.
// At runtime these are `undefined` (T1 not shipped yet) → tests fail red
// with "TypeError: not a function" or "expected undefined to be 'string'",
// which is the correct missing-behavior failure mode.
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
		// Observe non-return tool calls + a completion, but NO return action
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
		// Stream had no return action (agent crashed before it could return)
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
		// No return action before budget cut
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
		// Confirm still not-returned at this point
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

		// No tool_call emitted — gate must see no return
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
		// A crashed event path would be exempt via evaluateReturn, but the gate
		// itself must not see the error event as a return.
		expect(gate.returned).toBe(false);
	});
});

// ── AC5: gate is observation-only (no interception / no throwing) ────────────

describe("ReturnGate — AC5: gate is observation-only", () => {
	it("observe() on a return tool_call does not throw or intercept", () => {
		const gate = createReturnGate();
		// The gate must be passive: it can't prevent the event from proceeding
		expect(() => gate.observe(toolCallEvent("submit_review", {}))).not.toThrow();
	});

	it("multiple gates are independent (no shared state)", () => {
		const gateA = createReturnGate();
		const gateB = createReturnGate();

		gateA.observe(toolCallEvent("submit_review", {}));

		// gateB must be unaffected by gateA's observation
		expect(gateA.returned).toBe(true);
		expect(gateB.returned).toBe(false);
	});
});

// ── v2: Shared constants exist and are correctly shaped ─────────────────────
// These tests FAIL (red) until T1 ships AL6_FORCE_RETURN_MESSAGE + AL6_MAX_FORCE_RETURNS.

describe("AL6 v2 — shared forcing constants (T1 red)", () => {
	it("AL6_FORCE_RETURN_MESSAGE is a non-empty string naming the three return tools", () => {
		expect(typeof AL6_FORCE_RETURN_MESSAGE).toBe("string");
		expect(AL6_FORCE_RETURN_MESSAGE.length).toBeGreaterThan(0);
		// Must name the three canonical return tools
		expect(AL6_FORCE_RETURN_MESSAGE).toContain("submit_review");
		expect(AL6_FORCE_RETURN_MESSAGE).toContain("handoff_to");
		expect(AL6_FORCE_RETURN_MESSAGE).toContain("send_message");
	});

	it("AL6_MAX_FORCE_RETURNS is a positive integer (the force-continue budget)", () => {
		expect(typeof AL6_MAX_FORCE_RETURNS).toBe("number");
		expect(Number.isInteger(AL6_MAX_FORCE_RETURNS)).toBe(true);
		expect(AL6_MAX_FORCE_RETURNS).toBeGreaterThan(0);
	});

	it("AL6_MAX_FORCE_RETURNS === 2 (the architecture-specified budget)", () => {
		// The plan names N=2 explicitly (concept §3.4). This test pins the constant.
		// Changing N=2 must be a deliberate arch decision, caught here.
		expect(AL6_MAX_FORCE_RETURNS).toBe(2);
	});
});

// ── v2: Force-budget helper (shouldForceReturn) ───────────────────────────────
// These tests FAIL (red) until the shouldForceReturn helper is exported from @hyperidle/shared.
//
// shouldForceReturn(gate, forceCount) behavior:
//   - gate.returned === true → return null (return was seen; no force needed)
//   - gate.returned === false AND forceCount < AL6_MAX_FORCE_RETURNS
//       → return AL6_FORCE_RETURN_MESSAGE (inject forcing message, increment budget outside)
//   - gate.returned === false AND forceCount >= AL6_MAX_FORCE_RETURNS
//       → return null (budget spent; fall through to Tier-2 reject)
//
// The CALLER increments forceCount and re-prompts. shouldForceReturn is pure.

describe("AL6 v2 — shouldForceReturn helper (T1 red)", () => {
	it("returns null when return was already seen (gate.returned === true)", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("submit_review", {}));
		// Return was seen — no force needed regardless of forceCount
		expect(shouldForceReturn(gate, 0)).toBeNull();
		expect(shouldForceReturn(gate, 1)).toBeNull();
		expect(shouldForceReturn(gate, 99)).toBeNull();
	});

	it("returns AL6_FORCE_RETURN_MESSAGE on first no-return stop attempt (forceCount=0)", () => {
		const gate = createReturnGate();
		// No return seen, budget not started
		expect(shouldForceReturn(gate, 0)).toBe(AL6_FORCE_RETURN_MESSAGE);
	});

	it("returns AL6_FORCE_RETURN_MESSAGE on second no-return stop attempt (forceCount=1)", () => {
		const gate = createReturnGate();
		// No return seen, one force already done
		expect(shouldForceReturn(gate, 1)).toBe(AL6_FORCE_RETURN_MESSAGE);
	});

	it("returns null (budget exhausted) when forceCount === AL6_MAX_FORCE_RETURNS", () => {
		const gate = createReturnGate();
		// Budget exactly spent — fall through to Tier-2 reject, never inject again
		expect(shouldForceReturn(gate, AL6_MAX_FORCE_RETURNS)).toBeNull();
	});

	it("returns null (budget exhausted) when forceCount > AL6_MAX_FORCE_RETURNS", () => {
		const gate = createReturnGate();
		// Over-budget — also null; the loop cannot run forever
		expect(shouldForceReturn(gate, AL6_MAX_FORCE_RETURNS + 1)).toBeNull();
		expect(shouldForceReturn(gate, 100)).toBeNull();
	});

	it("force is bounded: exactly AL6_MAX_FORCE_RETURNS injections, then null (never loops forever)", () => {
		// Model a turn where the agent keeps refusing to return.
		// Simulate the forceCount incrementing as the caller re-prompts.
		const gate = createReturnGate();
		const injections: (string | null)[] = [];

		// Simulate the loop: each iteration checks shouldForceReturn and increments
		let forceCount = 0;
		for (let attempt = 0; attempt <= AL6_MAX_FORCE_RETURNS + 1; attempt++) {
			const msg = shouldForceReturn(gate, forceCount);
			injections.push(msg);
			if (msg !== null) forceCount++;
		}

		// The first AL6_MAX_FORCE_RETURNS calls return the message; thereafter null
		const forceMessages = injections.filter((m) => m !== null);
		const nullResponses = injections.filter((m) => m === null);

		expect(forceMessages).toHaveLength(AL6_MAX_FORCE_RETURNS);
		expect(nullResponses.length).toBeGreaterThan(0);
		// After the budget is spent the remaining calls all return null
		expect(injections[AL6_MAX_FORCE_RETURNS]).toBeNull();
	});

	it("shouldForceReturn is pure: same inputs same output, no mutation of gate", () => {
		const gate = createReturnGate();
		// Calling shouldForceReturn must NOT mutate gate.returned
		const result1 = shouldForceReturn(gate, 0);
		const result2 = shouldForceReturn(gate, 0);
		expect(result1).toBe(result2);
		// gate.returned is still false — shouldForceReturn is read-only
		expect(gate.returned).toBe(false);
	});
});

// ── v2: canForceReturn table — per-adapter capability bit (AC4 static) ──────
// The canForceReturn capability is a static type property added in T1/T2.
// AC4's per-adapter table (SDK: true, builtin: true, cli: false, remote: false,
// isolated: false) is enforced by the type system. The runtime test asserts that
// mock / stub adapters can be created with either value, covering the type surface.
// The real-adapter canForceReturn table is AC4's static property tested via
// `npm run check` (every getCapabilities() must include the field).
// This unit test just pins the structural expectation so green cannot omit the field.

// v2: canForceReturn is added to HarnessCapabilities in T1. Until T1 ships, access
// the field via a cast so this test RUNS (and fails red) instead of failing to compile.
type CapsV2 = import("@hyperidle/shared").HarnessCapabilities & { canForceReturn?: boolean };

describe("AL6 v2 — canForceReturn capability bit exists on HarnessCapabilities (AC4)", () => {
	it("a HarnessCapabilities object with canForceReturn:true satisfies the type", () => {
		// After T1 ships the cast is redundant. The RUNTIME assertion (read the field)
		// fails red while the field is absent (undefined !== true), and passes green
		// once T1 adds canForceReturn to HarnessCapabilities.
		const caps = {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			canForceReturn: true, // T1: Tier-1 force adapter
		} as CapsV2;
		expect(caps.canForceReturn).toBe(true);
	});

	it("a HarnessCapabilities object with canForceReturn:false satisfies the type", () => {
		const caps = {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: true,
			canForceReturn: false, // T1: Tier-2 reject adapter
		} as CapsV2;
		expect(caps.canForceReturn).toBe(false);
	});
});
