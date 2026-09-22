/**
 * The scope cascade — narrowing a document's audience narrows every wider
 * descendant with it, honestly: same transaction, both scope columns, one
 * `changes` row per narrowed child with the parent edit's own actor and
 * `at`, the child's own `version` bump, the whole row list handed to the
 * post-commit push (architecture.md §6.6, §4.3 cases 1a-1f). Real PGlite via
 * the `{ db }` fixture — no stub of the visibility predicate or the change
 * log. `deps.openParent` is faked per test where a call needs it;
 * `deps.onBodyChanged` is a recorder except in the one test that uses it to
 * prove the transaction boundary.
 */
import {
	changes,
	documents,
	type HyperIdleDb,
	teams,
	type User,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	type DocumentView,
	type DocumentRow as DomainDocumentRow,
	documentAs,
	type EditDocumentInput,
	type SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import { createDocumentActions, type DocumentActionsDeps } from "../document-actions.js";
import { insertDocument } from "../document-store.js";

type Insertable = typeof documents.$inferInsert;

/** Sensible defaults for a document row; every field is overridable — the
 * same helper `document-store.integration.test.ts` and
 * `document-edit-action.integration.test.ts` use. */
function docValues(overrides: Partial<Insertable> & { id: string }): Insertable {
	const ts = "2026-01-01T00:00:00.000Z";
	return {
		scopeKind: "factory",
		scopeId: null,
		title: "Untitled",
		body: "body",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		parentKind: null,
		parentId: null,
		position: 0,
		updatedBy: "seed",
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	};
}

async function seedUser(
	db: HyperIdleDb,
	id: string,
	overrides: Partial<typeof users.$inferInsert> = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	});
}

