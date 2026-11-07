import { z } from "zod";
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
	stop_session: stopSession,
} as const;
