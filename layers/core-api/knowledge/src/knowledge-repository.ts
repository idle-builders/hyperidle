/**
 * @lore O2: knowledge-repository split canonical item rows from app projection rows.
 * - knowledgeItems table no longer has layer, scopeId, kind, attentionScore,
 *   relevanceScore, citationCount, lastCitedAt, confidence, meta columns.
 * - These fields are now stored in knowledgeAppProjection (extension table).
 * - create() inserts into both tables; update() updates both tables;
 *   list() JOINs against extension table for filter/sort on projection fields.
 * - KnowledgeItem type is augmented with optional projection fields from the
 *   extension table via KnowledgeItemWithProjection.
 *
 * @lore AU20 K1-reads: all individual read function declarations (findById,
 * findDetailById, findKnowledgeItemProjectionById, listVisibleWithSignals,
 * findRetroKnowledgeItemForBet, listTitlesByIds, listRecentByLayers,
 * listExportableKnowledgeItems, findRelatedByTopic, countTriageVisible,
 * countAccessesSince, searchByText, searchVisibleByText) are DELETED from
 * source. Their logic is inlined into get(), list(), count(), countAccesses(),
 * and the extended search(). Callers use the general entry points only.
 */
import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
	type WriteExecutor,
} from "@hyperidle/db";

