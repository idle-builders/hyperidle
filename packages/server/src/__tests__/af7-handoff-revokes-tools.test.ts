/**
 * AF7 §5 / AC5 — Handoff stops the prior session's tool access (RED phase).
 *
 * Acceptance criterion (TRACK-AF.md AF7 AC5):
 *   "Handing a task off to another agent stops the prior session's tool access;
 *    the prior agent cannot keep acting after handoff."
 * Validation scenario:
 *   "Given a task handed off mid-session, when the handoff completes, then the
 *    original session's tools are revoked."
 *
 * Root cause being closed (Z8-048): handoff ends the session row but the builtin
 * `runLoop` keeps executing tools internally — `stopSession` sets `aborted`, but
 * the loop only checks it BETWEEN iterations, so a batch of tool calls already
 * being executed in `executeToolCalls` keeps dispatching new invokes after abort.
 *
 * Plan §5.3 contract (design (a)):
 *   - Add an `aborted` check INSIDE builtin `executeToolCalls`, BEFORE each
 *     invoke (top of each iteration, before `session.toolCallCount++`).
 *   - The AC5 assertion is "NO tool call STARTS after handoff completes" — an
 *     invoke already in flight at abort may finish (+1), but no NEW invoke
 *     starts. NOT "count frozen".
 *
 * RED expectation: today `executeToolCalls` has no per-invoke `aborted` guard —
 * once a batch of tool calls is being processed, EVERY call in the batch runs
 * even after `aborted` flips. So a second tool call STARTS after abort, and the
 * "no new tool call starts" assertion fails.
 *
 * Determinism: the registry's FIRST `invoke` flips the session into the aborted
 * state (simulating the handoff abort landing while the first tool is in flight).
 * With the §5.3 guard, the SECOND tool call in the same batch must NOT start.
 */

import type { SessionConfig } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import { BuiltinHarnessAdapter } from "@hyperidle/agent-layer";
import type { LlmResponse } from "@hyperidle/agent-layer";

vi.mock("../../../agent-layer/src/harness/llm-client.js", () => ({
	callLlm: vi.fn(),
}));

const { callLlm } = await import("@hyperidle/agent-layer");
const callLlmMock = vi.mocked(callLlm);

const RESOLVED_MODEL = {
	provider: "anthropic" as const,
	model: "claude-sonnet-4-20250514",
	apiKey: "sk-test",
	baseUrl: "https://api.anthropic.com",
};

/** A planning response containing TWO tool calls in a single batch. */
function twoToolCallResponse(): LlmResponse {
	return {
		stopReason: "tool_use",
		content: [
			{ type: "tool_use", id: "call-1", name: "first_tool", input: {} },
			{ type: "tool_use", id: "call-2", name: "second_tool", input: {} },
		],
		usage: { inputTokens: 10, outputTokens: 5 },
	};
}

function makeConfig(sessionId: string): SessionConfig {
	// AF7 §3: sessionId is part of SessionConfig — referenced here so the abort
	// guard and isolation share the same contract. RED until the green phase.
	return {
		sessionId,
		sandboxPath: `/workspace/${sessionId}`,
		systemPromptPath: "",
		assembledPrompt: "You are a helpful assistant.",
		modelTier: "workhorse",
		tools: ["first_tool", "second_tool"],
		resolvedModel: RESOLVED_MODEL,
	} as SessionConfig;
}

describe("AF7 AC5: builtin abort revokes tool access before the next invoke", () => {
	it("after abort lands mid-batch, NO new tool call starts (only the in-flight one finishes)", async () => {
		const adapter = new BuiltinHarnessAdapter({ maxIterations: 1, reflectionInterval: 99 });

		const started: string[] = [];

		// The FIRST tool invoke parks on `firstInFlight` so the loop is provably
		// inside executeToolCalls when the abort lands. A separate (non-awaited)
		// call to stopSession sets the session's `aborted` flag while the first
		// tool is in flight. Resolving the gate lets the first invoke finish; the
		// §5.3 per-invoke guard must then prevent the SECOND invoke from starting.
		let resolveFirst!: () => void;
		const firstInFlight = new Promise<void>((r) => {
			resolveFirst = r;
		});
		let firstStarted!: () => void;
		const firstStartedSignal = new Promise<void>((r) => {
			firstStarted = r;
		});

		const registry = {
			definitions: [],
			invoke: vi.fn(async (name: string) => {
				started.push(name);
				if (started.length === 1) {
					firstStarted();
					await firstInFlight; // park the in-flight tool
				}
				return { success: true as const, data: { ok: true } };
			}),
			toClaudeToolSpecs: vi.fn().mockReturnValue([
				{
					name: "first_tool",
					description: "first",
					input_schema: {
						type: "object" as const,
						properties: {},
						required: [] as readonly string[],
					},
				},
				{
					name: "second_tool",
					description: "second",
					input_schema: {
						type: "object" as const,
						properties: {},
						required: [] as readonly string[],
					},
				},
			]),
		};

		adapter.setSessionToolRegistry("S", registry);

		// Planning turn returns a batch of two tool calls.
		callLlmMock.mockResolvedValue(twoToolCallResponse());

		const handle = await adapter.startSession(makeConfig("S"));

		// Drain the event stream in the background (consumes the loop's events).
		const drain = (async () => {
			for await (const _ of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		// Wait until the first tool is provably in flight, then fire the handoff
		// abort. stopSession sets `aborted` and awaits the loop — it resolves once
		// the loop ends. We must NOT await it before unparking, or we deadlock.
		await firstStartedSignal;
		const stopped = adapter.stopSession(handle);

		// Unpark the in-flight first tool. The loop returns from the first invoke;
		// the §5.3 guard then sees `aborted` and refuses to start the second.
		resolveFirst();

		await stopped;
		await drain;

		// AC5 (§5.3): the first tool started (in flight when abort landed). The
		// SECOND tool must NOT have started — the per-invoke abort guard stops it.
		expect(started).toContain("first_tool");
		expect(started).not.toContain("second_tool");
	});
});
