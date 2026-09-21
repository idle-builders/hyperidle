import { z } from "zod";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID } from "../types.js";
import type { ActionDeclaration, Problem } from "./action.js";

/**
 * @lore BC4: the document action list — search, open, edit. This is what
 * replaces the knowledge item's hand-mirrored types, `routes/knowledge.ts`
 * and the `knowledge_app_projection` side table. `core-ui` imports this file
 * directly — never `core-api` — because the browser needs the exact same
 * `input`/invariant shape the server runs (architecture.md §3).
 */

// ---------------------------------------------------------------------------
// Vocabulary — moves here from the deleted `framework/domain-model/src/
// knowledge.ts` (architecture.md §3.1, §2). `role` is renamed `slot` (A6).
// ---------------------------------------------------------------------------

export const DOCUMENT_STATUSES = ["proposed", "active", "stale", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
	proposed: "Proposed",
	active: "Active",
	stale: "Stale",
	archived: "Archived",
};

export const DOCUMENT_SLOTS = ["ordinary", "skill", "rule", "agent_file", "prompt"] as const;
export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number];

export const DOCUMENT_SLOT_LABEL: Record<DocumentSlot, string> = {
	ordinary: "Knowledge",
	skill: "Skill",
	rule: "Rule",
	agent_file: "Identity",
	prompt: "Prompt",
};

export const DOCUMENT_PARENT_KINDS = ["document", "task", "thread", "routine", "agent"] as const;
export type DocumentParentKind = (typeof DOCUMENT_PARENT_KINDS)[number];

/** The word an agent uses. Derived on read, never stored — see `documentAs` below. */
export const DOCUMENT_AS = ["memory", "artifact", "document"] as const;
export type DocumentAs = (typeof DOCUMENT_AS)[number];

// ---------------------------------------------------------------------------
// The row — architecture.md §3.2.
// ---------------------------------------------------------------------------

export const DocumentRowSchema = z.object({
	id: z.string(),
	title: z.string(),
	body: z.string(),
	format: z.string(), // free text in the column; "markdown" in practice
	status: z.enum(DOCUMENT_STATUSES),
	slot: z.enum(DOCUMENT_SLOTS),
	scopeKind: z.enum(SCOPE_KINDS), // factory | team | user
	scopeId: z.string().nullable(),
	parentKind: z.enum(DOCUMENT_PARENT_KINDS).nullable(),
	parentId: z.string().nullable(),
	position: z.number().int(),
	version: z.number().int(),
	updatedBy: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	// Usage — §6.7. On the wire because a person reads them in the detail
	// aside and an agent filters on them; never writable through `edit_document`.
	readCount: z.number().int(),
	lastReadAt: z.string().nullable(),
	sessionUseCount: z.number().int(),
	lastUsedAt: z.string().nullable(),
	/** Derived, never stored — see `documentAs` below. */
	as: z.enum(DOCUMENT_AS),
});
export type DocumentRow = z.infer<typeof DocumentRowSchema>;

// ---------------------------------------------------------------------------
// search_documents — architecture.md §3.3.
// ---------------------------------------------------------------------------

export const SearchDocumentsInputSchema = z
	.object({
		ids: z.array(z.string()).optional(), // batched lookup — no caller ever loops
		text: z.string().min(1).optional(), // ILIKE over title and body
		/** roots + document-parented rows only — the browsable tree. */
		inTree: z.boolean().optional(),
		parent: z
			.object({
				kind: z.enum(DOCUMENT_PARENT_KINDS),
				id: z.string().min(1).optional(),
				ids: z.array(z.string().min(1)).min(1).optional(), // exactly one of id/ids
			})
			.optional(),
		slot: z.enum(DOCUMENT_SLOTS).optional(),
		status: z.enum(DOCUMENT_STATUSES).optional(),
		scopeKind: z.enum(SCOPE_KINDS).optional(),
		as: z.enum(DOCUMENT_AS).optional(),
		/**
		 * Neither read nor handed to a session since this ISO instant, counting
		 * a document's creation as its last activity when it has never been
		 * either. §6.7 — this is what the librarian's decay routine searches on.
		 */
		unusedSince: z.string().min(1).optional(),
		/** Plain words, so neither end can get the direction wrong. §6.7. */
		sort: z.enum(["least_used", "most_read"]).optional(),
		limit: z.number().int().min(1).max(500).optional(), // default 200
		offset: z.number().int().min(0).optional(),
	})
	.strict();