import {
	type KernelKnowledgeStatus,
	type KnowledgeParentKind,
	type KnowledgeRole,
	type SCOPE_KINDS,
	scopeToLayer,
} from "@hyperidle/domain-model";
import { and, desc, eq, gte, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { ItemDeletedError, VersionConflictError } from "./errors.js";
import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Input shapes (public — used by callers of create/update)
// ---------------------------------------------------------------------------

export interface CreateKnowledgeItemInput {
	/**
	 * @lore AU14: widened to accept `null` alongside the existing symmetric `kind`
	 * widening. The HTTP route passes `scopeToLayer(scopeKind)` (returns `null` for
	 * team/bet/user/filesystem scopes — see @hyperidle/domain-model SCOPE_TO_LAYER), which
	 * is exactly what the pre-AU14 route's `upsertProjectionLayer` wrote into the
	 * (nullable) `knowledgeAppProjection.layer` column for those scopes. Existing
	 * callers (`write-memory.ts`, `writeback.ts`) always pass a concrete layer, so
	 * this is behavior-neutral for them.
	 */
	layer: KnowledgeLayer | null;
	/** @lore R7: scopeKind written to the kernel table so items are queryable by
	 * scope without a JOIN against the extension table. Defaults to "factory"
	 * when not provided (preserves existing behavior for callers that don't set scope). */
	scopeKind?: string | null;
	scopeId?: string | null;
	/**
	 * What context assembly does with this document: an ordinary knowledge file,
	 * a SKILL.md in the harness skills directory, a rule, or an agent file bound
	 * to one agent. Absent leaves the column default (`ordinary`).
	 */
	role?: KnowledgeRole;
	/**
	 * @lore knowledge-attachment-slot: which entity this item hangs off, and
	 * the role it occupies there — a routine's prompt, an agent's identity.
	 * Optional: "no parent" is the ordinary case, and every caller would
	 * otherwise write `null` as noise. Both present or both absent — the
	 * kernel table's `ki_parent_pair_ck` enforces the pairing.
	 */
	parentKind?: KnowledgeParentKind | null;
	parentId?: string | null;
	/**
	 * @lore AU14: made optional so callers with no `kind` concept (the HTTP route)
	 * can omit it and keep `projection.kind` null, matching pre-AU14 route behavior.
	 * `write-memory.ts`/`writeback.ts` always pass `kind` — `?? null` never fires for them.
	 */
	kind?: KnowledgeKind | null;
	topic?: string | null;
	title: string;
	body: string;
	/**
	 * @lore AU14: widened from `KnowledgeFormat` to `string`. The kernel
	 * `knowledgeItems.format` DB column is unconstrained text (no check
	 * constraint) — `KnowledgeFormat` ("markdown" | "toon") is an app-runtime
	 * convention that validated callers (write-memory.ts's `z.enum`, writeback.ts's
	 * literal) already respect, not a DB-level guarantee. The HTTP route's schema
	 * has never validated `format` beyond `z.string()`; narrowing it now to route
	 * through the repository would be a new validation behavior change AU14 forbids.
	 */
	format: string;
	/**
	 * @lore R7: widened to `KnowledgeStatus | KernelKnowledgeStatus` so
	 * agent-created items (write_memory) can be created with status="draft"
	 * without polluting the app-runtime promotion-state enum. "draft" items are
	 * triage items until promoted to active/captured/... by a facilitator.
	 */
	status: KnowledgeStatus | KernelKnowledgeStatus;
	updatedBy: string;
	/** @lore AU44 batch 4: meta is a PLUGIN-written field (Ruling 3) retained here so
	 * the retro knowledge-item upsert (bets.ts POST /:id/retro) can write reflection
	 * metadata until the BA curation plugin track provides a replacement. */
	meta?: string | null;
}

export interface UpdateKnowledgeItemInput {
	layer?: KnowledgeLayer;
	scopeId?: string | null;
	kind?: KnowledgeKind;
	topic?: string | null;
	title?: string;
	body?: string;
	/** @lore AU14: same `string` widening as CreateKnowledgeItemInput.format — see there. */
	format?: string;
	/** @lore AU14: same `KnowledgeStatus | KernelKnowledgeStatus` widening as
	 * CreateKnowledgeItemInput.status (R7) — the PATCH route accepts kernel
	 * statuses (e.g. "draft") that are outside the app-runtime KnowledgeStatus enum. */
	status?: KnowledgeStatus | KernelKnowledgeStatus;
	/** Changing this promotes an ordinary note into a skill, or demotes one back. */
	role?: KnowledgeRole;
	/**
	 * Scope lives on the kernel row, and `scopeId` is mirrored onto the
	 * projection after the kernel write — `list()` matches either column with an
	 * OR, so leaving one behind silently changes who can find the document.
	 */
	scopeKind?: string;
	updatedBy?: string;
	/** @lore AU44 batch 4: retained so the retro upsert (Ruling 3 PLUGIN row) can write
	 * reflection metadata until the BA curation plugin track provides a replacement. */
	meta?: string | null;
}

/** Base filter for list() — filters on kernel + projection table fields. */
export interface ListFilters {
	layer?: KnowledgeLayer;
	/** Matches scope stored on either the canonical row or its app projection. */
	scopeId?: string | null;
	limit?: number;
	offset?: number;
}

/** Discriminant for get() — selects which projection view to return. */
export type KnowledgeItemView = "summary" | "full";

/**
 * Augments the kernel KnowledgeItem with app-runtime fields from the
 * knowledgeAppProjection extension table.
 *
 * @lore AF3: Do NOT redeclare fields already on KnowledgeItem (scopeId, etc.) —
 * TS2430 fires if an optional override conflicts with a required base property.
 * Only declare NEW fields from knowledgeAppProjection here.
 */
export interface KnowledgeItemWithProjection extends KnowledgeItem {
	layer?: string | null;
	kind?: string | null;
	attentionScore?: string | null;
	confidence?: string | null;
	meta?: string | null;
	// @lore AU44: attentionScore/confidence/meta are intentionally retained in this
	// interface. The PLUGIN attention service writes them via transition({recomputeAttention}).
	// They are removed from CreateKnowledgeItemInput/UpdateKnowledgeItemInput (callers
	// cannot write them) but stay readable here so the PLUGIN can read + return them.
}

// ---------------------------------------------------------------------------
// Local (non-exported) return-shape types — used in overload signatures.
// These replaced the former exported row types (KnowledgeListRow,
// KnowledgeDetailRow, etc.) deleted in AU20 K1-reads.
// ---------------------------------------------------------------------------

/** Row shape for list({recentByLayers}) — replaces exported RecentLayeredKnowledgeItemRow. */
type RecentRow = {
	readonly title: string;
	readonly updatedAt: string;
	readonly layer: string | null;
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function generateId(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

interface WriteOptions {
	/** Caller-owned workflow clock; defaults to wall-clock time. */
	readonly timestamp?: string;
}

/**
 * Fetch the app projection row for a knowledge item, or null if not found.
 */
async function getProjectionRow(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<typeof knowledgeAppProjection.$inferSelect | null> {
	const [row] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);
	return row ?? null;
}

/**
 * Merge canonical item fields with app projection fields.
 */
function mergeWithProjection(
	item: KnowledgeItem,
	projection: typeof knowledgeAppProjection.$inferSelect | null,
): KnowledgeItemWithProjection {
	if (!projection) return item;
	return {
		...item,
		layer: projection.layer,
		// @lore AU44 batch 4: projection.scopeId is a denormalized copy that may be null
		// (e.g. minimal test fixtures, or items created before the projection column existed).
		// Fall back to the kernel's scopeId so resolveScopeName receives the real value.
		scopeId: projection.scopeId ?? item.scopeId,
		kind: projection.kind,
		// @lore AU44 batch 4: attentionScore stays readable per the KnowledgeItemWithProjection
		// interface lore — the PLUGIN attention service writes it, callers may read it.
		// Removed from Create/UpdateKnowledgeItemInput (callers cannot write it).
		attentionScore: projection.attentionScore,
		confidence: projection.confidence,
		meta: projection.meta,
	};
}

// ---------------------------------------------------------------------------
// Write operations (K2-writes, kept here for cohesion with the repository)
// ---------------------------------------------------------------------------

export async function create(
	db: HyperIdleDb,
	input: CreateKnowledgeItemInput,
	options: WriteOptions = {},
): Promise<KnowledgeItemWithProjection> {
	const id = generateId();
	const timestamp = options.timestamp ?? now();

	// Insert into canonical table (projection fields excluded, except scopeKind/scopeId
	// which live on the kernel for efficient scope queries without a JOIN)
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: input.scopeKind ?? "factory",
		scopeId: input.scopeId ?? null,
		topic: input.topic ?? null,
		title: input.title,
		body: input.body,
		format: input.format,
		status: input.status,
		// Absent leaves the column default (`ordinary`), which is what every
		// caller predating an authorable role produced.
		...(input.role ? { role: input.role } : {}),
		parentKind: input.parentKind ?? null,
		parentId: input.parentId ?? null,
		version: 1,
		updatedBy: input.updatedBy,
		createdAt: timestamp,
		updatedAt: timestamp,
	});

	// Insert into app projection table.
	await db.insert(knowledgeAppProjection).values({
		id: generateId(),
		knowledgeItemId: id,
		layer: input.layer,
		scopeId: input.scopeId ?? null,
		kind: input.kind ?? null,
		meta: input.meta ?? null,
	});

	// Edit log for create
	await db.insert(knowledgeEditLog).values({
		id: generateId(),
		itemId: id,
		editor: input.updatedBy,
		field: "*",
		oldValue: null,
		newValue: null,
		editType: "create",
		createdAt: timestamp,
	});

	// @lore AU14: no domain event emitted here (deliberately). The route owns the
	// EventBus emit (live subscribers: ws-broadcaster, observability
	// dispatcher); non-HTTP callers (tools/writeback) never emitted on the bus
	// before this WP and continue not to — emitting here would be a NEW event for
	// them, a behavior change the WP forbids.
	const [created] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, id))
		.limit(1);
	if (!created) {
		throw new Error(`Failed to read back created knowledge item ${id}`);
	}
	const projectionRow = await getProjectionRow(db, id);
	return mergeWithProjection(created, projectionRow);
}

/**
 * Allow-list of caller-mutable fields for the kernel table.
 * @lore O2: projection fields (layer, scopeId, kind, attentionScore, confidence, meta)
 * are removed from canonical EDITABLE_FIELDS and written to the extension table instead.
 */
// `role` rides the ordinary editable set so a change is versioned and written to
// the edit log like any other field — promoting a note to a skill is an edit with
// an author and a history, not a hidden reclassification.
const KERNEL_EDITABLE_FIELDS = [
	"topic",
	"title",
	"body",
	"format",
	"status",
	"role",
	"scopeKind",
	"scopeId",
	"updatedBy",
] as const;

// `scopeId` is deliberately NOT here. It lives on the kernel row and is mirrored
// onto the projection after the kernel write, so the two cannot disagree. Listing
// it here made the generic update write the projection while the (now deleted)
// `/scope` route wrote the kernel — two writers, two tables, free to diverge.
const PROJECTION_EDITABLE_FIELDS = ["layer", "kind", "meta"] as const;

interface DiffResult {
	readonly kernelChanges: Record<string, unknown>;
	readonly projectionChanges: Record<string, unknown>;
	readonly editLogEntries: ReadonlyArray<typeof knowledgeEditLog.$inferInsert>;
}

