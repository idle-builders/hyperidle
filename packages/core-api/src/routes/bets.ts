import { getArtifactThreadSummaries } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	get as getKnowledgeItem,
	list as listKnowledgeItems,
	upsertBetRetroKnowledgeItem,
} from "@hyperidle/knowledge";
import {
	ApiError,
	getTeam,
	getTeamMembers,
	listTeamMembers,
	listTeams,
	updateTeam,
} from "@hyperidle/org";
import type { ArtifactThreadSummary, EventBus } from "@hyperidle/shared";
import {
	BET_OUTCOME_VERDICTS,
	CURRENCY_CODES,
	deriveTitle,
	InvalidTransitionError,
} from "@hyperidle/shared";
import * as work from "@hyperidle/work";
import { cascadeBetKill, transitionBet, updateBetField } from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { enumValues } from "../schemas/common.schema.js";
import { recordAgentWorkIntent } from "../services/session-requests-bindings.js";

const SUMMARY_CAP = 10;

// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service — closes W2's `teamMembers` ownership gap.
// @lore AU20 Am7: adapters bridge TeamCapacityReader to the new parameterized API.
const teamCapacity = {
	getByTeamId: (db: import("@hyperidle/db").WriteExecutor, teamId: string) =>
		getTeamMembers(db, { teamId }),
	setActiveBets: (db: import("@hyperidle/db").WriteExecutor, teamId: string, activeBets: number) =>
		updateTeam(db, teamId, { activeBets }),
};

/**
 * Zod schema for a WireMoney object in request bodies.
 * @lore L17: costAppetite replaces the old `appetite` duration string.
 */
const wiremoneySchema = z.object({
	minor: z.number().int().min(0),
	currency: z.enum(enumValues(CURRENCY_CODES)),
});

/**
 * Zod schemas for request validation.
 *
 * @lore U1: `productId` -> `teamId`, `pitch` -> `description`.
 */
const createBetSchema = z
	.object({
		// @lore U1: `teamId` references the `teams` table (formerly `products`).
		teamId: z.string(),
		/**
		 * @lore Q3: description must be non-empty (min 1 char). Formerly called `pitch`.
		 */
		description: z.string().min(1),
		/**
		 * @lore L17: costAppetite replaces the old `appetite` duration string
		 * (e.g. "2 weeks"). Accepts null for uncapped bets. POST with the old
		 * `appetite` string returns 400.
		 */
		costAppetite: wiremoneySchema.nullable().optional(),
		doneCondition: z.string().optional(),
		hypothesis: z.string().optional(),
		/**
		 * AK5: optional provenance — the knowledge item this bet was promoted from.
		 * When present: validated to exist (unknown id → 400); stored as FK on the row.
		 * When absent: null (hand-typed / assistant-drafted bet — existing callers unchanged).
		 */
		sourceKnowledgeItemId: z.string().optional(),
	})
	// Reject old fields
	.strict();

// I2 V2: enum-validate `field` so an unknown value is rejected with 400 by
// Zod instead of falling through to the service layer (which would throw
// a generic Error mapped to 500).
// @lore L17: cost_appetite is WireMoney (not a string), so updateBetSchema
// is a discriminated union: string-valued fields (done_condition, hypothesis)
// use a string `value`, while cost_appetite uses a WireMoney object `value`.
const updateBetStringFieldSchema = z.object({
	field: z.enum(["done_condition", "hypothesis"] as const),
	value: z.string(),
	reason: z.string(),
});

const updateBetCostAppetiteSchema = z.object({
	field: z.literal("cost_appetite"),
	value: wiremoneySchema.nullable(),
	reason: z.string(),
});

/**
 * @lore Q3: description PATCH schema — description is mutable in draft, active.
 * NOT in completed or killed.
 *
 * @lore U1: `pitch` renamed to `description`. Field name in PATCH requests is now `description`.
 */
const updateBetDescriptionSchema = z.object({
	field: z.literal("description"),
	value: z.string().min(1),
	reason: z.string(),
});

/**
 * @lore U2: at_risk PATCH schema — mutable in draft and active statuses only.
 * Value must be a boolean (not integer 0/1). Reason is required for audit trail.
 */
const updateBetAtRiskSchema = z.object({
	field: z.literal("at_risk"),
	value: z.boolean(),
	reason: z.string().min(1),
});

/**
 * Statuses in which description is mutable.
 *
 * @lore U1: simplified from the old set (shaped, committed, in_progress, paused, behind, blocked, review)
 * to the new simplified set (draft, active).
 */
const DESCRIPTION_MUTABLE_IN_STATUSES = new Set(["draft", "active"]);

/**
 * @lore U2: Statuses in which at_risk is mutable.
 * Completed and killed bets cannot be marked at_risk — the risk is resolved.
 */
const AT_RISK_MUTABLE_IN_STATUSES = new Set(["draft", "active"]);

const updateBetSchema = z.discriminatedUnion("field", [
	updateBetStringFieldSchema,
	updateBetCostAppetiteSchema,
	updateBetDescriptionSchema,
	updateBetAtRiskSchema,
]);

const killBetSchema = z.object({
	reason: z.string().min(1),
});

/**
 * Start (activate) a draft bet.
 *
 * @lore U1: `commit` endpoint now transitions draft->active (formerly shaped->committed).
 */
const startBetSchema = z.object({
	reason: z.string().optional(),
});

