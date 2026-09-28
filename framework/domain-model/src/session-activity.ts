/**
 * Normalized session ActivityEntry union.
 *
 * The server normalizes raw harness events into `ActivityEntry[]`; the web
 * hook consumes the same shape; `derivePartsFromSession`
 * (framework/conversation-parts/src/part.ts) adapts ActivityEntry[] → Part[]
 * through this type only — no harness-type parameter, no per-backend branch.
 */

// ── Data payload shapes ──────────────────────────────────────────────

export type ToolCallData = {
	toolName: string;
	argsSummary: string;
	/** Normalized tool family → icon/verb/expanded-shape. Defaults to "generic". */
	toolKind?: string;
	/** Human-readable action label ("Run command", "Edit", "View", …). */
	verb?: string;
	/** Muted truncated preview (command/path/# comment). */
	target?: string;
	/**
	 * "running" | "ok" | "failed" | "neutral".
	 * Optional for backward-compat with older server buffers that emit only toolName+argsSummary.
	 * The adapter defaults to "neutral" when absent.
	 */
	status?: "running" | "ok" | "failed" | "neutral";
	/** Collapsed body — stdout / matches / result (absent until expanded). */
	output?: string;
	/** A file-change carries a diff stat → opens ReviewCodeDiff. */
	diff?: { label: string; added: number; removed: number };
	/** A sub-agent spawn opens its own nested session view. */
	opensSession?: { sessionId: string; label: string };
};

export type ReasoningData = {
	/**
	 * How long the agent thought (ms) → "Thought for Ns" resting label.
	 * Optional for backward-compat with older server buffers that only emit `excerpt`.
	 */
	durationMs?: number;
	/**
	 * The reasoning body, shown on expand.
	 * Optional for backward-compat with older server buffers that only emit `excerpt`.
	 */
	text?: string;
	/** Legacy field from older server buffers; used when durationMs/text are absent. */
	excerpt?: string;
};

export type AnswerDeltaData = {
	/** New tokens appended to the current agent prose turn. */
	text: string;
};

export type AnswerSettledData = {
	/** The final settled text of the agent prose turn. */
	text: string;
};

export type HumanMessageData = {
	text: string;
	/** The human author (needed for isMe / display name). */
	author: {
		id: string;
		name: string;
		isAgent: false;
		isMe: boolean;
	};
};

// ── ActivityEntry discriminated union ──────────────────────────────

export type ActivityEntry =
	| { type: "tool_call"; timestamp: number; data: ToolCallData }
	| { type: "reasoning"; timestamp: number; data: ReasoningData }
	| { type: "answer_delta"; timestamp: number; data: AnswerDeltaData }
	| { type: "answer_settled"; timestamp: number; data: AnswerSettledData }
	| { type: "human_message"; timestamp: number; data: HumanMessageData };