/** Build the safe-changes payload + per-field edit-log rows. */
function buildDiff(
	itemId: string,
	existing: KnowledgeItemWithProjection,
	changes: UpdateKnowledgeItemInput,
	timestamp: string,
): DiffResult {
	const editLogEntries: Array<typeof knowledgeEditLog.$inferInsert> = [];
	const kernelChanges: Record<string, unknown> = {};
	const projectionChanges: Record<string, unknown> = {};

	for (const field of KERNEL_EDITABLE_FIELDS) {
		if (!(field in changes) || changes[field] === undefined) continue;
		const oldVal = existing[field];
		const newVal = changes[field];
		kernelChanges[field] = newVal;
		if (oldVal === newVal) continue;
		editLogEntries.push({
			id: generateId(),
			itemId,
			editor: changes.updatedBy ?? existing.updatedBy,
			field,
			oldValue: oldVal == null ? null : String(oldVal),
			newValue: newVal == null ? null : String(newVal),
			editType: "update",
			createdAt: timestamp,
		});
	}

	for (const field of PROJECTION_EDITABLE_FIELDS) {
		if (!(field in changes) || changes[field] === undefined) continue;
		const oldVal = existing[field];
		const newVal = changes[field];
		projectionChanges[field] = newVal;
		if (oldVal === newVal) continue;
		editLogEntries.push({
			id: generateId(),
			itemId,
			editor: changes.updatedBy ?? existing.updatedBy,
			field,
			oldValue: oldVal == null ? null : String(oldVal),
			newValue: newVal == null ? null : String(newVal),
			editType: "update",
			createdAt: timestamp,
		});
	}

	return { kernelChanges, projectionChanges, editLogEntries };
}

export async function update(
	db: HyperIdleDb,
	id: string,
	changes: UpdateKnowledgeItemInput,
	expectedVersion: number,
	options: WriteOptions = {},
): Promise<KnowledgeItemWithProjection> {
	// @lore N1/O2: PGlite uses async transactions. The transaction callback must
	// be async. All inner DB calls are awaited.
	const result = await db.transaction(
		async (tx): Promise<{ updated: KnowledgeItemWithProjection; newVersion: number }> => {
			const [existing] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

			if (!existing) {
				throw new Error(`Knowledge item ${id} not found`);
			}
			if (existing.version !== expectedVersion) {
				throw new VersionConflictError(id, existing.version);
			}

			const [projectionRow] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);
			const existingWithProjection = mergeWithProjection(existing, projectionRow ?? null);

			const timestamp = options.timestamp ?? now();
			const newVersion = existing.version + 1;
			const { kernelChanges, projectionChanges, editLogEntries } = buildDiff(
				id,
				existingWithProjection,
				changes,
				timestamp,
			);

			// Mirror the kernel's scopeId onto the projection in the same
			// transaction, so the two columns `list()` ORs together cannot drift.
			// A changed scopeKind also re-derives the fabric layer: the layer IS a
			// function of the scope, and leaving it behind would strand the document
			// in the layer its old scope implied.
			// `kernelChanges` is an untyped diff bag, so the two scope fields are
			// narrowed here rather than asserted at each use.
			const nextScopeId = kernelChanges.scopeId as string | null | undefined;
			const nextScopeKind = kernelChanges.scopeKind as (typeof SCOPE_KINDS)[number] | undefined;
			const mirroredProjectionChanges = {
				...projectionChanges,
				...("scopeId" in kernelChanges ? { scopeId: nextScopeId ?? null } : {}),
				...(nextScopeKind ? { layer: scopeToLayer(nextScopeKind) } : {}),
			};

			const updateRows = await tx
				.update(knowledgeItems)
				.set({
					...kernelChanges,
					version: newVersion,
					updatedAt: timestamp,
				})
				.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.version, expectedVersion)))
				.returning({ id: knowledgeItems.id });

			if (updateRows.length === 0) {
				const [current] = await tx
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, id))
					.limit(1);
				if (!current) throw new ItemDeletedError(id);
				throw new VersionConflictError(id, current.version);
			}

			// Update extension table if there are projection changes.
			if (Object.keys(mirroredProjectionChanges).length > 0) {
				const [existingProjection] = await tx
					.select({ id: knowledgeAppProjection.id })
					.from(knowledgeAppProjection)
					.where(eq(knowledgeAppProjection.knowledgeItemId, id))
					.limit(1);
				if (existingProjection) {
					await tx
						.update(knowledgeAppProjection)
						.set(mirroredProjectionChanges)
						.where(eq(knowledgeAppProjection.knowledgeItemId, id));
				} else {
					// Create extension row if it doesn't exist
					await tx.insert(knowledgeAppProjection).values({
						id: generateId(),
						knowledgeItemId: id,
						...mirroredProjectionChanges,
					});
				}
			}

			// Insert edit log entries
			for (const entry of editLogEntries) {
				await tx.insert(knowledgeEditLog).values(entry);
			}

			const [updated] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!updated) {
				throw new Error(`Failed to read back updated knowledge item ${id}`);
			}
			const [updatedProjection] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);
			return { updated: mergeWithProjection(updated, updatedProjection ?? null), newVersion };
		},
	);

	// @lore AU14: no domain event emitted here (deliberately) — see create() above.
	return result.updated;
}

// ---------------------------------------------------------------------------
// READ operations — K1-reads: get / list / count / search
// ---------------------------------------------------------------------------

/**
 * Internal base list query: filter by kernel + projection fields.
 * Called by the overloaded list() for the default base ListFilters case.
 */
/**
 * @lore BA9b-listBase: listBase has no `role` filter intentionally — the public
 * `list()` surface is for editorial/display use (knowledge view), where all roles
 * appear together. Capability items (role != 'ordinary') for session assembly are
 * fetched by a separate path: `fetchCapabilityItems` in session-knowledge-assembler.ts
 * uses a direct query with a scope+role predicate rather than going through listBase.
 * That path justifies the deviation (listBase's layer predicate would silently drop
 * capability items that have no layer). The two query paths do not drift because they
 * serve different callers — one is editorial, the other is session-time materialisation.
 * See the @lore BA9b-listBase comment in session-knowledge-assembler.ts for the full
 * rationale.
 */