/**
 * AC1: Schema for recording/updating a bet outcome.
 * Only valid for bets in completed or killed status.
 */
const betOutcomeSchema = z.object({
	verdict: z.enum(enumValues(BET_OUTCOME_VERDICTS)),
	summary: z.string().max(2000).optional(),
});

/**
 * AC2: Schema for the full retro flow — records outcome AND creates a retro knowledge item.
 * Only valid for completed or killed bets.
 */
const betRetroSchema = z.object({
	verdict: z.enum(enumValues(BET_OUTCOME_VERDICTS)),
	summary: z.string().max(2000),
	learnings: z.string().max(4000).optional(),
});

/**
 * L18: Assert the caller can read the bet — returns the bet row or null when
 * the bet does not exist or the caller cannot access it. Extracted so it is
 * reusable across the detail endpoint and the new aggregate endpoints without
 * repeating the 404 guard.
 */
async function assertBetReadable(db: HyperIdleDb, betId: string): Promise<{ id: string } | null> {
	const row = await work.get(db, "bet", betId);
	return row ? { id: row.id } : null;
}

/**
 * Handle PATCH /bets/:id for field="at_risk".
 *
 * @lore U2: Extracted to reduce cognitive complexity of the PATCH route handler.
 * at_risk is mutable in draft and active statuses. Stored as integer (0/1) in the
 * DB (see migration 0019_U2_at_risk_integer.sql) but validated as boolean on the wire.
 *
 * Returns the updated bet with atRisk normalized to boolean, or an error response.
 */
async function patchAtRisk(
	db: HyperIdleDb,
	betId: string,
	value: boolean,
	reason: string,
	actor: string | undefined,
): Promise<
	| { ok: true; row: Record<string, unknown> }
	| { ok: false; status: 400 | 404 | 500; body: Record<string, string> }
> {
	const bet = await work.get(db, "bet", betId);
	if (!bet) {
		return { ok: false, status: 404, body: { error: "Bet not found", code: "NOT_FOUND" } };
	}
	if (!AT_RISK_MUTABLE_IN_STATUSES.has(bet.status)) {
		return {
			ok: false,
			status: 400,
			body: {
				error: `Field 'at_risk' is not mutable in status '${bet.status}'`,
				code: "VALIDATION_ERROR",
			},
		};
	}
	const revisionLog: Array<Record<string, unknown>> = bet.revisionLog
		? (JSON.parse(bet.revisionLog) as Array<Record<string, unknown>>)
		: [];
	revisionLog.push({
		timestamp: new Date().toISOString(),
		field: "at_risk",
		old_value: bet.atRisk === 1,
		new_value: value,
		reason,
		actor,
	});
	await work.update(db, "bet", betId, {
		atRisk: value ? 1 : 0,
		revisionLog: JSON.stringify(revisionLog),
	});
	const updated = await work.get(db, "bet", betId);
	if (!updated) {
		return {
			ok: false,
			status: 500,
			body: { error: "Bet not found after update", code: "INTERNAL_ERROR" },
		};
	}
	// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique §4).
	return { ok: true, row: { ...updated, atRisk: updated.atRisk === 1 } };
}

type PatchResult =
	| { ok: true; row: Record<string, unknown> }
	| { ok: false; status: 400 | 404 | 500; body: Record<string, string> };

/**
 * Handle PATCH /bets/:id for field="description".
 *
 * @lore Q3: Extracted to reduce cognitive complexity of the PATCH route handler.
 * description is mutable in draft and active statuses.
 */
async function patchDescription(
	db: HyperIdleDb,
	betId: string,
	value: string,
	reason: string,
	actor: string | undefined,
): Promise<PatchResult> {
	const bet = await work.get(db, "bet", betId);
	if (!bet) {
		return { ok: false, status: 404, body: { error: "Bet not found", code: "NOT_FOUND" } };
	}
	if (!DESCRIPTION_MUTABLE_IN_STATUSES.has(bet.status)) {
		return {
			ok: false,
			status: 400,
			body: {
				error: `Field 'description' is not mutable in status '${bet.status}'`,
				code: "VALIDATION_ERROR",
			},
		};
	}
	const revisionLog: Array<Record<string, unknown>> = bet.revisionLog
		? (JSON.parse(bet.revisionLog) as Array<Record<string, unknown>>)
		: [];
	revisionLog.push({
		timestamp: new Date().toISOString(),
		field: "description",
		old_value: bet.description,
		new_value: value,
		reason,
		actor,
	});
	await work.update(db, "bet", betId, {
		description: value,
		revisionLog: JSON.stringify(revisionLog),
	});
	const updated = await work.get(db, "bet", betId);
	if (!updated) {
		return {
			ok: false,
			status: 500,
			body: { error: "Bet not found after update", code: "INTERNAL_ERROR" },
		};
	}
	return { ok: true, row: updated as Record<string, unknown> };
}

type WireMoney = { minor: number; currency: string } | null;

/**
 * Handle PATCH /bets/:id for field="cost_appetite".
 *
 * @lore L17: Extracted to reduce cognitive complexity. cost_appetite is mutable
 * in active status only (not draft — cost is negotiated once the bet is committed).
 */
