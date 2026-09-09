import { findThread } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { EventBus, ItemCreatedEvent } from "@hyperidle/event-bus";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";

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

/**
 * @lore AU21 §9 Increment 2: every optional field accepts an explicit
 * `null`, not just absence — `CoreApiPort.work.createItem`
 * (`core-api-port-composition.ts`) forwards `create_item`'s tool input
 * verbatim, which fills unset optional fields with a real `null` (matching
 * this route's own `body.<field> ?? null` normalization below), and
 * `JSON.stringify` serializes an object's `null` properties (unlike
 * `undefined`, which it drops) — the wire body genuinely carries `null`.
 */
const createItemSchema = z.object({
	sourceAgentId: z.string().nullish(),
	verb: z.string().nullish(),
	kind: z.string().nullish(),
	title: z.string().min(1),
	body: z.string().nullish(),
	attachments: z.string().nullish(),
	proposedAction: z.string().nullish(),
	options: z.string().nullish(),
	riskTier: z.enum(["low", "medium", "high"]).nullish(),
	blocking: z.boolean().optional(),
	reasoning: z.string().nullish(),
	threadId: z.string(),
});

/**
 * AU21 §9 Increment 2 — `CoreApiPort.work.updateItemById`'s backing
 * request body. Narrower than `createItemSchema`: only the three fields
 * `score_attention` mutates on an existing item (`route_item` was a second
 * mutator here — AU21 §6 Decision L3 deleted it outright as vestigial).
 */
const updateItemSchema = z.object({
	riskTier: z.enum(["low", "medium", "high"]).optional(),
	kind: z.string().optional(),
	verb: z.string().optional(),
});

/**
 * Create Hono routes for conversation endpoints.
 */
export function createConversationRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// AU21 §9 Increment 2 — `CoreApiPort.work.findItemByReasoningMarker`'s backing
	// route. Registered BEFORE `GET /:threadId` (a single-segment param route)
	// so the literal `/items` segment can never be shadowed by it.
	// GET /items?reasoningMarker=... — search items by a `reasoning` LIKE marker.
	router.get("/items", async (c) => {
		const reasoningMarker = c.req.query("reasoningMarker");
		if (!reasoningMarker) {
			const response: ApiErrorResponse = {
				error: "reasoningMarker query param is required",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		const found = await work.list(db, "item", { marker: reasoningMarker });
		return c.json({ items: found });
	});

	// AU21 §9 Increment 2 — `CoreApiPort.work.getItemById`'s backing route.
	// GET /items/:id — bare item detail (no bare detail route existed before this).
	router.get("/items/:id", async (c) => {
		const id = c.req.param("id");
		const item = await work.get(db, "item", id);
		if (!item) {
			const response: ApiErrorResponse = {
				error: "Item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}
		return c.json(item);
	});

	// AU21 §9 Increment 2 — `CoreApiPort.work.updateItemById`'s backing route.
	// PATCH /items/:id — patch riskTier/kind/verb (used by score_attention;
	// `route_item` was a second caller here — AU21 §6 Decision L3 deleted it
	// outright as vestigial).
	router.patch("/items/:id", validateBody(updateItemSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateItemSchema>;

		const existing = await work.get(db, "item", id);
		if (!existing) {
			const response: ApiErrorResponse = {
				error: "Item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const updates: Partial<{ riskTier: string; kind: string; verb: string }> = {};
		if (body.riskTier !== undefined) updates.riskTier = body.riskTier;
		if (body.kind !== undefined) updates.kind = body.kind;
		if (body.verb !== undefined) updates.verb = body.verb;
		if (Object.keys(updates).length > 0) {
			await work.update(db, "item", id, updates);
		}

		const updated = await work.get(db, "item", id);
		return c.json(updated);
	});

	// Row 10: POST /api/conversations/items — S (principal-self: item created by principal)
	// POST /items — create item
	// O2: routeItem/routeToFounder calls removed; view/founderRoute fields removed from response
	router.post("/items", validateBody(createItemSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createItemSchema>;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		// Verify thread exists
		const thread = await findThread(db, { id: body.threadId });
		if (!thread) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// O2: agents routing logic removed; sourceAgentId stored for audit purposes only
		await work.create(db, "item", {
			id,
			sourceAgentId: body.sourceAgentId ?? null,
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

		const created = await work.get(db, "item", id);

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
