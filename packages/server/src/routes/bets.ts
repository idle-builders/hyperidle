import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import type { ArtifactKind, ArtifactThreadSummary, EventBus } from "@hyperidle/shared";
import {
	ARTIFACT_KINDS,
	CURRENCY_CODES,
	deriveTitleFromPitch,
	formatMoney,
} from "@hyperidle/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { transitionBet, updateBetField } from "../services/bet-state-machine.js";
import { ApiError, loadProductTeam } from "../services/product-team.js";

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
 */
const createBetSchema = z
	.object({
		productId: z.string(),
		/**
		 * @lore Q3: teamId is now optional. When absent, the server resolves
		 * the team from the product's team via loadProductTeam(). When present,
		 * the explicit value is used. Either way, a team is always written.
		 */
		teamId: z.string().optional(),
		/**
		 * @lore Q3: pitch must be non-empty (min 1 char). Previously unconstrained.
		 */
		pitch: z.string().min(1),
		/**
		 * @lore L17: costAppetite replaces the old `appetite` duration string
		 * (e.g. "2 weeks"). Accepts null for uncapped bets. POST with the old
		 * `appetite` string returns 400.
		 */
		costAppetite: wiremoneySchema.nullable().optional(),
		doneCondition: z.string().optional(),
		hypothesis: z.string().optional(),
	})
	// Reject the old `appetite` string field — if it appears in the body, return 400
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
 * @lore Q3: pitch PATCH schema — pitch is mutable in shaped, committed,
 * in_progress, paused, behind, blocked, review. NOT in shipped or killed.
 * Handled directly in the PATCH route (not via bet-state-machine.MUTABLE_FIELDS)
 * per architecture design-it-twice decision.
 */
const updateBetPitchSchema = z.object({
	field: z.literal("pitch"),
	value: z.string().min(1),
	reason: z.string(),
});

/**
 * Statuses in which pitch is mutable.
 *
 * @lore Q3 W-1 arch critique: explicit set documented here as the single
 * source of truth. shipped and killed are excluded — the bet is done.
 */
const PITCH_MUTABLE_IN_STATUSES = new Set([
	"shaped",
	"committed",
	"in_progress",
	"paused",
	"behind",
	"blocked",
	"review",
]);

const updateBetSchema = z.discriminatedUnion("field", [
	updateBetStringFieldSchema,
	updateBetCostAppetiteSchema,
	updateBetPitchSchema,
]);

const killBetSchema = z.object({
	reason: z.string().min(1),
});

/**
 * L14: Pause requires a reason so the founder documents why work is paused.
 */
const pauseBetSchema = z.object({
	reason: z.string().min(1),
});

/**
 * L14: Resume reason is optional — resuming is non-destructive.
 */
const resumeBetSchema = z.object({
	reason: z.string().optional(),
});

/**
 * L18: Assert the caller can read the bet — returns the bet row or null when
 * the bet does not exist or the caller cannot access it. Extracted so it is
 * reusable across the detail endpoint and the new aggregate endpoints without
 * repeating the 404 guard.
 *
 * @lore L18: the plan flags an IDOR risk on the artifact-thread-summary
 * endpoint (risk §4). We reuse the same per-bet read check here that already
 * backs `GET /api/bets/:id`. If auth evolves to founder-scoped reads this
 * helper is the single place to extend.
 */
async function assertBetReadable(db: HyperIdleDb, betId: string): Promise<{ id: string } | null> {
	const [row] = await db.select({ id: bets.id }).from(bets).where(eq(bets.id, betId)).limit(1);
	return row ?? null;
}

/**
 * Create Hono routes for bet endpoints.
 * Requires db and eventBus to be set in context via middleware.
 */
