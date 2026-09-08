/**
 * O2: Knowledge routes rewritten for kernel purity.
 * Q2: scope_kind + scope_id fields added to creation, list, and detail endpoints.
 *     User-scoped items filtered by userId at GET / and GET /:id.
 *
 * Scope is edited through `PATCH /:id` like every other field. The separate
 * `PATCH /:id/scope` endpoint is DELETED: it demanded a `reason` that was
 * concatenated into an edit-log value and read by nothing, and it wrote the
 * kernel scopeId while the generic update wrote the projection's — two writers,
 * two tables, free to disagree.
 *
 * URL shape simplified from /:layer/... to /:id and /.
 * Layer guard, createRelevanceService, and computeSignals removed.
 * Events emitted per-route using the typed event interfaces.
 *
 * @lore nested-knowledge-items: `layer`/`kind`/`topic` and the `product`/
 * `practice` scope kinds are DELETED — a knowledge item's place in the tree
 * says what it is about now; `scope` says only who sees it. `parentKind`/
 * `parentId` are accepted on create, and `PATCH /:id` routes a
 * parentKind+parentId body through `reparent()` (the tree invariants) rather
 * than the generic field-diff `update()`. The `relatedItems` (Backlinks)
 * card becomes children ∪ siblings — the topic-match query it used is gone
 * with `topic`.
 */

