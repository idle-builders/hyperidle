import {
	actors,
	agents,
	factorySettings,
	type HyperIdleDb,
	items,
	responses,
	threads,
} from "@hyperidle/db";
import type {
	ApiErrorResponse,
	EventBus,
	ItemCreatedEvent,
	ResponseRecordedEvent,
} from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	DEFAULT_UNDO_WINDOW_SECONDS,
	REQUEST_CHANGES_INLINE_COMMENTS_MAX,
	REQUEST_CHANGES_SUMMARY_MAX,
	UNDO_WINDOW_MAX,
	UNDO_WINDOW_MIN,
} from "@hyperidle/shared";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ActorEnv } from "../middleware/actor-context.js";
import { validateBody } from "../middleware/validate.js";
import { isFounderActor } from "../services/founder-conflict.js";
import { routeToFounder } from "../services/founder-router.js";
import { routeItem } from "../services/item-router.js";

const VERDICT_ACTIONS = [
	"approve",
	"approve-with-comments",
	"comment",
	"inline-comment",
	"request-changes",
	"edit",
	"reject",
	"reply",
	"snooze",
	"escalate",
] as const;

const createItemSchema = z.object({
	sourceAgentId: z.string().optional(),
	layer: z.string().optional(),
	verb: z.string().optional(),
	kind: z.string().optional(),
	title: z.string().min(1),
	body: z.string().optional(),
	attachments: z.string().optional(),
	proposedAction: z.string().optional(),
	options: z.string().optional(),
	riskTier: z.enum(["low", "medium", "high"]).optional(),
	attentionScore: z.number().int().optional(),
	blocking: z.boolean().optional(),
	reasoning: z.string().optional(),
	costEstimate: z.number().int().optional(),
	threadId: z.string(),
});

/**
 * @lore L6: inline comments for a request-changes verdict are anchored to
 * lines inside the underlying `text_diff` artifact. `line_index` is the
 * absolute position within the flattened hunk's `lines` array — the same
 * value the gutter affordance reports back from the web client.
 */
const inlineCommentSchema = z.object({
	line_index: z.number().int().nonnegative(),
	body: z.string().min(1).max(2000),
});

/**
 * @lore L6 (.plan-L6.md § 3.6 option B): for request-changes verdicts,
 * `summary` writes to `responses.feedback` and `inline_comments[]` is
 * JSON-stringified into `responses.inlineAnchor`. Summary is required for
 * request-changes (refine below).
 */
const createResponseSchema = z
	.object({
		itemId: z.string(),
		decision: z.enum(VERDICT_ACTIONS),
		inlineAnchor: z.string().optional(),
		edits: z.string().optional(),
		feedback: z.string().optional(),
		approverId: z.string().optional(),
		view: z.string().optional(),
		summary: z.string().max(REQUEST_CHANGES_SUMMARY_MAX).optional(),
		inline_comments: z
			.array(inlineCommentSchema)
			.max(REQUEST_CHANGES_INLINE_COMMENTS_MAX)
			.optional(),
	})
	.refine(
		(v) =>
			v.decision !== "request-changes" ||
			(typeof v.summary === "string" && v.summary.trim().length > 0),
		{ message: "summary is required for request-changes verdicts", path: ["summary"] },
	);

/**
 * Create Hono routes for conversation endpoints.
 */
