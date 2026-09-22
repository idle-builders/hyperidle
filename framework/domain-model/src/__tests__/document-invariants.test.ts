/**
 * Pure invariant unit tests for the document module's declarations —
 * `editDocumentInvariants`, `searchDocumentsInvariants`, `documentAs` and
 * `canReadDocument`. Exact equality on `problems[0].code`, never
 * `toContain` — a past retro found tests asserted too loosely to fail.
 */

import { describe, expect, it } from "vitest";
import {
	canReadDocument,
	type DocumentRow,
	documentAs,
	editDocumentInvariants,
	searchDocumentsInvariants,
} from "../actions/document.js";

const noCaller = { hasCallingTask: false, hasCallingThread: false };

function makeRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "d1",
		title: "Existing title",
		body: "body",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u1",
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

describe("editDocumentInvariants", () => {
	it("I1 title_required: create with a whitespace-only title", () => {
		const problems = editDocumentInvariants({ title: "   " }, null, noCaller);
		expect(problems[0]?.code).toBe("title_required");
	});

	it("I2 empty_edit: an id alone, on an existing row", () => {
		const prev = makeRow();
		const problems = editDocumentInvariants({ id: prev.id }, prev, noCaller);
		expect(problems[0]?.code).toBe("empty_edit");
	});

	it("I3 memory_scope_fixed: as memory with an explicit scopeKind", () => {
		const problems = editDocumentInvariants(
			{ as: "memory", scopeKind: "team", title: "Note" },
			null,
			noCaller,
		);
		expect(problems[0]?.code).toBe("memory_scope_fixed");
	});

	it("I4 memory_has_parent: as memory with a parent", () => {
		const problems = editDocumentInvariants(
			{ as: "memory", parent: { kind: "document", id: "p1" }, title: "Note" },
			null,
			noCaller,
		);
		expect(problems[0]?.code).toBe("memory_has_parent");
	});

	it("I3 memory_scope_fixed: editing an existing memory's scope WITHOUT repeating `as` still refuses — the run function's forcing must never land silently", () => {
		const prev = makeRow({ scopeKind: "user", scopeId: "u1", parentKind: null, slot: "ordinary" });
		expect(documentAs(prev)).toBe("memory");
		const problems = editDocumentInvariants(
			{ id: prev.id, scopeKind: "team", scopeId: "team-1" },
			prev,
			noCaller,
		);
		expect(problems[0]?.code).toBe("memory_scope_fixed");
	});

	it("a private tree document's scope CAN change without `as` — it is not a memory, so no forcing applies", () => {
		const prev = makeRow({
			scopeKind: "user",
			scopeId: "u1",
			parentKind: "document",
			parentId: "folder-1",
			slot: "ordinary",
		});
		expect(documentAs(prev)).toBe("document");
		const problems = editDocumentInvariants(
			{ id: prev.id, scopeKind: "team", scopeId: "team-1" },
			prev,
			noCaller,
		);
		expect(problems).toEqual([]);
	});

	it("I5 artifact_parent_kind: as artifact with a document parent", () => {
		const problems = editDocumentInvariants(
			{ as: "artifact", parent: { kind: "document", id: "p1" }, title: "Out" },
			null,
			noCaller,
		);
		expect(problems[0]?.code).toBe("artifact_parent_kind");
	});

	it("I6 artifact_no_parent: as artifact, no parent, caller has neither", () => {
		const problems = editDocumentInvariants({ as: "artifact", title: "Out" }, null, noCaller);
		expect(problems[0]?.code).toBe("artifact_no_parent");
	});

	it("I6 does not fire when the caller has a calling task to fall back to", () => {
		const problems = editDocumentInvariants({ as: "artifact", title: "Out" }, null, {
			hasCallingTask: true,
			hasCallingThread: false,
		});
		expect(problems.map((p) => p.code)).not.toContain("artifact_no_parent");
	});

	it("I7 scope_needs_id: scopeKind team with no scopeId", () => {
		const problems = editDocumentInvariants({ scopeKind: "team", title: "x" }, null, noCaller);
		expect(problems[0]?.code).toBe("scope_needs_id");
	});

	it("I8 as_is_create_only: as memory on a row whose derived as is document", () => {
		const prev = makeRow({
			scopeKind: "team",
			scopeId: "team-1",
			slot: "ordinary",
			parentKind: null,
		});
		expect(documentAs(prev)).toBe("document");
		const problems = editDocumentInvariants({ id: prev.id, as: "memory" }, prev, noCaller);
		expect(problems[0]?.code).toBe("as_is_create_only");
	});

	it("I9 slot_is_create_only: slot changes away from the stored one", () => {
		const prev = makeRow({ slot: "ordinary" });
		const problems = editDocumentInvariants({ id: prev.id, slot: "skill" }, prev, noCaller);
		expect(problems[0]?.code).toBe("slot_is_create_only");
	});

	it("I10 slotted_document_cannot_move: a move on a slotted document", () => {
		const prev = makeRow({ slot: "skill" });
		const problems = editDocumentInvariants(
			{ id: prev.id, parent: { kind: "document", id: "new-parent" } },
			prev,
			noCaller,
		);
		expect(problems[0]?.code).toBe("slotted_document_cannot_move");
	});

	it("I11 self_parent: parent.id equals the document's own id", () => {
		const prev = makeRow({ slot: "ordinary" });
		const problems = editDocumentInvariants(
			{ id: prev.id, parent: { kind: "document", id: prev.id } },
			prev,
			noCaller,
		);
		expect(problems[0]?.code).toBe("self_parent");
	});

	it("I12 status_from_archived: a field other than status changes on an archived row", () => {
		const prev = makeRow({ status: "archived", slot: "ordinary" });
		const problems = editDocumentInvariants({ id: prev.id, title: "New title" }, prev, noCaller);
		expect(problems[0]?.code).toBe("status_from_archived");
	});

	it("status_from_archived does not fire when only status itself changes", () => {
		const prev = makeRow({ status: "archived", slot: "ordinary" });
		const problems = editDocumentInvariants({ id: prev.id, status: "active" }, prev, noCaller);
		expect(problems.map((p) => p.code)).not.toContain("status_from_archived");
	});

	it("I13 artifact_cannot_be_private: as artifact with scopeKind user", () => {
		const problems = editDocumentInvariants(
			{ as: "artifact", scopeKind: "user", title: "Out" },
			null,
			{ hasCallingTask: true, hasCallingThread: false },
		);
		expect(problems[0]?.code).toBe("artifact_cannot_be_private");
	});

	it("a well-formed create has no problems", () => {
		expect(editDocumentInvariants({ title: "A fine document" }, null, noCaller)).toEqual([]);
	});

	it("a well-formed edit has no problems", () => {
		const prev = makeRow();
		expect(editDocumentInvariants({ id: prev.id, title: "Renamed" }, prev, noCaller)).toEqual([]);
	});

	it("forbidden_parent_kind: a non-internal caller names an agent parent", () => {
		const problems = editDocumentInvariants(
			{ title: "Identity", parent: { kind: "agent", id: "a1" } },
			null,
			noCaller,
		);
		expect(problems[0]?.code).toBe("forbidden_parent_kind");
	});

	it("forbidden_parent_kind: a non-internal caller names a routine parent", () => {
		const problems = editDocumentInvariants(
			{ title: "Prompt", parent: { kind: "routine", id: "r1" } },
			null,
			noCaller,
		);
		expect(problems[0]?.code).toBe("forbidden_parent_kind");
	});

	it("forbidden_parent_kind does not fire for an internal caller", () => {
		const problems = editDocumentInvariants(
			{ title: "Identity", parent: { kind: "agent", id: "a1" } },
			null,
			{ ...noCaller, internal: true },
		);
		expect(problems.map((p) => p.code)).not.toContain("forbidden_parent_kind");
	});

	it("forbidden_parent_kind does not fire for a client-writable parent kind (document/task/thread)", () => {
		const problems = editDocumentInvariants(
			{ title: "Note", parent: { kind: "document", id: "d1" } },
			null,
			noCaller,
		);
		expect(problems.map((p) => p.code)).not.toContain("forbidden_parent_kind");
	});
});