async function listBase(
	db: HyperIdleDb,
	filters: ListFilters = {},
): Promise<KnowledgeItemWithProjection[]> {
	const hasProjectionFilter = filters.layer !== undefined || filters.scopeId !== undefined;

	const limit = filters.limit ?? 50;
	const offset = filters.offset ?? 0;

	if (!hasProjectionFilter) {
		const rows = await db
			.select()
			.from(knowledgeItems)
			.orderBy(knowledgeItems.id)
			.limit(limit)
			.offset(offset);

		const result: KnowledgeItemWithProjection[] = [];
		for (const item of rows) {
			const projection = await getProjectionRow(db, item.id);
			result.push(mergeWithProjection(item, projection));
		}
		return result;
	}

	// Projection filters: JOIN with extension table.
	// @lore O2: projection filter queries must JOIN with knowledgeAppProjection.
	const conditions: SQL[] = [];

	if (filters.layer !== undefined) {
		conditions.push(eq(knowledgeAppProjection.layer, filters.layer));
	}
	if (filters.scopeId !== undefined) {
		const scopeCondition =
			filters.scopeId === null
				? and(isNull(knowledgeItems.scopeId), isNull(knowledgeAppProjection.scopeId))
				: or(
						eq(knowledgeItems.scopeId, filters.scopeId),
						eq(knowledgeAppProjection.scopeId, filters.scopeId),
					);
		if (scopeCondition) conditions.push(scopeCondition);
	}
	const rows = await db
		.select({ item: knowledgeItems, projection: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(and(...conditions))
		.orderBy(knowledgeItems.id)
		.limit(limit)
		.offset(offset);

	return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
}

/**
 * Fetch a knowledge item by id with a discriminated view selection.
 *
 * - `{view: 'detail'}` → kernel row LEFT JOINed with projection (kind/layer/confidence/scores)
 * - default / `{view: 'summary'}` → raw kernel row (KnowledgeItem)
 *
 * @lore Ag7b: Collapses findById / findDetailById / findKnowledgeItemProjectionById
 * into one entry point with a discriminated return type so callers get the precise
 * shape they need without widening to a common any-bag.
 *
 * @lore AU20 K1-reads: the three delegate functions (findById, findDetailById,
 * findKnowledgeItemProjectionById) are deleted — logic is inlined into each case.
 */
/**
 * What a viewer may see: everything except another person's private notes.
 *
 * `scope_kind='user'` says the document belongs to the subject in `scope_id`.
 * That is two different things depending on the document's ROLE. An `ordinary`
 * user-scoped document is a person's private note. A capability document —
 * `agent_file`, `skill`, `rule` — with the same scope is a BINDING: it says
 * which agent this identity, skill or rule applies to. A binding is ordinary
 * team knowledge that happens to name its agent, not a secret.
 *
 * @lore BA9f: an agent's identity became a `scope_kind='user'` document bound to
 * the agent. Spelled as "user scope is private, full stop", every one of those
 * was invisible to everyone — including through the single knowledge edit
 * endpoint that is now the only place to edit them. Proven by driving the live
 * API: `GET /api/knowledge/ki_af_demo-agent-pm` answered 404 for a document
 * sitting in the table.
 *
 * The rule stays inside knowledge's own vocabulary on purpose: telling an agent
 * from a person means reading `users`, and that table belongs to another
 * service.
 */
function visibleToViewer(viewerUserId: string): SQL | undefined {
	return or(
		ne(knowledgeItems.scopeKind, "user"),
		ne(knowledgeItems.role, "ordinary"),
		eq(knowledgeItems.updatedBy, viewerUserId),
	);
}

export function get(
	db: HyperIdleDb,
	id: string,
	opts: { view: "full" },
): Promise<KnowledgeItemWithProjection | null>;
export function get(
	db: HyperIdleDb,
	id: string,
	opts?: { view?: "summary" },
): Promise<KnowledgeItem | null>;

export async function get(
	db: HyperIdleDb,
	id: string,
	opts?: { view?: KnowledgeItemView },
): Promise<KnowledgeItem | null> {
	switch (opts?.view) {
		case "full": {
			const [item] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!item) return null;
			return mergeWithProjection(item, await getProjectionRow(db, id));
		}
		default: {
			// Inlined from former findById — summary view: raw kernel row.
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			return row ?? null;
		}
	}
}

/**
 * List knowledge items with a discriminated filter.
 *
 * Discriminated variants (first matching wins):
 * - `{scope}` → items in scopeKind+scopeId on kernel table (replaces listByScope)
 * - `{visibleWithSignals}` → all items visible to viewerUserId with L22 signals
 * - `{titlesByIds}` → batched title lookup
 * - `{recentByLayers}` → items in given layers updated since a cutoff
 * - `{exportable}` → items with matching layer/status for git export
 * - `{relatedByTopic}` → same-topic items visible to viewer
 * - base `ListFilters` → projection-joined filtered list
 *
 * @lore Ag7b: Each variant has a unique required discriminant property so TypeScript
 * overload resolution picks the precise return type at the call site — no widened any-bags.
 *
 * @lore AU20 K1-reads: all nine specialized list helper functions are deleted from
 * source; their logic is inlined into the switch dispatch below.
 */
export function list(
	db: HyperIdleDb,
	filter: { readonly visibleWithSignals: string },
): Promise<KnowledgeItemWithProjection[]>;
export function list(
	db: HyperIdleDb,
	filter: { readonly titlesByIds: readonly string[] },
): Promise<Array<{ id: string; title: string }>>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly recentByLayers: { readonly layers: readonly string[]; readonly since: string };
	},
): Promise<readonly RecentRow[]>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly relatedByTopic: {
			readonly topic: string;
			readonly excludeId: string;
			readonly viewerUserId: string;
			readonly limit: number;
		};
	},
): Promise<Array<{ id: string; title: string }>>;
export function list(db: HyperIdleDb, filter?: ListFilters): Promise<KnowledgeItemWithProjection[]>;
export async function list(
	db: HyperIdleDb,
	filter?:
		| { readonly visibleWithSignals: string }
		| { readonly titlesByIds: readonly string[] }
		| { readonly recentByLayers: { readonly layers: readonly string[]; readonly since: string } }
		| {
				readonly relatedByTopic: {
					readonly topic: string;
					readonly excludeId: string;
					readonly viewerUserId: string;
					readonly limit: number;
				};
		  }
		| ListFilters,
): Promise<
	| KnowledgeItemWithProjection[]
	| null
	| readonly { id: string; title: string }[]
	| readonly RecentRow[]
