/**
 * L7 — Recovery Verbs (TRACK-L L7) — request/response Zod shapes.
 *
 * Single source of truth for the wire contracts used by:
 *   - server route handlers (validate inbound bodies)
 *   - web client (typed fetch + form validation)
 *
 * All bodies are `.strict()` — extraneous keys (notably `actorId`)
 * are rejected so a body cannot spoof identity. Identity is read
 * exclusively from the `X-Actor-Id` header (mirrors L4 hardening).
 */

import { z } from "zod";
import {
	RECOVERY_OUTCOMES,
	reasonOptionalSchema,
	reasonRequiredSchema,
} from "../constants/recovery.js";

// ── Factory pause/resume ──────────────────────────────────────────

export const factoryPauseRequestSchema = z
	.object({
		reason: reasonRequiredSchema,
	})
	.strict();
export type FactoryPauseRequest = z.infer<typeof factoryPauseRequestSchema>;

export const factoryResumeRequestSchema = z
	.object({
		reason: reasonOptionalSchema,
	})
	.strict();
export type FactoryResumeRequest = z.infer<typeof factoryResumeRequestSchema>;

export const factoryPauseResponseSchema = z.object({
	state: z.literal("paused"),
	pausedAt: z.string(),
	auditId: z.string(),
	affected: z.object({
		sessions: z.number().int().nonnegative(),
		tasks: z.number().int().nonnegative(),
	}),
});
export type FactoryPauseResponse = z.infer<typeof factoryPauseResponseSchema>;

export const factoryResumeResponseSchema = z.object({
	state: z.literal("running"),
	resumedAt: z.string(),
	auditId: z.string(),
});
export type FactoryResumeResponse = z.infer<typeof factoryResumeResponseSchema>;

export const factoryStateResponseSchema = z.object({
	paused: z.boolean(),
	pausedBy: z.string().nullable(),
	pausedAt: z.string().nullable(),
	pausedReason: z.string().nullable(),
});
export type FactoryStateResponse = z.infer<typeof factoryStateResponseSchema>;

// ── Rollback ─────────────────────────────────────────────────────

export const rollbackRequestSchema = z
	.object({
		reason: reasonRequiredSchema,
	})
	.strict();
export type RollbackRequest = z.infer<typeof rollbackRequestSchema>;

export const rollbackResponseSchema = z.object({
	auditId: z.string(),
	outcome: z.enum(RECOVERY_OUTCOMES),
	detail: z.string().optional(),
});
export type RollbackResponse = z.infer<typeof rollbackResponseSchema>;

// ── Session pause/resume ─────────────────────────────────────────

export const sessionPauseRequestSchema = z
	.object({
		reason: reasonRequiredSchema,
	})
	.strict();
export type SessionPauseRequest = z.infer<typeof sessionPauseRequestSchema>;

export const sessionResumeRequestSchema = z
	.object({
		reason: reasonOptionalSchema,
	})
	.strict();
export type SessionResumeRequest = z.infer<typeof sessionResumeRequestSchema>;

export const sessionPauseResponseSchema = z.object({
	state: z.literal("paused"),
	checkpointAt: z.string(),
	auditId: z.string(),
});
export type SessionPauseResponse = z.infer<typeof sessionPauseResponseSchema>;

export const sessionResumeResponseSchema = z.object({
	state: z.literal("running"),
	resumedAt: z.string(),
	auditId: z.string(),
});
export type SessionResumeResponse = z.infer<typeof sessionResumeResponseSchema>;
