import { randomUUID } from "node:crypto";
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
	type DocumentSlot,
	type DocumentView,
	type DocumentRow as DomainDocumentRow,
	documentAs,
	type EditDocumentInput,
	editDocument as editDocumentDeclaration,
	editDocumentInvariants,
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
	assertParentInvariants,
	assertSlotFree,
	bumpRead,
	DocumentInvariantError,
	type DocumentSearchFilter,
	type DocumentSearchViewer,
	getDocument,
	insertDocument,
	listAncestors,
	nextPositionForParent,
	searchDocumentRows,
	updateDocument,
} from "./document-store.js";

/**
 * The document module's outward-facing deps — architecture.md §8.1. `changes`
 * and `onBodyChanged` are written to only by `edit_document`; `openParent` is
 * read by `edit_document` for a `task`/`thread` parent's existence and team.
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

/**
 * Thrown inside `edit_document`'s transaction to abort the write and surface
 * a `Problem` list — the same shape `thread-actions.ts`'s `VerdictRaceConflict`
 * uses. Throwing (rather than returning) inside `db.transaction` rolls the
 * write back, so "a refused edit writes nothing" holds even for the checks
 * that must run against live state inside the transaction (architecture.md
 * §4.2's tree invariants — `reparent`'s own doc comment on why they can't run
 * before the transaction opens).
 */
class EditRefused extends Error {
	readonly problems: readonly Problem[];
	constructor(problems: readonly Problem[]) {
		super("edit refused");
		this.problems = problems;
	}
}

/**
 * A `changes` row `edit_document` wrote inside its own transaction, captured
 * for the post-commit push — architecture.md §6.3, §7. `kind` here is the DB
 * vocabulary (`changes_kind_ck`); the wire `kind` is derived from it, never
 * the other way around (mirrors `thread-actions.ts`'s `PushableChange`).
 */
interface PushableChange {
	readonly id: string;
	readonly objectId: string;
	readonly kind: "created" | "changed";
	readonly actor: string;
	readonly before: Record<string, unknown> | null;
	readonly after: Record<string, unknown>;
	readonly at: string;
}

function wireKindFor(kind: PushableChange["kind"]): "document.created" | "document.changed" {
	return `document.${kind}` as "document.created" | "document.changed";
}

/**
 * Post-commit push, once per `changes` row, on both `document:<id>` and the
 * global `documents` topic (architecture.md §7). `documents` carries no
 * field values at all — a memory's title is as private as its body, and
 * `documents` is a topic any signed-in identity may subscribe to; the hooks
 * re-run their own `call()` on any matching frame, so nothing needs the
 * values. A no-op when `deps.wsPush` is absent (its binding is B9).
 */
function pushChanges(deps: DocumentActionsDeps, rows: readonly PushableChange[]): void {
	if (!deps.wsPush) return;
	for (const row of rows) {
		const kind = wireKindFor(row.kind);
		const docTopic = `document:${row.objectId}`;
		deps.wsPush(docTopic, {
			type: "update",
			topic: docTopic,
			kind,
			data: {
				id: row.id,
				object: "document",
				objectId: row.objectId,
				kind,
				actor: row.actor,
				before: row.before,
				after: row.after,
				at: row.at,
			},
		});
		deps.wsPush("documents", {
			type: "update",
			topic: "documents",
			kind,
			data: {
				id: row.id,
				object: "document",
				objectId: row.objectId,
				kind,
				actor: row.actor,
				before: null,
				after: null,
				at: row.at,
			},
		});
	}
}

/** Only the fields that differ (plus `id`) — the `changes` row's diff shape.
 * Reused verbatim from `task-actions.ts:190-208` (architecture.md §6.3). */
function diffFields(
	id: string,
	prev: DbDocumentRow | null,
	patch: Readonly<Record<string, unknown>>,
): { before: Record<string, unknown> | null; after: Record<string, unknown> } {
	if (prev === null) {
		return { before: null, after: { id, ...patch } };
	}
	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch)) {
		const prevValue = (prev as unknown as Record<string, unknown>)[key];
		if (prevValue !== value) {
			before[key] = prevValue;
			after[key] = value;
		}
	}
	return { before: { id, ...before }, after: { id, ...after } };
}