async function patchCostAppetite(
	db: HyperIdleDb,
	betId: string,
	value: WireMoney,
	reason: string,
	actor: string | undefined,
): Promise<PatchResult> {
	const bet = await work.get(db, "bet", betId);
	if (!bet) {
		return { ok: false, status: 404, body: { error: "Bet not found", code: "NOT_FOUND" } };
	}
	const MUTABLE_IN_STATUSES = new Set(["active"]);
	if (!MUTABLE_IN_STATUSES.has(bet.status)) {
		return {
			ok: false,
			status: 400,
			body: {
				error: `Field 'cost_appetite' is not mutable in status '${bet.status}'`,
				code: "VALIDATION_ERROR",
			},
		};
	}
	const revisionLog: Array<Record<string, unknown>> = bet.revisionLog
		? (JSON.parse(bet.revisionLog) as Array<Record<string, unknown>>)
		: [];
	const oldAppetite =
		bet.costAppetiteMinor != null && bet.costAppetiteCurrency != null
			? { minor: bet.costAppetiteMinor, currency: bet.costAppetiteCurrency }
			: null;
	revisionLog.push({
		timestamp: new Date().toISOString(),
		field: "cost_appetite",
		old_value: oldAppetite,
		new_value: value,
		reason,
		actor,
	});
	await work.update(db, "bet", betId, {
		costAppetiteMinor: value?.minor ?? null,
		costAppetiteCurrency: value?.currency ?? null,
		revisionLog: JSON.stringify(revisionLog),
	});
	const updated = await work.get(db, "bet", betId);
	if (!updated) {
		return {
			ok: false,
			status: 500,
			body: { error: "Bet not found after update", code: "INTERNAL_ERROR" },
		};
	}
	return { ok: true, row: updated as Record<string, unknown> };
}

/**
 * Create Hono routes for bet endpoints.
 * Requires db and eventBus to be set in context via middleware.
 */
