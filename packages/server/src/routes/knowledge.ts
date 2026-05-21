/**
 * O2: Knowledge routes rewritten for kernel purity.
 *
 * URL shape simplified from /:layer/... to /:id and /.
 * Layer guard, createRelevanceService, and computeSignals removed.
 * Events emitted per-route using the typed event interfaces.
 * Status simplified to draft | active | archived.
 *
 * @lore O2: The layer-based URL scheme was a strategy concern embedded in
 * the kernel API. Removing it (along with layer/scopeId/kind columns on
 * knowledgeItems) keeps the kernel pure. Strategy layers compute their
 * signals in the fabric and write to knowledgeStrategyFabric.
 */
import {
	type HyperIdleDb,
	knowledgeAccessLog,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
} from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	type EventBus,
	type KnowledgeAccessedEvent,
	type KnowledgeArchivedEvent,
	type KnowledgeCreatedEvent,
	type KnowledgeUpdatedEvent,
} from "@hyperidle/shared";
import { and, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { validateBody } from "../middleware/validate.js";
import { escapeLikePattern } from "../services/like-escape.js";

// O2: status simplified to draft | active | archived
const KNOWLEDGE_STATUSES = ["draft", "active", "archived"] as const;
type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

const createKnowledgeSchema = z.object({
	topic: z.string().optional(),
	title: z.string(),
	body: z.string(),
	format: z.string(),
	updatedBy: z.string(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
});

const updateKnowledgeSchema = z.object({
	version: z.number(),
	updatedBy: z.string(),
	title: z.string().optional(),
	body: z.string().optional(),
	topic: z.string().optional(),
	format: z.string().optional(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
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
 * Create Hono routes for knowledge endpoints.
 * O2: routes use /:id URL shape (no layer prefix).
 */
export function createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// I2 review M-4 / HIGH-5: cap query length so an attacker cannot
	// drive a long full-table LIKE scan with a 1 MiB query string.
	const SEARCH_QUERY_SCHEMA = z.string().min(1).max(500);

	// GET /search — FTS search across all knowledge items
	// Must be registered before /:id to avoid route conflict
	router.get("/search", (c) => {
		const rawQuery = c.req.query("q");
		const parsed = SEARCH_QUERY_SCHEMA.safeParse(rawQuery?.trim());
		if (!parsed.success) {
			const response: ApiErrorResponse = {
				error: "Query parameter 'q' is required (1–500 chars)",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		const query = parsed.data;

		// I2 V4: escape LIKE wildcards (%, _, \) so the user's literal
		// query characters do not turn into SQL pattern operators.
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

	// GET / — list all items with LEFT JOIN to knowledgeStrategyFabric for pre-computed signals.
	// Also computes L22 signals (accessCount30d, lastActivityAt) from knowledgeAccessLog.
	// @lore O2: Kernel route queries strategy extension + access-log tables —
	// pragmatic boundary compromise to avoid a second round-trip from the fabric.
	router.get("/", (c) => {
		const rawItems = db
			.select({
				item: knowledgeItems,
				fabricId: knowledgeStrategyFabric.id,
				relevanceScore: knowledgeStrategyFabric.relevanceScore,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeStrategyFabric,
				eq(knowledgeStrategyFabric.knowledgeItemId, knowledgeItems.id),
			)
			.all();

		// L22: compute access signals per item from the access log.
		// 30-day window relative to now.
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

		const items = rawItems.map(({ item, relevanceScore }) => {
			const accessRows = db
				.select()
				.from(knowledgeAccessLog)
				.where(
					and(
						eq(knowledgeAccessLog.itemId, item.id),
						sql`${knowledgeAccessLog.accessedAt} >= ${thirtyDaysAgo}`,
					),
				)
				.all();

			const accessCount30d = accessRows.length > 0 ? accessRows.length : null;
			const lastActivityAt =
				accessRows.length > 0
					? accessRows.reduce(
							(latest, r) => (r.accessedAt > latest ? r.accessedAt : latest),
							accessRows[0]?.accessedAt ?? "",
						)
					: null;

			return {
				...item,
				signals: {
					lastActivityAt,
					accessCount30d,
					citationCount: null, // AC-3: citation staged — always null in L22
					relevanceScore: relevanceScore ?? null,
				},
			};
		});

		return c.json({ items });
	});

	// GET /:id — single item, emit knowledge_accessed event
	router.get("/:id", async (c) => {
		const id = c.req.param("id");

		const item = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// L22: append access-log row (best-effort — never break the read)
		// @lore O2: accessor_kind defaults to "human" for browser-initiated reads.
		try {
			db.insert(knowledgeAccessLog)
				.values({
					id: crypto.randomUUID(),
					itemId: item.id,
					accessorKind: "human",
					accessorId: "browser",
					accessedAt: new Date().toISOString(),
				})
				.run();
		} catch {
			// best-effort — do not surface access-log INSERT failures to the caller
		}

		// O2: emit knowledge_accessed event (replaces inline recomputeScores call)
		const accessedEvent: KnowledgeAccessedEvent = {
			type: "knowledge_accessed",
			streamId: `knowledge:${item.id}`,
			itemId: item.id,
			accessorKind: "human",
			accessorId: "browser",
			timestamp: Date.now(),
		};
		eventBus.emit(accessedEvent);

		return c.json(item);
	});

	// POST / — create (version=1), status defaults to "draft"
	router.post("/", validateBody(createKnowledgeSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createKnowledgeSchema>;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(knowledgeItems)
			.values({
				id,
				topic: body.topic ?? null,
				title: body.title,
				body: body.body,
				format: body.format,
				// O2: default status is "draft" (was "captured" in old implementation)
				status: (body.status ?? "draft") as KnowledgeStatus,
				version: 1,
				updatedBy: body.updatedBy,
				createdAt: now,
				updatedAt: now,
			})
			.run();

		const created = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		// O2: emit knowledge_created event
		const createdEvent: KnowledgeCreatedEvent = {
			type: "knowledge_created",
			streamId: `knowledge:${id}`,
			itemId: id,
			timestamp: Date.now(),
		};
		eventBus.emit(createdEvent);

		return c.json(created, 201);
	});

	// PATCH /:id — update (optimistic locking)
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: knowledge PATCH handler validates version and diff fields in one route
	router.patch("/:id", validateBody(updateKnowledgeSchema), (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateKnowledgeSchema>;

		const existing = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

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

		// Track changes for edit log (O2: removed kind, confidence, meta fields)
		const updatableFields = ["title", "body", "topic", "format", "status"] as const;
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
		if (body.format !== undefined) updates.format = body.format;
		if (body.status !== undefined) updates.status = body.status;

		db.update(knowledgeItems).set(updates).where(eq(knowledgeItems.id, id)).run();

		const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		// O2: emit knowledge_updated event
		const updatedEvent: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: `knowledge:${id}`,
			itemId: id,
			action: "updated",
			timestamp: Date.now(),
		};
		eventBus.emit(updatedEvent);

		return c.json(updated);
	});

	// POST /:id/merge — merge two items
	router.post("/:id/merge", validateBody(mergeSchema), (c) => {
		const targetId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof mergeSchema>;

		const target = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, targetId)).get();

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

		// O2: emit knowledge_updated event for merge
		const mergedEvent: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: `knowledge:${targetId}`,
			itemId: targetId,
			action: "merged",
			timestamp: Date.now(),
		};
		eventBus.emit(mergedEvent);

		return c.json(merged);
	});

	// POST /:id/split — split into two or more items
	router.post("/:id/split", validateBody(splitSchema), (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof splitSchema>;

		const original = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

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
					topic: newItem.topic ?? original.topic,
					title: newItem.title,
					body: newItem.body,
					format: original.format,
					// O2 reviewer finding: split handler must set status: "draft"
					status: "draft",
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

		// O2: emit knowledge_updated event for split
		const splitEvent: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: `knowledge:${id}`,
			itemId: id,
			action: "split",
			timestamp: Date.now(),
		};
		eventBus.emit(splitEvent);

		return c.json({ items: createdItems });
	});

	// POST /:id/archive — archive item, emit knowledge_archived event
	router.post("/:id/archive", (c) => {
		const id = c.req.param("id");

		const item = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

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

		// O2: emit knowledge_archived event (distinct from knowledge_updated)
		const archivedEvent: KnowledgeArchivedEvent = {
			type: "knowledge_archived",
			streamId: `knowledge:${id}`,
			itemId: id,
			timestamp: Date.now(),
		};
		eventBus.emit(archivedEvent);

		return c.json(updated);
	});

	// POST /:id/flag — flag for review, emit knowledge_updated with action "flagged"
	// O2: removed attentionScore write (column stripped from kernel table)
	router.post("/:id/flag", validateBody(flagSchema), (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof flagSchema>;

		const item = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const now = new Date().toISOString();
		// O2: no attentionScore write (column stripped). Flag is recorded in the edit log.
		db.update(knowledgeItems).set({ updatedAt: now }).where(eq(knowledgeItems.id, id)).run();

		// Edit log — include flag reason
		db.insert(knowledgeEditLog)
			.values({
				id: crypto.randomUUID(),
				itemId: id,
				editor: item.updatedBy,
				field: "status",
				oldValue: item.status,
				newValue: `flagged (reason: ${body.reason})`,
				editType: "flag",
				createdAt: now,
			})
			.run();

		const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		// O2: emit knowledge_updated with action "flagged"
		const flaggedEvent: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: `knowledge:${id}`,
			itemId: id,
			action: "flagged",
			timestamp: Date.now(),
		};
		eventBus.emit(flaggedEvent);

		return c.json(updated);
	});

	return router;
}