async function seedTeam(db: HyperIdleDb, id: string, name = id): Promise<void> {
	await db.insert(teams).values({
		id,
		name,
		phase: "build",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

function ctxFor(
	db: HyperIdleDb,
	actor: string,
	opts: { now?: string; caller?: ActionContext["caller"] } = {},
): ActionContext {
	return {
		actor,
		db,
		eventBus: new EventBus(),
		now: opts.now ?? "2026-06-01T00:00:00.000Z",
		...(opts.caller ? { caller: opts.caller } : {}),
	};
}

function actionFor<I, O>(actions: readonly Action[], name: string): Action<I, O> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found as unknown as Action<I, O>;
}

interface DepsOptions {
	readonly openParent?: DocumentActionsDeps["openParent"];
	readonly onBodyChanged?: DocumentActionsDeps["onBodyChanged"];
	readonly wsPush?: DocumentActionsDeps["wsPush"];
}

/** Real queries against the real `users`/`teams`/`changes` tables — never a
 * stub of the visibility predicate or the change log itself. */
function writeDeps(opts: DepsOptions = {}): DocumentActionsDeps {
	return {
		changes: {
			appendChange: async (exec: WriteExecutor, row) => {
				await exec.insert(changes).values(row).returning();
			},
		},
		users: {
			getUserById: async (exec: WriteExecutor, id: string): Promise<User | undefined> => {
				const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
			listOwnedBy: async (exec: WriteExecutor, ownerId: string) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
		},
		org: {
			getTeam: async (exec: WriteExecutor, q: { id: string }) => {
				const [row] = await exec.select().from(teams).where(eq(teams.id, q.id)).limit(1);
				return row;
			},
		},
		openParent:
			opts.openParent ??
			(async () => {
				throw new Error("openParent not stubbed for this test");
			}),
		systemParentExists: async () => {
			throw new Error("systemParentExists not stubbed for this test");
		},
		onBodyChanged: opts.onBodyChanged ?? (async () => {}),
		...(opts.wsPush ? { wsPush: opts.wsPush } : {}),
	};
}

async function readRow(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	return row;
}

async function readDocumentChanges(db: HyperIdleDb) {
	return db.select().from(changes).where(eq(changes.object, "document"));
}

function editAction(deps: DocumentActionsDeps): Action<EditDocumentInput, DocumentView> {
	return actionFor<EditDocumentInput, DocumentView>(createDocumentActions(deps), "edit_document");
}

function searchAction(
	deps: DocumentActionsDeps,
): Action<SearchDocumentsInput, DomainDocumentRow[]> {
	return actionFor<SearchDocumentsInput, DomainDocumentRow[]>(
		createDocumentActions(deps),
		"search_documents",
	);
}

describe("edit_document — the scope cascade, architecture.md §4.3 case 1a", () => {
	test("narrowing clamps a wider child's scopeKind AND scopeId, leaves an already-narrow grandchild untouched, and writes exactly two document change rows", async ({
		db,
	}) => {
		await seedTeam(db, "team-1a-old");
		await seedUser(db, "writer-1a", { teamId: "team-1a-old" });
		const root = await insertDocument(
			db,
			docValues({ id: "casc-1a-root", title: "Root", scopeKind: "factory", scopeId: null }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-1a-child",
				title: "Child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
			}),
		);
		const grandchild = await insertDocument(
			db,
			docValues({
				id: "casc-1a-grandchild",
				title: "Grandchild",
				parentKind: "document",
				parentId: child.id,
				scopeKind: "team",
				scopeId: "team-1a-already-narrow",
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1a"), {
			id: root.id,
			scopeKind: "team",
			scopeId: "team-1a-new",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");

		const childRow = await readRow(db, child.id);
		expect(childRow?.scopeKind).toBe("team");
		expect(childRow?.scopeId).toBe("team-1a-new");
		expect(childRow?.version).toBe(child.version + 1);

		const grandchildRow = await readRow(db, grandchild.id);
		expect(grandchildRow?.scopeKind).toBe("team");
		expect(grandchildRow?.scopeId).toBe("team-1a-already-narrow");
		expect(grandchildRow?.version).toBe(grandchild.version);

		const changeRows = await readDocumentChanges(db);
		expect(changeRows).toHaveLength(2);
		const rootChange = changeRows.find((r) => r.objectId === root.id);
		const childChange = changeRows.find((r) => r.objectId === child.id);
		expect(rootChange).toBeDefined();
		expect(childChange).toBeDefined();
		expect(changeRows.every((r) => r.actor === "writer-1a")).toBe(true);
		expect(rootChange?.at).toBe(childChange?.at);
		expect(childChange?.kind).toBe("changed");
		expect(JSON.parse(childChange?.before ?? "{}")).toEqual({
			id: child.id,
			scopeKind: "factory",
			scopeId: null,
		});
		expect(JSON.parse(childChange?.after ?? "{}")).toEqual({
			id: child.id,
			scopeKind: "team",
			scopeId: "team-1a-new",
		});
	});
});

describe("edit_document — the scope cascade family, architecture.md §4.3 cases 1b-1f", () => {
	test("case 1b — widening never cascades: exactly one change row, the child untouched", async ({
		db,
	}) => {
		await seedTeam(db, "team-1b");
		await seedUser(db, "writer-1b", { teamId: "team-1b" });
		const root = await insertDocument(
			db,
			docValues({ id: "casc-1b-root", scopeKind: "team", scopeId: "team-1b" }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-1b-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "team",
				scopeId: "team-1b",
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1b"), {
			id: root.id,
			scopeKind: "factory",
			scopeId: null,
		});
		expect(result.ok).toBe(true);

		const childRow = await readRow(db, child.id);
		expect(childRow?.scopeKind).toBe("team");
		expect(childRow?.scopeId).toBe("team-1b");
		expect(childRow?.version).toBe(child.version);

		const changeRows = await readDocumentChanges(db);
		expect(changeRows).toHaveLength(1);
		expect(changeRows[0]?.objectId).toBe(root.id);
	});

	test("case 1c — a named-slot child is narrowed too, its slot untouched", async ({ db }) => {
		await seedUser(db, "writer-1c");
		const root = await insertDocument(
			db,
			docValues({ id: "casc-1c-root", scopeKind: "factory", scopeId: null }),
		);
		const slotted = await insertDocument(
			db,
			docValues({
				id: "casc-1c-slotted",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
				slot: "skill",
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1c"), {
			id: root.id,
			scopeKind: "team",
			scopeId: "team-1c",
		});
		expect(result.ok).toBe(true);

		const slottedRow = await readRow(db, slotted.id);
		expect(slottedRow?.scopeKind).toBe("team");
		expect(slottedRow?.scopeId).toBe("team-1c");
		expect(slottedRow?.slot).toBe("skill");
	});

	test("case 1d — a child the actor cannot see is narrowed too: the walk runs over the true tree, not the actor's visible set", async ({
		db,
	}) => {
		await seedTeam(db, "team-1d-actor");
		await seedTeam(db, "team-1d-other");
		await seedUser(db, "writer-1d", { teamId: "team-1d-actor" });
		const root = await insertDocument(
			db,
			docValues({ id: "casc-1d-root", scopeKind: "factory", scopeId: null }),
		);
		const invisibleChild = await insertDocument(
			db,
			docValues({
				id: "casc-1d-invisible",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "team",
				scopeId: "team-1d-other",
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1d"), {
			id: root.id,
			scopeKind: "user",
			scopeId: "writer-1d",
		});
		expect(result.ok).toBe(true);

		const childRow = await readRow(db, invisibleChild.id);
		expect(childRow?.scopeKind).toBe("user");
		expect(childRow?.scopeId).toBe("writer-1d");
	});

	test("narrowing a folder to `user` scope makes its children private documents, never memories — I4 (memory_has_parent) is a write-time check on `edit_document`'s own input and is never reached by the cascade's direct row write, since the cascaded child keeps its `parentKind` (architecture decision on the gate-walk finding)", async ({
		db,
	}) => {
		await seedUser(db, "writer-1g");
		const folder = await insertDocument(
			db,
			docValues({ id: "casc-1g-folder", title: "Folder", scopeKind: "factory", scopeId: null }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-1g-child",
				title: "Note",
				parentKind: "document",
				parentId: folder.id,
				scopeKind: "factory",
				scopeId: null,
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1g"), {
			id: folder.id,
			scopeKind: "user",
			scopeId: "writer-1g",
		});
		expect(result.ok).toBe(true);

		const childRow = await readRow(db, child.id);
		expect(childRow?.scopeKind).toBe("user");
		expect(childRow?.scopeId).toBe("writer-1g");
		expect(childRow?.parentKind).toBe("document");
		if (!childRow) throw new Error("expected the child row to exist");
		expect(documentAs(childRow)).toBe("document");

		// Both reachable through the `document` shape, neither through `memory`.
		const asDocument = await searchAction(writeDeps()).run(ctxFor(db, "writer-1g"), {
			as: "document",
			parent: { kind: "document", id: folder.id },
		});
		expect(asDocument.ok).toBe(true);
		if (!asDocument.ok) throw new Error("expected success");
		expect(asDocument.data.map((r) => r.id)).toContain(child.id);

		const asMemory = await searchAction(writeDeps()).run(ctxFor(db, "writer-1g"), {
			as: "memory",
		});
		expect(asMemory.ok).toBe(true);
		if (!asMemory.ok) throw new Error("expected success");
		expect(asMemory.data.map((r) => r.id)).not.toContain(child.id);
	});

	test("case 1e — an archived child is narrowed too, its status still archived", async ({ db }) => {
		await seedUser(db, "writer-1e");
		const root = await insertDocument(
			db,
			docValues({ id: "casc-1e-root", scopeKind: "factory", scopeId: null }),
		);
		const archived = await insertDocument(
			db,
			docValues({
				id: "casc-1e-archived",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
				status: "archived",
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1e"), {
			id: root.id,
			scopeKind: "team",
			scopeId: "team-1e",
		});
		expect(result.ok).toBe(true);

		const archivedRow = await readRow(db, archived.id);
		expect(archivedRow?.status).toBe("archived");
		expect(archivedRow?.scopeKind).toBe("team");
		expect(archivedRow?.scopeId).toBe("team-1e");
	});

	test("case 1f — a memory can never be in the tree: giving it a parent is refused by memory_has_parent", async ({
		db,
	}) => {
		await seedUser(db, "writer-1f");
		const memory = await editAction(writeDeps()).run(ctxFor(db, "writer-1f"), {
			as: "memory",
			title: "Private note",
			body: "x",
		});
		expect(memory.ok).toBe(true);
		if (!memory.ok) throw new Error("expected success");

		const root = await insertDocument(
			db,
			docValues({ id: "casc-1f-root", scopeKind: "factory", scopeId: null }),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-1f"), {
			id: memory.data.document.id,
			as: "memory",
			parent: { kind: "document", id: root.id },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("memory_has_parent");
	});
});

describe("edit_document — the cascade's post-commit push, architecture.md §6.6 rule 5, §7", () => {
	test("the push receives every changed row — the parent's and each narrowed child's", async ({
		db,
	}) => {
		await seedUser(db, "writer-push-casc");
		const pushed: { topic: string }[] = [];
		const deps = writeDeps({
			wsPush: (topic) => {
				pushed.push({ topic });
			},
		});
		const root = await insertDocument(
			db,
			docValues({ id: "casc-push-root", scopeKind: "factory", scopeId: null }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-push-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
			}),
		);

		const result = await editAction(deps).run(ctxFor(db, "writer-push-casc"), {
			id: root.id,
			scopeKind: "team",
			scopeId: "team-push-casc",
		});
		expect(result.ok).toBe(true);

		// two changes rows, each pushed on its own document:<id> topic and once
		// more on the shared `documents` topic — four frames total.
		expect(pushed.filter((p) => p.topic === `document:${root.id}`)).toHaveLength(1);
		expect(pushed.filter((p) => p.topic === `document:${child.id}`)).toHaveLength(1);
		expect(pushed.filter((p) => p.topic === "documents")).toHaveLength(2);
	});
});

describe("edit_document — a refused edit narrows nothing, architecture.md §4.3 case 4", () => {
	test("a stale version on the parent refuses the whole edit and narrows no child", async ({
		db,
	}) => {
		await seedUser(db, "writer-stale-casc");
		const edit = editAction(writeDeps());
		const ctx = ctxFor(db, "writer-stale-casc");
		const root = await insertDocument(
			db,
			docValues({ id: "casc-stale-root", scopeKind: "factory", scopeId: null }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-stale-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
			}),
		);

		const result = await edit.run(ctx, {
			id: root.id,
			scopeKind: "team",
			scopeId: "team-stale",
			version: root.version + 99,
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("stale");

		const rootRow = await readRow(db, root.id);
		expect(rootRow?.scopeKind).toBe("factory");
		const childRow = await readRow(db, child.id);
		expect(childRow?.scopeKind).toBe("factory");
		expect(childRow?.version).toBe(child.version);

		const changeRows = await readDocumentChanges(db);
		expect(changeRows).toHaveLength(0);
	});

	test("any refusal narrows nothing — a pure-invariant refusal (I1 title_required) never reaches the transaction the cascade lives in", async ({
		db,
	}) => {
		await seedUser(db, "writer-refuse");
		const root = await insertDocument(
			db,
			docValues({ id: "casc-refuse-root", title: "Root", scopeKind: "factory", scopeId: null }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-refuse-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-refuse"), {
			id: root.id,
			title: "   ",
			scopeKind: "team",
			scopeId: "team-refuse",
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("title_required");

		const rootRow = await readRow(db, root.id);
		expect(rootRow?.scopeKind).toBe("factory");
		const childRow = await readRow(db, child.id);
		expect(childRow?.scopeKind).toBe("factory");
		expect(childRow?.version).toBe(child.version);
	});
});

describe("edit_document — the cascade is inside the parent's own transaction", () => {
	test("a failure thrown from onBodyChanged, after the cascade writes, rolls every cascade write back", async ({
		db,
	}) => {
		await seedUser(db, "writer-tx-casc");
		const boom = new Error("boom — injected after the cascade writes");
		const deps = writeDeps({
			onBodyChanged: async () => {
				throw boom;
			},
		});
		const root = await insertDocument(
			db,
			docValues({ id: "casc-tx-root", scopeKind: "factory", scopeId: null, body: "old body" }),
		);
		const child = await insertDocument(
			db,
			docValues({
				id: "casc-tx-child",
				parentKind: "document",
				parentId: root.id,
				scopeKind: "factory",
				scopeId: null,
			}),
		);

		await expect(
			editAction(deps).run(ctxFor(db, "writer-tx-casc"), {
				id: root.id,
				scopeKind: "team",
				scopeId: "team-tx-casc",
				body: "new body", // bodyChanged:true is what reaches onBodyChanged
			}),
		).rejects.toThrow(boom);

		const rootRow = await readRow(db, root.id);
		expect(rootRow?.scopeKind).toBe("factory");
		expect(rootRow?.body).toBe("old body");
		expect(rootRow?.version).toBe(root.version);

		const childRow = await readRow(db, child.id);
		expect(childRow?.scopeKind).toBe("factory");
		expect(childRow?.version).toBe(child.version);

		const changeRows = await readDocumentChanges(db);
		expect(changeRows).toHaveLength(0);
	});
});
