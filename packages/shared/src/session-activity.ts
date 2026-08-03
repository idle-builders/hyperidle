/**
 * AM3 — Normalized session ActivityEntry union.
 *
 * Lifted from `packages/web/src/hooks/useSessionActivity.ts` and
 * `packages/server/src/services/session-activity-buffer.ts` (both had
 * verbatim-duplicate definitions). This is the ONE definition; both the
 * web hook and the server buffer re-point their imports here.
 *
 * The union is the NORMALIZED, backend-agnostic boundary: the server
 * normalizes raw harness events into `ActivityEntry[]`; the web hook
 * consumes the same shape; `derivePartsFromSession` (packages/shared/src/part.ts)
 * adapts ActivityEntry[] → Part[] through this type only — no harness-type
 * parameter, no per-backend branch (AM3 AC3/AC4 uniformity proof).
 *
 * @lore AM3: ActivityEntry is intentionally richer than the Q1 shape to
 * support the session adapter. The Q1 shape (tool_call/reasoning) is
 * preserved as a subset; new entry types (answer_delta, answer_settled,
 * human_message) are added to cover the full adapter contract. The server
 * buffer only emits tool_call/reasoning; the web hook maps WS events to
 * these types. The adapter handles all members exhaustively.
 *
 * @lore AU21 Increment 14a: `cost_tick`/`CostTickData` is HARD-DELETED along
 * with the rest of the cost-cap feature — no replacement.
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
	 * Optional for backward-compat with Q1 server buffer that emits only toolName+argsSummary.
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
	 * Optional for backward-compat with Q1 server buffer that only emits `excerpt`.
	 */
	durationMs?: number;
	/**
	 * The reasoning body, shown on expand.
	 * Optional for backward-compat with Q1 server buffer that only emits `excerpt`.
	 */
	text?: string;
	/** Legacy field from Q1 server buffer; used when durationMs/text are absent. */
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