export type SearchDocumentsInput = z.infer<typeof SearchDocumentsInputSchema>;

export const DocumentListRowSchema = DocumentRowSchema; // same shape; no extra join
export type DocumentListRow = DocumentRow;

export const searchDocuments: ActionDeclaration<SearchDocumentsInput, DocumentRow[]> = {
	name: "search_documents",
	sentence:
		"Search documents. No parameter lists the ones you can see; filter by text, parent, status, " +
		"scope, slot, or by what it is — a memory of yours, an artifact, or a document in the tree. " +
		"Use `unusedSince` to find what nobody has opened or been given for a while.",
	input: SearchDocumentsInputSchema,
	output: z.array(DocumentRowSchema),
};

// ---------------------------------------------------------------------------
// open_document — architecture.md §3.4.
// ---------------------------------------------------------------------------

export const OpenDocumentInputSchema = z.object({ id: z.string().min(1) }).strict();
export type OpenDocumentInput = z.infer<typeof OpenDocumentInputSchema>;

export const DocumentViewSchema = z.object({
	document: DocumentRowSchema,
	/** Root-first breadcrumb; stops at the first non-`document` parent. */
	ancestors: z.array(DocumentRowSchema),
	/** Direct children, `position` then `title`. */
	children: z.array(DocumentRowSchema),
	/** Same parent, this one excluded, same order. */
	siblings: z.array(DocumentRowSchema),
	/** Human-readable scope: "Factory" / a team name / a person's name. Response-only. */
	scopeName: z.string(),
});
export type DocumentView = z.infer<typeof DocumentViewSchema>;

export const openDocument: ActionDeclaration<OpenDocumentInput, DocumentView> = {
	name: "open_document",
	sentence: "Open a document: its text, where it sits, what is under it and what sits beside it.",
	input: OpenDocumentInputSchema,
	output: DocumentViewSchema,
};

// ---------------------------------------------------------------------------
// edit_document — architecture.md §3.5.
// ---------------------------------------------------------------------------

export const EditDocumentInputSchema = z
	.object({
		/** Absent ⇒ create with a new uuid. Present ⇒ edit, or create with that id (A3). */
		id: z.string().min(1).optional(),
		title: z.string().min(1).optional(),
		body: z.string().optional(),
		format: z.string().min(1).optional(), // default "markdown" on create
		status: z.enum(DOCUMENT_STATUSES).optional(), // default "proposed" on create
		/** What this is. Create-only; on an edit it must match what the row already is. */
		as: z.enum(DOCUMENT_AS).optional(), // default "document"
		/** Create-only. A slotted document may never change slot or parent (I10). */
		slot: z.enum(DOCUMENT_SLOTS).optional(), // default "ordinary"
		scopeKind: z.enum(SCOPE_KINDS).optional(),
		scopeId: z.string().nullable().optional(),
		/** A move. `null` ⇒ to the top of the tree. Absent ⇒ no move. */
		parent: z
			.object({
				kind: z.enum(DOCUMENT_PARENT_KINDS),
				id: z.string().min(1),
			})
			.nullable()
			.optional(),
		position: z.number().int().nonnegative().optional(),
		/** Optimistic lock, compared against the stored `version`. */
		version: z.number().int().positive().optional(),
	})
	.strict();
export type EditDocumentInput = z.infer<typeof EditDocumentInputSchema>;

export const editDocument: ActionDeclaration<EditDocumentInput, DocumentView> = {
	name: "edit_document",
	sentence:
		"Write a document, new or existing: its title, text, status, scope, where it sits. " +
		'Say `as: "memory"` for a private note only you get back, `as: "artifact"` for output of ' +
		'the task or conversation you are in, `as: "document"` for the shared tree. ' +
		"Pass the version you read to be told if someone else saved first.",
	input: EditDocumentInputSchema,
	output: DocumentViewSchema, // same shape open_document returns
};

