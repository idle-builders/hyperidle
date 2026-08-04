/** Mock harness adapter for testing (D1). */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	ReturnEnforcementChannel,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "./harness-adapter.js";
import type { HarnessEvent } from "./harness-events.js";

let nextId = 1;

/**
 * Options for MockHarnessAdapter.
 *
 * @lore WARN-F4: returnEnforcement is non-optional on HarnessCapabilities.
 * The mock must support a channel override so tests can exercise multiple channels
 * through one adapter class. Default is "none" (suitable for tests that don't
 * care about the enforcement channel).
 */
export interface MockHarnessAdapterOptions {
	readonly returnEnforcement?: ReturnEnforcementChannel;
}

export class MockHarnessAdapter implements HarnessAdapter {
	private readonly sessions = new Map<string, { config: SessionConfig; running: boolean }>();
	private readonly returnEnforcementChannel: ReturnEnforcementChannel;

	/**
	 * @lore WARN-F4: Constructor accepts an options object with
	 * returnEnforcement override. Default is "none" so existing tests that
	 * construct MockHarnessAdapter() without args continue to work.
	 */
	constructor(options?: MockHarnessAdapterOptions) {
		this.returnEnforcementChannel = options?.returnEnforcement ?? "none";
	}

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
			tokenUsage: {
				byTier: {
					workhorse: { prompt: 100, completion: 50 },
				},
			},
		};
	}

	getCapabilities(): HarnessCapabilities {
		// X5: mcpSupport: false — mock adapter is test-only and does not wire MCP.
		// returnEnforcement declared from constructor override or default "none".
		return {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			returnEnforcement: this.returnEnforcementChannel,
		};
	}
}
