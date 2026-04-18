import { type HyperIdleDb, knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { API_ERROR_CODES, type EventBus, KNOWLEDGE_LAYERS } from "@hyperidle/shared";
import type { ApiErrorResponse, KnowledgeLayer } from "@hyperidle/shared";
import { and, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { escapeLikePattern } from "../services/like-escape.js";

const createKnowledgeSchema = z.object({
	kind: z.string(),
	topic: z.string().optional(),
	title: z.string(),
	body: z.string(),
	format: z.string(),
	updatedBy: z.string(),
	scopeId: z.string().optional(),
	status: z.string().optional(),
	confidence: z.number().optional(),
	meta: z.string().optional(),
});

const updateKnowledgeSchema = z.object({
	version: z.number(),
	updatedBy: z.string(),
	title: z.string().optional(),
	body: z.string().optional(),
	topic: z.string().optional(),
	kind: z.string().optional(),
	format: z.string().optional(),
	status: z.string().optional(),
	confidence: z.number().optional(),
	meta: z.string().optional(),
});

const mergeSchema = z.object({
	sourceId: z.string(),
	updatedBy: z.string(),
});

const splitSchema = z.object({
	newItems: z
		.array(
			z.object({
				title: z.string(),
				body: z.string(),
				kind: z.string(),
				topic: z.string().optional(),
			}),
		)
		.min(2),
	updatedBy: z.string(),
});

const flagSchema = z.object({
	reason: z.string(),
});

/**
 * I2 V3: Validate the `:layer` path param against KNOWLEDGE_LAYERS. Returns
 * the parsed layer when valid, or null when invalid (the caller writes a 400
 * response in that branch). Inline so each handler can short-circuit before
 * any DB access.
 */
const LayerSchema = z.enum(KNOWLEDGE_LAYERS as readonly [KnowledgeLayer, ...KnowledgeLayer[]]);

function parseLayer(raw: string): KnowledgeLayer | null {
	const result = LayerSchema.safeParse(raw);
	return result.success ? result.data : null;
}

function invalidLayerResponse(): { response: ApiErrorResponse; status: 400 } {
	return {
		response: {
			error: "Invalid knowledge layer",
			code: API_ERROR_CODES.VALIDATION_ERROR,
		},
		status: 400,
	};
}

/**
 * Emit a knowledge_updated event via the EventBus.
 * Now properly uses the DomainEvent union since knowledge_updated is a first-class event.
 */
function emitKnowledgeEvent(
	eventBus: EventBus,
	action: string,
	item: Record<string, unknown>,
): void {
	eventBus.emit({
		type: "knowledge_updated",
		streamId: `knowledge:${item.id as string}`,
		itemId: item.id as string,
		action,
		timestamp: Date.now(),
	});
}

/**
 * Create Hono routes for knowledge endpoints.
 */
export function createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — Bounded resource descriptor. Proves the route is mounted
	// (I1 S2). Listing happens via `/:layer`, `/:layer/:id`, and
	// `/search` — each of which scopes the result set.
	// @lore I1 simplification-#2 / architecture-S1: the previous handler
	// returned every knowledge item across every layer, which is
	// unbounded by construction.
	router.get("/", (c) =>
		c.json({
			ok: true,
			resource: "knowledge",
			endpoints: [
				"GET /:layer",
				"GET /:layer/:id",
				"GET /search",
				"POST /:layer",
				"PATCH /:layer/:id",
				"POST /:layer/:id/merge",
				"POST /:layer/:id/split",
				"POST /:layer/:id/archive",
				"POST /:layer/:id/flag",
			],
		}),
	);

	// GET /search — FTS search across all knowledge items
	// Must be registered before /:layer to avoid route conflict
	router.get("/search", (c) => {
		const query = c.req.query("q");
		if (!query || query.trim() === "") {
			const response: ApiErrorResponse = {
				error: "Query parameter 'q' is required",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		// I2 V4: escape LIKE wildcards (%, _, \) so the user's literal
		// query characters do not turn into SQL pattern operators. The
		// `ESCAPE '\\'` clause must be passed through Drizzle's `sql`
		// template tag because the `like()` helper does not expose the
		// SQLite ESCAPE modifier.
		const pattern = `%${escapeLikePattern(query)}%`;
		const results = db
			.select()
			.from(knowledgeItems)
			.where(
				and(
					or(
						sql`${knowledgeItems.title} LIKE ${pattern} ESCAPE '\\'`,
						sql`${knowledgeItems.body} LIKE ${pattern} ESCAPE '\\'`,
						sql`${knowledgeItems.topic} LIKE ${pattern} ESCAPE '\\'`,
					),
				),
			)
			.all();

		return c.json({ results });
	});

	// GET /:layer — list by layer, grouped by topic, kind
	router.get("/:layer", (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const items = db.select().from(knowledgeItems).where(eq(knowledgeItems.layer, layer)).all();

		// Group by topic -> kind
		const groups: Record<string, Record<string, typeof items>> = {};
		for (const item of items) {
			const topic = item.topic ?? "_uncategorized";
			if (!groups[topic]) {
				groups[topic] = {};
			}
			if (!groups[topic][item.kind]) {
				groups[topic][item.kind] = [];
			}
			groups[topic][item.kind].push(item);
		}

		return c.json({ layer, groups });
	});

	// GET /:layer/:id — single item
	router.get("/:layer/:id", (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const id = c.req.param("id");

		const item = db
			.select()
			.from(knowledgeItems)
			.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.layer, layer)))
			.get();

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		return c.json(item);
	});

	// POST /:layer — create (version=1)
	router.post("/:layer", validateBody(createKnowledgeSchema), (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const body = c.req.valid("json" as never) as z.infer<typeof createKnowledgeSchema>;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(knowledgeItems)
			.values({
				id,
				layer,
				scopeId: body.scopeId ?? null,
				kind: body.kind,
				topic: body.topic ?? null,
				title: body.title,
				body: body.body,
				format: body.format,
				status: body.status ?? "captured",
				confidence: body.confidence ?? null,
				version: 1,
				updatedBy: body.updatedBy,
				createdAt: now,
				updatedAt: now,
				meta: body.meta ?? null,
			})
			.run();

		const created = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		emitKnowledgeEvent(eventBus, "created", created as unknown as Record<string, unknown>);
		return c.json(created, 201);
	});

	// PATCH /:layer/:id — update (optimistic locking)
	router.patch("/:layer/:id", validateBody(updateKnowledgeSchema), (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateKnowledgeSchema>;

		const existing = db
			.select()
			.from(knowledgeItems)
			.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.layer, layer)))
			.get();

		if (!existing) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Optimistic locking: check version
		if (existing.version !== body.version) {
			const response: ApiErrorResponse = {
				error: `Version conflict: expected ${body.version}, current is ${existing.version}`,
				code: API_ERROR_CODES.CONFLICT,
				details: { currentVersion: existing.version },
			};
			return c.json(response, 409);
		}

		const now = new Date().toISOString();

		// Track changes for edit log
		const updatableFields = [
			"title",
			"body",
			"topic",
			"kind",
			"format",
			"status",
			"confidence",
			"meta",
		] as const;
		type UpdatableField = (typeof updatableFields)[number];

		for (const field of updatableFields) {
			const newValue = body[field as keyof typeof body];
			if (newValue !== undefined) {
				const oldValue = existing[field as UpdatableField];
				const oldStr = oldValue != null ? String(oldValue) : null;
				const newStr = String(newValue);
				if (oldStr !== newStr) {
					db.insert(knowledgeEditLog)
						.values({
							id: crypto.randomUUID(),
							itemId: id,
							editor: body.updatedBy,
							field,
							oldValue: oldStr,
							newValue: newStr,
							editType: "update",
							createdAt: now,
						})
						.run();
				}
			}
		}

		// Build update object
		const updates: Record<string, unknown> = {
			version: existing.version + 1,
			updatedBy: body.updatedBy,
			updatedAt: now,
		};

		if (body.title !== undefined) updates.title = body.title;
		if (body.body !== undefined) updates.body = body.body;
		if (body.topic !== undefined) updates.topic = body.topic;
		if (body.kind !== undefined) updates.kind = body.kind;
		if (body.format !== undefined) updates.format = body.format;
		if (body.status !== undefined) updates.status = body.status;
		if (body.confidence !== undefined) updates.confidence = body.confidence;
		if (body.meta !== undefined) updates.meta = body.meta;

		db.update(knowledgeItems).set(updates).where(eq(knowledgeItems.id, id)).run();

		const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		emitKnowledgeEvent(eventBus, "updated", updated as unknown as Record<string, unknown>);
		return c.json(updated);
	});

	// POST /:layer/:id/merge — merge two items
	router.post("/:layer/:id/merge", validateBody(mergeSchema), (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const targetId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof mergeSchema>;

		const target = db
			.select()
			.from(knowledgeItems)
			.where(and(eq(knowledgeItems.id, targetId), eq(knowledgeItems.layer, layer)))
			.get();

		if (!target) {
			const response: ApiErrorResponse = {
				error: "Target knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const source = db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, body.sourceId))
			.get();

		if (!source) {
			const response: ApiErrorResponse = {
				error: "Source knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const now = new Date().toISOString();
		const mergedBody = `${target.body}\n\n---\n\n${source.body}`;

		// Update target with merged body
		db.update(knowledgeItems)
			.set({
				body: mergedBody,
				version: target.version + 1,
				updatedBy: body.updatedBy,
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, targetId))
			.run();

		// Archive source
		db.update(knowledgeItems)
			.set({
				status: "archived",
				updatedBy: body.updatedBy,
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, body.sourceId))
			.run();

		// Edit log for merge
		db.insert(knowledgeEditLog)
			.values({
				id: crypto.randomUUID(),
				itemId: targetId,
				editor: body.updatedBy,
				field: "body",
				oldValue: target.body,
				newValue: mergedBody,
				editType: "merge",
				createdAt: now,
			})
			.run();

		db.insert(knowledgeEditLog)
			.values({
				id: crypto.randomUUID(),
				itemId: body.sourceId,
				editor: body.updatedBy,
				field: "status",
				oldValue: source.status,
				newValue: "archived",
				editType: "merge",
				createdAt: now,
			})
			.run();

		const merged = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, targetId)).get();
		emitKnowledgeEvent(eventBus, "merged", merged as unknown as Record<string, unknown>);
		return c.json(merged);
	});

	// POST /:layer/:id/split — split into two
	router.post("/:layer/:id/split", validateBody(splitSchema), (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof splitSchema>;

		const original = db
			.select()
			.from(knowledgeItems)
			.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.layer, layer)))
			.get();

		if (!original) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const now = new Date().toISOString();
		const createdItems: unknown[] = [];

		for (const newItem of body.newItems) {
			const newId = crypto.randomUUID();
			db.insert(knowledgeItems)
				.values({
					id: newId,
					layer,
					scopeId: original.scopeId,
					kind: newItem.kind,
					topic: newItem.topic ?? original.topic,
					title: newItem.title,
					body: newItem.body,
					format: original.format,
					status: "captured",
					version: 1,
					updatedBy: body.updatedBy,
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const created = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, newId)).get();
			createdItems.push(created);
		}

		// Archive original
		db.update(knowledgeItems)
			.set({
				status: "archived",
				updatedBy: body.updatedBy,
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, id))
			.run();

		// Edit log
		db.insert(knowledgeEditLog)
			.values({
				id: crypto.randomUUID(),
				itemId: id,
				editor: body.updatedBy,
				field: "status",
				oldValue: original.status,
				newValue: "archived",
				editType: "split",
				createdAt: now,
			})
			.run();

		emitKnowledgeEvent(eventBus, "split", { id, items: createdItems });
		return c.json({ items: createdItems });
	});

	// POST /:layer/:id/archive — archive
	router.post("/:layer/:id/archive", (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const id = c.req.param("id");

		const item = db
			.select()
			.from(knowledgeItems)
			.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.layer, layer)))
			.get();

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const now = new Date().toISOString();
		db.update(knowledgeItems)
			.set({
				status: "archived",
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, id))
			.run();

		// Edit log
		db.insert(knowledgeEditLog)
			.values({
				id: crypto.randomUUID(),
				itemId: id,
				editor: item.updatedBy,
				field: "status",
				oldValue: item.status,
				newValue: "archived",
				editType: "archive",
				createdAt: now,
			})
			.run();

		const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		emitKnowledgeEvent(eventBus, "archived", updated as unknown as Record<string, unknown>);
		return c.json(updated);
	});

	// POST /:layer/:id/flag — flag for review
	router.post("/:layer/:id/flag", validateBody(flagSchema), (c) => {
		const layer = parseLayer(c.req.param("layer"));
		if (!layer) {
			const { response, status } = invalidLayerResponse();
			return c.json(response, status);
		}
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof flagSchema>;

		const item = db
			.select()
			.from(knowledgeItems)
			.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.layer, layer)))
			.get();

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const now = new Date().toISOString();
		db.update(knowledgeItems)
			.set({
				status: "provisional",
				attentionScore: 100,
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, id))
			.run();

		// Edit log — include flag reason
		db.insert(knowledgeEditLog)
			.values({
				id: crypto.randomUUID(),
				itemId: id,
				editor: item.updatedBy,
				field: "status",
				oldValue: item.status,
				newValue: `provisional (reason: ${body.reason})`,
				editType: "flag",
				createdAt: now,
			})
			.run();

		const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		emitKnowledgeEvent(eventBus, "flagged", updated as unknown as Record<string, unknown>);
		return c.json(updated);
	});

	return router;
}
