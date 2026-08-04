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
 * scopeToLayer() from @hyperidle/shared maps scope_kind to projection layer.
 * The assignment is done inline (not via event) so the projection row is immediately
 * visible to the caller — this is a pragmatic boundary compromise per the Q2 lore.
 */

import { resolveInjectedConnectionsForAgent } from "@hyperidle/connections";
import { insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { getFilesystem, resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import {
	remove as archiveKnowledgeItem,
	countAccesses,
	count as countKnowledgeItems,
	create as createKnowledgeItem,
	findOpenConflict as findOpenKnowledgeConflict,
	get as getKnowledgeItem,
	ItemDeletedError,
	transition as knowledgeTransition,
	list as listKnowledgeItems,
	recomputeAttention,
	recordAccess as recordKnowledgeAccess,
	recordConflict as recordKnowledgeConflict,
	resolveKnowledgeActionRequest,
	search as searchKnowledge,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
import { getTeam, getTeamMembers, listTeamMembers } from "@hyperidle/org";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type { ApiErrorResponse } from "@hyperidle/shared";
import {
	type AgentWorkIntentEvent,
	API_ERROR_CODES,
	type EventBus,
	KNOWLEDGE_LAYERS,
	type KnowledgeAccessedEvent,
	type KnowledgeArchivedEvent,
	type KnowledgeCreatedEvent,
	type KnowledgeUpdatedEvent,
	roleLabel,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	scopeKindToLabel,
	scopeToLayer,
} from "@hyperidle/shared";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { resolveOrCreateKnowledgeCallingThread } from "../services/calling-thread-bindings.js";

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
 * - filesystem → derived repo/folder/source label from filesystems.resourceRef
 *
 * Every fallback is scopeKindToLabel(kind) from @hyperidle/shared — single source of truth.
 * Never returns a raw UUID.
 *
 * @lore AV3: Promoted scopeKindToLabel to @hyperidle/shared so server fallback === web fallback.
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
		// @lore AV3 U1: scopeId may be teams.id or team_members.id.
		// Try teams first (direct id). On miss, try team_members then teams.
		const teamRow = await getTeam(db, { id: scopeId });
		if (teamRow?.name) return teamRow.name;

		// Two-hop: scopeId is a team_members.id — find the teamId, then look up teams.name.
		const memberRow = await getTeamMembers(db, { id: scopeId });
		if (memberRow?.teamId) {
			const teamFromMember = await getTeam(db, { id: memberRow.teamId });
			if (teamFromMember?.name) return teamFromMember.name;
		}

		return scopeKindToLabel("team");
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

	if (scopeKind === "filesystem") {
		// @lore AV3 A2: filesystems table has no name column. Compose display name from resourceRef.
		// For code kind: last path segment of repo (e.g. "owner/nimmly" → "nimmly").
		// For doc_set kind: basename of folder (last non-empty path segment).
		// On parse failure or empty result: fall back to a source label map, then "Filesystem".
		const row = await getFilesystem(db, scopeId);

		if (!row) return scopeKindToLabel("filesystem");

		try {
			const ref = JSON.parse(row.resourceRef) as Record<string, unknown>;
			if (ref.kind === "code" && typeof ref.repo === "string" && ref.repo) {
				const segments = ref.repo.split("/").filter((s) => s.length > 0);
				const leaf = segments[segments.length - 1];
				if (leaf) return leaf;
			}
			if (ref.kind === "doc_set" && typeof ref.folder === "string" && ref.folder) {
				const segments = ref.folder.split("/").filter((s) => s.length > 0);
				const basename = segments[segments.length - 1];
				if (basename) return basename;
			}
		} catch {
			// resourceRef parse failed — fall through to source label
		}

		// Source label fallback map
		const SOURCE_LABELS: Record<string, string> = {
			github: "GitHub",
			gdrive: "Google Drive",
			obsidian: "Obsidian",
			local: "Local",
		};
		return SOURCE_LABELS[row.source] ?? row.source ?? scopeKindToLabel("filesystem");
	}

	// Unknown scopeKind — safe fallback.
	return scopeKindToLabel(scopeKind);
}

/**
 * Q2: Scope kinds that require a scopeId from the caller.
 * factory and user auto-assign their scope from context — no external id needed.
 * Defined once in @hyperidle/shared; imported here for the server-side guard.
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
	agentId: z.string().optional(),
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
	const createReviewItemForKnowledge = createReviewItem({
		conversation: { insertThread },
		work: { createItem: (exec, values) => work.create(exec, "item", values) },
	});
	const result = await recomputeAttention(
		{
			db,
			eventBus,
			work: {
				findItemByReasoningMarker: async (exec: WriteExecutor, marker: string) => {
					const rows = await work.list(exec, "item", { marker });
					return rows[0] ? { id: rows[0].id } : undefined;
				},
			},
			review: { createReviewItemForKnowledge, attentionReviewReasoningMarker },
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

	// I2 review M-4 / HIGH-5: cap query length so an attacker cannot
	// drive a long full-table LIKE scan with a 1 MiB query string.
	const SEARCH_QUERY_SCHEMA = z.string().min(1).max(500);

	// GET /search — FTS search across all knowledge items
	// Must be registered before /:id to avoid route conflict
	router.get("/search", requireBoundary({ kind: "public-data" }), async (c) => {
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

		// AU21 §9 Increment 2 (knowledge wave): optional `limit` query param —
		// `query_practice`'s seam call needs `limit*5` (client-side layer filter
		// downstream). Absent/invalid `limit` falls back to search()'s own default.
		const rawLimit = c.req.query("limit");
		const parsedLimit = rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : undefined;
		const limit =
			parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
				? parsedLimit
				: undefined;

		// @lore AU20 K1-reads: searchByText() deleted; search(mode:'text') performs
		// ILIKE on title/body/topic (same result set, case-insensitive improvement).
		// See knowledge-repository.ts search() docblock.
		const results = await searchKnowledge(db, query, {
			mode: "text",
			...(limit !== undefined ? { limit } : {}),
		});

		return c.json({ results });
	});

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
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const userId = c.get("userId");

		// @lore AU14 round 2: item + projection LEFT JOIN, Q2 filter, and the L22
		// access-signal aggregation all moved into the repository's
		// listVisibleWithSignals — see knowledge-repository.ts §6.
		const rows = await listKnowledgeItems(db, { visibleWithSignals: userId });

		const items = rows.map(
			({ item, relevanceScore, attentionScore, accessCount30d, lastActivityAt }) => ({
				...item,
				signals: {
					lastActivityAt,
					accessCount30d,
					citationCount: null, // AC-3: citation staged — always null in L22
					relevanceScore: relevanceScore ?? null,
					// Y4: attentionScore stored as text in DB, parse to number in API response
					attentionScore: attentionScore ? Number.parseFloat(attentionScore) : null,
				},
			}),
		);

		return c.json({ items });
	});

	// GET /triage-count — count of draft + needs_human items visible to the requesting user.
	// Y4: lightweight endpoint for the sidebar badge.
	// Must be registered before /:id to avoid route conflict.
	// @lore Y4: The filter mirrors GET / user-scope visibility: include item if scope_kind != 'user'
	// OR updatedBy = userId. This ensures private items from other users don't inflate the count.
	router.get("/triage-count", requireBoundary({ kind: "public-data" }), async (c) => {
		const userId = c.get("userId");
		const count = await countKnowledgeItems(db, { triageVisible: userId });
		return c.json({ count });
	});

	// GET /:id — single item, emit knowledge_accessed event
	// Q2: returns 404 for user-scoped items not authored by the requesting user.
	// AF13 §5: accessCount (30-day window) computed BEFORE the best-effort access-log
	// insert so the current page-load is NOT counted (WARNING 1 from architecture-critique).
	// AF13 §5: relatedItems computed as same-topic items visible to the requesting user,
	// capped at 10, null-topic → [] (WARNING 2 from architecture-critique).
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");
		const userId = c.get("userId");

		// @lore AU14 round 2: kernel row + projection LEFT JOIN moved into the
		// repository's findDetailById. Q2 stays a route-side 404 decision (§5).
		const row = await getKnowledgeItem(db, id, { view: "detail" });

		if (!row) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const { item } = row;

		// Q2: user-scoped items are private — return 404 (not 403) to avoid leaking existence.
		if (item.scopeKind === "user" && item.updatedBy !== userId) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		// AF13 §5 WARNING 1: Count access-log rows STRICTLY BEFORE the insert so the
		// current page-load is not counted. accessCount reflects historical accesses only.
		// @lore AF13: Order matters: count → insert. Swapping would produce N+1 counts.
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		const accessCount = await countAccesses(db, { itemId: item.id, since: thirtyDaysAgo });

		// AF13 §5 WARNING 2: relatedItems — same-topic items visible to this user, capped at 10.
		// null-topic → [] (no topic match means no related items).
		// User-scope filter: exclude other users' private (user-scoped) items.
		let relatedItems: Array<{ id: string; title: string }> = [];
		if (item.topic !== null) {
			relatedItems = await listKnowledgeItems(db, {
				relatedByTopic: {
					topic: item.topic,
					excludeId: item.id,
					viewerUserId: userId,
					limit: 10,
				},
			});
		}

		// L22: append access-log row (best-effort — never break the read)
		// @lore O2: accessor_kind defaults to "human" for browser-initiated reads.
		// @lore AF13: INSERT happens AFTER the count query so accessCount excludes own load.
		try {
			await recordKnowledgeAccess(db, {
				itemId: item.id,
				accessorKind: "human",
				accessorId: "browser",
				accessedAt: new Date().toISOString(),
			});
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

		// AV3: resolve scopeName — response-only derived field, never persisted.
		const scopeName = await resolveScopeName(db, item.scopeKind, item.scopeId);

		return c.json({
			...item,
			kind: row.kind ?? undefined,
			layer: row.layer ?? undefined,
			confidence: row.confidence ? Number.parseFloat(row.confidence) : undefined,
			// AF13 §5: computed metadata fields
			accessCount,
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
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		validateBody(createKnowledgeSchema),
		async (c) => {
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
		},
	);

	// PATCH /:id/scope — Q2: change scope_kind and scope_id with version tracking.
	// Bumps version, logs change in knowledgeEditLog, updates app projection layer.
	router.patch(
		"/:id/scope",
		requireBoundary({ kind: "public-data" }),
		validateBody(changeScopeSchema),
		async (c) => {
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
		},
	);

	// PATCH /:id — update (optimistic locking)
	// @lore AU14: routes through the shared repository's versioned update() instead of
	// a manual per-field edit-log loop + raw db.update. Pre-checks (404/409) stay so the
	// common-path response body is unchanged; the try/catch below is belt-and-suspenders
	// for a TOCTOU race between the pre-check and the repo's own transactional recheck.
	router.patch(
		"/:id",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateKnowledgeSchema),
		async (c) => {
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
		},
	);

	// POST /:id/merge — merge two items
	router.post(
		"/:id/merge",
		requireBoundary({ kind: "public-data" }),
		validateBody(mergeSchema),
		async (c) => {
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

			// @lore AU20 K2-writes: mergeItems folded into transition({target:"merge"}).
			const merged = await knowledgeTransition(db, target.id, {
				target: "merge",
				sourceId: source.id,
				updatedBy: body.updatedBy,
			});

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
		},
	);

	// POST /:id/split — split into two or more items
	router.post(
		"/:id/split",
		requireBoundary({ kind: "public-data" }),
		validateBody(splitSchema),
		async (c) => {
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

			// @lore AU20 K2-writes: splitItem folded into transition({target:"split"}).
			const createdItems = await knowledgeTransition(db, original.id, {
				target: "split",
				newItems: body.newItems,
				updatedBy: body.updatedBy,
			});

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
		},
	);

	// POST /:id/archive — archive item, emit knowledge_archived event
	router.post("/:id/archive", requireBoundary({ kind: "public-data" }), async (c) => {
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

	// POST /:id/flag — flag for review, emit knowledge_updated with action "flagged"
	// O2: removed attentionScore write (column stripped from kernel table)
	router.post(
		"/:id/flag",
		requireBoundary({ kind: "public-data" }),
		validateBody(flagSchema),
		async (c) => {
			const id = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof flagSchema>;

			const item = await getKnowledgeItem(db, id);

			if (!item) {
				const response: ApiErrorResponse = {
					error: "Knowledge item not found",
					code: API_ERROR_CODES.NOT_FOUND,
				};
				return c.json(response, 404);
			}

			if (body.agentId) {
				const agent = await findUser(db, { id: body.agentId });
				if (!agent) {
					const response: ApiErrorResponse = {
						error: "Agent not found",
						code: API_ERROR_CODES.NOT_FOUND,
					};
					return c.json(response, 404);
				}
			}

			// O2: no attentionScore write (column stripped). Flag is recorded in the edit log.
			// Status set to "draft" so flagged items re-enter the review queue.
			// @lore AU20 K2-writes: flagItem folded into transition({target:"flag"}).
			// transition() fetches the item internally by id — no need to pass `item`.
			const editId = crypto.randomUUID();
			let intent: Awaited<ReturnType<typeof enqueueWorkIntent>> | undefined;
			await db.transaction(async (tx) => {
				await knowledgeTransition(tx as HyperIdleDb, item.id, {
					target: "flag",
					reason: body.reason,
					editId,
				});
				if (body.agentId) {
					// AU21 §6 Decision B: resolve + validate the knowledge_action run
					// AT EMIT TIME (this Service's own domain state, plus the shared
					// ast-<userId> runnability invariant) and bake the full request
					// onto the intent — the drain dispatches it directly, with zero
					// domain reads.
					//
					// @lore AU21 knowledge_action wave: the resolved target is the
					// item's own `updatedBy` (whoever last touched it), NOT the
					// flagging `agentId` — it can be a non-agent id (e.g. a human
					// editor). Under the pre-migration drain-time model this never
					// blocked the flag itself (resolution ran later, async, and a
					// failure there was silent — only the eventual
					// `agent_run_admission_failed` reaction fired). Resolving earlier
					// must not newly gate the flag write on that outcome, so a
					// resolution failure here is caught: the flag still commits, the
					// intent is still recorded (unbaked, exactly the pre-migration
					// shape), and it fails at drain immediately (zero domain reads,
					// `default` case) — routing to the same knowledge_action
					// admission-failure reaction (a review-flagged item) the
					// pre-migration path already produced for this case.
					let bakedRequest: Awaited<ReturnType<typeof resolveKnowledgeActionRequest>> | undefined;
					try {
						bakedRequest = await resolveKnowledgeActionRequest(
							tx as HyperIdleDb,
							`knowledge:${id}`,
							{
								requireRunnableAgent,
								readServerConfig,
								resolveInjectedFilesystemsForAgent,
								// AU21 §9 Increment 12 follow-up part 2 (F2 gap closure —
								// connections): also bake injectedConnections.
								resolveInjectedConnectionsForAgent: (execDb, agentId) =>
									resolveInjectedConnectionsForAgent(execDb, agentId, findUser),
								// AU27: also bake callingThreadId — the knowledge item's own
								// hostKind:"knowledge_item" thread, so a knowledge_action
								// session's `reply` tool has somewhere real to post.
								resolveOrCreateCallingThread: resolveOrCreateKnowledgeCallingThread,
							},
						);
					} catch {
						bakedRequest = undefined;
					}
					intent = await enqueueWorkIntent(tx as HyperIdleDb, {
						kind: "knowledge_action",
						sourceKind: "knowledge_action",
						sourceId: `knowledge:${id}`,
						requestedBy: body.agentId,
						idempotencyKey: `knowledge:${id}:review:${editId}`,
						bakedRequest,
					});
				}
			});

			const updated = await getKnowledgeItem(db, id);

			// O2: emit knowledge_updated with action "flagged"
			const flaggedEvent: KnowledgeUpdatedEvent = {
				type: "knowledge_updated",
				streamId: `knowledge:${id}`,
				itemId: id,
				action: "flagged",
				timestamp: Date.now(),
			};
			eventBus.emit(flaggedEvent);

			if (body.agentId && intent) {
				eventBus.emit({
					type: "agent_work_intent_recorded",
					streamId: `knowledge:${id}`,
					intentId: intent.id,
					intentKind: "knowledge_action",
					sourceKind: "knowledge",
					sourceId: `knowledge:${id}`,
					idempotencyKey: intent.idempotencyKey,
					timestamp: Date.now(),
				} satisfies AgentWorkIntentEvent);
			}

			return c.json(updated);
		},
	);

	// AU21 §9 Increment 2 (knowledge wave): the four routes below back
	// `ToolHandlersKnowledgeAccessor`'s conflict/promote/attention methods —
	// no existing UI route wraps any of these, so each is new and narrow.

	// GET /:id/conflicts?proposedBy= — find an open conflict on :id filed by proposedBy.
	router.get("/:id/conflicts", requireBoundary({ kind: "public-data" }), async (c) => {
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
	router.post(
		"/:id/conflicts",
		requireBoundary({ kind: "public-data" }),
		validateBody(createConflictSchema),
		async (c) => {
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
		},
	);

	// POST /:id/promote — wraps transition({target:"promote",...}); no route wrapped this before.
	router.post(
		"/:id/promote",
		requireBoundary({ kind: "public-data" }),
		validateBody(promoteSchema),
		async (c) => {
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
		},
	);

	// PATCH /:id/attention-score — wraps transition({target:"recomputeAttention",...}).
	router.patch(
		"/:id/attention-score",
		requireBoundary({ kind: "public-data" }),
		validateBody(attentionScoreSchema),
		async (c) => {
			const id = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof attentionScoreSchema>;

			await knowledgeTransition(db, id, {
				target: "recomputeAttention",
				attentionScore: Number(body.attentionScore),
			});

			return c.json({ ok: true });
		},
	);

	// POST /:id/recompute-attention — the collapsed score_attention(mode:"recompute") helper.
	router.post("/:id/recompute-attention", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");
		const result = await recomputeAttentionScoreForKnowledgeItem(db, eventBus, id);
		return c.json(result);
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
/**
 * @lore U2: renamed from createTeamsRoutes to createTeamMembersRoutes.
 * Route relocated from /api/teams to /api/team-members to free up /api/teams
 * for the domain entity (Team, formerly Product). See U2 architecture §3.1.
 */
export function createTeamMembersRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// Row 11: GET /api/team-members — P (host-scope team listing)
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const allTeamMembers = await listTeamMembers(db);
		const rows = allTeamMembers.map((t) => ({
			id: t.id,
			teamId: t.teamId,
			capacity: t.capacity,
			activeBets: t.activeBets,
			formedAt: t.formedAt,
			dissolvedAt: t.dissolvedAt,
		}));

		return c.json({ teams: rows });
	});

	return router;
}
