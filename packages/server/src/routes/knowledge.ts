/**
 * O2: Knowledge routes rewritten for kernel purity.
 * Q2: scope_kind + scope_id fields added to creation, list, and detail endpoints.
 *     PATCH /:id/scope endpoint added for scope mutation with version tracking.
 *     User-scoped items filtered by userId at GET / and GET /:id.
 *     Fabric layer assigned (via knowledgeStrategyFabric) on creation and scope change.
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
 *
 * @lore Q2: scope_kind lives on the kernel knowledgeItems table so every item
 * knows where it belongs, regardless of which strategy fabric is active.
 * scopeToLayer() from @hyperidle/fabric maps scope_kind → layer for fabric assignment.
 * The assignment is done inline (not via event) so the fabric row is immediately
 * visible to the caller — this is a pragmatic boundary compromise per the Q2 lore.
 */
import {
	type HyperIdleDb,
	knowledgeAccessLog,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
	// @lore U1: `teamMembers` is the agent membership group (formerly `teams`).
	teamMembers,
} from "@hyperidle/db";
import { scopeToLayer } from "@hyperidle/fabric";
import type { ApiErrorResponse } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	type EventBus,
	type KnowledgeAccessedEvent,
	type KnowledgeArchivedEvent,
	type KnowledgeCreatedEvent,
	type KnowledgeUpdatedEvent,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
} from "@hyperidle/shared";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { escapeLikePattern } from "../services/like-escape.js";

// O2: status simplified to draft | active | archived
const KNOWLEDGE_STATUSES = ["draft", "active", "archived"] as const;

/**
 * Q2: Scope kinds that require a scopeId from the caller.
 * factory and user auto-assign their scope from context — no external id needed.
 * Defined once in @hyperidle/shared; imported here for the server-side guard.
 */
function requiresScopeId(kind: string): boolean {
	return SCOPES_REQUIRING_ID.has(kind as Parameters<typeof SCOPES_REQUIRING_ID.has>[0]);
}

