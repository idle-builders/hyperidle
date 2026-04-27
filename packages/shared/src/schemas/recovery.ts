/**
 * L7 — Recovery Verbs (TRACK-L L7) — request/response Zod shapes.
 *
 * Source of truth for the wire contracts used by:
 *   - server route handlers (validate inbound bodies)
 *   - web client (typed fetch + form validation)
 *
 * All bodies are `.strict()` — extraneous keys (notably `actorId`)
 * are rejected so a body cannot spoof identity. Identity is read
 * exclusively from the `X-Actor-Id` header (mirrors L4 hardening).
 *
 * @lore L7 (S2): only the request schemas + factoryStateResponseSchema
 * are exported. The other response shapes used to be exported as
 * unused barrel surface. Reintroduce a response schema only when a
 * client actually validates it.
 */

import { z } from "zod";
import { reasonOptionalSchema, reasonRequiredSchema } from "../constants/recovery.js";

// ── Factory pause/resume ──────────────────────────────────────────

export const factoryPauseRequestSchema = z
	.object({
		reason: reasonRequiredSchema,
	})
	.strict();

export const factoryResumeRequestSchema = z
	.object({
		reason: reasonOptionalSchema,
	})
	.strict();

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

// ── Session pause/resume ─────────────────────────────────────────

export const sessionPauseRequestSchema = z
	.object({
		reason: reasonRequiredSchema,
	})
	.strict();

export const sessionResumeRequestSchema = z
	.object({
		reason: reasonOptionalSchema,
	})
	.strict();
