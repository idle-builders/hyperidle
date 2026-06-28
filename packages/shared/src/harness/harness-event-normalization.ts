import { CURRENCY_CODES, type CurrencyCode } from "../types/money.js";
import { MODEL_TIERS, type ModelTier } from "../types.js";
import type {
	CapturedToolCall,
	CostUpdateEvent,
	HarnessEvent,
	HarnessEventType,
	TokenUsageEvent,
} from "./harness-events.js";

const EVENT_TYPES = [
	"token_usage",
	"tool_call",
	"completion",
	"error",
	"cost_update",
	"pre_compaction",
] as const satisfies readonly HarnessEventType[];

const MODEL_TIER_VALUES: ReadonlySet<string> = new Set(MODEL_TIERS);
const CURRENCY_CODE_VALUES: ReadonlySet<string> = new Set(CURRENCY_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isModelTier(value: unknown): value is ModelTier {
	return typeof value === "string" && MODEL_TIER_VALUES.has(value);
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
	return typeof value === "string" && CURRENCY_CODE_VALUES.has(value);
}

function isCapturedToolCall(value: unknown): value is CapturedToolCall {
	return (
		isRecord(value) &&
		typeof value.name === "string" &&
		isRecord(value.input) &&
		typeof value.output === "string" &&
		(value.status === "ok" || value.status === "error")
	);
}

function unknownEvent(input: unknown): HarnessEvent {
	const type = isRecord(input) && typeof input.type === "string" ? input.type : "unknown";
	return {
		type: "error",
		code: "UnknownHarnessEvent",
		message: `Unknown harness event: ${type}`,
	};
}

/**
 * Translate claude CLI stream-json event types to canonical HarnessEvent types
 * before normalization.
 *
 * claude `--output-format stream-json --verbose` emits one JSON object per line:
 *   - `assistant` — turn content (text or tool_use blocks in message.content)
 *   - `result`    — session summary (total_cost_usd, subtype, result text)
 *   - `system`    — init info, not useful for event dispatch
 *   - `user`      — echo of the prompt (ignored)
 *
 * Without this pre-map these all hit the default branch of normalizeHarnessEvent
 * and become error events (unknown type). This pre-map converts them to canonical
 * types so the event stream is useful.
 *
 * @lore claude-cli-adapter: Return enforcement for claude is the `settings-claude`
 * Stop hook (not stream return-detection). This pre-map is best-effort one-event-
 * per-line: multi-block assistant messages keep the first tool_use; else text.
 *
 * NOT called from normalizeHarnessEvent — the CLI adapter applies it explicitly
 * so codex/opencode are unaffected.
 */
export function preMapClaudeEvent(input: unknown): Record<string, unknown> {
	if (!isRecord(input) || typeof input.type !== "string") {
		return input as Record<string, unknown>;
	}

	switch (input.type) {
		case "assistant": {
			// message.content is an array of blocks
			const message = isRecord(input.message) ? input.message : {};
			const content = Array.isArray(message.content) ? message.content : [];
			// Prefer the first tool_use block over text
			for (const block of content) {
				if (!isRecord(block)) continue;
				if (block.type === "tool_use") {
					return {
						type: "tool_call",
						toolName: typeof block.name === "string" ? block.name : "unknown",
						args: isRecord(block.input) ? block.input : {},
					};
				}
			}
			// Fall back to the first text block
			for (const block of content) {
				if (!isRecord(block)) continue;
				if (block.type === "text" && typeof block.text === "string") {
					return { type: "completion", text: block.text };
				}
			}
			return { type: "completion", text: "" };
		}
		case "result": {
			return {
				type: "completion",
				text: typeof input.result === "string" ? input.result : "",
			};
		}
		default:
			// system, user, or anything else → benign completion to avoid error-event pollution
			return { type: "completion", text: "" };
	}
}

/**
 * Translate opencode JSONL raw event types to canonical HarnessEvent types
 * before normalization.
 *
 * opencode `--format json` emits JSONL where `type` is opencode-specific
 * (e.g. `step_finish`, `tool`). These don't match the canonical set, so without
 * a pre-map they normalize to `unknown`. This pre-map translates the most common
 * opencode event shapes to their canonical equivalents.
 *
 * @lore AL7 W3: This pre-map is required because opencode has no SDK adapter —
 * the HTTP MCP bridge is its only production transport. Event normalization
 * (return-detection, cost) must work for the loop to function correctly.
 * Without this, all opencode events normalize to `unknown` and the loop is blind.
 *
 * Verified opencode 1.17.8 `--format json` event types:
 *   step_finish — emitted when a turn ends; may include text output
 *   tool        — emitted when a tool call is made; includes tool name + args
 */
function preMapOpencodeEvent(input: Record<string, unknown>): Record<string, unknown> {
	switch (input.type) {
		case "step_finish": {
			// step_finish signals turn completion. Extract text from known field variants.
			// opencode may nest the content in `properties.output`, `output`, or `text`.
			const props = isRecord(input.properties) ? input.properties : input;
			const text =
				typeof props.output === "string"
					? props.output
					: typeof props.text === "string"
						? props.text
						: typeof input.output === "string"
							? input.output
							: "";
			return { type: "completion", text };
		}
		case "tool": {
			// tool event signals a tool call. Extract toolName + args.
			const toolName =
				typeof input.tool === "string"
					? input.tool
					: typeof input.name === "string"
						? input.name
						: "unknown";
			const args = isRecord(input.input) ? input.input : isRecord(input.args) ? input.args : {};
			return { type: "tool_call", toolName, args };
		}
		default:
			return input;
	}
}

export function normalizeHarnessEvent(input: unknown): HarnessEvent {
	if (!isRecord(input) || typeof input.type !== "string") {
		return unknownEvent(input);
	}

	// Pre-map opencode raw event types to canonical types before the main switch.
	const mapped = preMapOpencodeEvent(input);

	if (!(EVENT_TYPES as readonly string[]).includes(mapped.type as string)) {
		return unknownEvent(input);
	}

	// Use the pre-mapped event for normalization (opencode raw types translated to canonical).
	const n = mapped;

	switch (n.type) {
		case "completion": {
			if (typeof n.text !== "string") return unknownEvent(input);
			if (Array.isArray(n.toolCalls)) {
				const toolCalls = n.toolCalls.filter(isCapturedToolCall);
				return toolCalls.length > 0
					? { type: "completion", text: n.text, toolCalls }
					: { type: "completion", text: n.text };
			}
			return { type: "completion", text: n.text };
		}
		case "tool_call": {
			if (typeof n.toolName !== "string") return unknownEvent(input);
			const args = isRecord(n.args) ? n.args : {};
			return { type: "tool_call", toolName: n.toolName, args };
		}
		case "error": {
			if (typeof n.message !== "string" || typeof n.code !== "string") {
				return unknownEvent(input);
			}
			return { type: "error", message: n.message, code: n.code };
		}
		case "cost_update": {
			if (!(isFiniteNumber(n.totalCost) && isFiniteNumber(n.deltaCost))) {
				return unknownEvent(input);
			}
			const event: CostUpdateEvent = {
				type: "cost_update",
				totalCost: n.totalCost as number,
				deltaCost: n.deltaCost as number,
			};
			if (isCurrencyCode(n.currency)) {
				return { ...event, currency: n.currency };
			}
			return event;
		}
		case "token_usage": {
			if (!(isFiniteNumber(n.inputTokens) && isFiniteNumber(n.outputTokens))) {
				return unknownEvent(input);
			}
			const event: TokenUsageEvent = {
				type: "token_usage",
				inputTokens: n.inputTokens as number,
				outputTokens: n.outputTokens as number,
			};
			if (isModelTier(n.tier)) {
				return { ...event, tier: n.tier };
			}
			return event;
		}
		case "pre_compaction": {
			if (!(isFiniteNumber(n.contextTokens) && isFiniteNumber(n.maxTokens))) {
				return unknownEvent(input);
			}
			return {
				type: "pre_compaction",
				contextTokens: n.contextTokens as number,
				maxTokens: n.maxTokens as number,
			};
		}
	}
	return unknownEvent(input);
}

export function isHarnessEvent(input: unknown): input is HarnessEvent {
	return (
		normalizeHarnessEvent(input).type !== "error" || (isRecord(input) && input.type === "error")
	);
}