const createKnowledgeSchema = z.object({
	topic: z.string().optional(),
	title: z.string(),
	body: z.string(),
	format: z.string(),
	updatedBy: z.string(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
	// Q2: scope fields
	scopeKind: z.enum(SCOPE_KINDS),
	scopeId: z.string().optional(),
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
 * Q2: Schema for PATCH /:id/scope — change scope_kind and scope_id with version tracking.
 * `reason` is required (min 1 char) so scope changes always have an audit trail.
 */
const changeScopeSchema = z.object({
	scopeKind: z.enum(SCOPE_KINDS),
	scopeId: z.string().optional(),
	reason: z.string().min(1),
	updatedBy: z.string(),
	version: z.number(),
});

/**
 * Write or upsert a knowledgeStrategyFabric row for the given knowledge item.
 * If a fabric row already exists, updates the layer column.
 * If no fabric row exists and layer is non-null, creates one.
 *
 * @lore Q2: Inline fabric assignment is a pragmatic boundary compromise. The
 * caller sees the fabric row immediately without waiting for an event handler.
 * If layer is null (bet/team/user scope), we still create the fabric row but
 * leave layer null — this is consistent with the O2 seed pattern.
 */
function upsertFabricLayer(db: HyperIdleDb, knowledgeItemId: string, scopeKind: string): void {
	const layer = scopeToLayer(
		// Safe cast: scopeKind validated via z.enum(SCOPE_KINDS) before this call.
		scopeKind as (typeof SCOPE_KINDS)[number],
	);

	const existing = db
		.select()
		.from(knowledgeStrategyFabric)
		.where(eq(knowledgeStrategyFabric.knowledgeItemId, knowledgeItemId))
		.get();

	if (existing) {
		db.update(knowledgeStrategyFabric)
			.set({ layer })
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, knowledgeItemId))
			.run();
	} else {
		db.insert(knowledgeStrategyFabric)
			.values({
				id: crypto.randomUUID(),
				knowledgeItemId,
				layer,
			})
			.run();
	}
}

/**
 * Create Hono routes for knowledge endpoints.
 * Q2: upgraded to Hono<HyperIdleEnv> to read userId from auth middleware.
 */
export function createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

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
	// Q2: user-scoped items filtered: only visible to their author (updatedBy = userId).
	// @lore O2: Kernel route queries strategy extension + access-log tables —
	// pragmatic boundary compromise to avoid a second round-trip from the fabric.
	// @lore Q2: The filter is: include item if scope_kind != 'user' OR updatedBy = userId.
	// Using 404 (not 403) for unauthorized access prevents leaking existence.
	router.get("/", (c) => {
		const userId = c.get("userId");

		const rawItems = db
			.select({
				item: knowledgeItems,
				relevanceScore: knowledgeStrategyFabric.relevanceScore,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeStrategyFabric,
				eq(knowledgeStrategyFabric.knowledgeItemId, knowledgeItems.id),
			)
			.where(or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, userId)))
			.all();

		// L22: compute access signals per item from the access log.
		// 30-day window relative to now.
		// @lore O2: Batch all access-log rows in a single query before mapping to avoid
		// N+1 queries (one per item). Group by itemId in application code.
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

		const allAccessRows = db
			.select()
			.from(knowledgeAccessLog)
			.where(sql`${knowledgeAccessLog.accessedAt} >= ${thirtyDaysAgo}`)
			.all();

		// Group access rows by itemId for O(1) lookup in the map below.
		const accessByItem = new Map<string, typeof allAccessRows>();
		for (const row of allAccessRows) {
			const existing = accessByItem.get(row.itemId) ?? [];
			existing.push(row);
			accessByItem.set(row.itemId, existing);
		}

		const items = rawItems.map(({ item, relevanceScore }) => {
			const accessRows = accessByItem.get(item.id) ?? [];

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
	// Q2: returns 404 for user-scoped items not authored by the requesting user.
	router.get("/:id", (c) => {
		const id = c.req.param("id");
		const userId = c.get("userId");

		const item = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Q2: user-scoped items are private — return 404 (not 403) to avoid leaking existence.
		if (item.scopeKind === "user" && item.updatedBy !== userId) {
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
	// Q2: scopeKind required. scopeId required for product/practice/team/bet/task.
	//     factory and user scopes need no external scopeId.
	//     user scope auto-fills scopeId from userId.
	//     Fabric layer assigned inline on creation.
	router.post("/", validateBody(createKnowledgeSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createKnowledgeSchema>;
		const userId = c.get("userId");

		// Q2: scopeId validation — required for scopes that reference an external entity.
		if (requiresScopeId(body.scopeKind) && !body.scopeId) {
			const response: ApiErrorResponse = {
				error: `scopeId is required for scopeKind '${body.scopeKind}'`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		// Q2: user scope auto-fills scopeId from userId (private to the requesting user).
		const resolvedScopeId =
			body.scopeKind === "user" ? (body.scopeId ?? userId) : (body.scopeId ?? null);

		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(knowledgeItems)
			.values({
				id,
				scopeKind: body.scopeKind,
				scopeId: resolvedScopeId,
				topic: body.topic ?? null,
				title: body.title,
				body: body.body,
				format: body.format,
				// O2: default status is "draft" (was "captured" in old implementation)
				status: body.status ?? "draft",
				version: 1,
				updatedBy: body.updatedBy,
				createdAt: now,
				updatedAt: now,
			})
			.run();

		// Q2: assign fabric layer inline on creation.
		upsertFabricLayer(db, id, body.scopeKind);

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

	// PATCH /:id/scope — Q2: change scope_kind and scope_id with version tracking.
	// Bumps version, logs change in knowledgeEditLog, updates fabric layer.
	router.patch("/:id/scope", validateBody(changeScopeSchema), (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof changeScopeSchema>;

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

		// Q2: scopeId validation for the new scope kind
		if (requiresScopeId(body.scopeKind) && !body.scopeId) {
			const response: ApiErrorResponse = {
				error: `scopeId is required for scopeKind '${body.scopeKind}'`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		const now = new Date().toISOString();
		const resolvedScopeId = body.scopeId ?? null;

		// Log scope_kind change to knowledgeEditLog (with reason in newValue)
		if (existing.scopeKind !== body.scopeKind) {
			db.insert(knowledgeEditLog)
				.values({
					id: crypto.randomUUID(),
					itemId: id,
					editor: body.updatedBy,
					field: "scope_kind",
					oldValue: existing.scopeKind,
					newValue: `${body.scopeKind} (reason: ${body.reason})`,
					editType: "scope_change",
					createdAt: now,
				})
				.run();
		}

		// Log scope_id change to knowledgeEditLog if it changed
		if (existing.scopeId !== resolvedScopeId) {
			db.insert(knowledgeEditLog)
				.values({
					id: crypto.randomUUID(),
					itemId: id,
					editor: body.updatedBy,
					field: "scope_id",
					oldValue: existing.scopeId ?? null,
					newValue: resolvedScopeId ?? null,
					editType: "scope_change",
					createdAt: now,
				})
				.run();
		}

		db.update(knowledgeItems)
			.set({
				scopeKind: body.scopeKind,
				scopeId: resolvedScopeId,
				version: existing.version + 1,
				updatedBy: body.updatedBy,
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, id))
			.run();

		// Q2: update fabric layer for new scope
		upsertFabricLayer(db, id, body.scopeKind);

		const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		// Emit knowledge_updated event for scope change
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
					scopeKind: original.scopeKind,
					scopeId: original.scopeId,
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

			// Q2: assign fabric layer for split items (inherits parent scope)
			upsertFabricLayer(db, newId, original.scopeKind);

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
		// Status set to "draft" so flagged items re-enter the review queue.
		db.update(knowledgeItems)
			.set({ status: "draft", updatedAt: now })
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

/**
 * Q2 T13: Lightweight GET /api/teams endpoint.
 * Returns team_members rows (agent membership groups) with capacity/activeBets.
 * Used by the KnowledgeCreateDialog to populate the scope selector.
 *
 * @lore U1: Previously selected from old `teams` table (now renamed to `team_members`).
 * Updated to select from `teamMembers` (agent membership group). `productId` column
 * dropped — `teamId` is now the FK to the domain entity.
 */
export function createTeamsRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	router.get("/", (c) => {
		const rows = db
			.select({
				id: teamMembers.id,
				teamId: teamMembers.teamId,
				capacity: teamMembers.capacity,
				activeBets: teamMembers.activeBets,
				formedAt: teamMembers.formedAt,
				dissolvedAt: teamMembers.dissolvedAt,
			})
			.from(teamMembers)
			.all();

		return c.json({ teams: rows });
	});

	return router;
}
