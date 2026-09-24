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
	"knowledge",
	/** A subscription's wake — an event or schedule woke the subscriber. */
	"subscription",
	/**
	 * @lore BA2: a human's verdict on the review an agent filed. The session it
	 * asks for is not a new piece of work — it returns an agent to a session it
	 * already had, so it composes no prompt and assembles no context.
	 */
	"review_resume",
] as const;

export const AGENT_SESSION_PROMPT_MODES = [
	"task",
	"conversation",
	"knowledge",
	"subscription",
	/**
	 * @lore BA2: not a prompt at all — the verdict arrives as a user turn in a session
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

/**
 * @lore BC3 architecture.md §5 B5: `sourceCorrelation.assistantAgentId` is
 * renamed to `agentId` — a thread turn is not necessarily "the assistant"
 * (any woken agent gets one), only the ONE field name assumed it was.
 * `sourceKind`/`promptMode` stay `"assistant"`/`"conversation"`: they name
 * what the session IS (a conversation turn with a transcript and no task),
 * not who it belongs to.
 */
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
		// @lore this is the retired "knowledge" session-request family's own
		// stored payload shape (persisted verbatim in sessions.source_correlation_json
		// for existing rows) — left as knowledgeItemId rather than renamed.
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
	// The subscriber's effective team — absent for a factory-wide agent.
	teamId: z.string().min(1).optional(),
	sourceCorrelation: z.object({
		subscriptionId: z.string().min(1),
		changeId: z.string().min(1).optional(),
		teamId: z.string().min(1).optional(),
	}),
});

/**
 * @lore BA2: the request that returns an agent to its own session carrying a verdict.
 *
 * It has no `taskId` requirement and no context to assemble — everything it needs
 * is the harness session to reopen and what to say. The correlation names the
 * review a human decided on, which is the one identifier that ties the block, the
 * asking, and the answer together.
 */
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
