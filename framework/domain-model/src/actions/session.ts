import { z } from "zod";
import type { ActivityEntry } from "../session-activity.js";
import { AGENT_SESSION_SOURCE_KINDS } from "../session-request.js";
import { MODEL_TIERS } from "../types.js";
import type { ActionDeclaration } from "./action.js";

// No pure invariant functions: no-filter lists newest first (not an error), and anyone signed in may stop any session. Remaining constraints are either zod-enforced or DB-dependent.

// SESSION_STATES — derived from actual writers: "active" (create), "done"/"crashed" (transition-run.ts), "stopped" (request-run-stop-for-tasks.ts). "failed" belongs to agent_session_requests, not sessions.

export const SESSION_STATES = ["active", "done", "stopped", "crashed"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

// state/outcome are plain nullable strings (free-text column); SESSION_STATES is the closed set a filter validates against, not a constraint on the row itself.

export const SessionRowSchema = z.object({
	id: z.string(),
	agentId: z.string(),
	taskId: z.string().nullable(),
	/** The conversation the session answered in, when a message there started it. */
	threadId: z.string().nullable(),
	startedAt: z.string(),
	endedAt: z.string().nullable(),
	state: z.string().nullable(),
	outcome: z.string().nullable(),
	notes: z.string().nullable(),
	/** `sessions.model_tier` is `NOT NULL`, and every writer sets it from the closed `ModelTier` type. */
	modelTier: z.enum(MODEL_TIERS),
	/** `sessions.source_kind` is nullable text, written from the closed `AgentSessionSourceKind` type when set. */
	sourceKind: z.enum(AGENT_SESSION_SOURCE_KINDS).nullable(),
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

export const SearchSessionsInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		taskId: z.string().optional(),
		agentIds: z.array(z.string()).optional(),
		state: z.enum(SESSION_STATES).optional(),
		limit: z.number().int().min(1).max(500).optional(), // default 100
		offset: z.number().int().min(0).optional(),
	})
	.strict();
export type SearchSessionsInput = z.infer<typeof SearchSessionsInputSchema>;

export const searchSessions: ActionDeclaration<SearchSessionsInput, SessionRow[]> = {
	name: "search_sessions",
	sentence:
		"Search sessions — agent runs, past and live. No parameter lists them, newest first, up to " +
		"100 unless you set limit (up to 500); filter by id, task, agent, or state.",
	input: SearchSessionsInputSchema,
	output: z.array(SessionRowSchema),
};

export const WatchSessionInputSchema = z.object({ id: z.string().min(1) }).strict();
export type WatchSessionInput = z.infer<typeof WatchSessionInputSchema>;

// Mirrors `../session-activity.js`'s `ActivityEntry` union verbatim — the
// activity is the in-memory ring buffer, unchanged. Typed against the
// real `ActivityEntry` so the two can never drift silently.
const toolCallDataSchema = z.object({
	toolName: z.string(),
	argsSummary: z.string(),
	toolKind: z.string().optional(),
	verb: z.string().optional(),
	target: z.string().optional(),
	status: z.enum(["running", "ok", "failed", "neutral"]).optional(),
	output: z.string().optional(),
	diff: z
		.object({ label: z.string(), added: z.number().int(), removed: z.number().int() })
		.optional(),
	opensSession: z.object({ sessionId: z.string(), label: z.string() }).optional(),
});

const reasoningDataSchema = z.object({
	durationMs: z.number().optional(),
	text: z.string().optional(),
	excerpt: z.string().optional(),
});

const answerDeltaDataSchema = z.object({ text: z.string() });
const answerSettledDataSchema = z.object({ text: z.string() });
const humanMessageDataSchema = z.object({
	text: z.string(),
	author: z.object({
		id: z.string(),
		name: z.string(),
		isAgent: z.literal(false),
		isMe: z.boolean(),
	}),
});

export const ActivityEntrySchema: z.ZodType<ActivityEntry> = z.discriminatedUnion("type", [
	z.object({ type: z.literal("tool_call"), timestamp: z.number(), data: toolCallDataSchema }),
	z.object({ type: z.literal("reasoning"), timestamp: z.number(), data: reasoningDataSchema }),
	z.object({
		type: z.literal("answer_delta"),
		timestamp: z.number(),
		data: answerDeltaDataSchema,
	}),
	z.object({
		type: z.literal("answer_settled"),
		timestamp: z.number(),
		data: answerSettledDataSchema,
	}),
	z.object({
		type: z.literal("human_message"),
		timestamp: z.number(),
		data: humanMessageDataSchema,
	}),
]);

export const WatchSessionOutputSchema = z.object({
	session: SessionRowSchema,
	activity: z.array(ActivityEntrySchema),
});
export type WatchSessionOutput = z.infer<typeof WatchSessionOutputSchema>;

export const watchSession: ActionDeclaration<WatchSessionInput, WatchSessionOutput> = {
	name: "watch_session",
	sentence:
		"Watch a session: its row and its activity buffer so far. An unknown id is an error; a " +
		"session that has already ended and been evicted from the buffer answers with an empty " +
		"activity list, not a problem.",
	input: WatchSessionInputSchema,
	output: WatchSessionOutputSchema,
};

// stop_session answers with the row as read BEFORE the stop, not a second re-read.

export const StopSessionInputSchema = z.object({ id: z.string().min(1) }).strict();
export type StopSessionInput = z.infer<typeof StopSessionInputSchema>;

export const StopSessionOutputSchema = z.object({
	session: SessionRowSchema,
	stopped: z.boolean(),
});
export type StopSessionOutput = z.infer<typeof StopSessionOutputSchema>;

export const stopSession: ActionDeclaration<StopSessionInput, StopSessionOutput> = {
	name: "stop_session",
	sentence:
		"Stop a session — anyone signed in may stop any session, there is no ownership check. The " +
		"session in the answer is the row as it stood the moment you asked: a live session's harness " +
		"process is killed and its terminal state arrives moments later as a nudge on the session, " +
		"not in this answer. `stopped: false` means it was already over.",
	input: StopSessionInputSchema,
	output: StopSessionOutputSchema,
};

export const SESSION_ACTIONS = {
	search_sessions: searchSessions,
	watch_session: watchSession,
	stop_session: stopSession,
} as const;
