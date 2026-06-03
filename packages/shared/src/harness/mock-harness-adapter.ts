/** Mock harness adapter for testing (D1). */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "./harness-adapter.js";
import type { HarnessEvent } from "./harness-events.js";

let nextId = 1;

export class MockHarnessAdapter implements HarnessAdapter {
	private readonly sessions = new Map<string, { config: SessionConfig; running: boolean }>();

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const sessionId = `mock-session-${nextId++}`;
		this.sessions.set(sessionId, { config, running: true });
		return { sessionId };
	}

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`Unknown session: ${handle.sessionId}`);
		}

		yield { type: "token_usage", inputTokens: 100, outputTokens: 50 };
		yield { type: "tool_call", toolName: "read_file", args: { path: "/workspace/test.ts" } };
		yield { type: "completion", text: "Task completed successfully." };
	}

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`Unknown session: ${handle.sessionId}`);
		}
		session.running = false;
		return {
			outcome: "completed",
			cost: { minor: 300, currency: "USD" }, // $3.00 in cents
			tokenUsage: {
				byTier: {
					workhorse: { prompt: 100, completion: 50 },
				},
			},
		};
	}

	getCapabilities(): HarnessCapabilities {
		// X5: mcpSupport: false — mock adapter is test-only and does not wire MCP.
		return {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: false,
		};
	}
}
