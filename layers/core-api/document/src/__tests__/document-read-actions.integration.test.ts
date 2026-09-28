/**
 * The document module's read half — `search_documents`/`open_document`
 * (architecture.md §3.3, §3.4, §5.1, §6.7). Real PGlite via the `{ db }`
 * fixture. `deps.users`/`deps.org` are backed by real queries against the
 * real `users`/`teams` tables — no stub of the visibility predicate itself.
 * `deps.changes`/`openParent`/`onBodyChanged` throw if called at all: the
 * read half must never reach them (that is the write half's job, B6a).
 */
import {
	changes,
	type HyperIdleDb,
	teams,
	type User,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type {
	DocumentRow,
	DocumentView,
	OpenDocumentInput,
	SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import {
	assembleDocumentView,
	createDocumentActions,
	type DocumentActionsDeps,
} from "../document-actions.js";
import { insertDocument } from "../document-store.js";
import { actionFor, ctxFor, docValues, readRow, seedUser } from "./_helpers.js";

/** Real queries against the real `users`/`teams` tables — never a stub of
 * the visibility predicate's own data. */
function readOnlyDeps(): DocumentActionsDeps {
	return {
		changes: {
			appendChange: async () => {
				throw new Error("the read half must never write a changes row");
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
		openParent: async () => {
			throw new Error("the read half never calls openParent");
		},
		systemParentExists: async () => {
			throw new Error("the read half never calls systemParentExists");
		},
		onBodyChanged: async () => {
			throw new Error("the read half never calls onBodyChanged");
		},
	};
}

/** A db whose `.update` throws — the failure `bumpRead` must log and
 * swallow. Every other method proxies straight through to the real
 * fixture db, bound to it (not the proxy) so drizzle's own internals keep
 * working. */
function withFailingUpdate(db: HyperIdleDb): HyperIdleDb {
	return new Proxy(db, {
		get(target, prop, _receiver) {
			if (prop === "update") {
				return () => {
					throw new Error("simulated update failure");
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function"
				? (value as (...a: unknown[]) => unknown).bind(target)
				: value;
		},
	}) as HyperIdleDb;
}

describe("open_document", () => {
	test("on another person's memory returns exactly [{code:'not_found'}] and leaves readCount at 0", async ({
		db,
	}) => {
		await seedUser(db, "writer-open-1");
		await seedUser(db, "viewer-open-1");
		await insertDocument(
			db,
			docValues({
				id: "doc-open-private-1",
				title: "Private note",
				scopeKind: "user",
				scopeId: "writer-open-1",
			}),
		);

		const actions = createDocumentActions(readOnlyDeps());
		const openDocument = actionFor<OpenDocumentInput, DocumentView>(actions, "open_document");
		const input: OpenDocumentInput = { id: "doc-open-private-1" };
		const result = await openDocument.run(ctxFor(db, "viewer-open-1"), input);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems).toHaveLength(1);
		expect(result.problems[0]?.code).toBe("not_found");

		const row = await readRow(db, "doc-open-private-1");
		expect(row?.readCount).toBe(0);
	});

	test("as the writer, bumps read count by exactly 1 and sets lastReadAt — version/updatedAt unchanged, no changes row", async ({
		db,
	}) => {
		await seedUser(db, "writer-open-2");
		await insertDocument(
			db,
			docValues({
				id: "doc-open-mine-1",
				title: "My note",
				scopeKind: "user",
				scopeId: "writer-open-2",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);

		const actions = createDocumentActions(readOnlyDeps());
		const openDocument = actionFor<OpenDocumentInput, DocumentView>(actions, "open_document");
		const result = await openDocument.run(
			ctxFor(db, "writer-open-2", { now: "2026-06-01T00:00:00.000Z" }),
			{
				id: "doc-open-mine-1",
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.readCount).toBe(1);
		expect(result.data.document.lastReadAt).toBe("2026-06-01T00:00:00.000Z");

		const row = await readRow(db, "doc-open-mine-1");
		expect(row?.version).toBe(1);
		expect(row?.updatedAt).toBe("2026-01-01T00:00:00.000Z");

		const changeRows = await db
			.select()
			.from(changes)
			.where(eq(changes.objectId, "doc-open-mine-1"));
		expect(changeRows).toHaveLength(0);
	});

	test("by the owner of the writing agent works", async ({ db }) => {
		await seedUser(db, "owner-open-1");
		await seedUser(db, "agent-open-1", { kind: "ai", ownerUserId: "owner-open-1" });
		await insertDocument(
			db,
			docValues({
				id: "doc-open-agent-memory-1",
				title: "Agent's own note",
				scopeKind: "user",
				scopeId: "agent-open-1",
			}),
		);

		const actions = createDocumentActions(readOnlyDeps());
		const openDocument = actionFor<OpenDocumentInput, DocumentView>(actions, "open_document");
		const result = await openDocument.run(ctxFor(db, "owner-open-1"), {
			id: "doc-open-agent-memory-1",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.id).toBe("doc-open-agent-memory-1");
	});

	test("a bump failure is logged and swallowed — the open still succeeds and the count stays at 0", async ({
		db,
	}) => {
		await seedUser(db, "writer-open-3");
		await insertDocument(
			db,
			docValues({
				id: "doc-open-bump-fail-1",
				scopeKind: "user",
				scopeId: "writer-open-3",
			}),
		);

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const actions = createDocumentActions(readOnlyDeps());
		const openDocument = actionFor<OpenDocumentInput, DocumentView>(actions, "open_document");
		const ctx = ctxFor(withFailingUpdate(db), "writer-open-3");
		const result = await openDocument.run(ctx, { id: "doc-open-bump-fail-1" });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.readCount).toBe(0);

		expect(errorSpy).toHaveBeenCalled();
		const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(logged).toContain("document read bump failed");

		const row = await readRow(db, "doc-open-bump-fail-1");
		expect(row?.readCount).toBe(0);

		errorSpy.mockRestore();
	});
});

describe("assembleDocumentView — counts nothing on its own", () => {
	test("called directly does not bump the read count", async ({ db }) => {
		await seedUser(db, "writer-assemble-1");
		const row = await insertDocument(
			db,
			docValues({
				id: "doc-assemble-1",
				scopeKind: "user",
				scopeId: "writer-assemble-1",
			}),
		);

		const view = await assembleDocumentView(ctxFor(db, "writer-assemble-1"), readOnlyDeps(), row);

		expect(view.document.readCount).toBe(0);
		const stored = await readRow(db, "doc-assemble-1");
		expect(stored?.readCount).toBe(0);
	});
});

describe("search_documents", () => {
	test("never bumps the read count", async ({ db }) => {
		await insertDocument(db, docValues({ id: "doc-search-no-bump-1" }));

		const actions = createDocumentActions(readOnlyDeps());
		const searchDocuments = actionFor<SearchDocumentsInput, DocumentRow[]>(
			actions,
			"search_documents",
		);
		const input: SearchDocumentsInput = { ids: ["doc-search-no-bump-1"] };
		const result = await searchDocuments.run(ctxFor(db, "someone"), input);

		expect(result.ok).toBe(true);
		const row = await readRow(db, "doc-search-no-bump-1");
		expect(row?.readCount).toBe(0);
	});

	test("artifact_search_needs_parent — an artifact search with no parent is refused", async ({
		db,
	}) => {
		const actions = createDocumentActions(readOnlyDeps());
		const searchDocuments = actionFor<SearchDocumentsInput, DocumentRow[]>(
			actions,
			"search_documents",
		);
		const input: SearchDocumentsInput = { as: "artifact" };
		const result = await searchDocuments.run(ctxFor(db, "someone"), input);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems).toHaveLength(1);
		expect(result.problems[0]?.code).toBe("artifact_search_needs_parent");
	});

	test("two_shapes — inTree and parent together are refused", async ({ db }) => {
		const actions = createDocumentActions(readOnlyDeps());
		const searchDocuments = actionFor<SearchDocumentsInput, DocumentRow[]>(
			actions,
			"search_documents",
		);
		const input: SearchDocumentsInput = {
			inTree: true,
			parent: { kind: "document", id: "some-id" },
		};
		const result = await searchDocuments.run(ctxFor(db, "someone"), input);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems).toHaveLength(1);
		expect(result.problems[0]?.code).toBe("two_shapes");
	});

	test("returns the four usage values and the derived `as`", async ({ db }) => {
		await insertDocument(
			db,
			docValues({
				id: "doc-search-usage-1",
				scopeKind: "user",
				scopeId: "usage-owner-1",
				readCount: 5,
				lastReadAt: "2026-02-01T00:00:00.000Z",
				sessionUseCount: 2,
				lastUsedAt: "2026-03-01T00:00:00.000Z",
			}),
		);

		const actions = createDocumentActions(readOnlyDeps());
		const searchDocuments = actionFor<SearchDocumentsInput, DocumentRow[]>(
			actions,
			"search_documents",
		);
		const input: SearchDocumentsInput = { ids: ["doc-search-usage-1"] };
		const result = await searchDocuments.run(ctxFor(db, "usage-owner-1"), input);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data).toHaveLength(1);
		const found = result.data[0];
		expect(found?.readCount).toBe(5);
		expect(found?.lastReadAt).toBe("2026-02-01T00:00:00.000Z");
		expect(found?.sessionUseCount).toBe(2);
		expect(found?.lastUsedAt).toBe("2026-03-01T00:00:00.000Z");
		expect(found?.as).toBe("memory");
	});

	test("unusedSince — a document's creation counts as its last activity when it has never been read or used", async ({
		db,
	}) => {
		await insertDocument(
			db,
			docValues({
				id: "doc-unused-old",
				scopeKind: "factory",
				createdAt: "2020-01-01T00:00:00.000Z",
				updatedAt: "2020-01-01T00:00:00.000Z",
			}),
		);
		await insertDocument(
			db,
			docValues({
				id: "doc-unused-recently-used",
				scopeKind: "factory",
				createdAt: "2020-01-01T00:00:00.000Z",
				updatedAt: "2020-01-01T00:00:00.000Z",
				lastUsedAt: "2026-05-01T00:00:00.000Z",
			}),
		);
		await insertDocument(
			db,
			docValues({
				id: "doc-unused-recently-read",
				scopeKind: "factory",
				createdAt: "2020-01-01T00:00:00.000Z",
				updatedAt: "2020-01-01T00:00:00.000Z",
				lastReadAt: "2026-05-01T00:00:00.000Z",
			}),
		);

		const actions = createDocumentActions(readOnlyDeps());
		const searchDocuments = actionFor<SearchDocumentsInput, DocumentRow[]>(
			actions,
			"search_documents",
		);
		const input: SearchDocumentsInput = { unusedSince: "2024-01-01T00:00:00.000Z" };
		const result = await searchDocuments.run(ctxFor(db, "someone"), input);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.map((d) => d.id)).toEqual(["doc-unused-old"]);
	});

	test("ids batches an arbitrary set in one call", async ({ db }) => {
		const a = await insertDocument(db, docValues({ id: "doc-ids-batch-a" }));
		const b = await insertDocument(db, docValues({ id: "doc-ids-batch-b" }));
		await insertDocument(db, docValues({ id: "doc-ids-batch-c" }));

		const actions = createDocumentActions(readOnlyDeps());
		const searchDocuments = actionFor<SearchDocumentsInput, DocumentRow[]>(
			actions,
			"search_documents",
		);
		const input: SearchDocumentsInput = { ids: [a.id, b.id] };
		const result = await searchDocuments.run(ctxFor(db, "someone"), input);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
	});
});
