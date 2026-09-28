import { MODEL_TIERS, type ModelTier } from "@hyperidle/domain-model";
import type { HarnessEvent, HarnessEventType, TokenUsageEvent } from "@hyperidle/harness-protocol";

const EVENT_TYPES = [
	"token_usage",
	"tool_call",
	"completion",
	"error",
] as const satisfies readonly HarnessEventType[];

const MODEL_TIER_VALUES: ReadonlySet<string> = new Set(MODEL_TIERS);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isModelTier(value: unknown): value is ModelTier {
	return typeof value === "string" && MODEL_TIER_VALUES.has(value);
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
 * Translate claude `--output-format stream-json --verbose` events to canonical types.
 * Types: assistant (turn content), result (summary), system (ignored), user (ignored).
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
 * Translate opencode `--format json` JSONL event types to canonical types.
 * opencode has no SDK adapter — MCP bridge is its only transport.
 *
 * @lore: preMapOpencodeEvent — without this all opencode events normalize to unknown; verified 1.17.8: step_finish (turn end), tool (tool call)
 */
function preMapOpencodeEvent(input: Record<string, unknown>): Record<string, unknown> {
	switch (input.type) {
		case "step_finish": {
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
			const toolName =
				typeof input.tool === "string"
					? input.tool
					: typeof input.name === "string"
						? input.name
						: "unknown";
			const args = isRecord(input.input) ? input.input : isRecord(input.args) ? input.args : {};
			return { type: "tool_call", toolName, args };
		}
		case "tool_use": {
			// @lore: opencode tool_use — opencode emits "tool_use" (not "tool"); without this → UnknownHarnessEvent → crashed=true; name: part.tool, args: part.state.input
			const part = isRecord(input.part) ? input.part : {};
			const toolName =
				typeof part.tool === "string"
					? part.tool
					: typeof input.tool === "string"
						? input.tool
						: "unknown";
			const state = isRecord(part.state) ? part.state : {};
			const args = isRecord(state.input)
				? state.input
				: isRecord(input.input)
					? input.input
					: isRecord(input.args)
						? input.args
						: {};
			return { type: "tool_call", toolName, args };
		}
		case "step_start":
			// @lore: opencode step_start — lifecycle event with no content; without this branch → UnknownHarnessEvent → crashed=true; verified opencode 1.17.11
			return { type: "completion", text: "" };
		case "text": {
			// @lore: opencode text event — LLM response is in `text` events (part.text), NOT step_finish; without it drainForCompletion sees empty completions → parse fails
			const part = isRecord(input.part) ? input.part : {};
			const text = typeof part.text === "string" ? part.text : "";
			return { type: "completion", text };
		}
		default:
			return input;
	}
}

/**
 * Translate codex `exec --json` NDJSON event types to canonical types.
 * codex types: thread.started, turn.started, item.started, item.completed (text), turn.completed (usage).
 *
 * @lore: preMapCodexEvent — without this all codex dot-namespaced types → UnknownHarnessEvent; item.started must map to benign completion or crashed=true
 */
function preMapCodexEvent(input: Record<string, unknown>): Record<string, unknown> {
	switch (input.type) {
		case "item.completed": {
			const item = isRecord(input.item) ? input.item : {};
			const text = typeof item.text === "string" ? item.text : "";
			return { type: "completion", text };
		}
		case "turn.completed": {
			const usage = isRecord(input.usage) ? input.usage : {};
			const inputTokens =
				typeof usage.input_tokens === "number" && Number.isFinite(usage.input_tokens)
					? usage.input_tokens
					: 0;
			const outputTokens =
				typeof usage.output_tokens === "number" && Number.isFinite(usage.output_tokens)
					? usage.output_tokens
					: 0;
			const event: Record<string, unknown> = { type: "token_usage", inputTokens, outputTokens };
			if (isFiniteNumber(usage.cached_input_tokens) && usage.cached_input_tokens >= 0) {
				event.cachedInputTokens = usage.cached_input_tokens;
			}
			if (isFiniteNumber(usage.reasoning_output_tokens) && usage.reasoning_output_tokens >= 0) {
				event.reasoningOutputTokens = usage.reasoning_output_tokens;
			}
			return event;
		}
		case "thread.started":
		case "turn.started":
		case "item.started":
			// item.started fires when codex begins executing a shell command; must be benign or crashed=true
			return { type: "completion", text: "" };
		default:
			return input;
	}
}

export function normalizeHarnessEvent(input: unknown): HarnessEvent {
	if (!isRecord(input) || typeof input.type !== "string") {
		return unknownEvent(input);
	}

	const afterOpencode = preMapOpencodeEvent(input);
	const mapped = afterOpencode === input ? preMapCodexEvent(input) : afterOpencode;

	if (!(EVENT_TYPES as readonly string[]).includes(mapped.type as string)) {
		return unknownEvent(input);
	}

	const n = mapped;

	switch (n.type) {
		case "completion": {
			if (typeof n.text !== "string") return unknownEvent(input);
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
		case "token_usage": {
			if (!(isFiniteNumber(n.inputTokens) && isFiniteNumber(n.outputTokens))) {
				return unknownEvent(input);
			}
			const event: TokenUsageEvent = {
				type: "token_usage",
				inputTokens: n.inputTokens as number,
				outputTokens: n.outputTokens as number,
			};
			const enriched: TokenUsageEvent = {
				...event,
				...(isFiniteNumber(n.cachedInputTokens) && n.cachedInputTokens >= 0
					? { cachedInputTokens: n.cachedInputTokens }
					: {}),
				...(isFiniteNumber(n.cacheCreationInputTokens) && n.cacheCreationInputTokens >= 0
					? { cacheCreationInputTokens: n.cacheCreationInputTokens }
					: {}),
				...(isFiniteNumber(n.reasoningOutputTokens) && n.reasoningOutputTokens >= 0
					? { reasoningOutputTokens: n.reasoningOutputTokens }
					: {}),
				...(isModelTier(n.tier) ? { tier: n.tier } : {}),
			};
			return enriched;
		}
	}
	return unknownEvent(input);
}