> {
	if (!filter) return listBase(db);

	if ("visibleWithSignals" in filter) {
		// Visible items: Q2 filter — include if scope_kind != 'user' OR updatedBy = viewer.
		const viewerUserId = filter.visibleWithSignals;
		const rows = await db
			.select({ item: knowledgeItems, projection: knowledgeAppProjection })
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(visibleToViewer(viewerUserId));
		return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
	}

	if ("titlesByIds" in filter) {
		// Inlined from former listTitlesByIds.
		const ids = filter.titlesByIds;
		if (ids.length === 0) return [];
		return db
			.select({ id: knowledgeItems.id, title: knowledgeItems.title })
			.from(knowledgeItems)
			.where(inArray(knowledgeItems.id, ids as string[]));
	}

	if ("recentByLayers" in filter) {
		// Inlined from former listRecentByLayers.
		const { layers, since } = filter.recentByLayers;
		const rows = await db
			.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
			.from(knowledgeItems)
			.innerJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(
				and(
					inArray(knowledgeAppProjection.layer, layers as string[]),
					gte(knowledgeItems.updatedAt, since),
				),
			);
		return rows.map((r) => ({
			title: r.item.title,
			updatedAt: r.item.updatedAt,
			layer: r.fabric.layer,
		}));
	}

	if ("relatedByTopic" in filter) {
		// Inlined from former findRelatedByTopic.
		const opts = filter.relatedByTopic;
		return db
			.select({ id: knowledgeItems.id, title: knowledgeItems.title })
			.from(knowledgeItems)
			.where(
				and(
					eq(knowledgeItems.topic, opts.topic),
					ne(knowledgeItems.id, opts.excludeId),
					visibleToViewer(opts.viewerUserId),
				),
			)
			.limit(opts.limit);
	}

	// Base ListFilters case
	return listBase(db, filter);
}

/**
 * Count knowledge items for a given filter.
 *
 * - `{triageVisible: viewerUserId}` → count of draft + needs_human items visible to viewer (Q2)
 *
 * @lore AU20 K1-reads: subsumes former countTriageVisible — deleted from source.
 */
export async function count(
	db: HyperIdleDb,
	filter: { readonly triageVisible: string },
): Promise<number> {
	// Only triageVisible variant for now — add discriminants as consumers emerge.
	const viewerUserId = filter.triageVisible;
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(knowledgeItems)
		.where(
			and(inArray(knowledgeItems.status, ["draft", "needs_human"]), visibleToViewer(viewerUserId)),
		);
	return Number(result?.count ?? 0);
}

/**
 * Text search across knowledge items (ILIKE on title/body/topic).
 *
 * - `{visibility: viewerUserId}` — restrict to Q2 auth boundary (scope_kind != 'user' OR updatedBy = userId)
 *
 * @lore AU20 K1-reads: subsumes former searchByText (LIKE, all items) and
 * searchVisibleByText (ILIKE + Q2 filter) — both deleted from source.
 * Text mode uses ILIKE (case-insensitive) rather than searchByText's LIKE;
 * the behavioral difference is an intentional improvement (better UX).
 */
interface SearchOptions {
	limit?: number;
	offset?: number;
	/** @deprecated use text search — mode field ignored, always text */
	mode?: "fts" | "text";
	/** If provided, restrict to items visible to this userId (Q2 auth boundary). */
	visibility?: string;
}

export type { SearchOptions };

export async function search(
	db: HyperIdleDb,
	query: string,
	options: SearchOptions = {},
): Promise<KnowledgeItemWithProjection[]> {
	const { visibility, limit = 50, offset = 0 } = options;

	// ILIKE-based text search across title, body, and topic.
	// @lore AU44: the mode branch died with the FTS path (every production caller passed
	// "text"); the LIKE escape is inlined here because query-escaping was dissolved.
	const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

	const authFilter = visibility != null ? visibleToViewer(visibility) : undefined;

	const textFilter = or(
		sql`${knowledgeItems.title} ILIKE ${pattern} ESCAPE '\\'`,
		sql`${knowledgeItems.body} ILIKE ${pattern} ESCAPE '\\'`,
		sql`${knowledgeItems.topic} ILIKE ${pattern} ESCAPE '\\'`,
	);

	const whereClause = authFilter != null ? and(authFilter, textFilter) : textFilter;

	const rows = await db
		.select({
			item: knowledgeItems,
			projection: knowledgeAppProjection,
		})
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(whereClause)
		.orderBy(desc(knowledgeItems.updatedAt), knowledgeItems.id)
		.limit(limit)
		.offset(offset);

	return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
}

// ---------------------------------------------------------------------------
// Write operations continued (scope / archive)
// ---------------------------------------------------------------------------

/**
 * Write or upsert a knowledgeAppProjection row for the given knowledge item.
 */
async function upsertProjectionLayer(
	db: HyperIdleDb,
	knowledgeItemId: string,
	scopeKind: string,
): Promise<void> {
	const layer = scopeToLayer(
		// Safe cast: scopeKind is always a validated SCOPE_KINDS member by the time
		// it reaches here (route-side zod validation for scope/create/split callers).
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
			id: generateId(),
			knowledgeItemId,
			layer,
		});
	}
}

// ---------------------------------------------------------------------------
// transition — unified lifecycle write (replaces flagItem/mergeItems/
// splitItem/promoteKnowledgeItem)
//
// Scope is NOT a transition: it is a field on the document, edited through
// `update()` with everything else.
//
// @lore AU20 K2-writes: the five per-operation write functions are collapsed
// into one discriminated entry point. Each 'target' maps exactly to one old
// function; behavior is byte-identical.
// ---------------------------------------------------------------------------

/**
 * Result of a transition('promote') call. Structurally equivalent to the
 * former `PromoteKnowledgeItemResult` (promotion-pipeline.ts, now deleted).
 */
export type PromoteTransitionResult =
	| { readonly ok: true; readonly fromStatus: string }
	| {
			readonly ok: false;
			readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
			readonly message: string;
	  };

