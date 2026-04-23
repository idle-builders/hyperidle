import { agents, type HyperIdleDb, items, responses, threads } from "@hyperidle/db";
import type {
	ApiErrorResponse,
	EventBus,
	ItemCreatedEvent,
	ResponseRecordedEvent,
} from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
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

const createResponseSchema = z.object({
	itemId: z.string(),
	decision: z.enum(VERDICT_ACTIONS),
	inlineAnchor: z.string().optional(),
	edits: z.string().optional(),
	feedback: z.string().optional(),
	approverId: z.string().optional(),
	view: z.string().optional(),
});

/**
 * Create Hono routes for conversation endpoints.
 */
export function createConversationRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

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
		const body = c.req.valid("json" as never) as z.infer<typeof createItemSchema>;
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
		const body = c.req.valid("json" as never) as z.infer<typeof createResponseSchema>;
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

		db.insert(responses)
			.values({
				id,
				itemId: body.itemId,
				decision: body.decision,
				inlineAnchor: body.inlineAnchor ?? null,
				edits: body.edits ?? null,
				feedback: body.feedback ?? null,
				approverId: body.approverId ?? null,
				view: body.view ?? null,
				respondedAt: now,
			})
			.run();

		const created = db.select().from(responses).where(eq(responses.id, id)).get();

		// Emit response_recorded event
		const event: ResponseRecordedEvent = {
			type: "response_recorded",
			streamId: crypto.randomUUID(),
			responseId: id,
			itemId: body.itemId,
			decision: body.decision,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		return c.json(created, 201);
	});

	return router;
}
