import { z } from "zod";

export const AGENT_SESSION_SOURCE_KINDS = [
	"task",
	"assistant",
	"routine",
	"knowledge",
	"decomposition",
	"proposed_call",
] as const;

export const AGENT_SESSION_PROMPT_MODES = [
	"task",
	"conversation",
	"routine",
	"knowledge",
	"decomposition",
	"proposed_call",
] as const;

export const AGENT_SESSION_REQUEST_STATUSES = [
	"pending",
	"claimed",
	"running",
	"completed",
	"failed",
	"cancelled",
] as const;

export type AgentSessionSourceKind = (typeof AGENT_SESSION_SOURCE_KINDS)[number];
export type AgentSessionPromptMode = (typeof AGENT_SESSION_PROMPT_MODES)[number];
export type AgentSessionRequestStatus = (typeof AGENT_SESSION_REQUEST_STATUSES)[number];

const baseInput = z.object({
	sourceId: z.string().min(1),
	streamId: z.string().min(1),
	agentId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	userId: z.string().min(1).optional(),
	idempotencyKey: z.string().min(1),
	payloadJson: z.string().optional(),
});

export const taskSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("task"),
	promptMode: z.literal("task"),
	taskId: z.string().min(1),
	teamId: z.string().min(1),
	sourceCorrelation: z.object({
		taskId: z.string().min(1),
		teamId: z.string().min(1),
		proposedCallId: z.string().min(1).optional(),
	}),
});

export const assistantSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("assistant"),
	promptMode: z.literal("conversation"),
	taskId: z.null().optional(),
	userId: z.string().min(1),
	sourceCorrelation: z.object({
		threadId: z.string().min(1),
		messageId: z.string().min(1),
		userId: z.string().min(1),
		assistantAgentId: z.string().min(1),
	}),
});

export const routineSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("routine"),
	promptMode: z.literal("routine"),
	taskId: z.string().min(1).nullable().optional(),
	teamId: z.string().min(1),
	sourceCorrelation: z.object({
		routineId: z.string().min(1),
		routineRunId: z.string().min(1),
		teamId: z.string().min(1),
	}),
});

export const knowledgeSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("knowledge"),
	promptMode: z.literal("knowledge"),
	taskId: z.null().optional(),
	sourceCorrelation: z.object({
		knowledgeItemId: z.string().min(1),
		action: z.enum(["promote", "summarize", "extract", "review"]),
		teamId: z.string().min(1).optional(),
		scopeId: z.string().min(1).optional(),
	}),
});

export const decompositionSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("decomposition"),
	promptMode: z.literal("decomposition"),
	taskId: z.null().optional(),
	teamId: z.string().min(1),
	sourceCorrelation: z.object({
		betId: z.string().min(1),
		teamId: z.string().min(1),
		decomposerAgentId: z.string().min(1),
	}),
});

export const proposedCallSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("proposed_call"),
	promptMode: z.literal("proposed_call"),
	taskId: z.string().min(1),
	sourceCorrelation: z.object({
		taskId: z.string().min(1),
		proposedCallId: z.string().min(1),
		grantedAgentId: z.string().min(1),
	}),
});

export const agentSessionRequestInputSchema = z.discriminatedUnion("sourceKind", [
	taskSessionRequestInputSchema,
	assistantSessionRequestInputSchema,
	routineSessionRequestInputSchema,
	knowledgeSessionRequestInputSchema,
	decompositionSessionRequestInputSchema,
	proposedCallSessionRequestInputSchema,
]);

export type AgentSessionRequestInput = z.infer<typeof agentSessionRequestInputSchema>;
export type AgentSessionSourceCorrelation = AgentSessionRequestInput["sourceCorrelation"];

export interface SessionLifecycleCorrelation {
	readonly requestId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
}

export function buildSessionLifecycleCorrelation(input: SessionLifecycleCorrelation) {
	return input;
}
