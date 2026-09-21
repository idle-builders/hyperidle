import type {
	DocumentRow as DbDocumentRow,
	NewChange,
	Team,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import {
	canReadDocument,
	type DocumentAs,
	type DocumentParentKind,
	type DocumentView,
	type DocumentRow as DomainDocumentRow,
	documentAs,
	type OpenDocumentInput,
	openDocument as openDocumentDeclaration,
	type Problem,
	type SearchDocumentsInput,
	scopeKindToLabel,
	searchDocuments as searchDocumentsDeclaration,
	searchDocumentsInvariants,
} from "@hyperidle/domain-model";
import type { Action, ActionContext } from "./action-types.js";
import {
	bumpRead,
	type DocumentSearchFilter,
	type DocumentSearchViewer,
	getDocument,
	listAncestors,
	searchDocumentRows,
} from "./document-store.js";

/**
 * The document module's outward-facing deps — architecture.md §8.1. Declared
 * in full here (the read half's own deps plus the write half's, which B6a
 * adds the implementation for): `changes`, `openParent` and `onBodyChanged`
 * are unused by `search_documents`/`open_document` and sit ready for
 * `edit_document`.
 */
export interface DocumentActionsDeps {
	readonly changes: {
		appendChange(exec: WriteExecutor, row: NewChange): Promise<unknown>;
	};
	readonly users: {
		getUserById(exec: WriteExecutor, id: string): Promise<User | undefined>;
		/** agents owned by this person — founder ruling 5. */
		listOwnedBy(exec: WriteExecutor, ownerId: string): Promise<readonly User[]>;
	};
	readonly org: { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
	/**
	 * Existence of a `task`/`thread` parent, asked of the module that owns it,
	 * plus that parent's team — A4's task-team fallback needs both, and one
	 * crossing is cheaper than two.
	 */
	readonly openParent: (
		ctx: ActionContext,
		kind: "task" | "thread",
		id: string,
	) => Promise<{ readonly exists: boolean; readonly teamId?: string }>;
	/**
	 * Decided (O1): bound in `compose.ts` to `markDetached`, called inside the
	 * edit's transaction when `body` changed. BC5's subscriptions delete it.
	 */
	readonly onBodyChanged: (exec: WriteExecutor, documentId: string) => Promise<void>;
	readonly wsPush?: (topic: string, envelope: unknown) => void;
}

const logger = createLogger({ pkg: "document.document-actions" });

// ---------------------------------------------------------------------------
// Row -> domain mapping. The store's row has no `as` column (architecture.md
// §3.6 — derived, never stored); `documentAs` derives it back. The rest of
// the fields already share their names with the domain `DocumentRow`, so the
// structural cast (the same shape `task-actions.ts`'s `as unknown as
// DomainTask` already uses) stands in for a sixteen-field manual copy.
// ---------------------------------------------------------------------------
function toDocumentRow(row: DbDocumentRow): DomainDocumentRow {
	return {
		...(row as unknown as Omit<DomainDocumentRow, "as">),
		as: documentAs(row),
	};
}

/**
 * §5.1's `:subjects`/`:viewerTeamId` — resolved once per call, exactly as
 * `thread` already resolves `listOwnedBy` (`thread-actions.ts:77`).
 * `:subjects` is the actor plus every agent that actor owns (founder ruling
 * 5); `:viewerTeamId` is the actor's own team, read off their own row — NOT
 * `deps.org.getTeam`, which looks a team up by id, not by member.
 */
async function resolveViewer(
	ctx: ActionContext,
	deps: DocumentActionsDeps,
): Promise<DocumentSearchViewer> {
	const [actorUser, owned] = await Promise.all([
		deps.users.getUserById(ctx.db, ctx.actor),
		deps.users.listOwnedBy(ctx.db, ctx.actor),
	]);
	return {
		subjects: [ctx.actor, ...owned.map((u) => u.id)],
		viewerTeamId: actorUser?.teamId ?? null,
	};
}

/**
 * Lifted from `routes/knowledge.ts`'s `resolveScopeName` (`:84-108`) — the
 * route keeps its own copy until it is deleted later (B20). Narrowed to the
 * three scope kinds `SCOPE_KINDS` still has (`factory`/`team`/`user` —
 * `task`/`product`/`practice`/`filesystem` are already gone from the type),
 * and rewritten against this module's own injected `deps` instead of
 * `findUser`/`getTeam` imported directly — a nested Service reaches a
 * sibling only through a port (architecture.md §8.1).
 */
export async function resolveScopeName(
	deps: Pick<DocumentActionsDeps, "users" | "org">,
	exec: WriteExecutor,
	scopeKind: string,
	scopeId: string | null,
): Promise<string> {
	// factory always resolves to "Factory" — NOT routed through
	// scopeKindToLabel (which would return "Shared"); a deliberate override.
	if (scopeKind === "factory") return "Factory";

	if (!scopeId) return scopeKindToLabel(scopeKind);

	if (scopeKind === "user") {
		const user = await deps.users.getUserById(exec, scopeId);
		return user?.name ?? scopeKindToLabel("user");
	}

	if (scopeKind === "team") {
		const team = await deps.org.getTeam(exec, { id: scopeId });
		return team?.name ?? scopeKindToLabel("team");
	}

	return scopeKindToLabel(scopeKind);
}

/** `SearchDocumentsInput` -> `DocumentSearchFilter`, dropping every `undefined`
 * field rather than passing it through — the store's own filter type has no
 * optional-vs-absent distinction to preserve. */
function toSearchFilter(input: SearchDocumentsInput): DocumentSearchFilter {
	return {
		...(input.ids !== undefined ? { ids: input.ids } : {}),
		...(input.text !== undefined ? { text: input.text } : {}),
		...(input.inTree !== undefined ? { inTree: input.inTree } : {}),
		...(input.parent !== undefined ? { parent: input.parent } : {}),
		...(input.slot !== undefined ? { slot: input.slot } : {}),
		...(input.status !== undefined ? { status: input.status } : {}),
		...(input.scopeKind !== undefined ? { scopeKind: input.scopeKind } : {}),
		...(input.as !== undefined ? { as: input.as as DocumentAs } : {}),
		...(input.unusedSince !== undefined ? { unusedSince: input.unusedSince } : {}),
		...(input.sort !== undefined ? { sort: input.sort } : {}),
		...(input.limit !== undefined ? { limit: input.limit } : {}),
		...(input.offset !== undefined ? { offset: input.offset } : {}),
	};
}

/**
 * Same parent, `row` excluded, same order (architecture.md §3.4). A
 * non-root row (a real `parentKind`) reuses `search_documents`'s own
 * `parent` shape. A root row (`parentKind === null`) has no `parent` shape
 * to ask for — `search_documents`'s schema requires a `kind` — so this reads
 * the whole browsable tree (`inTree: true`, the same 200-row cap
 * `DocumentList.tsx` already accepts, architecture.md §5.2) and keeps only
 * the other roots, in the tree's own `position, title` order.
 */
async function siblingsOf(
	ctx: ActionContext,
	viewer: DocumentSearchViewer,
	row: DbDocumentRow,
): Promise<DbDocumentRow[]> {
	if (row.parentKind !== null && row.parentId !== null) {
		const rows = await searchDocumentRows(
			ctx.db,
			{ parent: { kind: row.parentKind as DocumentParentKind, id: row.parentId } },
			viewer,
		);
		return rows.filter((r) => r.id !== row.id);
	}
	const rows = await searchDocumentRows(ctx.db, { inTree: true }, viewer);
	return rows.filter((r) => r.parentKind === null && r.id !== row.id);
}

/**
 * Builds the `DocumentView` for an already-loaded row. Counts nothing —
 * `open_document.run` is the visibility check plus this plus `bumpRead`;
 * `edit_document.run` (B6a) calls this directly on the row it just wrote, so
 * an edit is never a read (architecture.md §6.7). Copying `edit_task`'s
 * `return openTaskRun(...)` here would be the bug this split avoids —
 * top-level and exported (not nested inside `createDocumentActions`) so it
 * is directly testable on its own, independent of the visibility door.
 */
export async function assembleDocumentView(
	ctx: ActionContext,
	deps: DocumentActionsDeps,
	row: DbDocumentRow,
): Promise<DocumentView> {
	const viewer = await resolveViewer(ctx, deps);
	const [ancestorRows, childRows, siblingRows, scopeName] = await Promise.all([
		listAncestors(ctx.db, row.id),
		searchDocumentRows(ctx.db, { parent: { kind: "document", id: row.id } }, viewer),
		siblingsOf(ctx, viewer, row),
		resolveScopeName(deps, ctx.db, row.scopeKind, row.scopeId),
	]);
	return {
		document: toDocumentRow(row),
		ancestors: ancestorRows.map(toDocumentRow),
		children: childRows.map(toDocumentRow),
		siblings: siblingRows.map(toDocumentRow),
		scopeName,
	};
}

export function createDocumentActions(deps: DocumentActionsDeps): readonly Action[] {
	// -----------------------------------------------------------------------
	// search_documents
	// -----------------------------------------------------------------------
	async function searchDocumentsRun(
		ctx: ActionContext,
		input: SearchDocumentsInput,
	): Promise<
		{ ok: true; data: DomainDocumentRow[] } | { ok: false; problems: readonly Problem[] }
	> {
		const pureProblems = searchDocumentsInvariants(input);
		if (pureProblems.length > 0) return { ok: false, problems: pureProblems };

		const viewer = await resolveViewer(ctx, deps);
		const rows = await searchDocumentRows(ctx.db, toSearchFilter(input), viewer);
		return { ok: true, data: rows.map(toDocumentRow) };
	}

	// -----------------------------------------------------------------------
	// open_document
	// -----------------------------------------------------------------------
	async function openDocumentRun(
		ctx: ActionContext,
		input: OpenDocumentInput,
	): Promise<{ ok: true; data: DocumentView } | { ok: false; problems: readonly Problem[] }> {
		const row = await getDocument(ctx.db, input.id);
		const viewer = await resolveViewer(ctx, deps);
		if (!(row && canReadDocument(viewer.subjects, viewer.viewerTeamId, row))) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Document ${input.id} not found` }],
			};
		}

		// The read count bump — after the visibility check, never before, so a
		// refused open counts nothing (architecture.md §6.7). Fire-and-forget
		// relative to the response: awaited, but a failure is logged and
		// swallowed rather than failing the read.
		try {
			await bumpRead(ctx.db, row.id, ctx.now);
		} catch (error) {
			logger.error("document read bump failed", {
				documentId: row.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Re-read rather than hand-incrementing the counters locally — the
		// response then always reflects the row's real state, bump succeeded
		// or not.
		const freshRow = (await getDocument(ctx.db, row.id)) ?? row;
		return { ok: true, data: await assembleDocumentView(ctx, deps, freshRow) };
	}

	// -----------------------------------------------------------------------
	// edit_document — B6a (the write half) adds it here.
	// -----------------------------------------------------------------------

	return [
		{ declaration: searchDocumentsDeclaration, run: searchDocumentsRun } as Action,
		{ declaration: openDocumentDeclaration, run: openDocumentRun } as Action,
	];
}
