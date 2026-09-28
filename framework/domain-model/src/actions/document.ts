import { z } from "zod";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID } from "../types.js";
import type { ActionDeclaration, Problem } from "./action.js";

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

export const DOCUMENT_PARENT_KINDS = [
	"document",
	"task",
	"thread",
	"agent",
	"subscription",
] as const;
export type DocumentParentKind = (typeof DOCUMENT_PARENT_KINDS)[number];

/** The word an agent uses. Derived on read, never stored — see `documentAs` below. */
export const DOCUMENT_AS = ["memory", "artifact", "document"] as const;
export type DocumentAs = (typeof DOCUMENT_AS)[number];

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
	// On the wire because a person reads them and an agent filters on them; never writable through `edit_document`.
	readCount: z.number().int(),
	lastReadAt: z.string().nullable(),
	sessionUseCount: z.number().int(),
	lastUsedAt: z.string().nullable(),
	/** Derived, never stored — see `documentAs` below. */
	as: z.enum(DOCUMENT_AS),
});
export type DocumentRow = z.infer<typeof DocumentRowSchema>;

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
		 * either — this is what the librarian's decay routine searches on.
		 */
		unusedSince: z.string().min(1).optional(),
		/** Plain words, so neither end can get the direction wrong. */
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

export const EditDocumentInputSchema = z
	.object({
		/** Absent ⇒ create with a new uuid. Present ⇒ edit, or create with that id. */
		id: z.string().min(1).optional(),
		title: z.string().min(1).optional(),
		body: z.string().optional(),
		format: z.string().min(1).optional(), // default "markdown" on create
		status: z.enum(DOCUMENT_STATUSES).optional(), // default "proposed" on create
		/** What this is. Create-only; on an edit it must match what the row already is. */
		as: z.enum(DOCUMENT_AS).optional(), // default "document"
		/** Create-only. A slotted document may never change slot or parent. */
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

// `as` — derived from columns, total and unambiguous, evaluated in order.

export function documentAs(row: {
	readonly parentKind: string | null;
	readonly scopeKind: string;
	readonly slot: string;
}): DocumentAs {
	if (row.parentKind === "task" || row.parentKind === "thread") return "artifact";
	// A memory is a user-scoped, parentless, `ordinary`-slot row — not in the
	// tree, and not a row `slot` alone already makes public. `slot` must agree
	// with the visibility predicate: `canReadDocument` exempts ANY non-ordinary
	// slot from the privacy check regardless of scope. A user-scoped row WITH
	// a parent is a private document:
	// `as:"document"`, widenable to team/factory and back, like any tree
	// document.
	if (row.scopeKind === "user" && row.parentKind === null && row.slot === "ordinary")
		return "memory";
	return "document";
}

// @lore: canReadDocument — shared with ws-subscribe-authorizer.ts; socket and read visibility must match; non-ordinary slot skips user-privacy check

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
	// Compared on a non-null `scopeId` — a `team`-scoped row with a NULL
	// `scopeId` (a reconcile gap the migration can leave behind)
	// must not read as "matches a team-less viewer" just because both sides
	// are `null`. The SQL twin (`document-store.ts`'s `visibilityPredicate`)
	// already gets this right via `eq(scopeId, viewerTeamId)`, which SQL NULL
	// semantics turn false whenever either side is NULL.
	const notTeamOrMatchesViewer =
		row.scopeKind !== "team" || (row.scopeId !== null && row.scopeId === viewerTeamId);
	return notPrivateOrOwned && notTeamOrMatchesViewer;
}

// Pure invariants — run in the browser and again on the server. DB-dependent invariants run inside edit_document.run.

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

/** Same as `CONTENT_FIELDS` but without `status`. */
const CONTENT_FIELDS_EXCEPT_STATUS = CONTENT_FIELDS.filter(
	(f) => f !== "status",
) as readonly (keyof EditDocumentInput)[];

function touchesAnyOf(
	input: EditDocumentInput,
	fields: readonly (keyof EditDocumentInput)[],
): boolean {
	return fields.some((f) => input[f] !== undefined);
}

/**
 * A memory is private and parent-less; both invariants are forced, never negotiated.
 * Keys on `effectiveAs` (input.as, or the row's own derived `as` when the
 * edit omits it) — not `input.as` alone. An edit of an existing memory that
 * only sends `scopeKind` (no `as`) must still be refused here: the run
 * function forces the scope back to `user` regardless, and a forced write
 * with no problem attached is a silent no-op.
 *
 * Creating a root (parentless) document scoped `"user"` is a one-way
 * trapdoor — the row reads back as a memory (`documentAs`), so a later
 * attempt to widen it hits this same check. The generic "no scope to set"
 * message reads as a bug report to someone who only ever asked for Private
 * on a document; an EXISTING memory (`prev !== null` and it already derives
 * as one) gets the clearer message telling them what to do about it. A
 * create with an explicit `as:"memory"` + a scope keeps the original
 * message — there is no existing row yet to point at.
 */
function memoryInvariants(
	effectiveAs: DocumentAs | undefined,
	input: EditDocumentInput,
	prev: DocumentRow | null,
): Problem[] {
	if (effectiveAs !== "memory") return [];
	const problems: Problem[] = [];
	const isExistingMemory = prev !== null && documentAs(prev) === "memory";
	if (input.scopeKind !== undefined || input.scopeId !== undefined) {
		problems.push({
			code: "memory_scope_fixed",
			message: isExistingMemory
				? "A memory has no audience to change; save it as a document to share it."
				: "A memory is private to you — it has no scope to set.",
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

/**
 * A user-scoped, parentless, non-`ordinary`-slot row derives as `"document"`
 * (not a memory — `documentAs`), but reads as PUBLIC through
 * `canReadDocument`'s non-ordinary-slot exemption, regardless of scope. A
 * caller asking for `scopeKind:"user"` on that shape is asking for a
 * contradiction — private-by-scope, public-by-slot — so it is refused
 * outright, the same way `artifactInvariants` refuses `as:"artifact"` + `scopeKind:"user"`
 * rather than silently resolving the conflict one way or the other. Only
 * `effectiveAs === "document"` reaches this: a memory's slot is already
 * forced to `ordinary` by the memory invariant, and an artifact's `scopeKind:"user"` is
 * already refused by `artifactInvariants`.
 */
function privateSlotInvariants(
	effectiveAs: DocumentAs | undefined,
	input: EditDocumentInput,
	prev: DocumentRow | null,
): Problem[] {
	// `effectiveAs` is `undefined` only for a create with no explicit `as` —
	// `edit_document.run` defaults that shape to `"document"`, so this check must too,
	// or a bare `{scopeKind:"user", slot:"skill"}` create would slip past it.
	if (effectiveAs !== "document" && effectiveAs !== undefined) return [];
	const isCreate = prev === null;
	// Slot is immutable after create — an edit can only ever transition
	// INTO this shape by touching `scopeKind` or `parent`. An edit that
	// touches neither leaves the row's scope/parent exactly as they already
	// were, so it is a continuation of whatever the row already legitimately
	// is, not a new attempt to create the contradiction — the same "only
	// refuse an active change" shape `memoryInvariants` already uses for its
	// own scope/parent checks (a body-only edit of an existing memory is
	// never re-refused either). The narrowing exists so a body-only edit of
	// ANY pre-existing row never trips a shape it did not create — it is a
	// defensive property of the check itself, not evidence of rows already
	// sitting in this shape.
	if (!isCreate && input.scopeKind === undefined && input.parent === undefined) return [];
	const scopeKind = input.scopeKind ?? prev?.scopeKind;
	if (scopeKind !== "user") return [];
	const slot = input.slot ?? prev?.slot ?? "ordinary";
	if (slot === "ordinary") return [];
	const parentIsNull =
		input.parent !== undefined ? input.parent === null : isCreate || prev.parentKind === null;
	if (!parentIsNull) return [];
	return [
		{
			code: "memory_needs_ordinary_slot",
			message: "A document scoped to you alone, with no parent, must use the ordinary slot.",
			path: "slot",
		},
	];
}

/**
 * An artifact hangs off a task or thread, and is never private.
 *
 * The parent checks stay keyed on the caller's literal `input.as === "artifact"` — an
 * edit that moves an existing artifact's parent WITHOUT repeating `as` is
 * "graduation" — `as` is derived, never stored, so moving `parent` off
 * a task/thread is all graduation is — `document-actions.integration.test.ts`
 * describe("graduation …")), a deliberately allowed transition. Keying the parent checks
 * on the row's derived `effectiveAs` instead would refuse that transition.
 *
 * The scope check is different: it is keyed on `effectiveAs` (the caller's explicit `as`,
 * or the row's own derived `as` when the edit omits it) — not `input.as`
 * alone. "An artifact is never private" is an absolute rule, not a
 * transition; an edit that only sends `{id, scopeKind:"user"}` against an
 * existing artifact must still be refused here, or the run function's write
 * lands the private scope with no problem attached (same
 * silent-overwrite shape as `memoryInvariants` above).
 */
function artifactInvariants(
	effectiveAs: DocumentAs | undefined,
	input: EditDocumentInput,
	caller: { readonly hasCallingTask: boolean; readonly hasCallingThread: boolean },
): Problem[] {
	const problems: Problem[] = [];
	if (input.as === "artifact") {
		if (input.parent === null) {
			// `null` means "to the top of the tree", for every `as` (architecture
			// decision) — and an artifact can never be at the top, so an
			// explicit `parent: null` is refused the same way a `document` parent
			// is, not silently treated as "no parent given" (which would stamp the
			// caller's own calling task/thread instead of honouring the explicit
			// top-of-tree request).
			problems.push({
				code: "artifact_parent_kind",
				message: "An artifact hangs off a task or a conversation.",
				path: "parent",
			});
		} else if (input.parent !== undefined) {
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
	}
	if (effectiveAs === "artifact" && input.scopeKind === "user") {
		problems.push({
			code: "artifact_cannot_be_private",
			message:
				"An artifact is shared with the people on that task or conversation — it cannot be private.",
			path: "scopeKind",
		});
	}
	return problems;
}

/**
 * Only a system-initiated caller may name an `agent`/`subscription` parent.
 * `caller.internal` is `true` only when the composition root built the call — never set by the HTTP door or MCP tool loop.
 */
function systemParentInvariants(
	input: EditDocumentInput,
	caller: { readonly internal?: boolean },
): Problem[] {
	if (
		input.parent !== undefined &&
		input.parent !== null &&
		(input.parent.kind === "agent" || input.parent.kind === "subscription") &&
		!caller.internal
	) {
		return [
			{
				code: "forbidden_parent_kind",
				message: "Only the system attaches a document to an agent or a subscription.",
				path: "parent",
			},
		];
	}
	return [];
}

/** A slotted document's slot and parent are fixed at create. */
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
	caller: {
		readonly hasCallingTask: boolean;
		readonly hasCallingThread: boolean;
		/** Set only by an in-process, system-initiated call — never by a
		 * client door. See `systemParentInvariants` below. */
		readonly internal?: boolean;
	},
): Problem[] {
	const problems: Problem[] = [];

	const effectiveTitle = input.title !== undefined ? input.title : (prev?.title ?? "");
	if (effectiveTitle.trim().length === 0) {
		problems.push({ code: "title_required", message: "A document needs a title.", path: "title" });
	}

	if (prev !== null && input.id !== undefined && !touchesAnyOf(input, CONTENT_FIELDS)) {
		problems.push({ code: "empty_edit", message: "An edit must change something.", path: "id" });
	}

	// What the row will BE once this edit lands: the caller's explicit `as`,
	// or — on an edit that omits it — the row's own derived `as`. The run
	// function forces scope/parent for a memory using this same fallback
	// (`edit_document.run`'s `effectiveAs`), so the pure check must key on the
	// same value or a forced overwrite could land with no problem attached.
	const effectiveAs: DocumentAs | undefined =
		input.as ?? (prev !== null ? documentAs(prev) : undefined);

	problems.push(...memoryInvariants(effectiveAs, input, prev));
	problems.push(...privateSlotInvariants(effectiveAs, input, prev));
	problems.push(...artifactInvariants(effectiveAs, input, caller));
	problems.push(...systemParentInvariants(input, caller));

	// A memory's scope is forced regardless of what the caller asked for
	// (memory_scope_fixed already reports that); checking scope_needs_id on
	// top of it would fire a second, misleading problem for the same input.
	if (
		effectiveAs !== "memory" &&
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

/** `search_documents`'s own pure invariants. */
export function searchDocumentsInvariants(input: SearchDocumentsInput): Problem[] {
	const problems: Problem[] = [];

	if (input.as === "artifact" && input.parent === undefined) {
		problems.push({
			code: "artifact_search_needs_parent",
			message: "Say which task or conversation's artifacts you want.",
			path: "parent",
		});
	}

	// `id`/`ids` name a query shape, not a value the store may treat as
	// absent; exactly one must be given, for every parent kind (not only
	// artifacts — a bare `parent:{kind:"thread"}` is the same unbounded query
	// one kind over).
	if (input.parent !== undefined) {
		const hasId = input.parent.id !== undefined;
		const hasIds = input.parent.ids !== undefined;
		if (hasId === hasIds) {
			problems.push({
				code: "parent_needs_id",
				message: "Name exactly one of id or ids for a parent filter.",
				path: "parent",
			});
		}
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