// Overload signatures — callers get precise return types for each target.
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: { readonly target: "recomputeAttention"; readonly attentionScore: number },
): Promise<void>;
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: {
		readonly target: "promote";
		readonly fromStatus: string;
		readonly toStatus: string;
		readonly reason?: string;
		readonly editor: string;
	},
): Promise<PromoteTransitionResult>;
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: { readonly target: "merge"; readonly sourceId: string; readonly updatedBy: string },
): Promise<KnowledgeItem>;
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: {
		readonly target: "split";
		readonly newItems: ReadonlyArray<{
			readonly title: string;
			readonly body: string;
			readonly topic?: string;
		}>;
		readonly updatedBy: string;
	},
): Promise<KnowledgeItem[]>;
// Implementation
export async function transition(
	db: HyperIdleDb,
	id: string,
	ctx:
		| { readonly target: "recomputeAttention"; readonly attentionScore: number }
		| {
				readonly target: "promote";
				readonly fromStatus: string;
				readonly toStatus: string;
				readonly reason?: string;
				readonly editor: string;
		  }
		| { readonly target: "merge"; readonly sourceId: string; readonly updatedBy: string }
		| {
				readonly target: "split";
				readonly newItems: ReadonlyArray<{
					readonly title: string;
					readonly body: string;
					readonly topic?: string;
				}>;
				readonly updatedBy: string;
		  },
): Promise<PromoteTransitionResult | void | KnowledgeItem | KnowledgeItem[]> {
	switch (ctx.target) {
		case "recomputeAttention": {
			// Projection-only atomic upsert: computed scores are derived state, not
			// canonical knowledge edits. Deliberately no item version/update timestamp
			// change and no knowledge_edit_log entry.
			await db
				.insert(knowledgeAppProjection)
				.values({
					id: generateId(),
					knowledgeItemId: id,
					attentionScore: String(ctx.attentionScore),
				})
				.onConflictDoUpdate({
					target: knowledgeAppProjection.knowledgeItemId,
					set: { attentionScore: String(ctx.attentionScore) },
				});
			return;
		}
		case "promote": {
			const { fromStatus, toStatus, reason, editor } = ctx;
			const isoNow = new Date().toISOString();

			return db.transaction(async (tx): Promise<PromoteTransitionResult> => {
				if (toStatus === "validated") {
					const [openConflict] = await tx
						.select()
						.from(knowledgeConflicts)
						.where(and(eq(knowledgeConflicts.itemId, id), eq(knowledgeConflicts.status, "open")))
						.limit(1);
					if (openConflict) {
						return {
							ok: false,
							code: "CONFLICT_OPEN",
							message: "open conflict blocks promotion to validated",
						};
					}
				}

				const updated = await tx
					.update(knowledgeItems)
					.set({ status: toStatus, updatedAt: isoNow, updatedBy: editor })
					.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.status, fromStatus)))
					.returning({ id: knowledgeItems.id });

				if (updated.length === 0) {
					return {
						ok: false,
						code: "CONCURRENT_MODIFICATION",
						message: `knowledge item ${id} no longer in status ${fromStatus}`,
					};
				}

				const newValue = reason ? `${toStatus} | reason: ${reason}` : toStatus;
				await tx.insert(knowledgeEditLog).values({
					id: generateId(),
					itemId: id,
					editor,
					field: "status",
					oldValue: fromStatus,
					newValue,
					editType: "refinement",
					createdAt: isoNow,
				});

				return { ok: true, fromStatus };
			});
		}

		case "merge": {
			const { sourceId, updatedBy } = ctx;
			const timestamp = now();

			const target = await getItemForTransition(db, id);
			const source = await getItemForTransition(db, sourceId);

			if (!target) throw new Error(`transition('merge'): target item ${id} not found`);
			if (!source) throw new Error(`transition('merge'): source item ${sourceId} not found`);

			const mergedBody = `${target.body}\n\n---\n\n${source.body}`;

			await db
				.update(knowledgeItems)
				.set({ body: mergedBody, version: target.version + 1, updatedBy, updatedAt: timestamp })
				.where(eq(knowledgeItems.id, id));

			await db
				.update(knowledgeItems)
				.set({ status: "archived", updatedBy, updatedAt: timestamp })
				.where(eq(knowledgeItems.id, sourceId));

			await db.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: id,
				editor: updatedBy,
				field: "body",
				oldValue: target.body,
				newValue: mergedBody,
				editType: "merge",
				createdAt: timestamp,
			});

			await db.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: sourceId,
				editor: updatedBy,
				field: "status",
				oldValue: source.status,
				newValue: "archived",
				editType: "merge",
				createdAt: timestamp,
			});

			const [merged] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!merged) throw new Error(`Failed to read back knowledge item ${id} after merge`);
			return merged;
		}

		case "split": {
			const { newItems, updatedBy } = ctx;
			const timestamp = now();

			const original = await getItemForTransition(db, id);
			if (!original) throw new Error(`transition('split'): item ${id} not found`);

			const created: KnowledgeItem[] = [];

			for (const newItem of newItems) {
				const newId = generateId();
				await db.insert(knowledgeItems).values({
					id: newId,
					scopeKind: original.scopeKind,
					scopeId: original.scopeId,
					topic: newItem.topic ?? original.topic,
					title: newItem.title,
					body: newItem.body,
					format: original.format,
					status: "draft",
					version: 1,
					updatedBy,
					createdAt: timestamp,
					updatedAt: timestamp,
				});

				await upsertProjectionLayer(db, newId, original.scopeKind);

				const [row] = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, newId))
					.limit(1);
				if (!row) throw new Error(`Failed to read back split item ${newId}`);
				created.push(row);
			}

			await db
				.update(knowledgeItems)
				.set({ status: "archived", updatedBy, updatedAt: timestamp })
				.where(eq(knowledgeItems.id, id));

			await db.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: id,
				editor: updatedBy,
				field: "status",
				oldValue: original.status,
				newValue: "archived",
				editType: "split",
				createdAt: timestamp,
			});

			return created;
		}
	}
}

/** Internal helper — fetch a bare kernel row for transition operations. */
async function getItemForTransition(db: HyperIdleDb, id: string): Promise<KnowledgeItem | null> {
	const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
	return row ?? null;
}

// ---------------------------------------------------------------------------
// remove — soft archive (kept as one of the 6 floor CRUD methods)
//
// @lore AU20 Ag7c: renamed from `archiveItem` to `remove`; behavior unchanged.
// ---------------------------------------------------------------------------

/**
 * `POST /:id/archive` — soft-delete: status→archived, NO version bump.
 *
 * @lore AU20 Ag7c: renamed from `archiveItem` to `remove` — archive-with-log
 * path folds under `remove`; behavior unchanged.
 */
