import { z } from "zod";

export const AGENT_SESSION_SOURCE_KINDS = [
	"task",
	"assistant",
	"knowledge",
	/** A subscription's wake — an event or schedule woke the subscriber. */
	"subscription",
	"review_resume",
] as const;

export const AGENT_SESSION_PROMPT_MODES = [
	"task",
	"conversation",
	"knowledge",
	"subscription",
	"resume",
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
		agentId: z.string().min(1),
	}),
});

export const knowledgeSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("knowledge"),
	promptMode: z.literal("knowledge"),
	taskId: z.null().optional(),
	sourceCorrelation: z.object({
		// @lore: knowledgeItemId — persisted in sessions.source_correlation_json; field name kept as-is for existing rows
		knowledgeItemId: z.string().min(1),
		action: z.enum(["promote", "summarize", "extract", "review"]),
		teamId: z.string().min(1).optional(),
		scopeId: z.string().min(1).optional(),
	}),
});

/**
 * The request a subscription's wake starts. `changeId` is absent for a
 * schedule-fired wake (no change caused it).
 */
export const subscriptionSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("subscription"),
	promptMode: z.literal("subscription"),
	taskId: z.null().optional(),
	// The subscriber's team — absent for a factory-wide agent.
	teamId: z.string().min(1).optional(),
	sourceCorrelation: z.object({
		subscriptionId: z.string().min(1),
		changeId: z.string().min(1).optional(),
		teamId: z.string().min(1).optional(),
	}),
});

/** The request that returns an agent to its own session carrying a verdict; no taskId, no context assembly. */
export const reviewResumeSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("review_resume"),
	promptMode: z.literal("resume"),
	taskId: z.string().min(1).nullable().optional(),
	sourceCorrelation: z.object({
		reviewMessageId: z.string().min(1),
		threadId: z.string().min(1),
		resumedSessionId: z.string().min(1),
	}),
});

export const agentSessionRequestInputSchema = z.discriminatedUnion("sourceKind", [
	taskSessionRequestInputSchema,
	assistantSessionRequestInputSchema,
	knowledgeSessionRequestInputSchema,
	subscriptionSessionRequestInputSchema,
	reviewResumeSessionRequestInputSchema,
]);

export type AgentSessionRequestInput = z.infer<typeof agentSessionRequestInputSchema>;
export type AgentSessionSourceCorrelation = AgentSessionRequestInput["sourceCorrelation"];

export interface SessionLifecycleCorrelation {
	readonly requestId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
}