export const DOCUMENT_ACTIONS = {
	search_documents: searchDocuments,
	open_document: openDocument,
	edit_document: editDocument,
} as const;

// ---------------------------------------------------------------------------
// `as` — how it maps to columns, and how it is derived back. Architecture.md
// §3.6. Total, unambiguous, evaluated in order.
// ---------------------------------------------------------------------------

export function documentAs(row: {
	readonly parentKind: string | null;
	readonly scopeKind: string;
	readonly slot: string;
}): DocumentAs {
	if (row.parentKind === "task" || row.parentKind === "thread") return "artifact";
	if (row.scopeKind === "user" && row.slot === "ordinary") return "memory";
	return "document";
}

// ---------------------------------------------------------------------------
// @lore BC4 architecture.md §7: the read/subscribe visibility predicate,
// pure and shared between `edit_document`/`search_documents`'s read path
// and `ws-subscribe-authorizer.ts`, so the socket and the read can never
// diverge — the same shape BC3's own bug report on that file names as the
// failure mode this avoids. Mirrors the §5.1 SQL predicate exactly:
//
//   parent_kind IN ('task','thread')
//   OR (
//        (scope_kind <> 'user' OR slot <> 'ordinary' OR scope_id = ANY(:subjects))
//    AND (scope_kind <> 'team'  OR scope_id = :viewerTeamId)
//      )
// ---------------------------------------------------------------------------

export function canReadDocument(
	subjects: readonly string[],
	viewerTeamId: string | null,
	row: {
		readonly parentKind: string | null;
		readonly scopeKind: string;
		readonly scopeId: string | null;
		readonly slot: string;
	},
): boolean {
	if (row.parentKind === "task" || row.parentKind === "thread") return true;
	const notPrivateOrOwned =
		row.scopeKind !== "user" ||
		row.slot !== "ordinary" ||
		(row.scopeId !== null && subjects.includes(row.scopeId));
	const notTeamOrMatchesViewer = row.scopeKind !== "team" || row.scopeId === viewerTeamId;
	return notPrivateOrOwned && notTeamOrMatchesViewer;
}

// ---------------------------------------------------------------------------
// Pure invariants — run in the browser to grey a control with its reason,
// and again on the server as the first pass over the input. No database.
// DB-dependent invariants (D1-D8, architecture.md §4.2) run inside
// `edit_document.run` and are not here.
// ---------------------------------------------------------------------------

/** Every writable field other than `id`/`version` — "did this edit change anything". */
const CONTENT_FIELDS = [
	"title",
	"body",
	"format",
	"status",
	"as",
	"slot",
	"scopeKind",
	"scopeId",
	"parent",
	"position",
] as const satisfies readonly (keyof EditDocumentInput)[];

/** Same as `CONTENT_FIELDS` but without `status` — I12's "anything other than status". */
const CONTENT_FIELDS_EXCEPT_STATUS = CONTENT_FIELDS.filter(
	(f) => f !== "status",
) as readonly (keyof EditDocumentInput)[];

function touchesAnyOf(
	input: EditDocumentInput,
	fields: readonly (keyof EditDocumentInput)[],
): boolean {
	return fields.some((f) => input[f] !== undefined);
}

/** I3/I4 — a memory is private and parent-less; both forced, never negotiated. */
function memoryInvariants(input: EditDocumentInput): Problem[] {
	if (input.as !== "memory") return [];
	const problems: Problem[] = [];
	if (input.scopeKind !== undefined || input.scopeId !== undefined) {
		problems.push({
			code: "memory_scope_fixed",
			message: "A memory is private to you — it has no scope to set.",
			path: "scopeKind",
		});
	}
	if (input.parent !== undefined && input.parent !== null) {
		problems.push({
			code: "memory_has_parent",
			message: "A memory sits on its own; it has no parent.",
			path: "parent",
		});
	}
	return problems;
}

