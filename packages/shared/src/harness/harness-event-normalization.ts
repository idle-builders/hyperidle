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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isModelTier(value: unknown): value is ModelTier {
	return typeof value === "string" && MODEL_TIERS.includes(value as ModelTier);
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

export function normalizeHarnessEvent(input: unknown): HarnessEvent {
	if (!isRecord(input) || typeof input.type !== "string") {
		return unknownEvent(input);
	}

	if (!(EVENT_TYPES as readonly string[]).includes(input.type)) {
		return unknownEvent(input);
	}

	switch (input.type) {
		case "completion": {
			if (typeof input.text !== "string") return unknownEvent(input);
			if (Array.isArray(input.toolCalls)) {
				const toolCalls = input.toolCalls.filter(isCapturedToolCall);
				return toolCalls.length > 0
					? { type: "completion", text: input.text, toolCalls }
					: { type: "completion", text: input.text };
			}
			return { type: "completion", text: input.text };
		}
		case "tool_call": {
			if (typeof input.toolName !== "string") return unknownEvent(input);
			const args = isRecord(input.args) ? input.args : {};
			return { type: "tool_call", toolName: input.toolName, args };
		}
		case "error": {
			if (typeof input.message !== "string" || typeof input.code !== "string") {
				return unknownEvent(input);
			}
			return { type: "error", message: input.message, code: input.code };
		}
		case "cost_update": {
			if (!(isFiniteNumber(input.totalCost) && isFiniteNumber(input.deltaCost))) {
				return unknownEvent(input);
			}
			const event: CostUpdateEvent = {
				type: "cost_update",
				totalCost: input.totalCost,
				deltaCost: input.deltaCost,
			};
			if (typeof input.currency === "string") {
				return { ...event, currency: input.currency as CostUpdateEvent["currency"] };
			}
			return event;
		}
		case "token_usage": {
			if (!(isFiniteNumber(input.inputTokens) && isFiniteNumber(input.outputTokens))) {
				return unknownEvent(input);
			}
			const event: TokenUsageEvent = {
				type: "token_usage",
				inputTokens: input.inputTokens,
				outputTokens: input.outputTokens,
			};
			if (isModelTier(input.tier)) {
				return { ...event, tier: input.tier };
			}
			return event;
		}
		case "pre_compaction": {
			if (!(isFiniteNumber(input.contextTokens) && isFiniteNumber(input.maxTokens))) {
				return unknownEvent(input);
			}
			return {
				type: "pre_compaction",
				contextTokens: input.contextTokens,
				maxTokens: input.maxTokens,
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
