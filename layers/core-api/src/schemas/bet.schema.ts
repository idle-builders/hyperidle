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

import type { Bet } from "@hyperidle/db";
import { BET_STATUSES, TASK_STATES } from "@hyperidle/shared";
import { z } from "zod";
import { enumValues, progressSchema } from "./common.schema.js";

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
	tokenAppetite: z.number().nullable().optional(),
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
 * A bet list item — the wire shape of one entry in the grouped list response
 * from GET /api/bets.
 *
 * @lore AU30: hand-written, not derived from the `bets` table. Two reasons, and
 * the second is the load-bearing one:
 *
 * 1. Deriving it meant importing drizzle-zod's `selectBetSchema`, which is the
 *    `bets` table symbol as far as ownership is concerned — a reach past the
 *    service that owns the table. The generated schema is not a legal shortcut
 *    into a table this layer does not own.
 * 2. The derived schema was simply wrong. The `at_risk` column is an integer,
 *    but the route normalizes it (`normalizeBet` in routes/bets.ts) so the wire
 *    carries a boolean — the derived schema rejected the very payload the
 *    endpoint emits. It survived because the only test that parsed a live
 *    response inserted no bet and so validated four empty arrays.
 *
 * This file describes wire shapes, exactly as the sibling
 * `betDetailResponseSchema` above already does by hand. The `Pin` below is what
 * keeps the wire shape honest about the row it derives from: add, drop or retype
 * a `bets` column and the pin fails to typecheck.
 */
export const betListItemSchema = z.object({
	id: z.string(),
	teamId: z.string(),
	description: z.string(),
	appetite: z.string().nullable(),
	doneCondition: z.string().nullable(),
	hypothesis: z.string().nullable(),
	// @lore AU30: deliberately not narrowed to BET_STATUSES — the column is plain
	// `text`, so `Bet["status"]` is `string` and an enum would break the pin below.
	// The generated schema did not narrow it either. Narrowing is a decision about
	// the endpoint, not about this schema's placement.
	status: z.string(),
	revisionLog: z.string().nullable(),
	createdAt: z.string(),
	completedAt: z.string().nullable(),
	// @lore U2: the wire value is a boolean; the column is integer 0/1.
	atRisk: z.boolean(),
	tokensActualJson: z.string().nullable(),
	outcomeVerdict: z.string().nullable(),
	outcomeSummary: z.string().nullable(),
	outcomeRecordedAt: z.string().nullable(),
	outcomeRecordedBy: z.string().nullable(),
	sourceKnowledgeItemId: z.string().nullable(),
});

/** The `bets` row as it appears on the wire: every column, `atRisk` normalized. */
type BetListItem = Omit<Bet, "atRisk"> & { atRisk: boolean };
type Wire = z.infer<typeof betListItemSchema>;
type Pin = Wire extends BetListItem ? (BetListItem extends Wire ? true : false) : false;
true satisfies Pin;

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
