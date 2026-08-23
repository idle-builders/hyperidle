/**
 * O2: Knowledge routes rewritten for kernel purity.
 * Q2: scope_kind + scope_id fields added to creation, list, and detail endpoints.
 *     PATCH /:id/scope endpoint added for scope mutation with version tracking.
 *     User-scoped items filtered by userId at GET / and GET /:id.
 *     App projection layer assigned (via knowledgeAppProjection) on creation and scope change.
 *
 * URL shape simplified from /:layer/... to /:id and /.
 * Layer guard, createRelevanceService, and computeSignals removed.
 * Events emitted per-route using the typed event interfaces.
 * Status simplified to draft | active | archived.
 *
 * @lore O2: The layer-based URL scheme was a strategy concern embedded in
 * the kernel API. Removing it (along with layer/scopeId/kind columns on
 * knowledgeItems) keeps the kernel pure. Strategy layers compute their
 * signals in the projection and write to knowledgeAppProjection.
 *
 * @lore Q2: scope_kind lives on the kernel knowledgeItems table so every item
 * knows where it belongs, regardless of which strategy app projection is used.
 * scopeToLayer() from @hyperidle/domain-model maps scope_kind to projection layer.
 * The assignment is done inline (not via event) so the projection row is immediately
 * visible to the caller — this is a pragmatic boundary compromise per the Q2 lore.
 */

import { insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import {
	API_ERROR_CODES,
	KNOWLEDGE_LAYERS,
	type KnowledgeAccessedEvent,
	type KnowledgeArchivedEvent,
	type KnowledgeCreatedEvent,
	type KnowledgeUpdatedEvent,
	roleLabel,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	scopeToLayer,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { type HyperIdleEnv, validateBody } from "@hyperidle/http-middleware";
import {
	remove as archiveKnowledgeItem,
	count as countKnowledgeItems,
	create as createKnowledgeItem,
	findOpenConflict as findOpenKnowledgeConflict,
	get as getKnowledgeItem,
	ItemDeletedError,
	transition as knowledgeTransition,
	list as listKnowledgeItems,
	recomputeAttention,
	recordConflict as recordKnowledgeConflict,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { scopeKindToLabel } from "@hyperidle/presentation-format";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";

/**
 * @lore AU21 §9 Increment 2 (knowledge wave): the 8 `KNOWLEDGE_KINDS` values
 * are `write_memory`'s own vocabulary (`tool-handlers/src/tool-definitions.ts`)
 * redefined locally here (never imported cross-Service — `@hyperidle/knowledge`'s
 * own `KnowledgeKind` type is intentionally NOT re-exported from its barrel).
 * A `z.enum(...)`-validated value's literal-union type is structurally
 * identical to the private `KnowledgeKind` type without needing to import it —
 * both are simply the same set of string literals.
 */
const KNOWLEDGE_ITEM_KINDS = [
	"pattern",
	"anti_pattern",
	"brief",
	"principle",
	"decision",
	"failure",
	"reflection",
	"focus",
] as const;

// O2: status simplified to draft | active | archived
// Y4: needs_human added for triage escalation
const KNOWLEDGE_STATUSES = ["draft", "active", "archived", "needs_human"] as const;

/**
 * Resolve a knowledge item's scopeId to a human-readable scope name.
 * Response-only derived field — never persisted (AV3 contract).
 *
 * Resolution map (per AV3 §1 table):
 * - factory → "Factory" (literal, no query)
 * - user    → users.name (missing → "Private" via scopeKindToLabel)
 * - team    → teams.name by direct id; two-hop via teamMembers if not found (missing → "Team")
 * - bet     → bets.description truncated at 60 chars (empty/missing → "Shared")
 * - task    → tasks.title (missing → "Shared")
 * - product → no entity table → scopeKindToLabel("product")
 * - practice → roleLabel(scopeId) for agent role ids; empty → scopeKindToLabel("practice")
 *
 * Every fallback is scopeKindToLabel(kind) from @hyperidle/presentation-format — single source of truth.
 * Never returns a raw UUID.
 *
 * @lore AU26 F2 (founder ruling): the `filesystem` branch — the one that read
 * `filesystems.resourceRef` to compose a repo/folder label — is DELETED with
 * the scope kind. It was this route's only `filesystems` touch, and the only
 * core-side use of the record; removing it is what let the record follow its
 * mounting engine into agent-orchestration.
 *
 * @lore AV3: Promoted scopeKindToLabel to @hyperidle/presentation-format so server fallback === web fallback.
 * @lore AV3 U1: team scopeId may be teams.id OR team_members.id (two-hop join). Resolve by
 * querying teams first; on miss query teamMembers then teams on that teamId; on final miss fallback.
 */
export async function resolveScopeName(
	db: HyperIdleDb,
	scopeKind: string,
	scopeId: string | null,
): Promise<string> {
	// factory always resolves to "Factory" — NOT routed through scopeKindToLabel
	// (which would return "Shared"); factory is a deliberate override.
	if (scopeKind === "factory") return "Factory";

	// product has no entity table — fall back immediately.
	if (scopeKind === "product") {
		return scopeKindToLabel(scopeKind);
	}

	// practice: no entity table — resolve scopeId as an agent role id via AGENT_ROLE_CATALOG.
	// @lore AV3 A1: practice scopeId is a role id. roleLabel() returns the catalog label or
	// title-cases the raw role for open-vocab user-defined roles. Empty scopeId → fallback.
	if (scopeKind === "practice") {
		if (!scopeId) return scopeKindToLabel("practice");
		const label = roleLabel(scopeId);
		return label || scopeKindToLabel("practice");
	}

	// All remaining kinds need a scopeId to look anything up.
	if (!scopeId) return scopeKindToLabel(scopeKind);

	if (scopeKind === "user") {
		const row = await findUser(db, { id: scopeId });
		return row?.name ?? scopeKindToLabel("user");
	}

	if (scopeKind === "team") {
		// @lore AU44 B1: after team_members fold, scopeId IS teams.id directly (no two-hop).
		const teamRow = await getTeam(db, { id: scopeId });
		return teamRow?.name ?? scopeKindToLabel("team");
	}

	if (scopeKind === "bet") {
		const row = await work.get(db, "bet", scopeId);
		if (!row) return scopeKindToLabel("bet");
		const desc = row.description?.trim() ?? "";
		if (!desc) return scopeKindToLabel("bet");
		// A5 rule: deterministic 60-char truncation with U+2026 ellipsis.
		return desc.length > 60 ? `${desc.slice(0, 60)}…` : desc;
	}

	if (scopeKind === "task") {
		const row = await work.get(db, "task", scopeId);
		return row?.title ?? scopeKindToLabel("task");
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

const createKnowledgeSchema = z.object({
	// AU21 §9 Increment 2 (knowledge wave): widened to accept an explicit
	// `null` alongside `undefined` — `write_memory`'s seam call always passes
	// `topic: topic ?? null` (never bare `undefined`), unlike the pre-existing
	// UI caller which simply omits the field when unset.
	topic: z.string().nullable().optional(),
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
	// AU21 §9 Increment 2 (knowledge wave): `kind` + an explicit `layer` override
	// — see this file's top `@lore` and CreateKnowledgeItemRequest's own doc
	// comment (api-contract). Both optional so the pre-existing UI caller
	// (never sets either) keeps its exact prior behavior (kind stays null,
	// layer stays derived from scopeToLayer(scopeKind)).
	kind: z.enum(KNOWLEDGE_ITEM_KINDS).optional(),
	layer: z.enum(KNOWLEDGE_LAYERS).optional(),
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
 * Create Hono routes for knowledge endpoints.
 * Q2: upgraded to Hono<HyperIdleEnv> to read userId from auth middleware.
 */
export function createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — list all items with LEFT JOIN to knowledgeAppProjection for pre-computed signals.
	// Also computes L22 signals (accessCount30d, lastActivityAt) from knowledgeAccessLog.
	// Q2: user-scoped items filtered: only visible to their author (updatedBy = userId).
	// @lore O2: Kernel route queries app projection + access-log tables —
	// pragmatic boundary compromise to avoid a second round-trip from the projection.
	// @lore Q2: The filter is: include item if scope_kind != 'user' OR updatedBy = userId.
	// Using 404 (not 403) for unauthorized access prevents leaking existence.
	// @lore AV3: scopeName is NOT resolved here — detail endpoint only (GET /:id). Intentional
	// list carve-out: resolving scopeName per-row would require N+1 DB queries or a batch join
	// for every scope kind (user/team/bet/task). Detail endpoint resolves one item in one call.
	router.get("/", async (c) => {
		const userId = c.get("userId");

		// @lore AU14 round 2: item + projection LEFT JOIN, Q2 filter, and the L22
		// access-signal aggregation all moved into the repository's
		// listVisibleWithSignals — see knowledge-repository.ts §6.
		// @lore AU44 batch 4: L22 signals (accessCount30d, lastActivityAt etc.) removed per
		// FULL-AUDIT.md row 13. attentionScore (PLUGIN-owned, still in schema) is parsed from
		// the stored text to a number here — same as the detail route does for confidence.
		const rows = await listKnowledgeItems(db, { visibleWithSignals: userId });
		const items = rows.map((item) => ({
			...item,
			attentionScore: item.attentionScore ? Number.parseFloat(item.attentionScore) : null,
		}));

		return c.json({ items });
	});

	// GET /triage-count — count of draft + needs_human items visible to the requesting user.
	// Y4: lightweight endpoint for the sidebar badge.
	// Must be registered before /:id to avoid route conflict.
	// @lore Y4: The filter mirrors GET / user-scope visibility: include item if scope_kind != 'user'
	// OR updatedBy = userId. This ensures private items from other users don't inflate the count.
	router.get("/triage-count", async (c) => {
		const userId = c.get("userId");
		const count = await countKnowledgeItems(db, { triageVisible: userId });
		return c.json({ count });
	});

	// GET /:id — single item, emit knowledge_accessed event
	// Q2: returns 404 for user-scoped items not authored by the requesting user.
	// AF13 §5: relatedItems computed as same-topic items visible to the requesting user,
	// capped at 10, null-topic → [] (WARNING 2 from architecture-critique).
	router.get("/:id", async (c) => {
		const id = c.req.param("id");
		const userId = c.get("userId");

		// @lore AU44 batch 4 MERGE row 9: detail→full; after score columns die, two
		// joined views are one. KnowledgeItemWithProjection is the single joined view.
		const row = await getKnowledgeItem(db, id, { view: "full" });

		if (!row) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// Q2: user-scoped items are private — return 404 (not 403) to avoid leaking existence.
		if (row.scopeKind === "user" && row.updatedBy !== userId) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// AF13 §5 WARNING 2: relatedItems — same-topic items visible to this user, capped at 10.
		// null-topic → [] (no topic match means no related items).
		// User-scope filter: exclude other users' private (user-scoped) items.
		let relatedItems: Array<{ id: string; title: string }> = [];
		if (row.topic !== null) {
			relatedItems = await listKnowledgeItems(db, {
				relatedByTopic: {
					topic: row.topic,
					excludeId: row.id,
					viewerUserId: userId,
					limit: 10,
				},
			});
		}

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
			// AV3: resolved human-readable scope name (response-only, never persisted)
			scopeName,
		});
	});

	// POST / — create (version=1), status defaults to "draft"
	// Q2: scopeKind required. scopeId required for product/practice/team/bet/task.
	//     factory and user scopes need no external scopeId.
	//     user scope auto-fills scopeId from userId.
	//     App projection layer assigned inline on creation.
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

		// Q2: user scope auto-fills scopeId from userId (private to the requesting user).
		const resolvedScopeId =
			body.scopeKind === "user" ? (body.scopeId ?? userId) : (body.scopeId ?? null);

		// @lore AU14: routes through the shared repository instead of a raw insert +
		// upsertProjectionLayer. kind is omitted so projection.kind stays null exactly
		// as before; resolvedScopeId is passed so the kernel scopeId (read by Q2/GET
		// filters) is preserved — this also populates projection.scopeId, which was
		// null pre-AU14. That is a deliberate, tested convergence (plan §9 D3), not a
		// regression: route-created scoped items now participate in scope-filtered
		// context assembly / promotion / practice-meeting / attention like tool-created
		// items already do. See plans/AU14/architecture.md §5, §9.
		const created = await createKnowledgeItem(db, {
			// AU21 §9 Increment 2 (knowledge wave): honor an explicit `layer`
			// override when the caller supplies one (write_memory's real call
			// always does); otherwise preserve the pre-existing derivation.
			layer: body.layer ?? scopeToLayer(body.scopeKind),
			scopeKind: body.scopeKind,
			scopeId: resolvedScopeId,
			kind: body.kind ?? null,
			topic: body.topic ?? null,
			title: body.title,
			body: body.body,
			format: body.format,
			// O2: default status is "draft" (was "captured" in old implementation)
			status: body.status ?? "draft",
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

	// PATCH /:id/scope — Q2: change scope_kind and scope_id with version tracking.
	// Bumps version, logs change in knowledgeEditLog, updates app projection layer.
	router.patch("/:id/scope", validateBody(changeScopeSchema), async (c) => {
		const id = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof changeScopeSchema>;

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

		// Q2: scopeId validation for the new scope kind
		if (requiresScopeId(body.scopeKind) && !body.scopeId) {
			const response: ApiErrorResponse = {
				error: `scopeId is required for scopeKind '${body.scopeKind}'`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		// @lore AU20 K2-writes: changeScope folded into transition({target:"changeScope"}).
		// transition() fetches the item internally by id (no need to pass `existing`).
		const updated = await knowledgeTransition(db, id, {
			target: "changeScope",
			scopeKind: body.scopeKind,
			scopeId: body.scopeId ?? null,
			reason: body.reason,
			updatedBy: body.updatedBy,
		});

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
	// @lore AU14: routes through the shared repository's versioned update() instead of
	// a manual per-field edit-log loop + raw db.update. Pre-checks (404/409) stay so the
	// common-path response body is unchanged; the try/catch below is belt-and-suspenders
	// for a TOCTOU race between the pre-check and the repo's own transactional recheck.
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

		try {
			await updateKnowledgeItem(
				db,
				id,
				{
					title: body.title,
					body: body.body,
					topic: body.topic,
					format: body.format,
					status: body.status,
					updatedBy: body.updatedBy,
				},
				body.version,
			);
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

	return router;
}
