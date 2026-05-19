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
import { progressSchema, wireMoneySchema } from "./common.schema.js";

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
	// @lore api-typesafety: TASK_STATES_EXTENDED is a readonly string[] from @hyperidle/shared.
	// Zod v4 requires a [string, ...string[]] tuple for z.enum(). The `as unknown as` cast
	// is the idiomatic escape hatch — TASK_STATES_EXTENDED is guaranteed non-empty at
	// compile time (it's a const array), so this is safe.
	state: z.enum(TASK_STATES_EXTENDED as unknown as [string, ...string[]]),
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
const tokenUsageSchema = z.record(z.unknown());

/**
 * Detailed bet response from GET /api/bets/:id.
 * Enriched with title (derived from pitch), product name, team id, and progress.
 */
export const betDetailResponseSchema = z.object({
	id: z.string(),
	title: z.string(),
	product: z.string(),
	team: z.string(),
	// @lore api-typesafety: BET_STATUSES is a readonly string[] from @hyperidle/shared.
	// Zod v4 requires a [string, ...string[]] tuple for z.enum(). The `as unknown as` cast
	// is the idiomatic escape hatch — BET_STATUSES is guaranteed non-empty at compile time.
	status: z.enum(BET_STATUSES as unknown as [string, ...string[]]),
	costAppetite: wireMoneySchema.nullable(),
	tokenAppetite: z.number().nullable().optional(),
	costActual: wireMoneySchema.nullable(),
	tokensActual: tokenUsageSchema.nullable(),
	progress: betProgressSchema,
	pitch: z.string(),
	tasks: z.array(betTaskRowSchema),
});

/**
 * A raw bet list item — the DB row shape used in the grouped list response.
 * Uses the drizzle-zod generated select schema.
 */
export const betListItemSchema = selectBetSchema;

/**
 * Grouped bet list response from GET /api/bets.
 * Bets are bucketed by status.
 */
export const betListResponseSchema = z.object({
	shaped: z.array(betListItemSchema),
	committed: z.array(betListItemSchema),
	in_progress: z.array(betListItemSchema),
	shipped: z.array(betListItemSchema),
	killed: z.array(betListItemSchema),
});