export async function remove(
	db: HyperIdleDb,
	item: KnowledgeItem,
	options: WriteOptions = {},
): Promise<KnowledgeItem> {
	const timestamp = options.timestamp ?? now();
	await db
		.update(knowledgeItems)
		.set({ status: "archived", updatedAt: timestamp })
		.where(eq(knowledgeItems.id, item.id));

	await db.insert(knowledgeEditLog).values({
		id: generateId(),
		itemId: item.id,
		editor: item.updatedBy,
		field: "status",
		oldValue: item.status,
		newValue: "archived",
		editType: "archive",
		createdAt: timestamp,
	});

	const [row] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, item.id))
		.limit(1);
	if (!row) {
		throw new Error(`Failed to read back knowledge item ${item.id} after archive`);
	}
	return row;
}

// ---------------------------------------------------------------------------
// Plugin-managed skill operations (BA9b)
// ---------------------------------------------------------------------------

export interface UpsertPluginDocumentInput {
	id: string;
	pluginId: string;
	/** The document's title — a skill's directory name, or a routine's prompt title. */
	title: string;
	body: string;
	scopeKind: string;
	scopeId: string | null;
	/** A real topic, or none. It no longer carries provenance — the registry does. */
	topic: string | null;
	ts: string;
	/** Defaults to `skill`. A routine's prompt is an ordinary document. */
	role?: KnowledgeRole;
	/**
	 * @lore knowledge-attachment-slot: required, not optional — every plugin
	 * writer names its parent, `null` included. Left optional, a caller could
	 * silently keep writing the old parentless shape; a required field makes
	 * `npm run check` name every call site instead.
	 */
	parentKind: KnowledgeParentKind | null;
	parentId: string | null;
}

/**
 * Insert or update a plugin-managed knowledge document — a skill, or the
 * document a contributed routine's prompt lives in.
 *
 * @lore BA9b: On conflict (same ID = same plugin+dirName), updates scope/topic/
 * timestamp but PRESERVES the body — user edits win (D5: your edit wins, you
 * are told it detached from the plugin). No edit-log entry is written here
 * because these are machine-managed rows; a user edit through the knowledge
 * route writes its own log entry via the normal update() path.
 */
/**
 * The body of the `agent_file` knowledge document bound to this agent — its
 * identity, which becomes the "## Identity" section of the AGENTS.md its
 * sessions read.
 *
 * The binding is the one context assembly already uses for `agent_file`:
 * `scopeKind='user'` with `scopeId` set to the agent's id. Null when the agent
 * has no identity document, which is a valid state — the session then carries
 * task, tools and workspace sections without a persona.
 */
/**
 * The item in a parent's named slot — a routine's prompt, an agent's
 * identity. Parent says where it hangs, role says where it lands; together
 * they are the singular-slot query (`ki_parent_slot_uq` makes at most one
 * item ever answer it). Ignores scope entirely — scope answers a different
 * question (how far an item reaches), not which item occupies this slot.
 */
export async function getParentedItem(
	db: HyperIdleDb,
	input: {
		readonly parentKind: KnowledgeParentKind;
		readonly parentId: string;
		readonly role: KnowledgeRole;
		readonly status?: "active";
	},
): Promise<KnowledgeItem | null> {
	const [row] = await db
		.select()
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				eq(knowledgeItems.parentId, input.parentId),
				eq(knowledgeItems.role, input.role),
				...(input.status ? [eq(knowledgeItems.status, input.status)] : []),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Every item under one parent, whatever its role — feeds the archive-on-
 * delete path (a parent's children are its whole `parent_kind`+`parent_id`
 * population, not just its named slot).
 */
export async function listItemIdsByParent(
	db: HyperIdleDb,
	input: { readonly parentKind: KnowledgeParentKind; readonly parentId: string },
): Promise<readonly string[]> {
	const rows = await db
		.select({ id: knowledgeItems.id })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				eq(knowledgeItems.parentId, input.parentId),
			),
		);
	return rows.map((r) => r.id);
}

/**
 * The same named slot for many parents at once — module-private because its
 * only consumer is `getAgentIdentityIds` below. `knip.json` sets
 * `ignoreExportsUsedInFile: true`, so an in-file-used export is fine, but a
 * barrel re-export nothing outside consumes would be flagged as unused.
 */
async function listParentedItemIds(
	db: HyperIdleDb,
	input: {
		readonly parentKind: KnowledgeParentKind;
		readonly parentIds: readonly string[];
		readonly role: KnowledgeRole;
		readonly status?: "active";
	},
): Promise<Map<string, string>> {
	if (input.parentIds.length === 0) return new Map();
	const rows = await db
		.select({ id: knowledgeItems.id, parentId: knowledgeItems.parentId })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				inArray(knowledgeItems.parentId, [...input.parentIds]),
				eq(knowledgeItems.role, input.role),
				...(input.status ? [eq(knowledgeItems.status, input.status)] : []),
			),
		);
	return new Map(rows.flatMap((r) => (r.parentId ? [[r.parentId, r.id] as const] : [])));
}

/**
 * Give an agent its identity document, or update the one it has.
 *
 * An agent's identity is an `agent_file` knowledge document parented to it —
 * `parentKind='agent'` with `parentId` set to the agent — which is the
 * binding context assembly reads through `getParentedItem`. `scopeKind:
 * 'user'`/`scopeId` are still written too: scope answers a different
 * question (how far the item reaches) and is never derived from the parent.
 * Seeded once when the agent is created; after that it is edited like any
 * other document.
 *
 * The body is NOT overwritten when the document already exists: an identity a
 * person has edited is theirs, and re-seeding would silently discard it.
 */
export async function upsertAgentIdentity(
	db: HyperIdleDb,
	input: {
		readonly agentId: string;
		readonly agentName: string;
		readonly body: string;
		readonly updatedBy: string;
	},
): Promise<string> {
	const id = `ki_af_${input.agentId}`;
	const ts = now();
	await db
		.insert(knowledgeItems)
		.values({
			id,
			scopeKind: "user",
			scopeId: input.agentId,
			topic: null,
			title: `${input.agentName || input.agentId} — identity`,
			body: input.body,
			format: "markdown",
			status: "active",
			version: 1,
			role: "agent_file",
			parentKind: "agent",
			parentId: input.agentId,
			updatedBy: input.updatedBy,
			createdAt: ts,
			updatedAt: ts,
		})
		.onConflictDoNothing();
	// Kernel row and projection travel together, as knowledge always writes them.
	await db
		.insert(knowledgeAppProjection)
		.values({
			id: `kp_af_${input.agentId}`,
			knowledgeItemId: id,
			layer: null,
			scopeId: input.agentId,
		})
		.onConflictDoNothing();
	return id;
}

