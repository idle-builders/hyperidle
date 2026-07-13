/**
 * Composite Zod schemas for bet API responses.
 *
 * These schemas define the wire shapes the frontend consumes from the bets
 * endpoints. They are composite schemas built on top of common.schema.ts
 * and the drizzle-zod base schemas.
 *
 * @lore api-typesafety: The betDetailResponseSchema encodes the enriched
 * response shape from GET /api/bets/:id — which is NOT the raw DB row.
 * The route enriches the bet with title (derived from pitch), product name,
 * team id, and task progress. The schema here documents and validates
 * that enriched shape.
 */

import { selectBetSchema } from "@hyperidle/db/zod-schemas";
import { BET_STATUSES, TASK_STATES } from "@hyperidle/shared";
import { z } from "zod";
import { enumValues, progressSchema, wireMoneySchema } from "./common.schema.js";

/**
 * Extended task states for the bet detail view.
 *
 * The DB-layer TASK_STATES does not include "open" (an older/frontend alias
 * for proposed/accepted states). The bet detail response may surface legacy
 * task state values from the DB, so we extend the set here for wire-schema
 * validation.
 *
 * @lore api-typesafety: "open" is a frontend display alias that predates the
 * TASK_STATES constant being formalised. The DB uses the TASK_STATES values
 * but legacy rows may carry "open". This extended set prevents a validation
 * failure on legitimate data while still rejecting genuinely bad values.
 */
const TASK_STATES_EXTENDED = [...TASK_STATES, "open"] as const;

/**
 * A single task row in the bet detail view, enriched with session metadata.
 */
export const betTaskRowSchema = z.object({
	id: z.string(),
	title: z.string(),
	owner: z.string(),
	state: z.enum(enumValues(TASK_STATES_EXTENDED)),
	costActual: wireMoneySchema.nullable(),
	latestSessionOutcome: z.string().nullable(),
	latestSessionHarnessUrl: z.string().nullable(),
	latestSessionModelTier: z.string().nullable(),
	ownerAgentId: z.string().nullable(),
});

/**
 * Progress schema for a bet (re-exported for convenience).
 */
export const betProgressSchema = progressSchema;

/**
 * Token usage shape stored as JSON.
 */
// @lore AF4/§4c: zod v4 (server-local 4.4.3) removed the single-arg z.record
// overload — only record(keyType, valueType, params?) exists. Supply the string
// key schema; same string-keyed-record wire shape as before. Behaviour-neutral.
const tokenUsageSchema = z.record(z.string(), z.unknown());

/**
 * Detailed bet response from GET /api/bets/:id.
 * Enriched with title (derived from description), product name, team id, and progress.
 *
 * @lore U1: `pitch` renamed to `description`.
 */
// @lore U2: `product` field removed (clean cut, no backward compat alias).
// Only `team` remains. See U2 architecture §3.2.
export const betDetailResponseSchema = z.object({
	id: z.string(),
	title: z.string(),
	team: z.string(),
	status: z.enum(enumValues(BET_STATUSES)),
	costAppetite: wireMoneySchema.nullable(),
	tokenAppetite: z.number().nullable().optional(),
	costActual: wireMoneySchema.nullable(),
	tokensActual: tokenUsageSchema.nullable(),
	progress: betProgressSchema,
	// @lore U1: `description` (formerly `pitch`)
	description: z.string(),
	tasks: z.array(betTaskRowSchema),
	/**
	 * AK5: provenance backlink — the knowledge item this bet was promoted from.
	 * null = hand-typed / assistant-drafted bet (no source).
	 * Enriched by GET /bets/:id from the knowledge_items row (id + title).
	 */
	sourceKnowledge: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
});

/**
 * A raw bet list item — the DB row shape used in the grouped list response.
 * Uses the drizzle-zod generated select schema.
 */
// @lore AF4/§4c: drizzle-zod 0.8.3 dedupes to zod 3.25.76, so selectBetSchema
// carries a zod-3.25 `$ZodType` brand that is nominally distinct from server's
// zod 4.4.3 `SomeType` (the z.array() arg). Bridge the internal schema type
// (NON-boundary, not a request/response payload cast) so z.array() accepts it.
// Same parsed shape; version-alignment is out of AF4 scope (§9).
// @lore no-unknown-cast exception: this is a cross-zod-VERSION brand bridge
// (drizzle-zod's zod-3.25 `$ZodType` vs server's zod-4.4.3 `SomeType`), not a
// shape assertion — the two types are structurally identical but nominally
// distinct, so TS requires the `unknown` hop. The real fix is aligning zod
// versions (out of scope). Disabled here, not weakened globally.
// eslint-disable-next-line design/no-unknown-cast
export const betListItemSchema = selectBetSchema as unknown as z.ZodTypeAny;

/**
 * Grouped bet list response from GET /api/bets.
 * Bets are bucketed by status.
 *
 * @lore U1: Status groups simplified from 9 to 4: draft | active | completed | killed.
 * Old mapping: shaped->draft, committed|in_progress|behind|blocked|paused|review->active,
 * shipped->completed.
 */
export const betListResponseSchema = z.object({
	draft: z.array(betListItemSchema),
	active: z.array(betListItemSchema),
	completed: z.array(betListItemSchema),
	killed: z.array(betListItemSchema),
});
