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
import {
	bets,
	filesystems,
	type HyperIdleDb,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
	tasks,
	// @lore U1: `teamMembers` is the agent membership group (formerly `teams`).
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	type EventBus,
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
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { escapeLikePattern } from "../services/like-escape.js";
import { createTriggeredAgentSessionRequest } from "../services/trigger-resolution.js";

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
		const [row] = await db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, scopeId))
			.limit(1);
		return row?.name ?? scopeKindToLabel("user");
	}

	if (scopeKind === "team") {
		// @lore AV3 U1: scopeId may be teams.id or team_members.id.
		// Try teams first (direct id). On miss, try team_members then teams.
		const [teamRow] = await db
			.select({ name: teams.name })
			.from(teams)
			.where(eq(teams.id, scopeId))
			.limit(1);
		if (teamRow?.name) return teamRow.name;

		// Two-hop: scopeId is a team_members.id — find the teamId, then look up teams.name.
		const [memberRow] = await db
			.select({ teamId: teamMembers.teamId })
			.from(teamMembers)
			.where(eq(teamMembers.id, scopeId))
			.limit(1);
		if (memberRow?.teamId) {
			const [teamFromMember] = await db
				.select({ name: teams.name })
				.from(teams)
				.where(eq(teams.id, memberRow.teamId))
				.limit(1);
			if (teamFromMember?.name) return teamFromMember.name;
		}

		return scopeKindToLabel("team");
	}

	if (scopeKind === "bet") {
		const [row] = await db
			.select({ description: bets.description })
			.from(bets)
			.where(eq(bets.id, scopeId))
			.limit(1);
		if (!row) return scopeKindToLabel("bet");
		const desc = row.description?.trim() ?? "";
		if (!desc) return scopeKindToLabel("bet");
		// A5 rule: deterministic 60-char truncation with U+2026 ellipsis.
		return desc.length > 60 ? `${desc.slice(0, 60)}…` : desc;
	}

	if (scopeKind === "task") {
		const [row] = await db
			.select({ title: tasks.title })
			.from(tasks)
			.where(eq(tasks.id, scopeId))
			.limit(1);
		return row?.title ?? scopeKindToLabel("task");
	}

	if (scopeKind === "filesystem") {
		// @lore AV3 A2: filesystems table has no name column. Compose display name from resourceRef.
		// For code kind: last path segment of repo (e.g. "owner/nimmly" → "nimmly").
		// For doc_set kind: basename of folder (last non-empty path segment).
		// On parse failure or empty result: fall back to a source label map, then "Filesystem".
		const [row] = await db
			.select({ source: filesystems.source, resourceRef: filesystems.resourceRef })
			.from(filesystems)
			.where(eq(filesystems.id, scopeId))
			.limit(1);

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
	agentId: z.string().optional(),
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
 * Write or upsert a knowledgeAppProjection row for the given knowledge item.
 * If a projection row already exists, updates the layer column.
 * If no projection row exists and layer is non-null, creates one.
 *
 * @lore Q2: Inline app projection assignment is a pragmatic boundary compromise. The
 * caller sees the projection row immediately without waiting for an event handler.
 * If layer is null (bet/team/user scope), we still create the projection row but
 * leave layer null — this is consistent with the O2 seed pattern.
 */
async function upsertProjectionLayer(
	db: HyperIdleDb,
	knowledgeItemId: string,
	scopeKind: string,
): Promise<void> {
	const layer = scopeToLayer(
		// Safe cast: scopeKind validated via z.enum(SCOPE_KINDS) before this call.
		scopeKind as (typeof SCOPE_KINDS)[number],
	);

	const [existing] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);

	if (existing) {
		await db
			.update(knowledgeAppProjection)
			.set({ layer })
			.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId));
	} else {
		await db.insert(knowledgeAppProjection).values({
			id: crypto.randomUUID(),
			knowledgeItemId,
			layer,
		});
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

		// I2 V4: escape LIKE wildcards (%, _, \) so the user's literal
		// query characters do not turn into SQL pattern operators.
		const pattern = `%${escapeLikePattern(query)}%`;
		const results = await db
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
			);

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

		const rawItems = await db
			.select({
				item: knowledgeItems,
				relevanceScore: knowledgeAppProjection.relevanceScore,
				attentionScore: knowledgeAppProjection.attentionScore,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, userId)));

		// L22: compute access signals per item from the access log.
		// 30-day window relative to now.
		// @lore O2: Batch all access-log rows in a single query before mapping to avoid
		// N+1 queries (one per item). Group by itemId in application code.
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

		const allAccessRows = await db
			.select()
			.from(knowledgeAccessLog)
			.where(sql`${knowledgeAccessLog.accessedAt} >= ${thirtyDaysAgo}`);

		// Group access rows by itemId for O(1) lookup in the map below.
		const accessByItem = new Map<string, typeof allAccessRows>();
		for (const row of allAccessRows) {
			const existing = accessByItem.get(row.itemId) ?? [];
			existing.push(row);
			accessByItem.set(row.itemId, existing);
		}

		const items = rawItems.map(({ item, relevanceScore, attentionScore }) => {
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
					// Y4: attentionScore stored as text in DB, parse to number in API response
					attentionScore: attentionScore ? Number.parseFloat(attentionScore) : null,
				},
			};
		});

		return c.json({ items });
	});

	// GET /triage-count — count of draft + needs_human items visible to the requesting user.
	// Y4: lightweight endpoint for the sidebar badge.
	// Must be registered before /:id to avoid route conflict.
	// @lore Y4: The filter mirrors GET / user-scope visibility: include item if scope_kind != 'user'
	// OR updatedBy = userId. This ensures private items from other users don't inflate the count.
	router.get("/triage-count", requireBoundary({ kind: "public-data" }), async (c) => {
		const userId = c.get("userId");
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(knowledgeItems)
			.where(
				and(
					inArray(knowledgeItems.status, ["draft", "needs_human"]),
					or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, userId)),
				),
			);
		return c.json({ count: Number(result?.count ?? 0) });
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

		const [row] = await db
			.select({
				item: knowledgeItems,
				kind: knowledgeAppProjection.kind,
				layer: knowledgeAppProjection.layer,
				confidence: knowledgeAppProjection.confidence,
				relevanceScore: knowledgeAppProjection.relevanceScore,
				attentionScore: knowledgeAppProjection.attentionScore,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(eq(knowledgeItems.id, id))
			.limit(1);

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
		const [accessCountRow] = await db
			.select({ count: sql<number>`count(*)` })
			.from(knowledgeAccessLog)
			.where(
				and(
					eq(knowledgeAccessLog.itemId, item.id),
					sql`${knowledgeAccessLog.accessedAt} >= ${thirtyDaysAgo}`,
				),
			);
		const accessCount = Number(accessCountRow?.count ?? 0);

		// AF13 §5 WARNING 2: relatedItems — same-topic items visible to this user, capped at 10.
		// null-topic → [] (no topic match means no related items).
		// User-scope filter: exclude other users' private (user-scoped) items.
		let relatedItems: Array<{ id: string; title: string }> = [];
		if (item.topic !== null) {
			const relatedRows = await db
				.select({ id: knowledgeItems.id, title: knowledgeItems.title })
				.from(knowledgeItems)
				.where(
					and(
						eq(knowledgeItems.topic, item.topic),
						ne(knowledgeItems.id, item.id),
						// User-scope filter: same as GET / — include if not user-scoped OR author is requester
						or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, userId)),
					),
				)
				.limit(10);
			relatedItems = relatedRows;
		}

		// L22: append access-log row (best-effort — never break the read)
		// @lore O2: accessor_kind defaults to "human" for browser-initiated reads.
		// @lore AF13: INSERT happens AFTER the count query so accessCount excludes own load.
		try {
			await db.insert(knowledgeAccessLog).values({
				id: crypto.randomUUID(),
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

			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			await db.insert(knowledgeItems).values({
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
			});

			// Q2: assign app projection layer inline on creation.
			await upsertProjectionLayer(db, id, body.scopeKind);

			const [created] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

			// O2: emit knowledge_created event
			const createdEvent: KnowledgeCreatedEvent = {
				type: "knowledge_created",
				streamId: `knowledge:${id}`,
				itemId: id,
				timestamp: Date.now(),
			};
			eventBus.emit(createdEvent);

			return c.json(created, 201);
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

			const [existing] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

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
				await db.insert(knowledgeEditLog).values({
					id: crypto.randomUUID(),
					itemId: id,
					editor: body.updatedBy,
					field: "scope_kind",
					oldValue: existing.scopeKind,
					newValue: `${body.scopeKind} (reason: ${body.reason})`,
					editType: "scope_change",
					createdAt: now,
				});
			}

			// Log scope_id change to knowledgeEditLog if it changed
			if (existing.scopeId !== resolvedScopeId) {
				await db.insert(knowledgeEditLog).values({
					id: crypto.randomUUID(),
					itemId: id,
					editor: body.updatedBy,
					field: "scope_id",
					oldValue: existing.scopeId ?? null,
					newValue: resolvedScopeId ?? null,
					editType: "scope_change",
					createdAt: now,
				});
			}

			await db
				.update(knowledgeItems)
				.set({
					scopeKind: body.scopeKind,
					scopeId: resolvedScopeId,
					version: existing.version + 1,
					updatedBy: body.updatedBy,
					updatedAt: now,
				})
				.where(eq(knowledgeItems.id, id));

			// Q2: update app projection layer for new scope
			await upsertProjectionLayer(db, id, body.scopeKind);

			const [updated] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

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
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: knowledge PATCH handler validates version and diff fields in one route
	router.patch(
		"/:id",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateKnowledgeSchema),
		async (c) => {
			const id = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof updateKnowledgeSchema>;

			const [existing] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

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
						await db.insert(knowledgeEditLog).values({
							id: crypto.randomUUID(),
							itemId: id,
							editor: body.updatedBy,
							field,
							oldValue: oldStr,
							newValue: newStr,
							editType: "update",
							createdAt: now,
						});
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

			await db.update(knowledgeItems).set(updates).where(eq(knowledgeItems.id, id));

			const [updated] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

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

			const [target] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, targetId))
				.limit(1);

			if (!target) {
				const response: ApiErrorResponse = {
					error: "Target knowledge item not found",
					code: API_ERROR_CODES.NOT_FOUND,
				};
				return c.json(response, 404);
			}

			const [source] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, body.sourceId))
				.limit(1);

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
			await db
				.update(knowledgeItems)
				.set({
					body: mergedBody,
					version: target.version + 1,
					updatedBy: body.updatedBy,
					updatedAt: now,
				})
				.where(eq(knowledgeItems.id, targetId));

			// Archive source
			await db
				.update(knowledgeItems)
				.set({
					status: "archived",
					updatedBy: body.updatedBy,
					updatedAt: now,
				})
				.where(eq(knowledgeItems.id, body.sourceId));

			// Edit log for merge
			await db.insert(knowledgeEditLog).values({
				id: crypto.randomUUID(),
				itemId: targetId,
				editor: body.updatedBy,
				field: "body",
				oldValue: target.body,
				newValue: mergedBody,
				editType: "merge",
				createdAt: now,
			});

			await db.insert(knowledgeEditLog).values({
				id: crypto.randomUUID(),
				itemId: body.sourceId,
				editor: body.updatedBy,
				field: "status",
				oldValue: source.status,
				newValue: "archived",
				editType: "merge",
				createdAt: now,
			});

			const [merged] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, targetId))
				.limit(1);

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

			const [original] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

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
				await db.insert(knowledgeItems).values({
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
				});

				// Q2: assign app projection layer for split items (inherits parent scope)
				await upsertProjectionLayer(db, newId, original.scopeKind);

				const [created] = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, newId))
					.limit(1);
				createdItems.push(created);
			}

			// Archive original
			await db
				.update(knowledgeItems)
				.set({
					status: "archived",
					updatedBy: body.updatedBy,
					updatedAt: now,
				})
				.where(eq(knowledgeItems.id, id));

			// Edit log
			await db.insert(knowledgeEditLog).values({
				id: crypto.randomUUID(),
				itemId: id,
				editor: body.updatedBy,
				field: "status",
				oldValue: original.status,
				newValue: "archived",
				editType: "split",
				createdAt: now,
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

		const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);

		if (!item) {
			const response: ApiErrorResponse = {
				error: "Knowledge item not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		const now = new Date().toISOString();
		await db
			.update(knowledgeItems)
			.set({
				status: "archived",
				updatedAt: now,
			})
			.where(eq(knowledgeItems.id, id));

		// Edit log
		await db.insert(knowledgeEditLog).values({
			id: crypto.randomUUID(),
			itemId: id,
			editor: item.updatedBy,
			field: "status",
			oldValue: item.status,
			newValue: "archived",
			editType: "archive",
			createdAt: now,
		});

		const [updated] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, id))
			.limit(1);

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

			const [item] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

			if (!item) {
				const response: ApiErrorResponse = {
					error: "Knowledge item not found",
					code: API_ERROR_CODES.NOT_FOUND,
				};
				return c.json(response, 404);
			}

			if (body.agentId) {
				const [agent] = await db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.id, body.agentId))
					.limit(1);
				if (!agent) {
					const response: ApiErrorResponse = {
						error: "Agent not found",
						code: API_ERROR_CODES.NOT_FOUND,
					};
					return c.json(response, 404);
				}
			}

			const now = new Date().toISOString();
			// O2: no attentionScore write (column stripped). Flag is recorded in the edit log.
			// Status set to "draft" so flagged items re-enter the review queue.
			await db
				.update(knowledgeItems)
				.set({ status: "draft", updatedAt: now })
				.where(eq(knowledgeItems.id, id));

			// Edit log — include flag reason
			await db.insert(knowledgeEditLog).values({
				id: crypto.randomUUID(),
				itemId: id,
				editor: item.updatedBy,
				field: "status",
				oldValue: item.status,
				newValue: `flagged (reason: ${body.reason})`,
				editType: "flag",
				createdAt: now,
			});

			const [updated] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

			// O2: emit knowledge_updated with action "flagged"
			const flaggedEvent: KnowledgeUpdatedEvent = {
				type: "knowledge_updated",
				streamId: `knowledge:${id}`,
				itemId: id,
				action: "flagged",
				timestamp: Date.now(),
			};
			eventBus.emit(flaggedEvent);

			if (body.agentId) {
				await createTriggeredAgentSessionRequest(db, {
					eventType: "knowledge.action",
					sourceKind: "knowledge",
					sourceId: `knowledge:${id}`,
					streamId: `knowledge:${id}`,
					defaultAgentId: body.agentId,
					idempotencyKey: `knowledge:${id}:review:${updated?.version ?? item.version + 1}`,
					payload: { reason: body.reason },
					sourceCorrelation: {
						knowledgeItemId: id,
						action: "review",
						...(item.scopeKind === "team" && item.scopeId ? { teamId: item.scopeId } : {}),
						...(item.scopeId ? { scopeId: item.scopeId } : {}),
					},
				});
			}

			return c.json(updated);
		},
	);

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
		const rows = await db
			.select({
				id: teamMembers.id,
				teamId: teamMembers.teamId,
				capacity: teamMembers.capacity,
				activeBets: teamMembers.activeBets,
				formedAt: teamMembers.formedAt,
				dissolvedAt: teamMembers.dissolvedAt,
			})
			.from(teamMembers);

		return c.json({ teams: rows });
	});

	return router;
}
