/** Harness adapter interface — the boundary between meta-layer and agent runtime (D1). */

import type { ModelTier } from "../types.js";
import type { HarnessEvent } from "./harness-events.js";

export interface SessionConfig {
	readonly workspacePath: string;
	readonly soulPromptPath: string;
	readonly modelTier: ModelTier;
	readonly tools: readonly string[];
}

export interface SessionHandle {
	readonly sessionId: string;
}

export interface SessionResult {
	readonly outcome: "completed" | "crashed" | "stopped";
	readonly totalTokens: number;
	readonly totalCost: number;
}

export interface HarnessCapabilities {
	readonly preCompactionTrigger: boolean;
	readonly subAgents: boolean;
}

export interface HarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<SessionResult>;
	getCapabilities(): HarnessCapabilities;
}
