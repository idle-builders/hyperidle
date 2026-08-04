import { MODEL_TIERS, type ModelTier } from "../types.js";
import type { HarnessEvent, HarnessEventType, TokenUsageEvent } from "./harness-events.js";

const EVENT_TYPES = [
	"token_usage",
	"tool_call",
	"completion",
	"error",
	"pre_compaction",
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
		case "tool_use": {
			// tool_use event signals a tool call (observed in opencode --format json output).
			// The event structure: { type:"tool_use", part:{ type:"tool", tool:<name>,
			// state:{ input:<args> } } }
			//
			// @lore AR2 opencode-tool_use: opencode --format json emits "tool_use" (not "tool")
			// for tool calls. Discovered 2026-06-29 by running `opencode run ... --format json`
			// manually: the JSONL stream contains step_start → tool_use → step_finish.
			// Without this branch, tool_use hits the default path → preMapCodexEvent (no match)
			// → unknownEvent → { type:"error", code:"UnknownHarnessEvent" }
			// → provisionSession crashed=true. Fix: map tool_use to tool_call using part.tool
			// for the name and part.state.input for the args.
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
			// Lifecycle event with no actionable content — produce a benign empty completion
			// so it doesn't fall through to unknownEvent (→ error).
			//
			// @lore AR2 opencode-events: opencode `--format json` emits step_start at turn-start.
			// Verified opencode 1.17.11: a simple `run` turn yields step_start → text → step_finish.
			// Without this branch, step_start hits the default path → unknownEvent
			// → { type: "error", code: "UnknownHarnessEvent" } → provisionSession crashed = true.
			return { type: "completion", text: "" };
		case "text": {
			// opencode `text` events carry streaming text chunks in `part.text`.
			// Real event shape (verified opencode 1.17.11):
			//   { type:"text", part:{ type:"text", text:"<actual content>" } }
			//
			// @lore AR5 opencode-text-event: The actual LLM response arrives in `text` events
			// (part.text), NOT in `step_finish`. step_finish carries only metadata (reason, tokens,
			// cost). Without extracting part.text here, drainForCompletion sees only empty completions
			// and returns "" → JSON.parse fails → blocked/empty. Verified 2026-06-30 by running
			// `opencode run ... --format json` manually: step_start → text[part.text="..."] →
			// step_finish[no output field]. Extract part.text so lastNonEmpty captures the response.
			const part = isRecord(input.part) ? input.part : {};
			const text = typeof part.text === "string" ? part.text : "";
			return { type: "completion", text };
		}
		default:
			return input;
	}
}

/**
 * Translate codex JSONL raw event types to canonical HarnessEvent types
 * before normalization.
 *
 * codex `exec <prompt> --json` emits NDJSON where `type` is codex-specific.
 * Verified codex event types (2026-06-28/2026-06-29):
 *   thread.started — session init; no content; benign → ignored (empty completion)
 *   turn.started   — turn init; no content; benign → ignored
 *   item.started   — item start (command/tool execution start); benign → ignored
 *   item.completed — turn content; item.type === "agent_message" carries the text
 *   turn.completed — session summary; carries usage (input/output tokens) → token_usage
 *
 * @lore cli-adapter-real-binary codex-events: Without this pre-map, all codex events
 * normalize to UnknownHarnessEvent (error) because their type strings are not in the
 * canonical EVENT_TYPES set. Discovered 2026-06-28 when the stdin-close fix unblocked
 * codex sessions through the production adapter and exposed the missing pre-map.
 * The item.completed event is the primary carrier of the agent's response text.
 *
 * @lore AR2 codex-item-started: `item.started` is emitted when codex begins executing
 * a command/tool (e.g. shell command). It was missing from the pre-map, causing
 * provisionSession to crash whenever codex ran any shell command. Added 2026-06-29.
 */
function preMapCodexEvent(input: Record<string, unknown>): Record<string, unknown> {
	switch (input.type) {
		case "item.completed": {
			// item.completed carries the agent's response in item.text (agent_message type).
			const item = isRecord(input.item) ? input.item : {};
			const text = typeof item.text === "string" ? item.text : "";
			return { type: "completion", text };
		}
		case "turn.completed": {
			// turn.completed carries usage info (input/output token counts).
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
			// Lifecycle events with no actionable content — produce a benign empty completion.
			// @lore AR2: item.started fires when codex begins executing a shell command.
			// Without this branch it becomes UnknownHarnessEvent → error → crashed=true.
			return { type: "completion", text: "" };
		default:
			return input;
	}
}

export function normalizeHarnessEvent(input: unknown): HarnessEvent {
	if (!isRecord(input) || typeof input.type !== "string") {
		return unknownEvent(input);
	}

	// Pre-map opencode raw event types to canonical types before the main switch.
	// Pre-map codex raw event types if the input looks like a codex event.
	//
	// @lore harness-event-normalization asymmetry: codex pre-map is GLOBAL (applied
	// unconditionally here) because codex's dot-namespaced event types (item.completed,
	// turn.completed, thread.started, turn.started) are disjoint from all other harness
	// vocabularies — no ambiguity risk. The only runtime caller of normalizeHarnessEvent
	// for codex events is the CliHarnessAdapter, which receives codex JSONL exclusively.
	// By contrast, claude's pre-map (preMapClaudeEvent) is adapter-gated via the
	// eventDialect field in CliAdapterConfig: claude emits "result" and "system" types
	// that could be ambiguous if applied globally, so the adapter applies it explicitly
	// in parseStdoutLine only when eventDialect === "claude-stream-json".
	//
	// @lore harness-event-normalization reference-identity: The expression
	// `afterOpencode === input` (reference identity, not deep equality) relies on
	// preMapOpencodeEvent's `default: return input` branch returning the SAME object
	// reference. If preMapOpencodeEvent ever returns a copy in its default branch,
	// this guard will silently invert: codex events would hit opencode's fallthrough
	// path (which returns a copy, !== input) and skip the codex pre-map. If you change
	// preMapOpencodeEvent's default branch to return a copy, replace this guard with
	// an explicit type-check against known opencode event types.
	const afterOpencode = preMapOpencodeEvent(input);
	const mapped = afterOpencode === input ? preMapCodexEvent(input) : afterOpencode;

	if (!(EVENT_TYPES as readonly string[]).includes(mapped.type as string)) {
		return unknownEvent(input);
	}

	// Use the pre-mapped event for normalization (opencode raw types translated to canonical).
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
