/**
 * X6: BuiltinHarnessAdapter — a HarnessAdapter implementation that runs a
 * structured agent loop (plan → execute → reflect → stop) using direct LLM API
 * calls via callLlm(). Supports Anthropic, OpenRouter, and OpenAI-compatible
 * model providers.
 *
 * @lore X6: We inject the registry rather than taking it in the constructor
 * because the registry is session-scoped (bound to a specific ToolContext
 * with sessionId, agentId, taskId, workspacePath, watcher). The adapter
 * is registered in the pool once; registries are created per-session by
 * the provisioning orchestrator.
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import type { ToolRegistry } from "../skill-tools/tool-registry.js";

/** Configuration options for the built-in harness. */
export interface BuiltinHarnessOptions {
	/** Maximum loop iterations before forced stop. Default: 50. */
	readonly maxIterations?: number;
	/** Tool calls between reflection checkpoints. Default: 5. */
	readonly reflectionInterval?: number;
	/** Context window usage fraction that triggers pre-compaction. Default: 0.8. */
	readonly preCompactionThreshold?: number;
	/** Max output tokens per LLM call. Default: 16384. */
	readonly maxOutputTokens?: number;
}

export class BuiltinHarnessAdapter implements HarnessAdapter {
	constructor(_options?: BuiltinHarnessOptions) {
		throw new Error("not implemented");
	}

	/**
	 * X6: Inject a tool registry for a session. Must be called before startSession.
	 * The provisioning orchestrator calls this after building the registry (Phase 8).
	 *
	 * This method is on the concrete class, NOT on the HarnessAdapter interface.
	 * The provisioning orchestrator casts to BuiltinHarnessAdapter when
	 * meta.type === "builtin".
	 */
	setSessionToolRegistry(_sessionId: string, _registry: ToolRegistry): void {
		throw new Error("not implemented");
	}

	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		throw new Error("not implemented");
	}

	// biome-ignore lint/correctness/useYield: stub — implementation will yield HarnessEvents
	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		throw new Error("not implemented");
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		throw new Error("not implemented");
	}

	getCapabilities(): HarnessCapabilities {
		throw new Error("not implemented");
	}
}
