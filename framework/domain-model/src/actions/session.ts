import { z } from "zod";
import type { ActivityEntry } from "../session-activity.js";
import { AGENT_SESSION_SOURCE_KINDS } from "../session-request.js";
import { MODEL_TIERS } from "../types.js";
import type { ActionDeclaration } from "./action.js";

/**
 * @lore The session action list — search, watch, stop. This is what
 * replaces the `/agent-orchestration/runs*` routes, the `/sessions*` routes
 * and the second websocket's live-update surface.
 * `core-ui` imports this file directly — never `core-api` or
 * `agent-orchestration` — for the same reason `document.ts`/`task.ts` do: the
 * browser needs the exact same `input`/invariant shape the server runs.
 *
 * There are deliberately no pure invariant functions in this file. The two
 * candidates first drafted — `search_sessions` refusing an empty filter, and
 * an authorization check on `stop_session` — are both explicitly dropped: no
 * filter lists newest first, and anyone signed in may stop any session.
 * Every remaining constraint is either enforced by the zod shape itself
 * (`.strict()`, `id` `min(1)`) or is DB-dependent (`not_found`) and belongs
 * in the module's `run`, not here.
 */

// ---------------------------------------------------------------------------
// SESSION_STATES — derived from the actual writers, not assumed.
// `sessions.state` (`framework/db/src/schema.ts:281`) is written by:
//   - the row's own create path: "active"
//   - `transition-run.ts`'s `updateSessionRow`: "done" | "crashed"
//   - `runtime-reapers.ts`'s crash sweep: "crashed"
//   - `request-run-stop-for-tasks.ts`'s `STOP_DISPOSITION`: "stopped"
// No writer ever sets "failed" — that value belongs to
// `agent_session_requests`, a different table. The set below already
// includes "stopped": `request-run-stop-for-tasks.ts` was writing it before
// this declaration existed, so "stopped" as a terminal state is confirmed
// by the writers rather than added by this declaration.
// ---------------------------------------------------------------------------

export const SESSION_STATES = ["active", "done", "stopped", "crashed"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

// ---------------------------------------------------------------------------
// The row — the 8 fields `AgentRunSummary` already carries
// (`agent-run-view.ts:25`) plus `notes`, `modelTier`,
// `sourceKind`. `state`/`outcome` stay plain, nullable strings, matching
// `AgentRunSummary` exactly — the column is free text
// (`framework/db/src/schema.ts:281`); `SESSION_STATES` above is the closed
// set a *filter* validates against, not a constraint on the row itself.
// ---------------------------------------------------------------------------

export const SessionRowSchema = z.object({
	id: z.string(),
	agentId: z.string(),
	taskId: z.string().nullable(),
	startedAt: z.string(),
	endedAt: z.string().nullable(),
	state: z.string().nullable(),
	outcome: z.string().nullable(),
	/** Decimal string as stored, or null. */
	effectivenessScore: z.string().nullable(),
	notes: z.string().nullable(),
	/** `sessions.model_tier` is `NOT NULL`, and every writer sets it from the closed `ModelTier` type. */
	modelTier: z.enum(MODEL_TIERS),
	/** `sessions.source_kind` is nullable text, written from the closed `AgentSessionSourceKind` type when set. */
	sourceKind: z.enum(AGENT_SESSION_SOURCE_KINDS).nullable(),
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

// ---------------------------------------------------------------------------
// search_sessions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// watch_session
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// stop_session — answers with the row as read BEFORE the stop, not a
// second re-read after it.
// ---------------------------------------------------------------------------

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