/**
 * A4's default-scope derivation — architecture.md §0 A4, §3.6: "actor's team
 * → calling task's team → factory". `viewer.viewerTeamId` is already "the
 * actor's own team, read off their own row" (§8.1's `resolveViewer`), the
 * same value the deleted `write_memory` tool read as `ctx.teamId`
 * (`tool-definitions.ts:88-97` at the tree this architecture was read
 * against — the agent's baked team, `provisioner.ts:1088`). Only when that is
 * absent does the calling task's own team (via `deps.openParent`) apply.
 */
async function deriveDefaultScope(
	ctx: ActionContext,
	deps: DocumentActionsDeps,
	viewer: DocumentSearchViewer,
): Promise<{ readonly scopeKind: string; readonly scopeId: string | null }> {
	let teamId = viewer.viewerTeamId;
	if (!teamId && ctx.caller?.taskId) {
		const parent = await deps.openParent(ctx, "task", ctx.caller.taskId);
		teamId = parent.teamId ?? null;
	}
	return teamId ? { scopeKind: "team", scopeId: teamId } : { scopeKind: "factory", scopeId: null };
}

/**
 * The artifact stamp — architecture.md §3.6: "the same server-side stamp
 * `send_message` uses for `review.taskId`". `null` only when the caller has
 * neither, which `artifact_no_parent` (I6) already refuses before this is
 * ever called with no explicit parent.
 */
