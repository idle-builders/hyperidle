/**
 * X5: BuiltinHarnessAdapter stub — placeholder until X6 implements the built-in
 * agent loop that runs inside the server process without an external harness.
 *
 * All session methods throw to fail loudly if an agent is configured with
 * harnessType: "builtin" before X6 lands.
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";

export class BuiltinHarnessAdapter implements HarnessAdapter {
	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		// X6 implements the real agent loop.
		throw new Error("BuiltinHarnessAdapter: not yet implemented (see X6)");
	}

	// biome-ignore lint/correctness/useYield: async generator requires yield for the type; throw before first yield
	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		throw new Error("BuiltinHarnessAdapter: not yet implemented (see X6)");
	}

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		throw new Error("BuiltinHarnessAdapter: not yet implemented (see X6)");
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: true,
			subAgents: false,
			// X5: modelProviders listed here because the builtin harness will call
			// these providers directly once X6 fills in the implementation.
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			// X5: mcpSupport: false — builtin harness calls tool registry directly,
			// no MCP transport needed.
			mcpSupport: false,
		};
	}
}