/** I5/I6/I13 — an artifact hangs off a task or thread, and is never private. */
function artifactInvariants(
	input: EditDocumentInput,
	caller: { readonly hasCallingTask: boolean; readonly hasCallingThread: boolean },
): Problem[] {
	if (input.as !== "artifact") return [];
	const problems: Problem[] = [];
	if (input.parent !== undefined && input.parent !== null) {
		if (input.parent.kind !== "task" && input.parent.kind !== "thread") {
			problems.push({
				code: "artifact_parent_kind",
				message: "An artifact hangs off a task or a conversation.",
				path: "parent",
			});
		}
	} else if (!(caller.hasCallingTask || caller.hasCallingThread)) {
		problems.push({
			code: "artifact_no_parent",
			message: "Name the task or conversation this belongs to.",
			path: "parent",
		});
	}
	if (input.scopeKind === "user") {
		problems.push({
			code: "artifact_cannot_be_private",
			message:
				"An artifact is shared with the people on that task or conversation — it cannot be private.",
			path: "scopeKind",
		});
	}
	return problems;
}

/** I9/I10/I11 — a slotted document's slot and parent are fixed at create. */
function slotAndParentInvariants(input: EditDocumentInput, prev: DocumentRow | null): Problem[] {
	const problems: Problem[] = [];
	if (prev !== null && input.slot !== undefined && input.slot !== prev.slot) {
		problems.push({
			code: "slot_is_create_only",
			message: "A document's slot cannot change after it is written.",
			path: "slot",
		});
	}
	if (prev !== null && prev.slot !== "ordinary" && input.parent !== undefined) {
		problems.push({
			code: "slotted_document_cannot_move",
			message: "A skill, rule, identity or prompt stays where it was attached.",
			path: "parent",
		});
	}
	if (
		input.id !== undefined &&
		input.parent !== undefined &&
		input.parent !== null &&
		input.parent.id === input.id
	) {
		problems.push({
			code: "self_parent",
			message: "A document cannot be its own parent.",
			path: "parent",
		});
	}
	return problems;
}

export function editDocumentInvariants(
	input: EditDocumentInput,
	prev: DocumentRow | null,
	caller: { readonly hasCallingTask: boolean; readonly hasCallingThread: boolean },
): Problem[] {
	const problems: Problem[] = [];

	const effectiveTitle = input.title !== undefined ? input.title : (prev?.title ?? "");
	if (effectiveTitle.trim().length === 0) {
		problems.push({ code: "title_required", message: "A document needs a title.", path: "title" });
	}

	if (prev !== null && input.id !== undefined && !touchesAnyOf(input, CONTENT_FIELDS)) {
		problems.push({ code: "empty_edit", message: "An edit must change something.", path: "id" });
	}

	problems.push(...memoryInvariants(input));
	problems.push(...artifactInvariants(input, caller));

	// A memory's scope is forced regardless of what the caller asked for
	// (memory_scope_fixed already reports that); checking scope_needs_id on
	// top of it would fire a second, misleading problem for the same input.
	if (
		input.as !== "memory" &&
		input.scopeKind !== undefined &&
		SCOPES_REQUIRING_ID.has(input.scopeKind) &&
		(input.scopeId === undefined || input.scopeId === null)
	) {
		problems.push({
			code: "scope_needs_id",
			message: "A team-scoped document needs a team.",
			path: "scopeId",
		});
	}

	if (prev !== null && input.as !== undefined && input.as !== documentAs(prev)) {
		problems.push({
			code: "as_is_create_only",
			message: "What a document is cannot change after it is written.",
			path: "as",
		});
	}

	problems.push(...slotAndParentInvariants(input, prev));

	if (
		prev !== null &&
		prev.status === "archived" &&
		touchesAnyOf(input, CONTENT_FIELDS_EXCEPT_STATUS)
	) {
		problems.push({
			code: "status_from_archived",
			message: "Reopen the document before changing anything else on it.",
			path: "status",
		});
	}

	return problems;
}

/** `search_documents`'s own pure invariants — I14 plus the shape conflict. */
export function searchDocumentsInvariants(input: SearchDocumentsInput): Problem[] {
	const problems: Problem[] = [];

	if (input.as === "artifact" && input.parent === undefined) {
		problems.push({
			code: "artifact_search_needs_parent",
			message: "Say which task or conversation's artifacts you want.",
			path: "parent",
		});
	}

	if (input.inTree === true && input.parent !== undefined) {
		problems.push({
			code: "two_shapes",
			message: "Give either inTree or a parent, not both.",
			path: "inTree",
		});
	}

	return problems;
}
