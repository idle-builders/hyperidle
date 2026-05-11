/**
 * N3 Spike — StubHarnessAdapter
 *
 * A minimal HarnessAdapter that yields one deterministic completion event
 * without touching any external API or binary. Used in Phase B of the spike
 * (run-spike.ts) to prove that `provisionSession` can complete an end-to-end
 * lifecycle without ANTHROPIC_API_KEY.
 *
 * Design notes:
 * - Emits exactly: token_usage → tool_call(read_file) → completion
 * - The `read_file` tool_call will fail silently inside `registry.invoke`
 *   because the tool does not exist in the builder role registry. This is
 *   EXPECTED; session-provisioning marks crashes only on `error` events or
 *   exceptions from streamEvents, not on silent tool-invoke failures.
 *   (The mock harness adapter in shared/src/harness does the same thing.)
 * - stopSession always returns outcome="completed" to keep the spike clean.
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";

let nextStubId = 1;

export class StubHarnessAdapter implements HarnessAdapter {
	private readonly sessions = new Map<string, { config: SessionConfig }>();

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async
	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const sessionId = `stub-session-${nextStubId++}`;
		this.sessions.set(sessionId, { config });
		return { sessionId };
	}

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async
	async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		if (!this.sessions.has(handle.sessionId)) {
			throw new Error(`StubHarnessAdapter: unknown session ${handle.sessionId}`);
		}

		// Phase B assertion target: these events drive the spike
		yield { type: "token_usage", inputTokens: 120, outputTokens: 60 };

		// This tool_call will fail silently — read_file is not registered.
		// Documented in surface audit (decision doc §5 Surface Audit).
		yield {
			type: "tool_call",
			toolName: "read_file",
			args: { path: "/workspace/README.md" },
		};

		yield { type: "completion", text: "N3 spike: deterministic completion." };
	}

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async
	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		if (!this.sessions.has(handle.sessionId)) {
			throw new Error(`StubHarnessAdapter: unknown session ${handle.sessionId}`);
		}
		this.sessions.delete(handle.sessionId);
		return {
			outcome: "completed",
			cost: { minor: 18, currency: "USD" }, // $0.18 in cents
			tokenUsage: {
				byTier: {
					workhorse: { prompt: 120, completion: 60 },
				},
			},
		};
	}

	getCapabilities(): HarnessCapabilities {
		return { preCompactionTrigger: false, subAgents: false };
	}
}