function stampedArtifactParent(
	ctx: ActionContext,
): { readonly kind: "task" | "thread"; readonly id: string } | null {
	if (ctx.caller?.taskId) return { kind: "task", id: ctx.caller.taskId };
	if (ctx.caller?.threadId) return { kind: "thread", id: ctx.caller.threadId };
	return null;
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
	// edit_document — architecture.md §3.5, §3.6, §4.1's forcings, §4.2, §6.3.
	// An upsert on `id` (A3): absent ⇒ create with a new uuid; present ⇒ edit,
	// or create with that id. A scope narrowing is accepted here and writes
	// only the edited document — the cascade over its descendants is B6b.
	// -----------------------------------------------------------------------
	async function editDocumentRun(
		ctx: ActionContext,
		input: EditDocumentInput,
	): Promise<{ ok: true; data: DocumentView } | { ok: false; problems: readonly Problem[] }> {
		// -- 1. the raw, unfiltered upsert probe (architecture.md §4.3 case 7) --
		const rawPrev = input.id ? await getDocument(ctx.db, input.id) : null;
		const viewer = await resolveViewer(ctx, deps);

		let prev: DbDocumentRow | null = null;
		if (input.id && rawPrev) {
			if (!canReadDocument(viewer.subjects, viewer.viewerTeamId, rawPrev)) {
				// D1 — an existing-but-invisible id answers exactly `not_found`
				// and creates nothing (never a second row, never a leak).
				return {
					ok: false,
					problems: [{ code: "not_found", message: `Document ${input.id} not found` }],
				};
			}
			prev = rawPrev;
		}

		// -- 2. pure invariants (architecture.md §4.1) --------------------------
		const domainPrev = prev ? toDocumentRow(prev) : null;
		const caller = {
			hasCallingTask: Boolean(ctx.caller?.taskId),
			hasCallingThread: Boolean(ctx.caller?.threadId),
		};
		const pureProblems = editDocumentInvariants(input, domainPrev, caller);
		if (pureProblems.length > 0) return { ok: false, problems: pureProblems };

		// -- 3. D7 stale — the edited document only; a version on a create is
		// ignored, not an error (architecture.md §4.3 case 6). -----------------
		if (prev !== null && input.version !== undefined && input.version !== prev.version) {
			return {
				ok: false,
				problems: [
					{
						code: "stale",
						message: "The document changed since you read it — open it again and retry.",
					},
				],
			};
		}

		// -- 4. §3.6's forcings — derive the written value for every field ------
		const isCreate = prev === null;
		const effectiveAs: DocumentAs = input.as ?? (prev ? documentAs(prev) : "document");

		const effectiveSlot: DocumentSlot =
			effectiveAs === "memory"
				? "ordinary"
				: prev
					? (prev.slot as DocumentSlot)
					: (input.slot ?? "ordinary");

		let effectiveScopeKind: string;
		let effectiveScopeId: string | null;
		if (effectiveAs === "memory") {
			effectiveScopeKind = "user";
			effectiveScopeId = ctx.actor;
		} else if (input.scopeKind !== undefined) {
			effectiveScopeKind = input.scopeKind;
			effectiveScopeId = input.scopeId ?? null;
		} else if (prev) {
			effectiveScopeKind = prev.scopeKind;
			effectiveScopeId = prev.scopeId;
		} else {
			const derived = await deriveDefaultScope(ctx, deps, viewer);
			effectiveScopeKind = derived.scopeKind;
			effectiveScopeId = derived.scopeId;
		}

		let effectiveParent: { readonly kind: DocumentParentKind; readonly id: string } | null;
		if (effectiveAs === "memory") {
			effectiveParent = null;
		} else if (input.parent !== undefined) {
			effectiveParent =
				input.parent === null
					? effectiveAs === "artifact"
						? stampedArtifactParent(ctx)
						: null
					: input.parent;
		} else if (prev) {
			effectiveParent =
				prev.parentKind !== null && prev.parentId !== null
					? { kind: prev.parentKind as DocumentParentKind, id: prev.parentId }
					: null;
		} else {
			effectiveParent = effectiveAs === "artifact" ? stampedArtifactParent(ctx) : null;
		}

		const effectiveTitle = input.title ?? prev?.title ?? "";
		const effectiveBody = input.body ?? prev?.body ?? "";
		const effectiveFormat = input.format ?? prev?.format ?? "markdown";
		const effectiveStatus = input.status ?? prev?.status ?? "proposed";
		const bodyChanged = isCreate || (input.body !== undefined && input.body !== prev?.body);
		// A parent is only actively (re-)established at create, or when the
		// caller names one — an edit that omits `parent` never moves the
		// document (architecture.md §3.5: "Absent ⇒ no move").
		const parentActivelySet = isCreate || input.parent !== undefined;

		const id = prev?.id ?? input.id ?? randomUUID();
		const now = ctx.now;

		let writtenRow: DbDocumentRow | null = null;
		let pushRow: PushableChange | null = null;

		try {
			await ctx.db.transaction(async (tx) => {
				// -- D2/D8/D3/D4/D6 — re-checked against LIVE state inside the
				// transaction (the same reasoning `reparent`'s own doc comment
				// gives: two moves that each look legal outside a transaction can
				// together produce a cycle no single read would catch). ----------
				if (parentActivelySet && effectiveParent !== null) {
					if (effectiveParent.kind === "document") {
						const parentRow = await getDocument(tx, effectiveParent.id);
						if (!parentRow) {
							throw new EditRefused([
								{
									code: "parent_not_found",
									message: `No document with id '${effectiveParent.id}'.`,
									path: "parent",
								},
							]);
						}
						if (!canReadDocument(viewer.subjects, viewer.viewerTeamId, parentRow)) {
							throw new EditRefused([
								{
									code: "forbidden_parent",
									message: "You cannot see the document you named as a parent.",
									path: "parent",
								},
							]);
						}
						try {
							await assertParentInvariants(tx, {
								documentId: prev?.id,
								newParentId: effectiveParent.id,
								childScopeKind: effectiveScopeKind,
							});
						} catch (error) {
							if (error instanceof DocumentInvariantError) {
								throw new EditRefused([
									{ code: error.code, message: error.message, path: "parent" },
								]);
							}
							throw error;
						}
					} else if (effectiveParent.kind === "task" || effectiveParent.kind === "thread") {
						const parent = await deps.openParent(ctx, effectiveParent.kind, effectiveParent.id);
						if (!parent.exists) {
							throw new EditRefused([
								{
									code: "parent_not_found",
									message: `No ${effectiveParent.kind} with id '${effectiveParent.id}'.`,
									path: "parent",
								},
							]);
						}
					}
					// A `routine`/`agent` parent has no existence port
					// (architecture.md §8.1's `openParent` covers only
					// task/thread) and legacy `applyParentMove` never checked
					// these kinds either — kept as today's behaviour, not invented.
				}

				// -- D5 — reachable only at create (a move is refused first by
				// I10, architecture.md §4.3 case 2). ------------------------------
				if (isCreate && effectiveSlot !== "ordinary" && effectiveParent !== null) {
					try {
						await assertSlotFree(tx, effectiveParent.kind, effectiveParent.id, effectiveSlot);
					} catch (error) {
						if (error instanceof DocumentInvariantError) {
							throw new EditRefused([{ code: error.code, message: error.message, path: "slot" }]);
						}
						throw error;
					}
				}

				const parentChanged =
					isCreate ||
					(effectiveParent?.kind ?? null) !== (prev?.parentKind ?? null) ||
					(effectiveParent?.id ?? null) !== (prev?.parentId ?? null);
				const position =
					input.position !== undefined
						? input.position
						: parentChanged
							? await nextPositionForParent(
									tx,
									effectiveParent?.kind ?? null,
									effectiveParent?.id ?? null,
								)
							: (prev?.position ?? 0);

				const patch = {
					title: effectiveTitle,
					body: effectiveBody,
					format: effectiveFormat,
					status: effectiveStatus,
					slot: effectiveSlot,
					scopeKind: effectiveScopeKind,
					scopeId: effectiveScopeId,
					parentKind: effectiveParent?.kind ?? null,
					parentId: effectiveParent?.id ?? null,
					position,
					updatedBy: ctx.actor,
				};

				if (prev === null) {
					writtenRow = await insertDocument(tx, {
						id,
						...patch,
						version: 1,
						createdAt: now,
						updatedAt: now,
					});
					const { after } = diffFields(id, null, patch);
					const changeId = randomUUID();
					await deps.changes.appendChange(tx, {
						id: changeId,
						object: "document",
						objectId: id,
						kind: "created",
						actor: ctx.actor,
						before: null,
						after: JSON.stringify(after),
						at: now,
					});
					pushRow = {
						id: changeId,
						objectId: id,
						kind: "created",
						actor: ctx.actor,
						before: null,
						after,
						at: now,
					};
				} else {
					const updated = await updateDocument(tx, id, prev.version, patch, now);
					if (!updated) {
						// A true concurrent race between our pre-transaction read and
						// this write — the same fact D7 reports, caught here as a
						// belt-and-suspenders backstop over the CAS `WHERE` clause.
						throw new EditRefused([
							{
								code: "stale",
								message: "The document changed since you read it — open it again and retry.",
							},
						]);
					}
					writtenRow = updated;
					const { before, after } = diffFields(id, prev, patch);
					const changeId = randomUUID();
					await deps.changes.appendChange(tx, {
						id: changeId,
						object: "document",
						objectId: id,
						kind: "changed",
						actor: ctx.actor,
						before: JSON.stringify(before),
						after: JSON.stringify(after),
						at: now,
					});
					pushRow = {
						id: changeId,
						objectId: id,
						kind: "changed",
						actor: ctx.actor,
						before,
						after,
						at: now,
					};
				}

				// O1 — inside the same transaction, only when body changed.
				if (bodyChanged) {
					await deps.onBodyChanged(tx, id);
				}
			});
		} catch (error) {
			if (error instanceof EditRefused) {
				return { ok: false, problems: error.problems };
			}
			throw error;
		}

		if (!writtenRow) {
			throw new Error("edit_document: transaction committed without writing a row");
		}
		if (pushRow) pushChanges(deps, [pushRow]);

		// Never through `open_document.run` — that would count this write as a
		// read (architecture.md §6.7's trap).
		return { ok: true, data: await assembleDocumentView(ctx, deps, writtenRow) };
	}

	return [
		{ declaration: searchDocumentsDeclaration, run: searchDocumentsRun } as Action,
		{ declaration: openDocumentDeclaration, run: openDocumentRun } as Action,
		{ declaration: editDocumentDeclaration, run: editDocumentRun } as Action,
	];
}
