import { type HyperIdleDb, items, threads } from "@hyperidle/db";
import type { ApiErrorResponse, EventBus, ItemCreatedEvent } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { validateBody } from "../middleware/validate.js";

// @lore L1 step5 (S-C2): the legacy `POST /api/conversations/responses` path
// dual-wrote `verdict`-typed messages without founder authz, idempotency, or
// the resolves-which-message check that `routes/threads.ts` enforces. The
// dual-write was deleted; verdicts go through `POST /api/threads/:id/messages`
// (the canonical L1 surface). The `GET /:threadId` projection that re-shaped
// verdict messages into the legacy `responses` row format went with it —
// items now expose an empty `responses: []` for one-release wire compat.

// @lore O2: routeToFounder and routeItem removed from POST /items handler.
// Inline routing calls were a strategy concern embedded in the kernel route.
// The view and founderRoute fields are no longer returned in the response.
// O2 also removes attentionScore and costEstimate from the create schema and
// the insert, since those columns were stripped from the items kernel table.

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
	blocking: z.boolean().optional(),
	reasoning: z.string().optional(),
	threadId: z.string(),
});

/**
 * Create Hono routes for conversation endpoints.
 */
export function createConversationRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — list threads, paginated, sorted by recency
	// O2: attention_score sort removed (column stripped from items table)
	router.get("/", async (c) => {
		const sort = c.req.query("sort") ?? "recency";
		const page = Math.max(1, Number(c.req.query("page") ?? "1"));
		const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") ?? "20")));
		const offset = (page - 1) * limit;

		if (sort === "attention_score") {
			// O2: attention_score column stripped from items — fall through to recency sort
			// @lore O2: attention_score was a strategy concern. Sorting by it from the kernel
			// route is no longer supported. Callers should use recency or switch to strategy layer.
			const [countRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(threads).limit(1);
			const total = countRow?.count ?? 0;

			const allThreads = await db
				.select()
				.from(threads)
				.orderBy(desc(threads.createdAt))
				.limit(limit)
				.offset(offset);

			return c.json({
				threads: allThreads,
				pagination: { page, limit, total },
			});
		}

		// Default: sort by recency (createdAt DESC)
		const [countRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(threads).limit(1);
		const total = countRow?.count ?? 0;

		const allThreads = await db
			.select()
			.from(threads)
			.orderBy(desc(threads.createdAt))
			.limit(limit)
			.offset(offset);

		return c.json({
			threads: allThreads,
			pagination: { page, limit, total },
		});
	});

	// GET /:threadId — thread with items and responses
	router.get("/:threadId", async (c) => {
		const threadId = c.req.param("threadId");
		const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);

		if (!thread) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Get items sorted by createdAt ASC
		const threadItems = await db
			.select()
			.from(items)
			.where(eq(items.threadId, threadId))
			.orderBy(items.createdAt);

		// L1 step5 (S-C2): the verdict-projection that re-shaped `verdict`
		// messages into the legacy `responses` row format was removed alongside
		// the dual-write `POST /responses` path. Verdicts now live on
		// `GET /api/threads/:id` (messages, type='verdict'). The empty
		// `responses: []` keeps the wire shape for one release.
		const itemsWithResponses = threadItems.map((item) => ({
			...item,
			responses: [] as ReadonlyArray<never>,
		}));

		return c.json({ ...thread, items: itemsWithResponses });
	});

	// POST /items — create item
	// O2: routeItem/routeToFounder calls removed; view/founderRoute fields removed from response
	router.post("/items", validateBody(createItemSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createItemSchema>;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		// Verify thread exists
		const [thread] = await db.select().from(threads).where(eq(threads.id, body.threadId)).limit(1);
		if (!thread) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// O2: agents routing logic removed; sourceAgentId stored for audit purposes only
		await db.insert(items).values({
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
			blocking: body.blocking ?? false,
			reasoning: body.reasoning ?? null,
			threadId: body.threadId,
			createdAt: now,
		});

		const [created] = await db.select().from(items).where(eq(items.id, id)).limit(1);

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

		return c.json(created, 201);
	});

	// `POST /responses` removed in L1 step5 (S-C2). Verdicts go through the
	// canonical `POST /api/threads/:id/messages` surface.

	return router;
}