import { findThread, insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import {
	API_ERROR_CODES,
	KNOWLEDGE_ROLES,
	KNOWLEDGE_STATUSES,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	scopeKindToLabel,
} from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type {
	EventBus,
	KnowledgeAccessedEvent,
	KnowledgeArchivedEvent,
	KnowledgeCreatedEvent,
	KnowledgeUpdatedEvent,
} from "@hyperidle/event-bus";
import {
	remove as archiveKnowledgeItem,
	count as countKnowledgeItems,
	create as createKnowledgeItem,
	findOpenConflict as findOpenKnowledgeConflict,
	GraduationNotAllowedError,
	get as getKnowledgeItem,
	graduate as graduateKnowledgeItem,
	ItemDeletedError,
	transition as knowledgeTransition,
	list as listKnowledgeItems,
	recomputeAttention,
	recordConflict as recordKnowledgeConflict,
	reparent as reparentKnowledgeItem,
	sweep as runKnowledgeSweep,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { markDetached } from "@hyperidle/settings";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";

const KNOWLEDGE_PARENT_KINDS = ["knowledge_item", "task", "thread", "routine", "agent"] as const;

/**
 * Resolve a knowledge item's scopeId to a human-readable scope name.
 * Response-only derived field — never persisted (AV3 contract).
 *
 * Resolution map (per AV3 §1 table, narrowed to the surviving scope kinds):
 * - factory → "Factory" (literal, no query)
 * - user    → users.name (missing → "Private" via scopeKindToLabel)
 * - team    → teams.name by direct id (missing → "Team")
 *
 * Every fallback is scopeKindToLabel(kind) — single source of truth. Never
 * returns a raw UUID.
 *
 * @lore nested-knowledge-items: the `product`/`practice`/`bet`/`task`/
 * `filesystem` branches are DELETED with the scope kinds themselves.
 */
export async function resolveScopeName(
	db: HyperIdleDb,
	scopeKind: string,
	scopeId: string | null,
): Promise<string> {
	// factory always resolves to "Factory" — NOT routed through scopeKindToLabel
	// (which would return "Shared"); factory is a deliberate override.
	if (scopeKind === "factory") return "Factory";

	// All remaining kinds need a scopeId to look anything up.
	if (!scopeId) return scopeKindToLabel(scopeKind);

	if (scopeKind === "user") {
		const row = await findUser(db, { id: scopeId });
		return row?.name ?? scopeKindToLabel("user");
	}

	if (scopeKind === "team") {
		const teamRow = await getTeam(db, { id: scopeId });
		return teamRow?.name ?? scopeKindToLabel("team");
	}

	// Unknown scopeKind — safe fallback.
	return scopeKindToLabel(scopeKind);
}

/**
 * Q2: Scope kinds that require a scopeId from the caller.
 * factory and user auto-assign their scope from context — no external id needed.
 * Defined once in @hyperidle/domain-model; imported here for the server-side guard.
 */
function requiresScopeId(kind: string): boolean {
	return SCOPES_REQUIRING_ID.has(kind as Parameters<typeof SCOPES_REQUIRING_ID.has>[0]);
}

/**
 * The parent kinds a client may name at creation time. A deliberate subset of
 * `KNOWLEDGE_PARENT_KINDS` — see `createKnowledgeSchema.parentKind`.
 *
 * @lore rebase-onto-#547 correction: an earlier pass on this rebase widened
 * `createKnowledgeSchema.parentKind` to the full `KNOWLEDGE_PARENT_KINDS`,
 * reasoning from this WP's own final branch state. `knowledge.parent.
 * integration.test.ts` (also merged from #547) proved that wrong — it pins,
 * as a real tested contract, that a client naming `knowledge_item`/`routine`/
 * `agent` gets a 400, and that a named `task`/`thread` must exist (checked
 * via `parentExists`, the owning service). No caller in this WP — UI or
 * test — creates with `parentKind: "knowledge_item"` through this route
 * (nesting a NEW item under an existing one happens via `PATCH` → `reparent()`
 * after creation, not at create time), so restoring the narrower, tested
 * contract costs this WP nothing. `updateKnowledgeSchema.parentKind` below
 * stays on the full `KNOWLEDGE_PARENT_KINDS` — moving an item INTO the tree
 * via PATCH is this WP's own real feature and untouched by that test file.
 */
const CLIENT_WRITABLE_PARENT_KINDS = ["task", "thread"] as const;
type ClientWritableParentKind = (typeof CLIENT_WRITABLE_PARENT_KINDS)[number];

/**
 * Confirm a named parent actually exists, asking the service that OWNS its
 * table rather than reading that table here — `work` for a task,
 * `conversation` for a thread. Both are already imported by this route, so
 * this costs no new dependency.
 *
 * The slot carries no foreign key (it points at five tables), so this check is
 * the only thing standing between a typo and a knowledge item hanging off
 * nothing.
 */
async function parentExists(
	db: HyperIdleDb,
	kind: ClientWritableParentKind,
	id: string,
): Promise<boolean> {
	if (kind === "task") {
		return (await work.get(db, "task", id)) !== undefined;
	}
	return (await findThread(db, { id })) !== undefined;
}

const createKnowledgeSchema = z.object({
	title: z.string(),
	body: z.string(),
	format: z.string(),
	updatedBy: z.string(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
	// Q2: scope fields
	scopeKind: z.enum(SCOPE_KINDS),
	// AU21 §9 Increment 2 (knowledge wave): widened to accept an explicit `null`
	// alongside `undefined` — `write_memory`'s seam call passes `scopeId: null`
	// for scopes it resolves to no external id (e.g. "factory"), unlike the
	// pre-existing UI caller which simply omits the field.
	scopeId: z.string().nullable().optional(),
	/**
	 * The document's role — what context assembly does with it. Absent means
	 * `ordinary`, which is the column default and what every existing caller
	 * has always produced.
	 */
	role: z.enum(KNOWLEDGE_ROLES).optional(),
	/**
	 * Where a produced item hangs at creation time. Only `task` and `thread`
	 * are accepted from a client (`CLIENT_WRITABLE_PARENT_KINDS` above) — the
	 * other three `KNOWLEDGE_PARENT_KINDS` (`knowledge_item`, `routine`,
	 * `agent`) are written exclusively by core-api's own routes, which already
	 * hold the parent row for other reasons. Nesting a new item directly under
	 * an existing tree node is a create-then-`PATCH`-reparent, not a single
	 * create call — see `updateKnowledgeSchema.parentKind` below.
	 */
	parentKind: z.enum(CLIENT_WRITABLE_PARENT_KINDS).optional(),
	parentId: z.string().optional(),
});

const updateKnowledgeSchema = z.object({
	version: z.number(),
	updatedBy: z.string(),
	title: z.string().optional(),
	body: z.string().optional(),
	format: z.string().optional(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
	/**
	 * Scope is a field on the document like any other. It had its own endpoint
	 * demanding a `reason`, which was concatenated into an edit-log value and
	 * read by nothing; that endpoint and that string are gone. Changing scope
	 * alongside content is now one edit under one version bump instead of two
	 * round trips that can half-fail.
	 *
	 * @lore knowledge-attachment-slot: `role` is deliberately NOT in this
	 * schema — it is create-only now (see the create schema's own `role`
	 * field above). `z.object` strips unknown keys, so a PATCH body that
	 * still carries `role` is silently ignored rather than 400ing; the role
	 * a document was created with cannot drift.
	 */
	scopeKind: z.enum(SCOPE_KINDS).optional(),
	scopeId: z.string().nullable().optional(),
	/**
	 * @lore nested-knowledge-items: a move. Both present or neither — routed
	 * through `reparent()`, not the generic field diff, because moving a
	 * knowledge item re-checks the tree invariants (cycle, scope-no-wider,
	 * depth<=32) against LIVE state inside its own transaction.
	 *
	 * @lore nested-knowledge-items defect 2: both `null` together is a move
	 * to the top level (detach to root) — mirrors `ki_parent_pair_ck`'s
	 * both-or-neither pairing, now including "neither" as an explicit value
	 * rather than only "field absent".
	 */
	parentKind: z.enum(KNOWLEDGE_PARENT_KINDS).nullable().optional(),
	parentId: z.string().nullable().optional(),
});

// BA9d: agent-reachable merge/split doors (recovered from AU44 scope breach,
// see .pipeline/work/AU44/FEATURE-LEDGER.md rows 58-59 and founder D9).
const mergeSchema = z.object({
	sourceId: z.string().min(1),
	updatedBy: z.string().min(1),
});

const splitSchema = z.object({
	newItems: z
		.array(
			z.object({
				title: z.string().min(1),
				body: z.string().min(1),
			}),
		)
		.min(2),
	updatedBy: z.string().min(1),
});

/**
 * AU21 §9 Increment 2 (knowledge wave) — schemas for the four new narrow
 * routes backing `ToolHandlersKnowledgeAccessor`'s conflict/promote/attention
 * methods (no existing UI route wraps any of these transition targets today).
 */
const createConflictSchema = z.object({
	id: z.string().min(1),
	versionBase: z.number().int().nonnegative(),
	versionCurrent: z.number().int().nonnegative(),
	proposedBody: z.string().min(1),
	proposedMeta: z.string().nullable().optional(),
	proposedBy: z.string().min(1),
	createdAt: z.string().min(1),
});

const promoteSchema = z.object({
	fromStatus: z.string().min(1),
	toStatus: z.string().min(1),
	reason: z.string().optional(),
	editor: z.string().min(1),
});

const attentionScoreSchema = z.object({
	attentionScore: z.string().min(1),
});

/**
 * Collapses `buildCreateReviewItemForKnowledge({conversation,work})` +
 * `buildAttentionService({db,eventBus,work,review}).recomputeOne(id)` — the
 * exact same composition `dispatch-bindings.ts`'s own
 * `recomputeAttentionForCandidates` and (pre-migration)
 * `tool-handlers-bindings.ts`'s own `recomputeAttentionScoreForItem` already
 * perform, now wired inside core-api behind a real HTTP door instead of a
 * raw same-process DI call reaching across a Service boundary.
 */
async function recomputeAttentionScoreForKnowledgeItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	knowledgeItemId: string,
): Promise<{ readonly current: number }> {
	const result = await recomputeAttention(
		{
			db,
			eventBus,
			work: {
				findItemByReasoningMarker: async (exec: WriteExecutor, marker: string) => {
					const rows = await work.list(exec, "item", { marker });
					return rows[0] ? { id: rows[0].id } : undefined;
				},
				createItem: (exec, values) => work.create(exec, "item", values),
			},
			conversation: { insertThread },
		},
		{ itemId: knowledgeItemId },
	);
	if (Array.isArray(result) || !("current" in result))
		throw new Error("unexpected attention result");
	return result;
}

/**
 * Create Hono routes for knowledge endpoints.
 * Q2: upgraded to Hono<HyperIdleEnv> to read userId from auth middleware.
 */
export function createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — list all items with LEFT JOIN to knowledgeAppProjection for pre-computed signals.
	// Q2: user-scoped items filtered: only visible to their author (updatedBy = userId).
	// @lore O2: Kernel route queries app projection + access-log tables —
	// pragmatic boundary compromise to avoid a second round-trip from the projection.
	// @lore Q2: The filter is: include item if scope_kind != 'user' OR updatedBy = userId.
	// Using 404 (not 403) for unauthorized access prevents leaking existence.
	router.get("/", async (c) => {
		const userId = c.get("userId");
		const parentKind = c.req.query("parentKind");
		const parentId = c.req.query("parentId");

		// AC4/AC5: when parentKind+parentId are provided, return only items for that
		// parent. Both must be present — one without the other is a malformed request.
		if (parentKind !== undefined || parentId !== undefined) {
			if (!(parentKind && parentId)) {
				return c.json(
					{ error: "parentKind and parentId must both be provided", code: "INVALID_QUERY" },
					400,
				);
			}
			if (parentKind !== "task" && parentKind !== "thread") {
				return c.json({ error: "parentKind must be task or thread", code: "INVALID_QUERY" }, 400);
			}
			const rows = await listKnowledgeItems(db, { byParent: { parentKind, parentId } });
			const items = rows.map((item) => ({
				...item,
				attentionScore: item.attentionScore ? Number.parseFloat(item.attentionScore) : null,
			}));
			return c.json({ items });
		}

		// @lore AU14 round 2: item + projection LEFT JOIN, Q2 filter, and the L22
		// access-signal aggregation all moved into the repository's
		// listVisibleWithSignals — see knowledge-repository.ts §6.
		// @lore AU44 batch 4: L22 signals (accessCount30d, lastActivityAt etc.) removed per
		// FULL-AUDIT.md row 13. attentionScore (PLUGIN-owned, still in schema) is parsed from
		// the stored text to a number here — same as the detail route does for confidence.
		// @lore nested-knowledge-items: visibleWithSignals returns the whole tree
		// (root + knowledge_item-parented rows) — a task/thread-parented produced
		// item is excluded and fetched separately via ?parentKind+parentId.
		const rows = await listKnowledgeItems(db, { visibleWithSignals: userId });
		const items = rows.map((item) => ({
			...item,
			attentionScore: item.attentionScore ? Number.parseFloat(item.attentionScore) : null,
		}));

		return c.json({ items });
	});

	// GET /triage-count — count of proposed items visible to the requesting user.
	// Y4: lightweight endpoint for the sidebar badge.
	// Must be registered before /:id to avoid route conflict.
	router.get("/triage-count", async (c) => {
		const userId = c.get("userId");
		const count = await countKnowledgeItems(db, { triageVisible: userId });
		return c.json({ count });
	});

	// GET /:id — single item, emit knowledge_accessed event
	// Q2: returns 404 for user-scoped items not authored by the requesting user.
	// @lore nested-knowledge-items: `relatedItems` (Backlinks) is now children
	// ∪ siblings — the tree answers "what is near this" instead of a shared
	// topic string. `children` is the ordered list this item's own children,
	// for the detail page's "a parent renders its children" surface.
	router.get("/:id", async (c) => {
		const id = c.req.param("id");
		const userId = c.get("userId");

		const row = await getKnowledgeItem(db, id, { view: "full" });

		if (!row) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Q2: a person's private note is private — 404 (not 403) so its existence
		// does not leak. An `agent_file`/`skill`/`rule` with user scope is a
		// BINDING to an agent, not a private note: it is ordinary team knowledge,
		// and this endpoint is the only place its identity can be edited.
		if (row.scopeKind === "user" && row.role === "ordinary" && row.updatedBy !== userId) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const [relatedItems, children] = await Promise.all([
			listKnowledgeItems(db, {
				childrenAndSiblings: { itemId: row.id, viewerUserId: userId, limit: 10 },
			}),
			listKnowledgeItems(db, { childrenOf: { parentId: row.id } }),
		]);

		// O2: emit knowledge_accessed event
		const accessedEvent: KnowledgeAccessedEvent = {
			type: "knowledge_accessed",
			streamId: `knowledge:${row.id}`,
			itemId: row.id,
			accessorKind: "human",
			accessorId: "browser",
			timestamp: Date.now(),
		};
		eventBus.emit(accessedEvent);

		// AV3: resolve scopeName — response-only derived field, never persisted.
		const scopeName = await resolveScopeName(db, row.scopeKind, row.scopeId);

		return c.json({
			...row,
			confidence: row.confidence ? Number.parseFloat(row.confidence) : undefined,
			relatedItems,
			children,
			// AV3: resolved human-readable scope name (response-only, never persisted)
			scopeName,
		});
	});

	// POST / — create (version=1), status defaults to "proposed"
	// Q2: scopeKind required. scopeId required for team.
	//     factory and user scopes need no external scopeId.
	//     user scope auto-fills scopeId from userId.
	router.post("/", validateBody(createKnowledgeSchema), async (c) => {
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

		if ((body.parentKind === undefined) !== (body.parentId === undefined)) {
			const response: ApiErrorResponse = {
				error: "parentKind and parentId must both be present or both be absent",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		if (body.parentKind !== undefined && body.parentId !== undefined) {
			if (!(await parentExists(db, body.parentKind, body.parentId))) {
				const response: ApiErrorResponse = {
					error: `no ${body.parentKind} with id '${body.parentId}'`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
		}

		// Q2: user scope auto-fills scopeId from userId (private to the requesting user).
		const resolvedScopeId =
			body.scopeKind === "user" ? (body.scopeId ?? userId) : (body.scopeId ?? null);

		const created = await createKnowledgeItem(db, {
			scopeKind: body.scopeKind,
			scopeId: resolvedScopeId,
			title: body.title,
			body: body.body,
			format: body.format,
			// Default status is "proposed" — the ladder's starting point.
			status: body.status ?? "proposed",
			role: body.role,
			...(body.parentKind ? { parentKind: body.parentKind, parentId: body.parentId } : {}),
			updatedBy: body.updatedBy,
		});

		// Response shape preserved: re-select the raw kernel row (not the repo's
		// KnowledgeItemWithProjection, which carries extra projection fields) so the
		// 201 body stays byte-identical to pre-AU14.
		const row = await getKnowledgeItem(db, created.id);

		// O2: emit knowledge_created event
		const createdEvent: KnowledgeCreatedEvent = {
			type: "knowledge_created",
			streamId: `knowledge:${created.id}`,
			itemId: created.id,
			timestamp: Date.now(),
		};
		eventBus.emit(createdEvent);

		return c.json(row, 201);
	});

	// PATCH /:id — update (optimistic locking)
	// @lore nested-knowledge-items: a body carrying both `parentKind` and
	// `parentId` is a MOVE — it routes through `reparent()` (tree invariants,
	// its own transaction), not the generic field-diff `update()`. Any other
	// field in the same body is applied first via `update()`, then the move.
	// @lore nested-knowledge-items defect 2: both `null` together is a move
	// to the top level (detach to root) — `reparent()` still runs, its
	// invariants are simply vacuous for a root.
	router.patch("/:id", validateBody(updateKnowledgeSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateKnowledgeSchema>;

		const existing = await getKnowledgeItem(db, id);

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

		// The guard the deleted `/scope` route carried: a scope that names an
		// external entity needs that entity's id.
		if (body.scopeKind !== undefined && requiresScopeId(body.scopeKind) && !body.scopeId) {
			const response: ApiErrorResponse = {
				error: `scopeId is required for scopeKind '${body.scopeKind}'`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		// @lore nested-knowledge-items defect 2: `undefined` means "no move in
		// this PATCH"; `null` means "move to the top level" (detach to root).
		// Both fields must carry the same one of the three states — absent,
		// null, or a same-kind string — never a mix.
		if ((body.parentKind === undefined) !== (body.parentId === undefined)) {
			const response: ApiErrorResponse = {
				error: "parentKind and parentId must both be present or both be absent",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		if (body.parentKind !== undefined && (body.parentKind === null) !== (body.parentId === null)) {
			const response: ApiErrorResponse = {
				error: "parentKind and parentId must both be null (a move to the top level) or both be set",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		try {
			await updateKnowledgeItem(
				db,
				id,
				{
					title: body.title,
					body: body.body,
					format: body.format,
					status: body.status,
					scopeKind: body.scopeKind,
					scopeId: body.scopeId,
					updatedBy: body.updatedBy,
				},
				body.version,
			);
			if (body.parentKind !== undefined && body.parentId !== undefined) {
				await reparentKnowledgeItem(db, id, {
					parentKind: body.parentKind,
					parentId: body.parentId,
					updatedBy: body.updatedBy,
				});
			}
		} catch (error) {
			if (error instanceof VersionConflictError) {
				const response: ApiErrorResponse = {
					error: `Version conflict: expected ${body.version}, current is ${error.currentVersion}`,
					code: API_ERROR_CODES.CONFLICT,
					details: { currentVersion: error.currentVersion },
				};
				return c.json(response, 409);
			}
			if (error instanceof ItemDeletedError) {
				const response: ApiErrorResponse = {
					error: "Knowledge item not found",
					code: API_ERROR_CODES.NOT_FOUND,
				};
				return c.json(response, 404);
			}
			throw error;
		}

		// @lore BA9g: a plugin-contributed document a person edits becomes theirs,
		// so a reinstall leaves their version alone (D5: your edit wins) and the
		// plugin's contributions view says which rows they have taken over. The
		// route is the legal bridge — knowledge does not know about plugins, and
		// the plugin service does not write `knowledge_items`.
		//
		// This replaces `updated_by <> 'plugin:<id>'`, which carried the same
		// meaning and was never read by anything.
		if (body.body !== undefined) {
			await markDetached(db, { kind: "knowledge", entityId: id, ts: new Date().toISOString() });
		}

		const updated = await getKnowledgeItem(db, id);

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

	// POST /:id/merge — merge source item into target; source is archived.
	// @lore BA9d D9: restored from AU44 scope breach (rows 58-59 of FEATURE-LEDGER.md).
	router.post("/:id/merge", validateBody(mergeSchema), async (c) => {
		const targetId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof mergeSchema>;

		const target = await getKnowledgeItem(db, targetId);
		if (!target) {
			const response: ApiErrorResponse = {
				error: "Target knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const source = await getKnowledgeItem(db, body.sourceId);
		if (!source) {
			const response: ApiErrorResponse = {
				error: "Source knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const merged = await knowledgeTransition(db, target.id, {
			target: "merge",
			sourceId: source.id,
			updatedBy: body.updatedBy,
		});

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

	// POST /:id/split — split item into two or more new items; original is archived.
	// @lore BA9d D9: restored from AU44 scope breach (rows 58-59 of FEATURE-LEDGER.md).
	router.post("/:id/split", validateBody(splitSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof splitSchema>;

		const original = await getKnowledgeItem(db, id);
		if (!original) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const createdItems = await knowledgeTransition(db, original.id, {
			target: "split",
			newItems: body.newItems,
			updatedBy: body.updatedBy,
		});

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
	router.post("/:id/archive", async (c) => {
		const id = c.req.param("id");

		const item = await getKnowledgeItem(db, id);

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// @lore AU14 round 2: exact write sequence (status→archived, NO version bump,
		// NO updatedBy rewrite, one `editType:"archive"` edit-log row) moved into the
		// repository's remove (archiveItem) — see knowledge-repository.ts §7c.
		const updated = await archiveKnowledgeItem(db, item);

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

	// AU21 §9 Increment 2 (knowledge wave): the four routes below back
	// `ToolHandlersKnowledgeAccessor`'s conflict/promote/attention methods —
	// no existing UI route wraps any of these, so each is new and narrow.

	// GET /:id/conflicts?proposedBy= — find an open conflict on :id filed by proposedBy.
	router.get("/:id/conflicts", async (c) => {
		const id = c.req.param("id");
		const proposedBy = c.req.query("proposedBy");
		if (!proposedBy) {
			const response: ApiErrorResponse = {
				error: "Query parameter 'proposedBy' is required",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		const conflict = await findOpenKnowledgeConflict(db, id, proposedBy);
		return c.json({ conflict });
	});

	// POST /:id/conflicts — record an open knowledge_conflicts row on :id.
	router.post("/:id/conflicts", validateBody(createConflictSchema), async (c) => {
		const itemId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof createConflictSchema>;

		await recordKnowledgeConflict(db, {
			id: body.id,
			itemId,
			versionBase: body.versionBase,
			versionCurrent: body.versionCurrent,
			proposedBody: body.proposedBody,
			proposedMeta: body.proposedMeta ?? null,
			proposedBy: body.proposedBy,
			createdAt: body.createdAt,
		});

		return c.json({ id: body.id, itemId, status: "open" as const }, 201);
	});

	// POST /:id/promote — wraps transition({target:"promote",...}); no route wrapped this before.
	router.post("/:id/promote", validateBody(promoteSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof promoteSchema>;

		const result = await knowledgeTransition(db, id, {
			target: "promote",
			fromStatus: body.fromStatus,
			toStatus: body.toStatus,
			reason: body.reason,
			editor: body.editor,
		});

		// The domain result (ok:true|false) is forwarded as-is at HTTP 200 —
		// a domain-level "blocked" outcome is not a transport/validation failure.
		return c.json(result);
	});

	// PATCH /:id/attention-score — wraps transition({target:"recomputeAttention",...}).
	router.patch("/:id/attention-score", validateBody(attentionScoreSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof attentionScoreSchema>;

		await knowledgeTransition(db, id, {
			target: "recomputeAttention",
			attentionScore: Number(body.attentionScore),
		});

		return c.json({ ok: true });
	});

	// POST /:id/recompute-attention — the collapsed score_attention(mode:"recompute") helper.
	router.post("/:id/recompute-attention", async (c) => {
		const id = c.req.param("id");
		const result = await recomputeAttentionScoreForKnowledgeItem(db, eventBus, id);
		return c.json(result);
	});

	// POST /:id/graduate — narrow transition that moves a produced item into the knowledge tree.
	//
	// Only allowed when:
	//   - role is `ordinary` (skills/rules/prompts/agent_files cannot be reparented here)
	//   - current parentKind is `task` or `thread` (that is what "produced item" means)
	//   - newParentId names an existing knowledge item, or is absent (top of tree)
	//   - item cannot graduate onto itself
	//
	// @lore graduation: this is the one path that writes parentKind/parentId after
	// create, and it is deliberately narrow. The generic PATCH omits parent so a
	// person cannot repoint a routine prompt or an agent identity. This endpoint
	// carries its own preconditions to preserve that guarantee.
	const graduateSchema = z.object({
		version: z.number().int().positive(),
		updatedBy: z.string().min(1),
		newParentKind: z.literal("knowledge_item").optional(),
		newParentId: z.string().min(1).optional(),
	});
	router.post("/:id/graduate", validateBody(graduateSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof graduateSchema>;

		const existing = await getKnowledgeItem(db, id);
		if (!existing) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Optimistic locking: early check so the error message is specific.
		if (existing.version !== body.version) {
			const response: ApiErrorResponse = {
				error: `Version conflict: expected ${body.version}, current is ${existing.version}`,
				code: API_ERROR_CODES.CONFLICT,
				details: { currentVersion: existing.version },
			};
			return c.json(response, 409);
		}

		// Both-or-neither: a kind with no id is ambiguous, an id with no kind is too.
		if ((body.newParentKind === undefined) !== (body.newParentId === undefined)) {
			const response: ApiErrorResponse = {
				error: "newParentKind and newParentId must be given together",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		// When a knowledge-item parent is named, it must exist.
		if (body.newParentKind === "knowledge_item" && body.newParentId !== undefined) {
			const target = await getKnowledgeItem(db, body.newParentId);
			if (!target) {
				const response: ApiErrorResponse = {
					error: `no knowledge_item with id '${body.newParentId}'`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
		}

		try {
			const updated = await graduateKnowledgeItem(
				db,
				id,
				{
					newParentKind: body.newParentKind ?? null,
					newParentId: body.newParentId ?? null,
					updatedBy: body.updatedBy,
				},
				body.version,
			);
			return c.json(updated);
		} catch (error) {
			if (error instanceof GraduationNotAllowedError) {
				const response: ApiErrorResponse = {
					error: error.reason,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			if (error instanceof VersionConflictError) {
				const response: ApiErrorResponse = {
					error: `Version conflict: expected ${body.version}, current is ${error.currentVersion}`,
					code: API_ERROR_CODES.CONFLICT,
					details: { currentVersion: error.currentVersion },
				};
				return c.json(response, 409);
			}
			throw error;
		}
	});

	// POST /sweep — agent-callable knowledge sweep (BA9d: replaces dead builtin routine path).
	// kind="autoPromotion": promote proposed items that meet the repetition threshold.
	// kind="stale": mark active items that have not been referenced recently as stale.
	const sweepBodySchema = z.object({ kind: z.enum(["autoPromotion", "stale"]) });
	router.post("/sweep", validateBody(sweepBodySchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof sweepBodySchema>;
		const result =
			body.kind === "autoPromotion"
				? await runKnowledgeSweep(db, eventBus, "autoPromotion")
				: await runKnowledgeSweep(db, eventBus, "stale", { nowMs: Date.now() });
		const processed = "promotedIds" in result ? result.promotedIds.length : result.markedIds.length;
		return c.json({ kind: body.kind, processed });
	});

	return router;
}