export function createBetRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /bets — list all bets grouped by status, with pagination
	router.get("/", async (c) => {
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const allBets = await db.select().from(bets).limit(limit).offset(offset);

		const grouped = {
			shaped: allBets.filter((b) => b.status === "shaped"),
			committed: allBets.filter((b) => b.status === "committed"),
			in_progress: allBets.filter((b) => b.status === "in_progress"),
			shipped: allBets.filter((b) => b.status === "shipped"),
			killed: allBets.filter((b) => b.status === "killed"),
		};

		return c.json(grouped);
	});

	// GET /bets/canvas — canvas data: shaped, committed, capacity info
	//
	// @lore Q3 T3: enriched with product name (batch lookup) + derived title +
	// formatted appetite string. Uses a Map for batch product lookup to avoid
	// N+1 queries (Q3 arch critique W-4).
	router.get("/canvas", async (c) => {
		const allBets = await db.select().from(bets);
		const allTeams = await db.select().from(teams);

		const totalCapacity = allTeams.reduce((sum, t) => sum + t.capacity, 0);
		const totalUsed = allTeams.reduce((sum, t) => sum + t.activeBets, 0);

		// Batch product lookup — one query, then a Map for O(1) access.
		const allProducts = await db.select({ id: products.id, name: products.name }).from(products);
		const productMap = new Map(allProducts.map((p) => [p.id, p.name]));

		/** Shape a bet row into the CanvasBetWire format. */
		function enrichBet(bet: (typeof allBets)[number]): Record<string, unknown> {
			const title = deriveTitleFromPitch(bet.pitch, bet.id);
			const product = productMap.get(bet.productId) ?? bet.productId;
			const appetite =
				bet.costAppetiteMinor != null && bet.costAppetiteCurrency != null
					? formatMoney({
							minor: bet.costAppetiteMinor,
							currency: bet.costAppetiteCurrency as "USD" | "EUR" | "GBP" | "JPY",
						})
					: "—";

			return {
				id: bet.id,
				title,
				product,
				productId: bet.productId,
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
			shaped: allBets.filter((b) => b.status === "shaped").map(enrichBet),
			committed: allBets.filter((b) => b.status === "committed").map(enrichBet),
			capacity: {
				used: totalUsed,
				max: totalCapacity,
			},
		};

		return c.json(canvas);
	});

	// GET /bets/:id — bet detail with tasks, enriched with title/product/team/progress.
	//
	// @lore L14: The `bets` table has no title, product, or team columns. These
	// fields are derived server-side:
	//   - title: first non-empty line of pitch, stripping the "# " prefix.
	//            Falls back to bet.id if no heading is found.
	//   - product: joined from products.name via bets.productId.
	//   - team: teams.id (display identifier; name column not yet on teams table).
	//   - progress: { done, total } computed from the tasks already fetched.
	// Keeping enrichment in the API layer preserves the three-layer boundary
	// (client stays thin) and avoids a second API call from the browser.
	router.get("/:id", async (c) => {
		const betId = c.req.param("id");
		const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);

		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		// L19: Enrich task rows with latest session metadata via correlated subqueries.
		// The sessions_task_id_idx index covers the task_id lookups efficiently.
		// @lore L19: Five correlated subqueries rather than a single JSON subquery —
		// explicit columns are easier to read and the volume is bounded (< 50 tasks/bet,
		// < 20 sessions/task).
		//
		// @lore L19: ${tasks.id} inside a nested sql`` template renders as unqualified
		// `"id"` (no table prefix), causing SQLite to resolve it against the inner
		// sessions table. We use sql.identifier to emit `"tasks"."id"` explicitly.
		// See bets.session-enrichment.test.ts for the proof.
		const outerTaskId = sql`${sql.identifier("tasks")}.${sql.identifier("id")}`;
		// @lore O2: stripped strategy columns (durability, riskTier, attentionScore,
		// crossTeam) removed from select. Session cost/token/harness columns also
		// stripped — those are strategy concerns now in the fabric layer.
		const betTasks = await db
			.select({
				id: tasks.id,
				betId: tasks.betId,
				productId: tasks.productId,
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

		const title = deriveTitleFromPitch(bet.pitch, bet.id);

		const [productRow] = await db
			.select({ name: products.name })
			.from(products)
			.where(eq(products.id, bet.productId))
			.limit(1);
		const product = productRow?.name ?? bet.productId;

		const team = bet.teamId;

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
			title,
			product,
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

	// POST /bets — create shaped bet
	//
	// @lore Q3 T2: teamId is optional — when absent, the server resolves it from
	// the product's team via loadProductTeam(). Product existence is checked first
	// (returns 400, not 500) before team lookup. revisionLog is seeded with a
	// creation entry on every new bet.
	router.post("/", validateBody(createBetSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createBetSchema>;

		// Q3 W-3 arch critique: check product existence before team lookup.
		const [productRow] = await db
			.select({ id: products.id })
			.from(products)
			.where(eq(products.id, body.productId))
			.limit(1);
		if (!productRow) {
			return c.json(
				{ error: `Product '${body.productId}' not found`, code: "VALIDATION_ERROR" },
				400,
			);
		}

		// Resolve teamId — explicit or derived from product's team.
		let resolvedTeamId: string;
		if (body.teamId) {
			resolvedTeamId = body.teamId;
		} else {
			try {
				const team = await loadProductTeam(db, body.productId);
				resolvedTeamId = team.id;
			} catch (err) {
				if (err instanceof ApiError) {
					return c.json({ error: err.message, code: err.code }, 400);
				}
				throw err;
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
				new_value: "shaped",
				reason: "Bet created",
				...(actor !== undefined ? { actor } : {}),
			},
		];

		await db.insert(bets).values({
			id,
			productId: body.productId,
			teamId: resolvedTeamId,
			pitch: body.pitch,
			doneCondition: body.doneCondition ?? null,
			hypothesis: body.hypothesis ?? null,
			status: "shaped",
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
	// Q3 T4: pitch is now patchable; handled directly (not via bet-state-machine).
	router.patch("/:id", validateBody(updateBetSchema), async (c) => {
		const betId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateBetSchema>;

		// @lore Q3 T4: pitch is mutable on shaped/committed/in_progress/paused/behind/blocked/review.
		// NOT shipped or killed. Handled here (not via bet-state-machine.MUTABLE_FIELDS) per
		// architecture design-it-twice decision.
		if (body.field === "pitch") {
			const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
			if (!bet) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}
			if (!PITCH_MUTABLE_IN_STATUSES.has(bet.status)) {
				return c.json(
					{
						error: `Field 'pitch' is not mutable in status '${bet.status}'`,
						code: "VALIDATION_ERROR",
					},
					400,
				);
			}
			const revisionLog: Array<Record<string, unknown>> = bet.revisionLog
				? (JSON.parse(bet.revisionLog) as Array<Record<string, unknown>>)
				: [];
			revisionLog.push({
				timestamp: new Date().toISOString(),
				field: "pitch",
				old_value: bet.pitch,
				new_value: body.value,
				reason: body.reason,
				actor: c.get("userId"),
			});
			await db
				.update(bets)
				.set({
					pitch: body.value,
					revisionLog: JSON.stringify(revisionLog),
				})
				.where(eq(bets.id, betId));
			const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
			return c.json(updated);
		}

		// @lore L17: cost_appetite is a WireMoney object — it cannot go through
		// updateBetField (which maps fields to single string DB columns). Write
		// costAppetiteMinor + costAppetiteCurrency directly and add a revision entry.
		if (body.field === "cost_appetite") {
			const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
			if (!bet) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}
			const MUTABLE_IN_STATUSES = new Set(["in_progress", "paused", "behind", "blocked"]);
			if (!MUTABLE_IN_STATUSES.has(bet.status)) {
				return c.json(
					{
						error: `Field 'cost_appetite' is not mutable on an in_progress bet`,
						code: "VALIDATION_ERROR",
					},
					400,
				);
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
				new_value: body.value,
				reason: body.reason,
				actor: c.get("userId"),
			});
			await db
				.update(bets)
				.set({
					costAppetiteMinor: body.value?.minor ?? null,
					costAppetiteCurrency: body.value?.currency ?? null,
					revisionLog: JSON.stringify(revisionLog),
				})
				.where(eq(bets.id, betId));

			const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
			return c.json(updated);
		}

		await updateBetField(db, eventBus, betId, body.field, body.value, body.reason, c.get("userId"));

		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
	});

	// POST /bets/:id/commit — transition shaped→committed
	router.post("/:id/commit", async (c) => {
		const betId = c.req.param("id");
		await transitionBet(db, eventBus, betId, "committed");
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
	});

	// POST /bets/:id/ship — transition in_progress→shipped
	router.post("/:id/ship", async (c) => {
		const betId = c.req.param("id");
		await transitionBet(db, eventBus, betId, "shipped");
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
	});

	// POST /bets/:id/kill — kill with reason (required)
	router.post("/:id/kill", validateBody(killBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!(await assertBetReadable(db, betId))) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof killBetSchema>;
		await transitionBet(db, eventBus, betId, "killed", {
			reason: body.reason,
			actor: c.get("userId"),
		});
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
	});

	// POST /bets/:id/pause — pause an in_progress or behind bet. Reason required.
	// L14: T3.
	router.post("/:id/pause", validateBody(pauseBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!(await assertBetReadable(db, betId))) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof pauseBetSchema>;
		await transitionBet(db, eventBus, betId, "paused", {
			reason: body.reason,
			actor: c.get("userId"),
		});
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
	});

	// POST /bets/:id/resume — resume a paused bet. Reason optional.
	// L14: T4.
	router.post("/:id/resume", validateBody(resumeBetSchema), async (c) => {
		const betId = c.req.param("id");
		if (!(await assertBetReadable(db, betId))) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof resumeBetSchema>;
		await transitionBet(db, eventBus, betId, "in_progress", {
			reason: body.reason ?? "Resumed by founder",
			actor: c.get("userId"),
		});
		const [updated] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		return c.json(updated);
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
		//
		// We use Drizzle's sql`` template for the aggregate expressions.
		// @lore L18: Drizzle/Postgres does not expose a built-in correlated-subquery helper.
		// Using sql`` template tags is the idiomatic escape hatch for aggregate queries.
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
					if (typeof preview["file"] === "string" && preview["file"]) {
						artifactTitle = preview["file"];
					} else if (typeof preview["title"] === "string" && preview["title"]) {
						artifactTitle = preview["title"];
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
					const text = payload["text"];
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