export function createConversationRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<ActorEnv> {
	const router = new Hono<ActorEnv>();

	// GET / — list threads, paginated, sorted by recency or attention_score
	router.get("/", (c) => {
		const sort = c.req.query("sort") ?? "recency";
		const page = Math.max(1, Number(c.req.query("page") ?? "1"));
		const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") ?? "20")));
		const offset = (page - 1) * limit;

		if (sort === "attention_score") {
			// Join threads with items to get max attention_score
			const allThreads = db
				.select({
					id: threads.id,
					kind: threads.kind,
					pinned: threads.pinned,
					participants: threads.participants,
					createdAt: threads.createdAt,
					maxAttentionScore: sql<number>`COALESCE(MAX(${items.attentionScore}), 0)`.as(
						"max_attention_score",
					),
				})
				.from(threads)
				.leftJoin(items, eq(items.threadId, threads.id))
				.groupBy(threads.id)
				.orderBy(sql`max_attention_score DESC`)
				.all();

			const total = allThreads.length;
			const paged = allThreads.slice(offset, offset + limit);

			return c.json({
				threads: paged,
				pagination: { page, limit, total },
			});
		}

		// Default: sort by recency (createdAt DESC)
		const total = db.select({ count: sql<number>`COUNT(*)` }).from(threads).get()?.count ?? 0;

		const allThreads = db
			.select()
			.from(threads)
			.orderBy(desc(threads.createdAt))
			.limit(limit)
			.offset(offset)
			.all();

		return c.json({
			threads: allThreads,
			pagination: { page, limit, total },
		});
	});

	// GET /:threadId — thread with items and responses
	router.get("/:threadId", (c) => {
		const threadId = c.req.param("threadId");
		const thread = db.select().from(threads).where(eq(threads.id, threadId)).get();

		if (!thread) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Get items sorted by createdAt ASC
		const threadItems = db
			.select()
			.from(items)
			.where(eq(items.threadId, threadId))
			.orderBy(items.createdAt)
			.all();

		// For each item, get its responses
		const itemsWithResponses = threadItems.map((item) => {
			const itemResponses = db.select().from(responses).where(eq(responses.itemId, item.id)).all();
			return { ...item, responses: itemResponses };
		});

		return c.json({ ...thread, items: itemsWithResponses });
	});

	// POST /items — create item
	router.post("/items", validateBody(createItemSchema), (c) => {
		const body = c.req.valid("json");
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		// Verify thread exists
		const thread = db.select().from(threads).where(eq(threads.id, body.threadId)).get();
		if (!thread) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Determine routing
		const view = routeItem({
			riskTier: body.riskTier ?? null,
			kind: body.kind ?? null,
			verb: body.verb ?? null,
		});

		// Determine founder routing if sourceAgentId is provided
		let founderRoute: "ceo" | "cpo" | "both" = "both";
		if (body.sourceAgentId) {
			const agent = db.select().from(agents).where(eq(agents.id, body.sourceAgentId)).get();
			founderRoute = routeToFounder(agent?.role ?? null);
		}

		db.insert(items)
			.values({
				id,
				sourceAgentId: body.sourceAgentId ?? null,
				layer: body.layer ?? null,
				verb: body.verb ?? null,
				kind: body.kind ?? null,
				title: body.title,
				body: body.body ?? null,
				attachments: body.attachments ?? null,
				proposedAction: body.proposedAction ?? null,
				options: body.options ?? null,
				riskTier: body.riskTier ?? null,
				attentionScore: body.attentionScore ?? null,
				blocking: body.blocking ? 1 : 0,
				reasoning: body.reasoning ?? null,
				costEstimate: body.costEstimate ?? null,
				threadId: body.threadId,
				createdAt: now,
			})
			.run();

		const created = db.select().from(items).where(eq(items.id, id)).get();

		// Emit item_created event
		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId: id,
			conversationId: body.threadId,
			kind: body.kind ?? "unknown",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		return c.json({ ...created, view, founderRoute }, 201);
	});

	// POST /responses — record verdict
	router.post("/responses", validateBody(createResponseSchema), (c) => {
		const body = c.req.valid("json");
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		// Verify item exists
		const item = db.select().from(items).where(eq(items.id, body.itemId)).get();
		if (!item) {
			const response: ApiErrorResponse = {
				error: "Item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// L2: when an actor is identified, server-derive `approverId` from
		// `c.get("actorId")` — body value is ignored. Programmatic verdicts
		// (e.g. `policy_engine`) bypass this path entirely (no `X-Actor-Id`)
		// and may set `body.approverId` directly — but never as a founder.
		//
		// @lore L2 review (security CRIT-2 / adversary C1): when actorId
		// is null and `body.approverId` is set, we MUST refuse any value
		// matching a registered actor row. Otherwise an API key holder
		// could omit `X-Actor-Id`, set `body.approverId = "actor:ceo"`,
		// and forge a founder verdict bypassing the conflict gate.
		const actorId = c.get("actorId") ?? null;
		if (actorId === null && body.approverId && isFounderActor(body.approverId, db)) {
			const response: ApiErrorResponse = {
				error: "Cannot claim founder identity without authentication",
				code: API_ERROR_CODES.UNAUTHORIZED,
				details: { field: "approverId" },
			};
			return c.json(response, 401);
		}
		const approverId = actorId ?? body.approverId ?? null;

		// L2 founder-conflict pre-check + insert wrapped in a single
		// transaction. better-sqlite3 transactions default to DEFERRED
		// (read-only until first write) which leaves a TOCTOU window: two
		// concurrent SELECTs see no conflict, both INSERT, both commit.
		// `behavior: 'immediate'` upgrades to BEGIN IMMEDIATE so the
		// transaction acquires a write lock at the start and concurrent
		// founder verdicts serialise.
		//
		// @lore L2 review (W1/C2): drizzle better-sqlite3 supports
		// `.transaction(fn, { behavior: 'immediate' })` since 0.30; PG
		// default isolation is sufficient given the FK + check. A
		// belt-and-braces partial unique index would need to enforce
		// "one founder verdict per thread", but `responses` does not
		// denormalise `thread_id`. The IMMEDIATE transaction is the
		// authoritative serialisation point; adding a `thread_id` column
		// to `responses` is deferred (TRACK-L L8 audit-driven UI surface).
		// L4: snapshot the configured undo window per row so undo windows are
		// deterministic across mid-flight setting changes. Default 8s; clamp
		// to [3, 15]. The settings read is cheap and safe outside the
		// transaction (no chain semantics depend on it). The prior-decision
		// read MUST execute inside the IMMEDIATE transaction — see @lore
		// below.
		const settingRow = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "appearance.undo_window_seconds"))
			.get();
		const parsedWindow = settingRow ? Number.parseInt(settingRow.value, 10) : Number.NaN;
		const undoWindowSeconds = Number.isFinite(parsedWindow)
			? Math.min(UNDO_WINDOW_MAX, Math.max(UNDO_WINDOW_MIN, parsedWindow))
			: DEFAULT_UNDO_WINDOW_SECONDS;

		// @lore L4 review: the prior-decision audit-chain read runs inside
		// the IMMEDIATE transaction so two concurrent commits cannot both
		// see the same prior row and both write the same `prior_decision`
		// — the second commit must observe the first commit as its prior.
		const result = db.transaction(
			(tx) => {
				if (actorId !== null) {
					const prior = tx
						.select({
							approverId: responses.approverId,
							decision: responses.decision,
							respondedAt: responses.respondedAt,
						})
						.from(responses)
						.innerJoin(items, eq(items.id, responses.itemId))
						.innerJoin(actors, eq(actors.id, responses.approverId))
						.where(
							and(
								eq(items.threadId, item.threadId),
								isNotNull(responses.approverId),
								ne(responses.approverId, actorId),
							),
						)
						.limit(1)
						.get();

					if (prior?.approverId) {
						return {
							ok: false as const,
							conflict: {
								actor_id: prior.approverId,
								at: prior.respondedAt,
								action: prior.decision,
							},
						};
					}
				}

				// @lore L4 review (adversary C1 / arch W1): filter on
				// `transition='commit'` so commit→undo→commit chains record
				// the *actual* prior verdict, not the undo row's NULL
				// decision (which would otherwise become the next commit's
				// `prior_decision` and lie about the audit chain).
				const priorRow = tx
					.select()
					.from(responses)
					.where(and(eq(responses.itemId, body.itemId), eq(responses.transition, "commit")))
					.orderBy(desc(responses.respondedAt))
					.limit(1)
					.get();
				const priorDecision = priorRow?.decision ?? null;

				// @lore L6: request-changes maps summary→feedback and
				// inline_comments[]→inlineAnchor JSON; other decisions unchanged.
				const isRequestChanges = body.decision === "request-changes";
				const feedbackValue = isRequestChanges
					? (body.summary ?? body.feedback ?? null)
					: (body.feedback ?? null);
				const inlineAnchorValue = isRequestChanges
					? JSON.stringify(body.inline_comments ?? [])
					: (body.inlineAnchor ?? null);

				tx.insert(responses)
					.values({
						id,
						itemId: body.itemId,
						decision: body.decision,
						inlineAnchor: inlineAnchorValue,
						edits: body.edits ?? null,
						feedback: feedbackValue,
						approverId,
						view: body.view ?? null,
						respondedAt: now,
						transition: "commit",
						priorDecision,
						undoesResponseId: null,
						undoWindowSeconds,
					})
					.run();

				const created = tx.select().from(responses).where(eq(responses.id, id)).get();
				return { ok: true as const, created };
			},
			{ behavior: "immediate" },
		);

		if (!result.ok) {
			const response: ApiErrorResponse = {
				error: "founder_conflict",
				code: API_ERROR_CODES.FOUNDER_CONFLICT,
				details: { existing_verdict: result.conflict },
			};
			return c.json(response, 409);
		}

		// Emit response_recorded event. L6: for request-changes, propagate
		// the summary + inline-comment payload onto the event so the agent
		// runtime can react to structured feedback.
		const event: ResponseRecordedEvent = {
			type: "response_recorded",
			streamId: crypto.randomUUID(),
			responseId: id,
			itemId: body.itemId,
			decision: body.decision,
			timestamp: Date.now(),
		};
		if (body.decision === "request-changes") {
			if (body.summary !== undefined) {
				event.summary = body.summary;
			}
			if (body.inline_comments !== undefined) {
				event.inlineComments = body.inline_comments.map((c) => ({
					lineIndex: c.line_index,
					body: c.body,
				}));
			}
		}
		eventBus.emit(event);

		return c.json(result.created, 201);
	});

	return router;
}
