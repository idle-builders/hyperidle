import { z } from "zod";
import { AGENT_SESSION_SOURCE_KINDS, type AgentSessionSourceKind } from "./session-request.js";

export const TRIGGER_EVENT_TYPES = [
	"task.accepted",
	"assistant.message",
	"routine.fire",
	"work.decompose_requested",
	"knowledge.action",
	"proposed_call.granted",
] as const;

export type TriggerEventType = (typeof TRIGGER_EVENT_TYPES)[number];

export const TRIGGER_RESULT_STATES = ["matched", "fallback", "failed"] as const;
export type TriggerResultState = (typeof TRIGGER_RESULT_STATES)[number];

const TriggerScopeSchema = z.object({
	sourceId: z.string().min(1).optional(),
	teamId: z.string().min(1).optional(),
	userId: z.string().min(1).optional(),
});

export const TriggerRuleValueSchema = z
	.object({
		eventType: z.enum(TRIGGER_EVENT_TYPES),
		sourceKind: z.enum(AGENT_SESSION_SOURCE_KINDS),
		scope: TriggerScopeSchema.optional(),
		agentId: z.string().min(1),
		prompt: z.string().max(12_000).optional(),
		priority: z.number().int().optional(),
	})
	.passthrough();

export type TriggerRuleValue = z.infer<typeof TriggerRuleValueSchema>;

export interface TriggerResolutionResult {
	readonly eventType: TriggerEventType;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly result: TriggerResultState;
	readonly triggerKey: string | null;
	readonly triggerSource: "fallback" | "default" | "user_override" | "user_owned" | "failed";
	readonly chosenAgentId: string | null;
	readonly prompt: string | null;
	readonly promptSource: string | null;
	readonly conflicts: readonly string[];
	readonly deterministicOrder: readonly string[];
	readonly reason: string;
}

export function isTriggerEventType(value: string): value is TriggerEventType {
	return (TRIGGER_EVENT_TYPES as readonly string[]).includes(value);
}
