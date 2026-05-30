import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
} from "@hyperidle/db";
import type { ArtifactKind, ArtifactThreadSummary, EventBus } from "@hyperidle/shared";
import {
	ARTIFACT_KINDS,
	CURRENCY_CODES,
	deriveTitle,
	InvalidTransitionError,
} from "@hyperidle/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { transitionBet, updateBetField } from "../services/bet-state-machine.js";
import { ApiError, loadTeamMembers } from "../services/team-lookup.js";

const RECOGNISED_ARTIFACT_KIND_VALUES = ARTIFACT_KINDS as readonly string[];
const SUMMARY_CAP = 10;

/**
 * Zod schema for a WireMoney object in request bodies.
 * @lore L17: costAppetite replaces the old `appetite` duration string.
 */
const wiremoneySchema = z.object({
	minor: z.number().int().min(0),
	currency: z.enum(CURRENCY_CODES as unknown as [string, ...string[]]),
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
 * L18: Assert the caller can read the bet — returns the bet row or null when
 * the bet does not exist or the caller cannot access it. Extracted so it is
 * reusable across the detail endpoint and the new aggregate endpoints without
 * repeating the 404 guard.
 */
async function assertBetReadable(db: HyperIdleDb, betId: string): Promise<{ id: string } | null> {
	const [row] = await db.select({ id: bets.id }).from(bets).where(eq(bets.id, betId)).limit(1);
	return row ?? null;
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
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
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
	await db
		.update(bets)
		.set({ atRisk: value ? 1 : 0, revisionLog: JSON.stringify(revisionLog) })
		.where(eq(bets.id, betId));
	const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
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
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
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
	await db
		.update(bets)
		.set({ description: value, revisionLog: JSON.stringify(revisionLog) })
		.where(eq(bets.id, betId));
	const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
	if (!updated) {
		return {
			ok: false,
			status: 500,
			body: { error: "Bet not found after update", code: "INTERNAL_ERROR" },
		};
	}
	return { ok: true, row: updated as unknown as Record<string, unknown> };
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
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
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
	await db
		.update(bets)
		.set({
			costAppetiteMinor: value?.minor ?? null,
			costAppetiteCurrency: value?.currency ?? null,
			revisionLog: JSON.stringify(revisionLog),
		})
		.where(eq(bets.id, betId));
	const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
	if (!updated) {
		return {
			ok: false,
			status: 500,
			body: { error: "Bet not found after update", code: "INTERNAL_ERROR" },
		};
	}
	return { ok: true, row: updated as unknown as Record<string, unknown> };
}

/**
 * Create Hono routes for bet endpoints.
 * Requires db and eventBus to be set in context via middleware.
 */
export function createBetRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /bets — list all bets grouped by status, with pagination
	// @lore U1: grouped by new simplified statuses (draft, active, completed, killed).
	router.get("/", async (c) => {
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const allBets = await db.select().from(bets).limit(limit).offset(offset);

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
	router.get("/canvas", async (c) => {
		const allBets = await db.select().from(bets);
		const allTeamMembers = await db.select().from(teamMembers);

		const totalCapacity = allTeamMembers.reduce((sum, t) => sum + t.capacity, 0);
		const totalUsed = allTeamMembers.reduce((sum, t) => sum + t.activeBets, 0);

		// Batch team lookup — one query, then a Map for O(1) access.
		const allTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
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
	router.get("/:id", async (c) => {
		const betId = c.req.param("id");
		const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);

		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		// L19: Enrich task rows with latest session metadata via correlated subqueries.
		const outerTaskId = sql`${sql.identifier("tasks")}.${sql.identifier("id")}`;
		// @lore O2: stripped strategy columns (durability, riskTier, attentionScore,
		// crossTeam) removed from select. Session cost/token/harness columns also
		// stripped — those are strategy concerns now in the fabric layer.
		// @lore U1: tasks.teamId now references `teams` (formerly `products`). No more productId.
		const betTasks = await db
			.select({
				id: tasks.id,
				betId: tasks.betId,
				teamId: tasks.teamId,
				ownerAgentId: tasks.ownerAgentId,
				title: tasks.title,
				description: tasks.description,
				doneCondition: tasks.doneCondition,
				state: tasks.state,
				dependencies: tasks.dependencies,
				artifacts: tasks.artifacts,
				costCap: tasks.costCap,
				costActual: tasks.costActual,
				threadId: tasks.threadId,
				notes: tasks.notes,
				auditTrail: tasks.auditTrail,
				createdAt: tasks.createdAt,
				updatedAt: tasks.updatedAt,
				latestSessionOutcome: sql<
					string | null
				>`(SELECT ${sessions.outcome} FROM ${sessions} WHERE ${sessions.taskId} = ${outerTaskId} ORDER BY ${sessions.startedAt} DESC LIMIT 1)`.as(
					"latest_session_outcome",
				),
			})
			.from(tasks)
			.where(eq(tasks.betId, betId));

		// @lore U1: `description` (formerly `pitch`), `teamId` (formerly `productId`).
		const title = deriveTitle(bet.description, bet.id);

		const [teamRow] = await db
			.select({ name: teams.name })
			.from(teams)
			.where(eq(teams.id, bet.teamId))
			.limit(1);
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
			...restBet
		} = bet;

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
	router.post("/", validateBody(createBetSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createBetSchema>;

		// Check team existence before team_members lookup.
		const [teamRow] = await db
			.select({ id: teams.id })
			.from(teams)
			.where(eq(teams.id, body.teamId))
			.limit(1);
		if (!teamRow) {
			return c.json({ error: `Team '${body.teamId}' not found`, code: "VALIDATION_ERROR" }, 400);
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

		await db.insert(bets).values({
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
		});

		const [created] = await db.select().from(bets).where(eq(bets.id, id)).limit(1);
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
	});

	// PATCH /bets/:id — update mutable fields on active bets.
	// M3 A5: actor comes from auth context (c.get("userId")), not a hardcoded founder constant.
	// L17: cost_appetite replaced the old appetite string; handled directly in the route.
	// @lore U1: `description` (formerly `pitch`) is the patchable text field.
	router.patch("/:id", validateBody(updateBetSchema), async (c) => {
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

		await updateBetField(db, eventBus, betId, body.field, body.value, body.reason, c.get("userId"));

		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
	});

	// POST /bets/:id/commit — transition draft→active
	// @lore U1: formerly "shaped→committed". Now "draft→active".
	// @lore U1: body is optional — all fields are optional so we parse manually
	// instead of using validateBody to avoid "Malformed JSON" when body is absent.
	router.post("/:id/commit", async (c) => {
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
		const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		try {
			loadTeamMembers(db, bet.teamId);
		} catch (err) {
			if (err instanceof ApiError) {
				return c.json({ error: err.message, code: err.code }, 500);
			}
			throw err;
		}

		// @lore U2: catch InvalidTransitionError here (not global handler) so bets return 400.
		// Global error handler maps InvalidTransitionError to 409 (CONFLICT) for task transitions.
		// Bet lifecycle spec explicitly requires 400 with code VALIDATION_ERROR.
		try {
			await transitionBet(db, eventBus, betId, "active", {
				reason: reason ?? "Bet activated",
				actor: c.get("userId"),
			});
		} catch (err) {
			if (err instanceof InvalidTransitionError) {
				return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
			}
			throw err;
		}
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique W-1).
		return c.json({ ...updated, atRisk: updated.atRisk === 1 });
	});

	// POST /bets/:id/ship — transition active→completed
	// @lore U1: formerly "in_progress→shipped". Now "active→completed".
	router.post("/:id/ship", async (c) => {
		const betId = c.req.param("id");
		// @lore U2: catch InvalidTransitionError here (not global handler) so bets return 400.
		try {
			await transitionBet(db, eventBus, betId, "completed");
		} catch (err) {
			if (err instanceof InvalidTransitionError) {
				return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
			}
			throw err;
		}
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique W-1).
		return c.json({ ...updated, atRisk: updated.atRisk === 1 });
	});

	// POST /bets/:id/kill — kill with reason (required)
	router.post("/:id/kill", validateBody(killBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!(await assertBetReadable(db, betId))) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof killBetSchema>;
		// @lore U2: catch InvalidTransitionError here (not global handler) so bets return 400.
		try {
			await transitionBet(db, eventBus, betId, "killed", {
				reason: body.reason,
				actor: c.get("userId"),
			});
		} catch (err) {
			if (err instanceof InvalidTransitionError) {
				return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
			}
			throw err;
		}
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		// @lore U2: normalize atRisk 0/1 to boolean on the wire (architecture-critique W-1).
		return c.json({ ...updated, atRisk: updated.atRisk === 1 });
	});

	// GET /bets/:id/artifact-thread-summary — per-bet aggregate of artifact threads.
	// Returns up to SUMMARY_CAP summaries ordered by lastMessageAt DESC.
	// Requires the bet to exist (404 guard via assertBetReadable).
	//
	// @lore L18: the endpoint joins artifacts → tasks → bet, then aggregates
	// per-artifact thread stats. A correlated subquery counts messages and
	// fetches the last message in one pass. SQLite handles this efficiently at
	// expected volumes (< 100 artifacts per bet). The server-enforced cap of 10
	// bounds the worst-case payload and query cost.
	router.get("/:id/artifact-thread-summary", async (c) => {
		const betId = c.req.param("id");

		if (!(await assertBetReadable(db, betId))) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		// 1. Collect all task ids for this bet (fan-out guard: bets have bounded tasks).
		const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.betId, betId));
		const taskIds = taskRows.map((r) => r.id);

		if (taskIds.length === 0) {
			return c.json({ summaries: [], totalCount: 0, truncated: false });
		}

		// 2. For each artifact linked to those tasks, compute:
		//    - thread id (if any) via LEFT JOIN threads WHERE host_kind='artifact'
		//    - messageCount, lastMessageAt, lastMessageSnippet via correlated subquery on messages
		//    - hasUnresolvedReview: whether any review-type message in the thread has resolvedAt IS NULL
		const rows = await db
			.select({
				artifactId: artifacts.id,
				artifactKind: artifacts.kind,
				artifactPreviewJson: artifacts.previewJson,
				taskTitle: tasks.title,
				threadId: threads.id,
				messageCount:
					sql<number>`COALESCE((SELECT COUNT(*) FROM ${messages} WHERE ${messages.threadId} = ${threads.id}), 0)`.as(
						"message_count",
					),
				lastMessageAt: sql<
					string | null
				>`(SELECT ${messages.createdAt} FROM ${messages} WHERE ${messages.threadId} = ${threads.id} AND ${messages.deletedAt} IS NULL ORDER BY ${messages.createdAt} DESC LIMIT 1)`.as(
					"last_message_at",
				),
				lastMessagePayload: sql<
					string | null
				>`(SELECT ${messages.payload} FROM ${messages} WHERE ${messages.threadId} = ${threads.id} AND ${messages.type} = 'plain' AND ${messages.deletedAt} IS NULL ORDER BY ${messages.createdAt} DESC LIMIT 1)`.as(
					"last_message_payload",
				),
				hasUnresolvedReview:
					sql<number>`COALESCE((SELECT 1 FROM ${messages} WHERE ${messages.threadId} = ${threads.id} AND ${messages.type} = 'review' AND ${messages.resolvedAt} IS NULL LIMIT 1), 0)`.as(
						"has_unresolved_review",
					),
			})
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
			.leftJoin(threads, and(eq(threads.hostKind, "artifact"), eq(threads.hostId, artifacts.id)))
			.where(inArray(artifacts.producingTaskId, taskIds));

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

			// Normalise artifactKind to a recognised value.
			const recognised =
				RECOGNISED_ARTIFACT_KIND_VALUES.includes(r.artifactKind) &&
				r.artifactKind !== "unknown_kind";
			const artifactKind = (recognised ? r.artifactKind : "unknown_kind") as ArtifactKind;

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
	});

	return router;
}
