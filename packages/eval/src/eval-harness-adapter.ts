/**
 * EvalHarnessAdapter — mock harness that replays scripted tool call sequences.
 *
 * @lore X7: The eval adapter implements HarnessAdapter directly rather than
 * wrapping BuiltinHarnessAdapter (X6 is a stub that throws). This adapter
 * emits tool_call events with mcpSupport=false so provisionSession's Phase 10
 * intercepts them and dispatches to registry.invoke() — exercising the full
 * tool execution path including Zod validation, DB writes, and event emission.
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import type { HarnessScript } from "./types.js";

export class EvalHarnessAdapter implements HarnessAdapter {
	private readonly script: HarnessScript;
	private nextId = 1;

	constructor(script: HarnessScript) {
		this.script = script;
	}

	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: `eval-session-${this.nextId++}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		for (const turn of this.script.turns) {
			// Emit tool_call events for each scripted tool call.
			// The provisioning orchestrator's Phase 10 intercepts these and
			// dispatches to registry.invoke().
			for (const tc of turn.toolCalls) {
				yield {
					type: "tool_call",
					toolName: tc.toolName,
					args: tc.args,
				};
			}

			// Emit cost_update if specified.
			if (turn.costDelta !== undefined && turn.costDelta > 0) {
				yield {
					type: "cost_update",
					totalCost: turn.costDelta,
					deltaCost: turn.costDelta,
				};
			}

			// Emit completion text if specified.
			if (turn.completion) {
				yield {
					type: "completion",
					text: turn.completion,
				};
			}
		}
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			// @lore X7: mcpSupport=false is critical — it causes provisionSession's
			// Phase 10 to intercept tool_call events and dispatch them to
			// registry.invoke(). With mcpSupport=true, interception is skipped and
			// tool DB writes would never happen.
			mcpSupport: false,
		};
	}
}
