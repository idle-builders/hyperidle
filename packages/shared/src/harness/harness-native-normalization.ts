/**
 * AM2 AC6: Per-family native event pre-normalizer.
 *
 * Maps captured real harness output shapes into the HyperIdle union before
 * `normalizeHarnessEvent`. Genuinely-unsupported native types fall through to
 * `normalizeHarnessEvent` → `UnknownHarnessEvent`.
 *
 * Decision: `builtin` is intentionally NOT in this union. Builtin events are
 * already union-shaped (emitted by BuiltinHarnessAdapter.trackUsage →
 * token_usage/cost_update) and never pass through this pre-normalizer — that
 * different code path is exactly why AC6 asserts three-way equivalence (builtin
 * vs the two normalized fixtures).
 *
 * @lore AM2: No per-backend branching leaks into descriptor shape or UI — consumers
 * still see only the HyperIdle union (HarnessEvent). The pre-normalizer is the only
 * place that knows about native Codex/Claude shapes.
 */

import { normalizeHarnessEvent } from "./harness-event-normalization.js";
import type { HarnessEvent } from "./harness-events.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Normalize a real Codex native event line into the HyperIdle union.
 *
 * Recognized:
 *   - `turn.completed` with `usage.{input_tokens, output_tokens}` → `token_usage`
 *
 * Unrecognized → falls through to `normalizeHarnessEvent` → `UnknownHarnessEvent`.
 */
function normalizeCodexEvent(nativeLine: unknown): HarnessEvent {
	if (!isRecord(nativeLine)) return normalizeHarnessEvent(nativeLine);

	if (nativeLine.type === "turn.completed") {
		const usage = nativeLine.usage;
		if (
			isRecord(usage) &&
			isFiniteNumber(usage.input_tokens) &&
			isFiniteNumber(usage.output_tokens)
		) {
			return {
				type: "token_usage",
				inputTokens: usage.input_tokens,
				outputTokens: usage.output_tokens,
			};
		}
	}

	// Unrecognized codex event type → fall through
	return normalizeHarnessEvent(nativeLine);
}

/**
 * Normalize a real Claude Code native event line into the HyperIdle union.
 *
 * Recognized:
 *   - `result` with `usage.{input_tokens, output_tokens}` → `token_usage`
 *   - `result` with `total_cost_usd` → `cost_update` (when extractCost option set)
 *
 * Unrecognized → falls through to `normalizeHarnessEvent` → `UnknownHarnessEvent`.
 */
function normalizeClaudeCodeEvent(
	nativeLine: unknown,
	opts?: { extractCost?: boolean },
): HarnessEvent {
	if (!isRecord(nativeLine)) return normalizeHarnessEvent(nativeLine);

	if (nativeLine.type === "result") {
		const usage = nativeLine.usage;

		// When extractCost is requested, produce a cost_update from total_cost_usd
		if (opts?.extractCost === true && isFiniteNumber(nativeLine.total_cost_usd)) {
			return {
				type: "cost_update",
				totalCost: nativeLine.total_cost_usd,
				deltaCost: nativeLine.total_cost_usd,
				currency: "USD",
			};
		}

		// Default: produce token_usage from usage.{input_tokens, output_tokens}
		if (
			isRecord(usage) &&
			isFiniteNumber(usage.input_tokens) &&
			isFiniteNumber(usage.output_tokens)
		) {
			return {
				type: "token_usage",
				inputTokens: usage.input_tokens,
				outputTokens: usage.output_tokens,
			};
		}
	}

	// Unrecognized claude event type → fall through
	return normalizeHarnessEvent(nativeLine);
}

/**
 * Normalize a real OpenCode native event line into the HyperIdle union.
 *
 * @lore AM2: OpenCode's event schema was not confirmed in the live dossier.
 * Until a real fixture is captured and the schema is known, all opencode lines
 * fall through to `normalizeHarnessEvent` → `UnknownHarnessEvent`. This is the
 * correct conservative treatment: never guess a mapping.
 */
function normalizeOpenCodeEvent(nativeLine: unknown): HarnessEvent {
	// No recognized shapes yet — fall through
	return normalizeHarnessEvent(nativeLine);
}

/**
 * Per-family native event pre-normalizer.
 *
 * Maps captured Codex/Claude real output shapes into the HyperIdle union.
 * Genuinely-unsupported types fall through to `normalizeHarnessEvent` →
 * `UnknownHarnessEvent` (graceful degradation preserved).
 *
 * `builtin` is intentionally NOT in the family union — builtin events already
 * arrive in the union shape via `BuiltinHarnessAdapter.trackUsage`.
 *
 * @param family     The CLI harness family that produced the native line.
 * @param nativeLine The raw parsed JSON event object from the CLI output.
 * @param opts       Options: `extractCost` instructs Claude normalization to
 *                   extract `total_cost_usd` as a `cost_update` event instead of
 *                   the default `token_usage`.
 */
export function normalizeNativeHarnessEvent(
	family: "codex" | "claude-code" | "opencode",
	nativeLine: unknown,
	opts?: { extractCost?: boolean },
): HarnessEvent {
	switch (family) {
		case "codex":
			return normalizeCodexEvent(nativeLine);
		case "claude-code":
			return normalizeClaudeCodeEvent(nativeLine, opts);
		case "opencode":
			return normalizeOpenCodeEvent(nativeLine);
	}
}
