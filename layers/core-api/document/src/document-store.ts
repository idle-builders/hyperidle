/**
 * The document module's private row store — every `documents` read and write
 * Private to this package: the action layer (`document-actions.ts`) is the only caller.
 *
 * Functions here take an already-open `WriteExecutor` (the top-level db or an
 * open `tx`) and never open a transaction themselves — the caller owns the
 * transaction boundary, exactly like `thread-service.ts`'s
 * `findThreadForUpdate`/`updateThread` and `task-service.ts`'s equivalents.

 */

import { type DocumentRow, documents, type WriteExecutor } from "@hyperidle/db";
import type { DocumentAs, DocumentParentKind, DocumentSlot } from "@hyperidle/domain-model";
import { and, desc, eq, inArray, isNull, ne, not, or, type SQL, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Tree invariants — parent_not_found, cycle, depth_exceeded, scope_too_wide, slot_taken. Thrown, not returned;
// the exact stable `code`s the edit action turns into `Problem`s.
// ---------------------------------------------------------------------------

export type DocumentInvariantCode =
	| "parent_not_found"
	| "cycle"
	| "depth_exceeded"
	| "scope_too_wide"
	| "slot_taken";

export class DocumentInvariantError extends Error {
	readonly code: DocumentInvariantCode;

	constructor(code: DocumentInvariantCode, message: string) {
		super(message);
		this.name = "DocumentInvariantError";
		this.code = code;
	}
}

/** factory is widest, user is narrowest. */
const SCOPE_RANK: Readonly<Record<string, number>> = { factory: 0, team: 1, user: 2 };

function scopeRank(scopeKind: string): number {
	return SCOPE_RANK[scopeKind] ?? 0;
}

/** Backstop depth limit; the real guard is the cycle check. */
const MAX_TREE_DEPTH = 32;

/**
 * Walk up the `document` parent chain starting at `startId`, stopping at the
 * first non-`document` parent or a root. Returns `[startId, ...,
 * topmostDocumentAncestor]` — `chain.length` is exactly the number of
 * `document` ancestors a child parented under `startId` would inherit, so
 * `chain.length + 1` is that child's resulting depth.

 */
export async function walkDocumentAncestorChain(
	exec: WriteExecutor,
	startId: string,
): Promise<readonly string[]> {
	const chain: string[] = [];
	let currentId: string | null = startId;
	let guard = 0;
	while (currentId) {
		// A real cycle already in the stored tree would otherwise spin forever —
		// this bound only exists to fail loud instead.
		if (guard++ > 10_000) {
			throw new Error(
				"walkDocumentAncestorChain: exceeded safety bound — an existing cycle in the stored tree",
			);
		}
		chain.push(currentId);
		const [row] = await exec
			.select({ parentKind: documents.parentKind, parentId: documents.parentId })
			.from(documents)
			.where(eq(documents.id, currentId))
			.limit(1);
		if (row?.parentKind !== "document" || !row.parentId) break;
		currentId = row.parentId;
	}
	return chain;
}

/**
 * The tree invariants — no cycle, scope no wider than the parent's, depth <=
 * 32, and the named parent exists — run inside the same transaction as the
 * write that sets a parent, against LIVE state.
 *
 * Only evaluated when the new parent is a `document` — a task/thread/
 * subscription/agent parent inherits nothing and is never part of a cycle
 * (existence of those other four parent kinds is
 * not this store's job — `documents` is the only table this package owns,
 * per `table-owners.json`).
 */
export async function assertParentInvariants(
	exec: WriteExecutor,
	input: {
		/** Omitted for a create — a brand-new id cannot already be an ancestor. */
		readonly documentId?: string;
		readonly newParentId: string;
		readonly childScopeKind: string;
	},
): Promise<void> {
	const chain = await walkDocumentAncestorChain(exec, input.newParentId);

	if (input.documentId && chain.includes(input.documentId)) {
		throw new DocumentInvariantError("cycle", "That would put the document inside itself.");
	}
	if (chain.length >= MAX_TREE_DEPTH) {
		throw new DocumentInvariantError("depth_exceeded", "Documents nest 32 deep at most.");
	}

	const parentId = chain[0];
	const [parentRow] = await exec
		.select({ scopeKind: documents.scopeKind })
		.from(documents)
		.where(eq(documents.id, parentId ?? input.newParentId))
		.limit(1);
	if (!parentRow) {
		throw new DocumentInvariantError(
			"parent_not_found",
			`No document with id '${input.newParentId}'.`,
		);
	}
	if (scopeRank(input.childScopeKind) < scopeRank(parentRow.scopeKind)) {
		throw new DocumentInvariantError(
			"scope_too_wide",
			"This document reaches further than the one it would sit under.",
		);
	}
}

/**
 * A named slot (`skill`/`rule`/`agent_file`/`prompt`) may occupy at most one document per parent
 * (`doc_parent_slot_uq`). `ordinary` is not a named slot and is always free. Checked at create time —
 * a move cannot reach this because `slotted_document_cannot_move` refuses the move first.
 */
export async function assertSlotFree(
	exec: WriteExecutor,
	parentKind: string,
	parentId: string,
	slot: string,
): Promise<void> {
	if (slot === "ordinary") return;
	const [existing] = await exec
		.select({ id: documents.id })
		.from(documents)
		.where(
			and(
				eq(documents.parentKind, parentKind as DocumentParentKind),
				eq(documents.parentId, parentId),
				eq(documents.slot, slot as DocumentSlot),
			),
		)
		.limit(1);
	if (existing) {
		throw new DocumentInvariantError(
			"slot_taken",
			`That ${slot} place on this ${parentKind} is already taken.`,
		);
	}
}

/** Append-at-end position for a new or moved child of one parent (or among roots). */
export async function nextPositionForParent(
	exec: WriteExecutor,
	parentKind: string | null,
	parentId: string | null,
): Promise<number> {
	const condition =
		parentKind === null || parentId === null
			? and(isNull(documents.parentKind), isNull(documents.parentId))
			: and(eq(documents.parentKind, parentKind), eq(documents.parentId, parentId));
	const [row] = await exec
		.select({ maxPos: sql<number | null>`MAX(${documents.position})` })
		.from(documents)
		.where(condition);
	const max = row?.maxPos;
	return max == null ? 0 : Number(max) + 1;
}

// ---------------------------------------------------------------------------
// The scope cascade's pure read. Every descendant currently wider than `newScopeKind`, at any depth —
// the walk descends past an already-narrow node too, because a narrow branch can still hide a wider
// leaf further down. The cascade write turns the result into writes: one `changes` row and one version
// bump per returned row, both scope columns clamped to the parent's.
// ---------------------------------------------------------------------------

export async function listWiderDescendants(
	exec: WriteExecutor,
	rootId: string,
	newScopeKind: string,
): Promise<DocumentRow[]> {
	const wider: DocumentRow[] = [];
	let frontier: readonly string[] = [rootId];
	let guard = 0;
	while (frontier.length > 0) {
		if (guard++ > 10_000) {
			throw new Error(
				"listWiderDescendants: exceeded safety bound — an existing cycle in the tree",
			);
		}
		const children = await exec
			.select()
			.from(documents)
			.where(and(eq(documents.parentKind, "document"), inArray(documents.parentId, [...frontier])));
		for (const child of children) {
			if (scopeRank(child.scopeKind) < scopeRank(newScopeKind)) wider.push(child);
		}
		frontier = children.map((c) => c.id);
	}
	return wider;
}

/**
 * The cascade's write. Batched over
 * every id `listWiderDescendants` returned: both scope columns clamped to
 * the parent's new scope, `version` bumped by one (collateral, never version-
 * checked — a child is not the document being edited), `updatedAt` moved to
 * `now` because the row did change. No `changes` row here — the caller
 * appends one per id, carrying the parent edit's own actor and `at`
 * this function only ever writes `documents`.
 */
export async function narrowDescendantScope(
	exec: WriteExecutor,
	ids: readonly string[],
	scopeKind: string,
	scopeId: string | null,
	now: string,
): Promise<void> {
	if (ids.length === 0) return;
	await exec
		.update(documents)
		.set({ scopeKind, scopeId, version: sql`${documents.version} + 1`, updatedAt: now })
		.where(inArray(documents.id, [...ids]));
}

// ---------------------------------------------------------------------------
// Reads — get, the ancestor walk, `resolveParentChain`.
// ---------------------------------------------------------------------------

/** Raw, unfiltered read by id — the upsert probe's first step. */
export async function getDocument(exec: WriteExecutor, id: string): Promise<DocumentRow | null> {
	const [row] = await exec.select().from(documents).where(eq(documents.id, id)).limit(1);
	return row ?? null;
}

/**
 * Root-first ancestor chain of full rows, stopping at the first non-`document`
 * parent — `open_document`'s `ancestors` field.
 */
export async function listAncestors(exec: WriteExecutor, id: string): Promise<DocumentRow[]> {
	const chain = await walkDocumentAncestorChain(exec, id);
	const ancestorIds = chain.slice(1); // nearest-first, excluding the row itself
	if (ancestorIds.length === 0) return [];
	const rows = await exec
		.select()
		.from(documents)
		.where(inArray(documents.id, [...ancestorIds]));
	const byId = new Map(rows.map((r) => [r.id, r]));
	const result: DocumentRow[] = [];
	for (const id of ancestorIds) {
		const row = byId.get(id);
		if (row) result.push(row);
	}
	return result.reverse(); // root-first
}

/** One ancestor as the session assembler's `parentChain` needs it — enough to
 * materialise a directory + manifest entry without a second DB read at bake
 * time. */
export interface DocumentParentChainAncestor {
	readonly id: string;
	readonly title: string;
	readonly scopeKind: string;
	readonly version: number;
}

/**
 * Walk a document's ancestors, root first, stopping at the first non-`document` parent or the
 * depth-32 backstop. Returns a reduced shape for the session assembler; `listAncestors` is the
 * separate full-row walk `open_document` needs.
 */
export async function resolveParentChain(
	exec: WriteExecutor,
	documentId: string,
): Promise<readonly DocumentParentChainAncestor[]> {
	const chain: DocumentParentChainAncestor[] = [];
	let cursorId: string = documentId;
	for (let depth = 0; depth < MAX_TREE_DEPTH; depth++) {
		const [row] = await exec
			.select({ parentKind: documents.parentKind, parentId: documents.parentId })
			.from(documents)
			.where(eq(documents.id, cursorId))
			.limit(1);
		if (row?.parentKind !== "document" || !row.parentId) break;

		const [ancestor] = await exec
			.select({
				id: documents.id,
				title: documents.title,
				scopeKind: documents.scopeKind,
				version: documents.version,
			})
			.from(documents)
			.where(eq(documents.id, row.parentId))
			.limit(1);
		if (!ancestor) break;

		chain.unshift(ancestor);
		cursorId = ancestor.id;
	}
	return chain;
}

// ---------------------------------------------------------------------------
// search_documents — the one query. `viewer` is already-resolved context (`subjects`, `viewerTeamId`) —
// the caller resolves it once per call through `deps.users.listOwnedBy`, exactly as `thread` already does.
// ---------------------------------------------------------------------------

export interface DocumentSearchFilter {
	readonly ids?: readonly string[];
	readonly text?: string;
	readonly inTree?: boolean;
	readonly parent?: {
		readonly kind: DocumentParentKind;
		readonly id?: string;
		readonly ids?: readonly string[];
	};
	readonly slot?: DocumentSlot;
	readonly status?: string;
	readonly scopeKind?: string;
	readonly as?: DocumentAs;
	readonly unusedSince?: string;
	readonly sort?: "least_used" | "most_read";
	readonly limit?: number;
	readonly offset?: number;
}

export interface DocumentSearchViewer {
	readonly subjects: readonly string[];
	readonly viewerTeamId: string | null;
}

/**
 * `parent_kind IN ('task','thread') OR ( (scope_kind<>'user' OR slot<>
 * 'ordinary' OR scope_id = ANY(:subjects)) AND (scope_kind<>'team' OR
 * scope_id = :viewerTeamId) )`. The subject is `scope_id`, never `updated_by`.
 */
function visibilityPredicate(subjects: readonly string[], viewerTeamId: string | null): SQL {
	const isArtifact = inArray(documents.parentKind, ["task", "thread"]);
	const notPrivateOrOwned = or(
		ne(documents.scopeKind, "user"),
		ne(documents.slot, "ordinary"),
		subjects.length > 0 ? inArray(documents.scopeId, [...subjects]) : sql`false`,
	) as SQL;
	const notTeamOrMatchesViewer = (
		viewerTeamId !== null
			? or(ne(documents.scopeKind, "team"), eq(documents.scopeId, viewerTeamId))
			: ne(documents.scopeKind, "team")
	) as SQL;
	return or(isArtifact, and(notPrivateOrOwned, notTeamOrMatchesViewer)) as SQL;
}

/**
 * `as` translated to predicates, never a post-filter. A memory is a user-scoped,
 * parentless, `ordinary`-slot row — not in the tree, and not a row `slot`
 * alone already makes public.
 *
 * Review-found defect: an earlier version of this predicate dropped the
 * `slot` term (a memory's slot is always forced to `ordinary` at write time,
 * so checking it here seemed to only re-derive `parent_kind IS
 * NULL`) — but `visibilityPredicate` exempts ANY non-ordinary slot from the
 * privacy check regardless of scope, so a user-scoped, parentless row with a
 * non-ordinary slot matched `as:"memory"` here while being world-readable
 * there: the Memories filter would show a row every other person could
 * already read. `slot` must agree with the visibility predicate, not just
 * with what a memory's own write path forces.
 *
 * `notArtifact` is written with an explicit `isNull` branch — `NOT
 * (parent_kind IN (...))` alone evaluates to SQL NULL (excluded) for a NULL
 * `parent_kind`, which would wrongly drop every root-level document from its
 * own `as` filter. Shared by the `memory` and `document` arms below.
 */
const notArtifact = or(
	isNull(documents.parentKind),
	not(inArray(documents.parentKind, ["task", "thread"])),
) as SQL;

const isMemory = and(
	eq(documents.scopeKind, "user"),
	isNull(documents.parentKind),
	eq(documents.slot, "ordinary"),
) as SQL;

function asPredicate(as: DocumentAs): SQL {
	switch (as) {
		case "artifact":
			return inArray(documents.parentKind, ["task", "thread"]);
		case "memory":
			return and(notArtifact, isMemory) as SQL;
		case "document":
			return and(notArtifact, not(isMemory)) as SQL;
	}
}

export function searchDocumentRows(
	exec: WriteExecutor,
	input: DocumentSearchFilter,
	viewer: DocumentSearchViewer,
): Promise<DocumentRow[]> {
	const conditions: (SQL | undefined)[] = [
		visibilityPredicate(viewer.subjects, viewer.viewerTeamId),
	];

	if (input.inTree === true) {
		conditions.push(or(isNull(documents.parentKind), eq(documents.parentKind, "document")) as SQL);
	} else if (input.parent !== undefined) {
		conditions.push(eq(documents.parentKind, input.parent.kind));
		if (input.parent.id !== undefined) {
			conditions.push(eq(documents.parentId, input.parent.id));
		} else if (input.parent.ids !== undefined) {
			conditions.push(inArray(documents.parentId, [...input.parent.ids]));
		} else {
			// Defensive backstop — a parent-kind-only query would answer every row of that kind,
			// visibility aside. `searchDocumentsInvariants` already refuses this
			// shape at every client door; this throw is what makes an internal
			// caller unable to bypass it by calling the store directly.
			throw new Error("searchDocumentRows: a parent filter must name id or ids");
		}
	}

	if (input.as !== undefined) conditions.push(asPredicate(input.as));
	if (input.ids !== undefined) conditions.push(inArray(documents.id, [...input.ids]));
	if (input.text !== undefined) {
		const pattern = `%${input.text.replace(/[\\%_]/g, "\\$&")}%`;
		conditions.push(
			or(
				sql`${documents.title} ILIKE ${pattern} ESCAPE '\\'`,
				sql`${documents.body} ILIKE ${pattern} ESCAPE '\\'`,
			) as SQL,
		);
	}
	if (input.slot !== undefined) conditions.push(eq(documents.slot, input.slot));
	if (input.status !== undefined) conditions.push(eq(documents.status, input.status));
	if (input.scopeKind !== undefined) conditions.push(eq(documents.scopeKind, input.scopeKind));
	if (input.unusedSince !== undefined) {
		const cutoff = input.unusedSince;
		conditions.push(sql`COALESCE(${documents.lastUsedAt}, ${documents.createdAt}) < ${cutoff}`);
		conditions.push(sql`COALESCE(${documents.lastReadAt}, ${documents.createdAt}) < ${cutoff}`);
	}

	const where = and(...conditions) ?? sql`true`;
	let query = exec.select().from(documents).where(where).$dynamic();

	if (input.sort === "least_used") {
		query = query.orderBy(
			sql`COALESCE(${documents.lastUsedAt}, ${documents.createdAt}) ASC`,
			documents.id,
		);
	} else if (input.sort === "most_read") {
		query = query.orderBy(desc(documents.readCount), documents.id);
	} else if (input.inTree === true || input.parent !== undefined) {
		query = query.orderBy(documents.position, documents.title);
	} else {
		// No explicit ordering for a plain filter search or an `ids` batch — the text row's order is the fallback.
		query = query.orderBy(desc(documents.updatedAt), documents.id);
	}

	return query.limit(input.limit ?? 200).offset(input.offset ?? 0);
}

// ---------------------------------------------------------------------------
// The transactional write shape. Plain row writes; the caller wraps these in its own `db.transaction`,
// alongside `deps.changes.appendChange` and, for a narrowing edit, the cascade's writes.
// ---------------------------------------------------------------------------

type DocumentInsertValues = typeof documents.$inferInsert;

export async function insertDocument(
	exec: WriteExecutor,
	values: DocumentInsertValues,
): Promise<DocumentRow> {
	const [row] = await exec.insert(documents).values(values).returning();
	if (!row) {
		throw new Error(`insertDocument: failed to read back document ${values.id}`);
	}
	return row;
}

/**
 * Every caller-mutable field except the four usage columns (`read_count`,
 * `last_read_at`, `session_use_count`, `last_used_at`) — never writable through `edit_document`. Omitting them from the
 * patch type keeps that invariant enforced at the call site, not just by
 * convention.
 */
export type DocumentPatch = Partial<
	Omit<
		DocumentInsertValues,
		"id" | "createdAt" | "version" | "readCount" | "lastReadAt" | "sessionUseCount" | "lastUsedAt"
	>
>;

/**
 * Version-guarded update. Returns the updated row, or `null` when the WHERE
 * clause matched nothing — either the id doesn't exist or `expectedVersion`
 * is stale; disambiguating (`not_found` vs `stale`) is the edit action's job.
 */
export async function updateDocument(
	exec: WriteExecutor,
	id: string,
	expectedVersion: number,
	patch: DocumentPatch,
	now: string,
): Promise<DocumentRow | null> {
	const rows = await exec
		.update(documents)
		.set({ ...patch, version: expectedVersion + 1, updatedAt: now })
		.where(and(eq(documents.id, id), eq(documents.version, expectedVersion)))
		.returning();
	return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Usage counting — two plain `UPDATE`s, never a
// `changes` row, never a `version`/`updated_at` bump.
// ---------------------------------------------------------------------------

/** `open_document` calls this once, after the visibility check. */
export async function bumpRead(exec: WriteExecutor, id: string, now: string): Promise<void> {
	await exec
		.update(documents)
		.set({ readCount: sql`${documents.readCount} + 1`, lastReadAt: now })
		.where(eq(documents.id, id));
}

/** `assembleSessionDocuments` calls this once per call, batched over every
 * document it is about to return. */
export async function bumpSessionUse(
	exec: WriteExecutor,
	ids: readonly string[],
	now: string,
): Promise<void> {
	if (ids.length === 0) return;
	await exec
		.update(documents)
		.set({ sessionUseCount: sql`${documents.sessionUseCount} + 1`, lastUsedAt: now })
		.where(inArray(documents.id, [...ids]));
}