describe("searchDocumentsInvariants", () => {
	it("I14 artifact_search_needs_parent: as artifact with no parent filter", () => {
		const problems = searchDocumentsInvariants({ as: "artifact" });
		expect(problems[0]?.code).toBe("artifact_search_needs_parent");
	});

	it("artifact_search_needs_parent does not fire when a parent filter is given", () => {
		const problems = searchDocumentsInvariants({
			as: "artifact",
			parent: { kind: "task", id: "t1" },
		});
		expect(problems.map((p) => p.code)).not.toContain("artifact_search_needs_parent");
	});

	it("two_shapes: inTree and parent given together", () => {
		const problems = searchDocumentsInvariants({
			inTree: true,
			parent: { kind: "document", id: "p1" },
		});
		expect(problems[0]?.code).toBe("two_shapes");
	});

	it("a well-formed search has no problems", () => {
		expect(searchDocumentsInvariants({ inTree: true })).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The combined cases — architecture.md §4.3, the ones assignable to a pure
// invariant. The rest (cascade, stale version, upsert visibility) need the
// database and are not tested here.
// ---------------------------------------------------------------------------

describe("combined cases (pure half)", () => {
	it("case 1f: a memory can never be in the tree — refused by I4, which is what makes the cascade walk safe", () => {
		const problems = editDocumentInvariants(
			{ as: "memory", parent: { kind: "document", id: "p1" }, title: "Note" },
			null,
			noCaller,
		);
		expect(problems[0]?.code).toBe("memory_has_parent");
	});

	it("case 2: a move of a slotted document is refused by I10 before D5 is ever consulted", () => {
		const prev = makeRow({ slot: "prompt" });
		// `internal: true` — a routine parent is internal-only
		// (`forbidden_parent_kind`); this case is about I10 firing before D5,
		// not about who may name a routine.
		const problems = editDocumentInvariants(
			{ id: prev.id, parent: { kind: "routine", id: "r1" } },
			prev,
			{ ...noCaller, internal: true },
		);
		expect(problems[0]?.code).toBe("slotted_document_cannot_move");
		expect(problems.map((p) => p.code)).not.toContain("slot_taken");
	});

	it("case 5: memory + slot on create raises no problem — the forcing is silent", () => {
		const problems = editDocumentInvariants(
			{ as: "memory", slot: "skill", title: "Note" },
			null,
			noCaller,
		);
		expect(problems).toEqual([]);
	});
});

describe("documentAs — the read-side derivation", () => {
	it("a task-parented row is an artifact", () => {
		expect(documentAs({ parentKind: "task", scopeKind: "team", slot: "ordinary" })).toBe(
			"artifact",
		);
	});

	it("a thread-parented row is an artifact", () => {
		expect(documentAs({ parentKind: "thread", scopeKind: "user", slot: "ordinary" })).toBe(
			"artifact",
		);
	});

	it("a user-scoped ordinary-slot row with no parent is a memory", () => {
		expect(documentAs({ parentKind: null, scopeKind: "user", slot: "ordinary" })).toBe("memory");
	});

	it("a user-scoped row with no parent is a memory regardless of slot — a memory's slot is always forced to ordinary at write time, so this only matters for a row written before that forcing existed", () => {
		expect(documentAs({ parentKind: null, scopeKind: "user", slot: "skill" })).toBe("memory");
	});

	it("a user-scoped row WITH a parent is a private document, not a memory — founder decision, gate-walk finding: a note in the tree is not the same thing as a memory", () => {
		expect(documentAs({ parentKind: "document", scopeKind: "user", slot: "ordinary" })).toBe(
			"document",
		);
	});

	it("a team-scoped row is a document", () => {
		expect(documentAs({ parentKind: null, scopeKind: "team", slot: "ordinary" })).toBe("document");
	});
});

describe("canReadDocument — the shared visibility predicate", () => {
	it("an artifact (task-parented) is readable regardless of scope", () => {
		expect(
			canReadDocument([], "some-other-team", {
				parentKind: "task",
				scopeKind: "user",
				scopeId: "someone-else",
				slot: "ordinary",
			}),
		).toBe(true);
	});

	it("a memory owned by one of the viewer's subjects is readable", () => {
		expect(
			canReadDocument(["u1"], null, {
				parentKind: null,
				scopeKind: "user",
				scopeId: "u1",
				slot: "ordinary",
			}),
		).toBe(true);
	});

	it("a private tree document (user scope, in tree) owned by one of the viewer's subjects is readable — same subjects rule as a memory", () => {
		expect(
			canReadDocument(["u1"], null, {
				parentKind: "document",
				scopeKind: "user",
				scopeId: "u1",
				slot: "ordinary",
			}),
		).toBe(true);
	});

	it("a private tree document (user scope, in tree) not owned by any of the viewer's subjects is not readable", () => {
		expect(
			canReadDocument(["u1"], null, {
				parentKind: "document",
				scopeKind: "user",
				scopeId: "u2",
				slot: "ordinary",
			}),
		).toBe(false);
	});

	it("a memory not owned by any of the viewer's subjects is not readable", () => {
		expect(
			canReadDocument(["u1"], null, {
				parentKind: null,
				scopeKind: "user",
				scopeId: "u2",
				slot: "ordinary",
			}),
		).toBe(false);
	});

	it("a user-scoped row with a named slot is exempt from the memory filter", () => {
		expect(
			canReadDocument(["u1"], null, {
				parentKind: null,
				scopeKind: "user",
				scopeId: "u2",
				slot: "skill",
			}),
		).toBe(true);
	});

	it("a team-scoped row matching the viewer's team is readable", () => {
		expect(
			canReadDocument([], "team-1", {
				parentKind: null,
				scopeKind: "team",
				scopeId: "team-1",
				slot: "ordinary",
			}),
		).toBe(true);
	});

	it("a team-scoped row for a different team is not readable", () => {
		expect(
			canReadDocument([], "team-1", {
				parentKind: null,
				scopeKind: "team",
				scopeId: "team-2",
				slot: "ordinary",
			}),
		).toBe(false);
	});

	it("a team-scoped row with a NULL scopeId is not readable to a team-less viewer — agrees with the SQL twin, which never matches a NULL scopeId", () => {
		expect(
			canReadDocument([], null, {
				parentKind: null,
				scopeKind: "team",
				scopeId: null,
				slot: "ordinary",
			}),
		).toBe(false);
	});

	it("a factory-scoped row is always readable", () => {
		expect(
			canReadDocument([], null, {
				parentKind: null,
				scopeKind: "factory",
				scopeId: null,
				slot: "ordinary",
			}),
		).toBe(true);
	});
});
