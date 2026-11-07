import { z } from "zod";
import { AGENT_SESSION_SOURCE_KINDS } from "../session-request.js";
import { MODEL_TIERS } from "../types.js";

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