/**
 * @lore knowledge-attachment-slot: the retired predicate was
 * `scopeKind='user' AND scopeId=agentId` — a reverse lookup. This now resolves
 * through the parent slot instead; scope plays no part in finding the item.
 */
export async function getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null> {
	const item = await getParentedItem(db, {
		parentKind: "agent",
		parentId: agentId,
		role: "agent_file",
		status: "active",
	});
	return item?.body ?? null;
}

/**
 * The identity document id for each of `agentIds`, for agents that have one.
 *
 * The agent list needs to link every agent to the document that says who it is,
 * and one query for the whole list beats one per agent.
 */
export async function getAgentIdentityIds(
	db: HyperIdleDb,
	agentIds: readonly string[],
): Promise<Map<string, string>> {
	return listParentedItemIds(db, {
		parentKind: "agent",
		parentIds: agentIds,
		role: "agent_file",
		status: "active",
	});
}

export async function upsertPluginDocument(
	db: HyperIdleDb,
	input: UpsertPluginDocumentInput,
): Promise<void> {
	await db
		.insert(knowledgeItems)
		.values({
			id: input.id,
			scopeKind: input.scopeKind,
			scopeId: input.scopeId,
			topic: input.topic,
			title: input.title,
			body: input.body,
			format: "markdown",
			status: "active",
			version: 1,
			role: input.role ?? "skill",
			parentKind: input.parentKind,
			parentId: input.parentId,
			// @lore BA9g: `plugin:<id>` was a provenance sentinel here. Migration
			// 0071 rewrote every existing one to `plugin` because it leaked into the
			// knowledge view as a raw author string, and the registry carries
			// provenance now — so a freshly installed document must not re-create it.
			updatedBy: "plugin",
			createdAt: input.ts,
			updatedAt: input.ts,
		})
		.onConflictDoUpdate({
			target: [knowledgeItems.id],
			set: {
				// D5: body is NOT in the update set — the user's edit wins.
				scopeKind: input.scopeKind,
				scopeId: input.scopeId,
				topic: input.topic,
				// A reinstall over a row created before the parent column existed
				// must repair the binding, exactly as this set already repairs
				// scope and status. The parent is not a person's field, so nothing
				// a human wrote is discarded by overwriting it.
				parentKind: input.parentKind,
				parentId: input.parentId,
				// Uninstall and disable both ARCHIVE these rows, and only `active`
				// ones reach a session. Leaving status alone here meant a reinstall
				// produced a plugin that reported `enabled`, restored its agent and
				// routines, and still delivered no skills to anyone — the rows came
				// back archived and stayed that way. Installing is a deliberate act;
				// it makes the contribution live again. Distinct from `body`, which
				// stays untouched so a person's edit survives.
				status: "active" as const,
				updatedAt: input.ts,
			},
		});
	// Kernel row and projection travel together, as knowledge always writes them.
	// @lore BA9g: this write was MISSING. Migrations 0068/0069/0071 all insert a
	// projection and their tests assert "a document with no projection is a state
	// production cannot produce" — while the install path produced exactly that.
	// Migrated documents appeared in scope-filtered views (which inner-join the
	// projection) and freshly installed ones did not.
	await db
		.insert(knowledgeAppProjection)
		.values({
			id: `kp_${input.id}`,
			knowledgeItemId: input.id,
			layer: scopeToLayer(input.scopeKind as (typeof SCOPE_KINDS)[number]),
			scopeId: input.scopeId,
		})
		.onConflictDoNothing();
}

/**
 * Set the status of all knowledge items for a plugin (by topic).
 * Used by the plugin disable/enable lifecycle in the route layer.
 *
 * status='archived' → skills stop reaching sessions (assembler filters status='active').
 * status='active'   → skills are restored on enable.
 *
 * @lore BA9d: the route cannot write the `knowledge_items` table directly
 * (governance boundary) — it calls this function instead. This is a topic-level
 * bulk update: ALL items with topic=`plugin:${pluginId}` are affected,
 * including any the user has edited (their body survives in the row; only the
 * status changes). There is NO restore path for user-edited skill bodies on
 * disable/remove — skills do not go through plugin_configuration_defaults, so
 * restorePluginContribution() cannot recover them.
 */
/**
 * Set status on the named knowledge documents.
 *
 * @lore BA9g: it took a `pluginId` and matched `topic = 'plugin:<id>'`. The
 * topic is a person's field — editing it silently orphaned a document from
 * uninstall and disable, permanently. The plugin service names the documents
 * now, and `topic` means what it says.
 */
export async function setKnowledgeStatus(
	exec: WriteExecutor,
	ids: readonly string[],
	status: "active" | "archived",
): Promise<void> {
	if (ids.length === 0) return;
	await exec
		.update(knowledgeItems)
		.set({ status, updatedAt: new Date().toISOString() })
		.where(inArray(knowledgeItems.id, [...ids]));
}

/**
 * Overwrite a skill's body with the plugin's original content and reset
 * updatedBy back to `plugin:${pluginId}`, marking the item as no longer
 * detached from the plugin.
 *
 * Called by the restore-contribution route when kind="skill" (D12): the
 * route reads the SKILL.md from install_path on disk and passes the body
 * here so knowledge-repository stays pure (no filesystem access).
 *
 * @lore D12: "restore to original version just means we import from the
 * plugin again. the plugin is the original version." — founder, BA9/founder-decisions.md.
 * We deliberately do NOT store a separate copy in plugin_configuration_defaults;
 * the file on disk IS the authoritative original.
 */
/**
 * Put the plugin's version of a contributed document back.
 *
 * @lore BA9g: this also reset `updatedBy` to `plugin:<id>` to clear the
 * "detached" signal. That sentinel is gone — detachment is a registry column,
 * and `updated_by` names a person again. The caller clears it.
 */
export async function restorePluginDocumentBody(
	exec: WriteExecutor,
	documentId: string,
	body: string,
	restoredBy: string,
): Promise<void> {
	await exec
		.update(knowledgeItems)
		.set({ body, updatedBy: restoredBy, updatedAt: new Date().toISOString() })
		.where(eq(knowledgeItems.id, documentId));
}
