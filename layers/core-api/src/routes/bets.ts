import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { getArtifactThreadSummaries } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	create as createKnowledgeItem,
	get as getKnowledgeItem,
	list as listKnowledgeItems,
	update as updateKnowledgeItem,
} from "@hyperidle/knowledge";
import { getTeam, getTeamMembers, listTeamMembers, listTeams, updateTeam } from "@hyperidle/org";
import type { ArtifactThreadSummary, EventBus } from "@hyperidle/shared";
import { BET_OUTCOME_VERDICTS, deriveTitle, InvalidTransitionError } from "@hyperidle/shared";
import { type HyperIdleEnv, requireBoundary, validateBody } from "@hyperidle/shared/http";
import * as work from "@hyperidle/work";
import { cascadeBetKill, transitionBet, updateBetField } from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { enumValues } from "../schemas/common.schema.js";
import { buildSeamBackedWorkIntentRecorder } from "../services/agent-orchestration-port-composition.js";
import { taskRunResolverDeps } from "../services/task-run-resolver-bindings.js";

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
// @lore AU21 Increment 14a: `updateBetCostAppetiteSchema`/the `cost_appetite`
// PATCH field are deleted along with the rest of the cost feature (the
// `costAppetiteMinor`/`costAppetiteCurrency` columns are dropped) — no
// replacement. `updateBetStringFieldSchema` now covers exactly the two
// remaining string-valued fields.
const updateBetStringFieldSchema = z.object({
	field: z.enum(["done_condition", "hypothesis"] as const),
	value: z.string(),
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

/**
 * Create Hono routes for bet endpoints.
 * Requires db and eventBus to be set in context via middleware.
 */
export function createBetRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
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

			return {
				id: bet.id,
				title,
				team,
				teamId: bet.teamId,
				status: bet.status,
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

		// @lore AU26 J4: `latestSessionOutcome` is GONE from this response. It was
		// core-api reading `sessions` — an `agent-orchestration` table — purely to
		// decorate a task row for two renders (the outcome chip on the task sheet
		// and the task-list sort order). Founder ruling: *"orchestration now has an
		// api so that the ui can get the agent run state from the orchestration
		// directly and combine this information in the ui."* `WorkBet.tsx` now
		// fetches `GET /api/agent-orchestration/runs/latest-outcomes?task_ids=…`
		// for this bet's tasks and merges it in; what the user sees is unchanged.
		// (H2 had already deleted the correlated subquery inside `work-service`
		// and recomposed the read at this route — the right PLACE, still the wrong
		// LAYER. This finishes it.)
		// @lore O2: stripped strategy columns (durability, riskTier, attentionScore,
		// crossTeam) removed from select. Session cost/token/harness columns also
		// stripped — those are strategy concerns now in the app projection layer.
		// @lore U1: tasks.teamId now references `teams` (formerly `products`). No more productId.
		const rawBetTasks = await work.list(db, "task", { betId });
		const betTasks = rawBetTasks.map(
			({ outcomeVerdict, outcomeRecordedAt, outcomeRecordedBy: _recordedBy, ...task }) => ({
				...task,
				outcomeVerdict,
				outcomeRecordedAt,
			}),
		);

		// @lore U1: `description` (formerly `pitch`), `teamId` (formerly `productId`).
		const title = deriveTitle(bet.description, bet.id);

		const teamRow = await getTeam(db, { id: bet.teamId });
		const team = teamRow?.name ?? bet.teamId;

		const done = betTasks.filter((t) => t.state === "done").length;
		const total = betTasks.length;

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
			tokensActual,
			// AK5: null when no provenance (hand-typed bet), enriched object when promoted.
			sourceKnowledge,
			tasks: betTasks,
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
				revisionLog: JSON.stringify(initialLog),
				sourceKnowledgeItemId: body.sourceKnowledgeItemId ?? null,
			});

			const created = await work.get(db, "bet", id);
			if (!created) {
				return c.json({ error: "Failed to create bet", code: "INTERNAL_ERROR" }, 500);
			}

			return c.json(created, 201);
		},
	);

	// PATCH /bets/:id — update mutable fields on active bets.
	// M3 A5: actor comes from auth context (c.get("userId")), not a hardcoded founder constant.
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
			// @lore AU20 R-org: ApiError is unexported from @hyperidle/org (it is an
			// internal invariant-enforcement class). Duck-type on err.name to surface
			// the status/code without an instanceof import.
			if (err instanceof Error && err.name === "ApiError" && "status" in err && "code" in err) {
				const apiErr = err as Error & { status: number; code: string };
				return c.json({ error: apiErr.message, code: apiErr.code }, apiErr.status as 500);
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
				workIntents: buildSeamBackedWorkIntentRecorder(agentOrchestration),
				taskRunResolver: taskRunResolverDeps,
				// AU31 §3.1/§13 item 2: seam-backed — supersedes AU26 H2's "a
				// downward call, not a Port method"; the port is now core's one
				// door, both directions.
				runOrchestration: {
					requestRunStopForTasks: (_exec, taskIds, opts) =>
						agentOrchestration.runs.stopForTasks(taskIds, opts.reason),
				},
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
			// `knowledge`-owned (TABLE_OWNER since Increment 1a). Now uses
			// `@hyperidle/knowledge`'s `create`/`update` directly — same exact write
			// sequence (meta fields reconstructed from known inputs, no lossy merge).
			// @lore AU20 K2-writes: upsertBetRetroKnowledgeItem deleted from barrel;
			// inlined here using create()/update(). The meta merge on update was
			// reconstructing {betId, hypothesis, verdict, validatedAt, validatedBy} — all
			// known at call-site except the immutable creation-time hypothesis. Updates
			// read the existing projection and preserve that snapshot while refreshing
			// only its validation fields. create() generates the id internally; captured
			// from its return value for the response.
			const hypothesisSnapshot = bet.hypothesis?.trim() || "(no hypothesis recorded)";
			let retroKnowledgeItemId = "";

			// @lore AC2: Atomic transaction wrapping bet-outcome write + knowledge-item upsert.
			// Without this, a partial failure (outcome saved, knowledge item not) leaves the bet
			// in an inconsistent state. The existing projection read stays in the same
			// transaction so the optimistic update preserves the exact snapshot it read.
			await db.transaction(async (tx) => {
				const knowledgeDb = tx as HyperIdleDb;
				const existingKi = await listKnowledgeItems(knowledgeDb, { retroForBet: betId });
				retroKnowledgeItemId = existingKi?.id ?? "";

				// Write outcome fields on bet
				await work.update(tx, "bet", betId, {
					outcomeVerdict: body.verdict,
					outcomeSummary: body.summary,
					outcomeRecordedAt: now,
					outcomeRecordedBy: actor ?? null,
					revisionLog: JSON.stringify(revisionLog),
				});

				if (existingKi) {
					const existingKnowledge = await getKnowledgeItem(knowledgeDb, existingKi.id, {
						view: "full",
					});
					const existingMeta = JSON.parse(existingKnowledge?.meta ?? "{}") as Record<
						string,
						unknown
					>;
					await updateKnowledgeItem(
						knowledgeDb,
						existingKi.id,
						{
							title: kiTitle,
							body: kiBody,
							meta: JSON.stringify({
								...existingMeta,
								verdict: body.verdict,
								validatedAt: now,
								validatedBy: actor ?? null,
							}),
							updatedBy: actor ?? "system",
						},
						existingKi.version,
					);
				} else {
					const created = await createKnowledgeItem(knowledgeDb, {
						layer: null,
						scopeKind: "bet",
						scopeId: betId,
						title: kiTitle,
						body: kiBody,
						format: "markdown",
						status: "active",
						updatedBy: actor ?? "system",
						kind: "reflection",
						meta: JSON.stringify({
							betId,
							hypothesis: hypothesisSnapshot,
							verdict: body.verdict,
							validatedAt: now,
							validatedBy: actor ?? null,
						}),
					});
					retroKnowledgeItemId = created.id;
				}
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