export function createBetRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /bets — list all bets grouped by status, with pagination
	// @lore U1: grouped by new simplified statuses (draft, active, completed, killed).
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const allBets = await work.list(db, "bet", { limit, offset });

		// @lore U2: normalize atRisk 0/1 to boolean on the wire for all list items,
		// consistent with the detail endpoint (architecture-critique W-1).
		const normalizeBet = <T extends { atRisk: number | null }>(b: T) => ({
			...b,
			atRisk: b.atRisk === 1,
		});

		const grouped = {
			draft: allBets.filter((b) => b.status === "draft").map(normalizeBet),
			active: allBets.filter((b) => b.status === "active").map(normalizeBet),
			completed: allBets.filter((b) => b.status === "completed").map(normalizeBet),
			killed: allBets.filter((b) => b.status === "killed").map(normalizeBet),
		};

		return c.json(grouped);
	});

	// GET /bets/canvas — canvas data: draft, active, capacity info
	//
	// @lore Q3 T3: enriched with team name (batch lookup) + derived title +
	// formatted appetite string. Uses a Map for batch team lookup to avoid
	// N+1 queries (Q3 arch critique W-4).
	// @lore U1: uses `teams` (domain entity, formerly `products`) and `teamMembers`.
	router.get("/canvas", requireBoundary({ kind: "public-data" }), async (c) => {
		const allBets = await work.list(db, "bet");
		const allTeamMembers = await listTeamMembers(db);

		const totalCapacity = allTeamMembers.reduce((sum, t) => sum + t.capacity, 0);
		const totalUsed = allTeamMembers.reduce((sum, t) => sum + t.activeBets, 0);

		// Batch team lookup — one query, then a Map for O(1) access.
		const allTeams = await listTeams(db);
		const teamMap = new Map(allTeams.map((t) => [t.id, t.name]));

		/** Shape a bet row into the CanvasBetWire format. */
		function enrichBet(bet: (typeof allBets)[number]): Record<string, unknown> {
			// @lore U1: `description` (formerly `pitch`), `teamId` (formerly `productId`).
			const title = deriveTitle(bet.description, bet.id);
			const team = teamMap.get(bet.teamId) ?? bet.teamId;
			const appetite =
				bet.costAppetiteMinor != null && bet.costAppetiteCurrency != null
					? `${bet.costAppetiteMinor} ${bet.costAppetiteCurrency}`
					: "—";

			return {
				id: bet.id,
				title,
				team,
				teamId: bet.teamId,
				status: bet.status,
				appetite,
				costAppetite:
					bet.costAppetiteMinor != null && bet.costAppetiteCurrency != null
						? { minor: bet.costAppetiteMinor, currency: bet.costAppetiteCurrency }
						: null,
				progress: null,
			};
		}

		const canvas = {
			draft: allBets.filter((b) => b.status === "draft").map(enrichBet),
			active: allBets.filter((b) => b.status === "active").map(enrichBet),
			capacity: {
				used: totalUsed,
				max: totalCapacity,
			},
		};

		return c.json(canvas);
	});

	// GET /bets/:id — bet detail with tasks, enriched with title/team/progress.
	//
	// @lore L14: The `bets` table has no title or team name columns. These
	// fields are derived server-side:
	//   - title: first non-empty line of description, stripping the "# " prefix.
	//            Falls back to bet.id if no heading is found.
	//   - team: joined from teams.name via bets.teamId.
	//   - progress: { done, total } computed from the tasks already fetched.
	// Keeping enrichment in the API layer preserves the three-layer boundary.
	// @lore U1: `description` (formerly `pitch`), `teamId`, `completedAt` (formerly `shippedAt`).
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const betId = c.req.param("id");
		const bet = await work.get(db, "bet", betId);

		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		// L19: Enrich task rows with latest session metadata via a correlated
		// sessions subquery — owned by work-service (foreign-import ceiling, plan
		// addendum §A2/§A9).
		// @lore O2: stripped strategy columns (durability, riskTier, attentionScore,
		// crossTeam) removed from select. Session cost/token/harness columns also
		// stripped — those are strategy concerns now in the app projection layer.
		// @lore U1: tasks.teamId now references `teams` (formerly `products`). No more productId.
		const betTasks = await work.list(db, "task", { betId, include: "latestSessionOutcome" });

		// @lore U1: `description` (formerly `pitch`), `teamId` (formerly `productId`).
		const title = deriveTitle(bet.description, bet.id);

		const teamRow = await getTeam(db, { id: bet.teamId });
		const team = teamRow?.name ?? bet.teamId;

		const done = betTasks.filter((t) => t.state === "done").length;
		const total = betTasks.length;

		// L17: compute actual cost from sessions for this bet's tasks
		let costActualMinor: number | null = null;
		let costActualCurrency: string | null = null;

		if (bet.costActualMinor != null) {
			costActualMinor = bet.costActualMinor;
			costActualCurrency = bet.costActualCurrency ?? "USD";
		}

		let tokensActual: Record<string, unknown> | null = null;
		if (bet.tokensActualJson) {
			try {
				tokensActual = JSON.parse(bet.tokensActualJson) as Record<string, unknown>;
			} catch {
				// ignore malformed JSON
			}
		}

		const {
			appetite: _appetite,
			costAppetiteMinor,
			costAppetiteCurrency,
			tokensActualJson: _tJson,
			sourceKnowledgeItemId,
			...restBet
		} = bet;

		// AK5: enrich with sourceKnowledge:{id,title} when provenance FK is set.
		// Lookup happens per-bet (already on PK path) — no index needed.
		let sourceKnowledge: { id: string; title: string } | null = null;
		if (sourceKnowledgeItemId != null) {
			const srcItem = await getKnowledgeItem(db, sourceKnowledgeItemId);
			sourceKnowledge = srcItem ? { id: srcItem.id, title: srcItem.title } : null;
		}

		return c.json({
			...restBet,
			// @lore U2: `atRisk` DB column is integer (0/1); normalize to boolean on the wire.
			// See U2 architecture §3.4 and architecture-critique.
			atRisk: restBet.atRisk === 1,
			title,
			// @lore U2: `product` field removed (clean cut, no backward compat). Only `team` remains.
			team,
			progress: { done, total },
			costAppetite:
				costAppetiteMinor != null && costAppetiteCurrency != null
					? { minor: costAppetiteMinor, currency: costAppetiteCurrency }
					: null,
			costActual:
				costActualMinor != null && costActualCurrency != null
					? { minor: costActualMinor, currency: costActualCurrency }
					: null,
			tokensActual,
			// AK5: null when no provenance (hand-typed bet), enriched object when promoted.
			sourceKnowledge,
			tasks: betTasks.map((t) => ({
				...t,
				// O2: costActual/costCap mapped to WireMoney for display; strategy columns removed
				costActual: t.costActual != null ? { minor: t.costActual, currency: "USD" as const } : null,
				costCap: t.costCap != null ? { minor: t.costCap, currency: "USD" as const } : null,
			})),
		});
	});

	// POST /bets — create draft bet
	//
	// @lore Q3 T2: the server creates the bet in 'draft' status.
	// @lore U1: `teamId` (formerly `productId`), `description` (formerly `pitch`),
	// status 'draft' (formerly 'shaped').
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		validateBody(createBetSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createBetSchema>;

			// Check team existence before team_members lookup.
			const teamRow = await getTeam(db, { id: body.teamId });
			if (!teamRow) {
				return c.json({ error: `Team '${body.teamId}' not found`, code: "VALIDATION_ERROR" }, 400);
			}

			// AK5: validate sourceKnowledgeItemId refers to an existing knowledge item.
			// Guards dangling provenance FK — the column has onDelete:"restrict".
			if (body.sourceKnowledgeItemId !== undefined) {
				const srcItem = await getKnowledgeItem(db, body.sourceKnowledgeItemId);
				if (!srcItem) {
					return c.json(
						{
							error: `Knowledge item '${body.sourceKnowledgeItemId}' not found`,
							code: "VALIDATION_ERROR",
						},
						400,
					);
				}
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			const actor = c.get("userId");

			// Seed initial revisionLog entry for the creation event.
			const initialLog: Array<Record<string, unknown>> = [
				{
					timestamp: now,
					field: "status",
					old_value: null,
					new_value: "draft",
					reason: "Bet created",
					...(actor !== undefined ? { actor } : {}),
				},
			];

			// AK5: if promoting from a knowledge item, append a provenance entry so
			// the audit trail records the origin even if the FK column were migrated away.
			if (body.sourceKnowledgeItemId !== undefined) {
				initialLog.push({
					timestamp: now,
					field: "source_knowledge_item",
					old_value: null,
					new_value: body.sourceKnowledgeItemId,
					reason: "Promoted from knowledge item",
					...(actor !== undefined ? { actor } : {}),
				});
			}

			await work.create(db, "bet", {
				id,
				teamId: body.teamId,
				description: body.description,
				doneCondition: body.doneCondition ?? null,
				hypothesis: body.hypothesis ?? null,
				status: "draft",
				createdAt: now,
				costAppetiteMinor: body.costAppetite?.minor ?? null,
				costAppetiteCurrency: body.costAppetite?.currency ?? null,
				revisionLog: JSON.stringify(initialLog),
				sourceKnowledgeItemId: body.sourceKnowledgeItemId ?? null,
			});

			const created = await work.get(db, "bet", id);
			if (!created) {
				return c.json({ error: "Failed to create bet", code: "INTERNAL_ERROR" }, 500);
			}

			// Return structured costAppetite in the response
			return c.json(
				{
					...created,
					costAppetite:
						created.costAppetiteMinor != null && created.costAppetiteCurrency != null
							? { minor: created.costAppetiteMinor, currency: created.costAppetiteCurrency }
							: null,
				},
				201,
			);
		},
	);

	// PATCH /bets/:id — update mutable fields on active bets.
	// M3 A5: actor comes from auth context (c.get("userId")), not a hardcoded founder constant.
	// L17: cost_appetite replaced the old appetite string; handled directly in the route.
	// @lore U1: `description` (formerly `pitch`) is the patchable text field.
	router.patch(
		"/:id",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateBetSchema),
		async (c) => {
			const betId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof updateBetSchema>;

			// @lore U1: `description` (formerly `pitch`) is mutable in draft/active.
			// Delegated to patchDescription() to reduce PATCH handler complexity.
			if (body.field === "description") {
				const result = await patchDescription(db, betId, body.value, body.reason, c.get("userId"));
				if (!result.ok) return c.json(result.body, result.status);
				return c.json(result.row);
			}

			// @lore U2: at_risk PATCH — delegated to patchAtRisk() for complexity management.
			if (body.field === "at_risk") {
				const result = await patchAtRisk(db, betId, body.value, body.reason, c.get("userId"));
				if (!result.ok) return c.json(result.body, result.status);
				return c.json(result.row);
			}

			// @lore L17: cost_appetite PATCH — delegated to patchCostAppetite().
			// WireMoney value cannot go through updateBetField (string-only columns).
			// @lore U1: mutable in 'active' status only.
			if (body.field === "cost_appetite") {
				const result = await patchCostAppetite(db, betId, body.value, body.reason, c.get("userId"));
				if (!result.ok) return c.json(result.body, result.status);
				return c.json(result.row);
			}

			await updateBetField(
				db,
				eventBus,
				betId,
				body.field,
				body.value,
				body.reason,
				c.get("userId"),
			);

			const updated = await work.get(db, "bet", betId);
			return c.json(updated);
		},
	);

	// POST /bets/:id/commit — transition draft→active
	// @lore U1: formerly "shaped→committed". Now "draft→active".
	// @lore U1: body is optional — all fields are optional so we parse manually
	// instead of using validateBody to avoid "Malformed JSON" when body is absent.
	router.post("/:id/commit", requireBoundary({ kind: "public-data" }), async (c) => {
		const betId = c.req.param("id");

		// Parse optional body — default to {} if absent or empty
		let reason: string | undefined;
		try {
			const rawBody = await c.req.text();
			if (rawBody.trim()) {
				const parsed = startBetSchema.safeParse(JSON.parse(rawBody));
				if (!parsed.success) {
					return c.json({ error: "Validation failed", code: "VALIDATION_ERROR" }, 400);
				}
				reason = parsed.data.reason;
			}
		} catch {
			// non-JSON body — treat as empty
		}

		// Check capacity before transitioning
		const bet = await work.get(db, "bet", betId);
		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		try {
			await getTeamMembers(db, { teamId: bet.teamId }, { require: true });
		} catch (err) {
			if (err instanceof ApiError) {
				return c.json({ error: err.message, code: err.code }, err.status as 500);
			}
			throw err;
		}

		// @lore U2: catch InvalidTransitionError here (not global handler) so bets return 400.
		// Global error handler maps InvalidTransitionError to 409 (CONFLICT) for task transitions.
		// Bet lifecycle spec explicitly requires 400 with code VALIDATION_ERROR.
		try {
			await transitionBet(db, eventBus, teamCapacity, betId, "active", {
				reason: reason ?? "Bet activated",
				actor: c.get("userId"),
			});
		} catch (err) {
			if (err instanceof InvalidTransitionError) {
				return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
			}
			// @lore AF12: activating at full team capacity throws CapacityExceededError.
			// Do NOT map it locally — let it propagate to the global error handler,
			// which returns 409 CONFLICT. That is the system-wide contract: 409 is
			// reserved for capacity conflicts (see middleware/error-handler.ts and the
			// `@lore U2` on the E3 bets.integration tests). An earlier AF12 plan mapped
			// this to 400 on the false premise that it otherwise 500s — it does not.
			throw err;
		}
		const updated = await work.get(db, "bet", betId);
		if (!updated) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique W-1).
		return c.json({ ...updated, atRisk: updated.atRisk === 1 });
	});

	// POST /bets/:id/ship — transition active→completed
	// @lore U1: formerly "in_progress→shipped". Now "active→completed".
	router.post("/:id/ship", requireBoundary({ kind: "public-data" }), async (c) => {
		const betId = c.req.param("id");
		// @lore U2: catch InvalidTransitionError here (not global handler) so bets return 400.
		try {
			await transitionBet(db, eventBus, teamCapacity, betId, "completed");
		} catch (err) {
			if (err instanceof InvalidTransitionError) {
				return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
			}
			throw err;
		}
		const updated = await work.get(db, "bet", betId);
		if (!updated) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique W-1).
		return c.json({ ...updated, atRisk: updated.atRisk === 1 });
	});

	// POST /bets/:id/kill — kill with reason (required)
	router.post(
		"/:id/kill",
		requireBoundary({ kind: "public-data" }),
		validateBody(killBetSchema),
		async (c) => {
			const betId = c.req.param("id");
			if (!(await assertBetReadable(db, betId))) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}
			const body = c.req.valid("json" as never) as z.infer<typeof killBetSchema>;
			// @lore U2: catch InvalidTransitionError here (not global handler) so bets return 400.
			try {
				await transitionBet(db, eventBus, teamCapacity, betId, "killed", {
					reason: body.reason,
					actor: c.get("userId"),
				});
			} catch (err) {
				if (err instanceof InvalidTransitionError) {
					return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
				}
				throw err;
			}
			// @lore AF12: cascade the kill downward AFTER the bet is `killed` so the
			// task-kill's upward propagation sees a terminal bet and skips (no spurious
			// review thread). Synchronous so the UI's immediate refresh shows true state.
			await cascadeBetKill(db, eventBus, betId, {
				workIntents: { record: recordAgentWorkIntent },
			});
			const updated = await work.get(db, "bet", betId);
			if (!updated) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}
			// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique W-1).
			return c.json({ ...updated, atRisk: updated.atRisk === 1 });
		},
	);

	// POST /bets/:id/outcome — record or update bet outcome (AC1).
	// Only valid for completed or killed bets (hypothesis can only be evaluated after the bet ends).
	router.post(
		"/:id/outcome",
		requireBoundary({ kind: "public-data" }),
		validateBody(betOutcomeSchema),
		async (c) => {
			const betId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof betOutcomeSchema>;

			const bet = await work.get(db, "bet", betId);
			if (!bet) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}

			// AC1 AC-9: outcome can only be recorded for completed or killed bets
			if (bet.status !== "completed" && bet.status !== "killed") {
				return c.json(
					{
						error: `Outcome cannot be recorded for a bet in '${bet.status}' status. Only completed or killed bets can have outcomes.`,
						code: "VALIDATION_ERROR",
					},
					400,
				);
			}

			const now = new Date().toISOString();
			const actor = c.get("userId");

			// AC1 AC-12: append to revision log when overriding an existing outcome
			const revisionLog: Array<Record<string, unknown>> = bet.revisionLog
				? (JSON.parse(bet.revisionLog) as Array<Record<string, unknown>>)
				: [];

			if (bet.outcomeVerdict !== null) {
				revisionLog.push({
					timestamp: now,
					field: "outcome",
					old_value: {
						verdict: bet.outcomeVerdict,
						summary: bet.outcomeSummary ?? null,
						recordedAt: bet.outcomeRecordedAt,
						recordedBy: bet.outcomeRecordedBy,
					},
					new_value: {
						verdict: body.verdict,
						summary: body.summary ?? null,
					},
					actor,
				});
			}

			await work.update(db, "bet", betId, {
				outcomeVerdict: body.verdict,
				outcomeSummary: body.summary ?? null,
				outcomeRecordedAt: now,
				outcomeRecordedBy: actor ?? null,
				revisionLog: JSON.stringify(revisionLog),
			});

			const updated = await work.get(db, "bet", betId);
			if (!updated) {
				return c.json({ error: "Bet not found after update", code: "INTERNAL_ERROR" }, 500);
			}
			// @lore U2: normalize atRisk 0/1 to boolean on the wire.
			return c.json({ ...updated, atRisk: updated.atRisk === 1 });
		},
	);

	// POST /bets/:id/retro/draft — AI-assisted draft (stub) for AC2.
	// Must be registered BEFORE /:id/retro to avoid partial-segment match.
	// Returns a suggested { verdict, summary, learnings } based on task outcomes.
	//
	// @lore AC2: The draft endpoint is a stub for AC2. The stub derives verdict
	// from task outcome verdicts and composes a summary from task titles + states.
	// When LLM integration lands, replace this logic with a single bounded LLM call.
	// The endpoint shape and frontend integration are already in place.
	router.post("/:id/retro/draft", requireBoundary({ kind: "public-data" }), async (c) => {
		const betId = c.req.param("id");

		const bet = await work.get(db, "bet", betId);
		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		if (bet.status !== "completed" && bet.status !== "killed") {
			return c.json(
				{
					error: `Draft cannot be generated for a bet in '${bet.status}' status. Only completed or killed bets can be evaluated.`,
					code: "VALIDATION_ERROR",
				},
				400,
			);
		}

		// Load tasks for the bet
		const betTasks = await work.list(db, "task", { betId });

		// Stub: derive verdict from task outcome verdicts
		const metOutcomes = betTasks.filter((t) => t.outcomeVerdict === "met");
		const partialOutcomes = betTasks.filter(
			(t) => t.outcomeVerdict === "partially_met" || t.outcomeVerdict === "met_with_rework",
		);
		const notMetOutcomes = betTasks.filter((t) => t.outcomeVerdict === "not_met");
		const totalTasks = betTasks.length;

		let verdict: string;
		if (totalTasks === 0) {
			verdict = "inconclusive";
		} else if (notMetOutcomes.length === 0 && partialOutcomes.length === 0) {
			verdict = "validated";
		} else if (metOutcomes.length === 0 && partialOutcomes.length === 0) {
			verdict = "refuted";
		} else {
			verdict = "partial";
		}

		// Stub: compose summary from task data
		const taskSummaryLines = betTasks.map((t) => {
			const outcome = t.outcomeVerdict ? ` (${t.outcomeVerdict})` : "";
			return `- ${t.title}: ${t.state}${outcome}`;
		});
		const summary =
			totalTasks === 0
				? "No tasks were associated with this bet."
				: `Based on ${totalTasks} task${totalTasks === 1 ? "" : "s"}:\n\n${taskSummaryLines.join("\n")}`;

		const learnings =
			totalTasks === 0
				? "No task data available to derive learnings."
				: `Based on ${totalTasks} task${totalTasks === 1 ? "" : "s"}, ${metOutcomes.length} met their conditions, ${partialOutcomes.length} partially met, and ${notMetOutcomes.length} did not meet their conditions.`;

		return c.json({ verdict, summary, learnings });
	});

	// POST /bets/:id/retro — atomic retro: writes outcome + creates/upserts retro knowledge item (AC2).
	// Only valid for completed or killed bets.
	//
	// @lore AC2: Single endpoint wraps both the outcome write and the knowledge item
	// creation in one transaction to prevent the partial-failure mode (outcome saved
	// but knowledge failed). The hypothesis snapshot is stored in the projection meta at
	// creation time and never updated by subsequent retro calls (immutability by convention).
	router.post(
		"/:id/retro",
		requireBoundary({ kind: "public-data" }),
		validateBody(betRetroSchema),
		async (c) => {
			const betId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof betRetroSchema>;

			const bet = await work.get(db, "bet", betId);
			if (!bet) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}

			if (bet.status !== "completed" && bet.status !== "killed") {
				return c.json(
					{
						error: `Retro cannot be recorded for a bet in '${bet.status}' status. Only completed or killed bets can be evaluated.`,
						code: "VALIDATION_ERROR",
					},
					400,
				);
			}

			const now = new Date().toISOString();
			const actor = c.get("userId");

			// AC1 AC-12: append to revision log when overriding an existing outcome
			const revisionLog: Array<Record<string, unknown>> = bet.revisionLog
				? (JSON.parse(bet.revisionLog) as Array<Record<string, unknown>>)
				: [];

			if (bet.outcomeVerdict !== null) {
				revisionLog.push({
					timestamp: now,
					field: "outcome",
					old_value: {
						verdict: bet.outcomeVerdict,
						summary: bet.outcomeSummary ?? null,
						recordedAt: bet.outcomeRecordedAt,
						recordedBy: bet.outcomeRecordedBy,
					},
					new_value: {
						verdict: body.verdict,
						summary: body.summary,
					},
					actor,
				});
			}

			// Compose retro knowledge item body (markdown only — no YAML frontmatter in body per arch critique)
			const learningsSection =
				body.learnings && body.learnings.trim() ? body.learnings.trim() : "(No learnings recorded)";

			const kiBody = `## Reality\n\n${body.summary}\n\n## Learnings\n\n${learningsSection}`;

			// Derive knowledge item title: "Retro: {bet title}"
			const betTitle = deriveTitle(bet.description, bet.id);
			const kiTitle = `Retro: ${betTitle}`;

			// Find existing retro knowledge item for this bet (upsert pattern)
			// Query: knowledge_items scoped to this bet + projection kind='reflection'
			//
			// @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, knowledge
			// sub-item): this used to be a direct `.from(knowledgeItems).innerJoin(
			// knowledgeAppProjection, …)` query plus the transaction's own raw
			// `knowledgeItems`/`knowledgeAppProjection` reads/writes — both
			// `knowledge`-owned (TABLE_OWNER since Increment 1a). Now calls
			// `@hyperidle/knowledge`'s `findRetroKnowledgeItemForBet`/
			// `upsertBetRetroKnowledgeItem` — same exact write sequence
			// (update-with-meta-merge vs insert), zero behavior change.
			const existingKi = await listKnowledgeItems(db, { retroForBet: betId });
			const retroKnowledgeItemId = existingKi ? existingKi.id : crypto.randomUUID();
			const hypothesisSnapshot = bet.hypothesis?.trim() || "(no hypothesis recorded)";

			// @lore AC2: Atomic transaction wrapping bet-outcome write + knowledge-item upsert.
			// Without this, a partial failure (outcome saved, knowledge item not) leaves the bet
			// in an inconsistent state. The existingKi/retroKnowledgeItemId are resolved outside
			// the transaction (read-only queries) so the transaction only covers the writes.
			await db.transaction(async (tx) => {
				// Write outcome fields on bet
				await work.update(tx, "bet", betId, {
					outcomeVerdict: body.verdict,
					outcomeSummary: body.summary,
					outcomeRecordedAt: now,
					outcomeRecordedBy: actor ?? null,
					revisionLog: JSON.stringify(revisionLog),
				});

				await upsertBetRetroKnowledgeItem(tx as HyperIdleDb, {
					existing: existingKi,
					retroKnowledgeItemId,
					betId,
					title: kiTitle,
					body: kiBody,
					verdict: body.verdict,
					hypothesisSnapshot,
					actor,
					timestamp: now,
				});
			});

			const updated = await work.get(db, "bet", betId);
			if (!updated) {
				return c.json({ error: "Bet not found after update", code: "INTERNAL_ERROR" }, 500);
			}
			// @lore U2: normalize atRisk 0/1 to boolean on the wire.
			return c.json({ ...updated, atRisk: updated.atRisk === 1, retroKnowledgeItemId });
		},
	);

	// GET /bets/:id/artifact-thread-summary — per-bet aggregate of artifact threads.
	// Returns up to SUMMARY_CAP summaries ordered by lastMessageAt DESC.
	// Requires the bet to exist (404 guard via assertBetReadable).
	//
	// @lore L18: the endpoint joins artifacts → tasks → bet, then aggregates
	// per-artifact thread stats. A correlated subquery counts messages and
	// fetches the last message in one pass. SQLite handles this efficiently at
	// expected volumes (< 100 artifacts per bet). The server-enforced cap of 10
	// bounds the worst-case payload and query cost.
	router.get(
		"/:id/artifact-thread-summary",
		requireBoundary({ kind: "public-data" }),
		async (c) => {
			const betId = c.req.param("id");

			if (!(await assertBetReadable(db, betId))) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}

			// 1. Collect all task ids for this bet (fan-out guard: bets have bounded tasks).
			const taskRows = await work.list(db, "task", { betId });
			const taskIds = taskRows.map((r) => r.id);

			if (taskIds.length === 0) {
				return c.json({ summaries: [], totalCount: 0, truncated: false });
			}

			// 2. Load the artifacts (Work-owned) for those tasks, then fetch their
			//    conversation summaries from conversation-store (threads+messages only,
			//    keyed by artifactId) and merge per-artifact in JS — AU12 decomposition
			//    keeps neither side crossing the ownership boundary.
			const artifactRows = await work.list(db, "artifact", { taskIds, include: "taskSummary" });
			const summaryByArtifact = new Map(
				(
					await getArtifactThreadSummaries(
						db,
						artifactRows.map((a) => a.artifactId),
					)
				).map((s) => [s.artifactId, s]),
			);
			const rows = artifactRows.map((a) => {
				const s = summaryByArtifact.get(a.artifactId);
				return {
					artifactId: a.artifactId,
					artifactKind: a.artifactKind,
					artifactPreviewJson: a.artifactPreviewJson,
					taskTitle: a.taskTitle,
					threadId: s?.threadId ?? null,
					messageCount: s?.messageCount ?? 0,
					lastMessageAt: s?.lastMessageAt ?? null,
					lastMessagePayload: s?.lastMessagePayload ?? null,
					hasUnresolvedReview: s?.hasUnresolvedReview ?? 0,
				};
			});

			// 3. Filter to only artifacts with at least one message.
			const withMessages = rows.filter((r) => r.threadId !== null && (r.messageCount ?? 0) >= 1);

			// 4. Sort by lastMessageAt DESC (already stable since we control the ordering).
			withMessages.sort((a, b) => {
				if (a.lastMessageAt && b.lastMessageAt) {
					if (a.lastMessageAt > b.lastMessageAt) return -1;
					if (a.lastMessageAt < b.lastMessageAt) return 1;
				}
				// Tie-break by artifactId ASC for determinism.
				return a.artifactId < b.artifactId ? -1 : 1;
			});

			const totalCount = withMessages.length;
			const truncated = totalCount > SUMMARY_CAP;
			const capped = withMessages.slice(0, SUMMARY_CAP);

			const summaries: ArtifactThreadSummary[] = capped.map((r) => {
				// Derive artifact title from previewJson (look for 'file' or 'title' fields),
				// falling back to the producing task's title.
				let artifactTitle = r.taskTitle;
				if (r.artifactPreviewJson) {
					try {
						const preview = JSON.parse(r.artifactPreviewJson) as Record<string, unknown>;
						if (typeof preview.file === "string" && preview.file) {
							artifactTitle = preview.file;
						} else if (typeof preview.title === "string" && preview.title) {
							artifactTitle = preview.title;
						}
					} catch {
						// ignore malformed previewJson; fall back to task title
					}
				}

				// @lore AE6: artifactKind is now string (open vocabulary). No unknown_kind sentinel.
				// Pass the raw kind through — unregistered kinds render fallback on the UI.
				const artifactKind = r.artifactKind;

				// Extract snippet from the last plain-message payload (first 80 chars of text).
				let lastMessageSnippet: string | null = null;
				if (r.lastMessagePayload) {
					try {
						const payload = JSON.parse(r.lastMessagePayload) as Record<string, unknown>;
						const text = payload.text;
						if (typeof text === "string" && text) {
							lastMessageSnippet = text.slice(0, 80);
						}
					} catch {
						// ignore malformed payload
					}
				}

				return {
					artifactId: r.artifactId,
					artifactKind,
					artifactTitle,
					threadId: r.threadId ?? null,
					messageCount: r.messageCount ?? 0,
					lastMessageAt: r.lastMessageAt ?? null,
					lastMessageSnippet,
					hasUnresolvedReview: r.hasUnresolvedReview === 1,
				};
			});

			return c.json({ summaries, totalCount, truncated });
		},
	);

	return router;
}
