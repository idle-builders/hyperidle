import { z } from "zod";

/**
 * @lore AU21 §9 Increment 10a (Decision I): `decomposition` REMOVED — the
 * built-in bet_decomposition mechanism (its sole producer of a
 * "decomposition"-sourced session request) no longer exists, so this
 * session-source vocabulary member is dead, not merely unused.
 */
export const AGENT_SESSION_SOURCE_KINDS = [
	"task",
	"assistant",
	"routine",
	"knowledge",
	/**
	 * BA2: a human's verdict on the review a gate denial produced. The session it
	 * asks for is not a new piece of work — it returns an agent to a session it
	 * already had, so it composes no prompt and assembles no context.
	 */
	"gate_resume",
] as const;

export const AGENT_SESSION_PROMPT_MODES = [
	"task",
	"conversation",
	"routine",
	"knowledge",
	/**
	 * BA2: not a prompt at all — the verdict arrives as a user turn in a session
	 * the harness replays for itself. Named so the request row stays honest about
	 * having no prompt to compose rather than borrowing one that misdescribes it.
	 */
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
		assistantAgentId: z.string().min(1),
	}),
});

export const routineSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("routine"),
	promptMode: z.literal("routine"),
	taskId: z.string().min(1).nullable().optional(),
	// BA1 D5: scope comes from the owner agent, which may belong to no team.
	teamId: z.string().min(1).optional(),
	sourceCorrelation: z.object({
		routineId: z.string().min(1),
		routineRunId: z.string().min(1),
		teamId: z.string().min(1).optional(),
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

/**
 * BA2: the request that returns an agent to its own session carrying a verdict.
 *
 * It has no `taskId` requirement and no context to assemble — everything it needs
 * is the harness session to reopen and what to say. The correlation names the
 * review a human decided on, which is the one identifier that ties the block, the
 * asking, and the answer together.
 */
export const gateResumeSessionRequestInputSchema = baseInput.extend({
	sourceKind: z.literal("gate_resume"),
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
	routineSessionRequestInputSchema,
	knowledgeSessionRequestInputSchema,
	gateResumeSessionRequestInputSchema,
]);

export type AgentSessionRequestInput = z.infer<typeof agentSessionRequestInputSchema>;
export type AgentSessionSourceCorrelation = AgentSessionRequestInput["sourceCorrelation"];

export interface SessionLifecycleCorrelation {
	readonly requestId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
}
