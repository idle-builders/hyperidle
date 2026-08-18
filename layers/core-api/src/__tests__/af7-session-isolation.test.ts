/**
 * AF7 §3 / AC3 — Per-session harness/registry isolation (RED phase).
 *
 * Acceptance criterion (TRACK-AF.md AF7 AC3):
 *   "Two sessions running concurrently never observe each other's tool or
 *    registry context."
 * Validation scenario:
 *   "Given two concurrent sessions, when each calls its tools, then neither sees
 *    the other's context."
 *
 * Root cause being closed (Z8-092 / Z8-093): `BuiltinHarnessAdapter.startSession`
 * mints a NEW internal id (`builtin-${nextId++}`) and reconciles the
 * pre-registered registry by SCANNING the session map for "the first session
 * with loopPromise===null && registry!==null && !done". Under two concurrent
 * provisions interleaving `setSessionToolRegistry` → `startSession`, the scan can
 * bind session B's registry to session A.
 *
 * Plan §3 fix: `SessionConfig.sessionId` becomes the contract. `startSession`
 * keys its session map on `config.sessionId` (no scan), so the registry
 * pre-registered under that exact id is the one bound.
 *
 * RED expectation:
 *   - TYPE: `SessionConfig` has no `sessionId` field today — referencing it in
 *     the config is a compile error (feature absent).
 *   - RUNTIME: even if it compiled, the adapter ignores `config.sessionId` and
 *     binds via the scan, so the two sessions can swap registries and the
 *     "each session only invokes its own registry" assertion fails.
 *
 * The test registers registry A under sessionId "A" and registry B under
 * sessionId "B", then starts both with configs carrying the matching sessionId.
 * Each registry's `invoke` records which session called it. After both runs,
 * registry A must have been invoked ONLY for session A's tool calls, and B only
 * for B's.
 */

import type { HarnessAdapter, SessionConfig } from "@hyperidle/harness-protocol";
import { BuiltinHarnessAdapter } from "@hyperidle/harness-registry";
import type { LlmResponse } from "../../../agent-execution/harness-registry/src/llm-client.js";

/** setSessionToolRegistry is a builtin-only duck-typed method (not on HarnessAdapter). */
type BuiltinAdapterLike = HarnessAdapter & {
	setSessionToolRegistry(id: string, registry: unknown): void;
};
/** Audited cast: new BuiltinHarnessAdapter() always returns BuiltinHarnessAdapter. */
function toBuiltinLike(a: HarnessAdapter): BuiltinAdapterLike {
	return a as unknown as BuiltinAdapterLike;
}

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../agent-execution/harness-registry/src/llm-client.js", () => ({
	callLlm: vi.fn(),
}));

const { callLlm } = await import("../../../agent-execution/harness-registry/src/llm-client.js");
const callLlmMock = vi.mocked(callLlm);

const RESOLVED_MODEL = {
	provider: "anthropic" as const,
	model: "claude-sonnet-4-20250514",
	apiKey: "sk-test",
	baseUrl: "https://api.anthropic.com",
};

function toolCallResponse(toolName: string, id: string): LlmResponse {
	return {
		stopReason: "tool_use",
		content: [{ type: "tool_use", id, name: toolName, input: { marker: id } }],
		usage: { inputTokens: 10, outputTokens: 5 },
	};
}

/** Registry that records every tool name it is asked to invoke. */
function makeRecordingRegistry(label: string) {
	const invocations: string[] = [];
	return {
		invocations,
		registry: {
			definitions: [],
			invoke: vi.fn(async (name: string) => {
				invocations.push(name);
				return { success: true as const, data: { ranBy: label } };
			}),
			toClaudeToolSpecs: vi.fn().mockReturnValue([
				{
					name: `tool_${label}`,
					description: `tool for ${label}`,
					input_schema: {
						type: "object" as const,
						properties: { marker: { type: "string" } },
						required: ["marker"] as readonly string[],
					},
				},
			]),
		},
	};
}

function makeConfig(sessionId: string): SessionConfig {
	// AF7 §3: SessionConfig.sessionId is the new isolation contract — RED: it
	// does not exist on SessionConfig yet (compile error until the green phase).
	return {
		sessionId,
		sandboxPath: `/workspace/${sessionId}`,
		systemPromptPath: "",
		// Marker lets the shared callLlm mock answer per-session deterministically.
		assembledPrompt: `You are a helpful assistant. session:${sessionId}`,
		modelTier: "workhorse",
		tools: [`tool_${sessionId}`],
		resolvedModel: RESOLVED_MODEL,
	} as SessionConfig;
}

describe("AF7 AC3: concurrent builtin sessions are isolated by sessionId", () => {
	it("binds each session to ONLY its own pre-registered registry (no scan swap)", async () => {
		const adapter = toBuiltinLike(
			new BuiltinHarnessAdapter({ maxIterations: 2, reflectionInterval: 99 }),
		);

		const a = makeRecordingRegistry("A");
		const b = makeRecordingRegistry("B");

		// Pre-register both registries under their session ids, in order A then B.
		// (The provisioning orchestrator does this in Phase 8.5a before startSession.)
		adapter.setSessionToolRegistry("A", a.registry);
		adapter.setSessionToolRegistry("B", b.registry);

		// Concurrent interleaving: the second provision (session B) reaches
		// startSession FIRST, passing config.sessionId="B". Today the adapter
		// IGNORES config.sessionId and binds by scanning for the first
		// pre-registered session — which is A — so B's session binds to registry A
		// (the Z8-092/093 swap). The §3 fix keys on config.sessionId, so B binds
		// to registry B regardless of registration order.
		//
		// Each session: planning yields a tool call (named after its sessionId),
		// then a text turn ends the loop.
		callLlmMock.mockImplementation((opts) => {
			// The system prompt carries the sessionId so the shared mock can answer
			// per-session deterministically.
			const sys = opts.system ?? "";
			const sid = sys.includes("session:B") ? "B" : "A";
			// First call for a session → tool call; subsequent → end.
			return Promise.resolve(
				sid === "B" ? toolCallResponse("tool_B", "B-1") : toolCallResponse("tool_A", "A-1"),
			);
		});

		// Start B FIRST (config.sessionId="B"), then A. If sessionId is honored,
		// B's tools route to registry B even though A was pre-registered first.
		const handleB = await adapter.startSession(makeConfig("B"));
		const handleA = await adapter.startSession(makeConfig("A"));

		for await (const _ of adapter.streamEvents(handleB)) {
			// drain
		}
		await adapter.stopSession(handleB);
		for await (const _ of adapter.streamEvents(handleA)) {
			// drain
		}
		await adapter.stopSession(handleA);

		// AC3: B's registry ran ONLY B's tool, A's ran ONLY A's. No cross-binding.
		expect(b.invocations).toContain("tool_B");
		expect(b.invocations).not.toContain("tool_A");
		expect(a.invocations).toContain("tool_A");
		expect(a.invocations).not.toContain("tool_B");
	});
});
