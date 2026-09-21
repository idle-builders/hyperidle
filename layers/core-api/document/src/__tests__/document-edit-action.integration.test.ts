/**
 * The document module's write half — `edit_document` (architecture.md §3.5,
 * §3.6, §4.1's forcings, §4.2, §4.3, §6.3, §7). Real PGlite via the `{ db }`
 * fixture. `deps.users`/`deps.org`/`deps.changes` are backed by real queries
 * against the real tables — no stub of the visibility predicate or the
 * change log itself. `deps.openParent` is the one genuinely external port
 * (a sibling module's action) and is faked per test; `deps.onBodyChanged` is
 * a recorder. The cascade over a narrowed scope's descendants (§6.6) is out
 * of scope here — B6b.
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
import type { DocumentView, EditDocumentInput, OpenDocumentInput } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { and, eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import { createDocumentActions, type DocumentActionsDeps } from "../document-actions.js";
import { insertDocument } from "../document-store.js";

type Insertable = typeof documents.$inferInsert;

/** Sensible defaults for a document row; every field is overridable — the
 * same helper `document-store.integration.test.ts` uses. */
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
 * stub of the visibility predicate or the change log itself. `openParent` is
 * the one genuinely external crossing (a sibling module's action) and is
 * faked per test, exactly like the seam it will be bound through in B7. */
function writeDeps(opts: DepsOptions = {}): DocumentActionsDeps {
	const deps: DocumentActionsDeps = {
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
		onBodyChanged: opts.onBodyChanged ?? (async () => {}),
		...(opts.wsPush ? { wsPush: opts.wsPush } : {}),
	};
	return deps;
}

async function readRow(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	return row;
}

async function readChanges(db: HyperIdleDb, objectId: string) {
	return db
		.select()
		.from(changes)
		.where(and(eq(changes.object, "document"), eq(changes.objectId, objectId)));
}

function editAction(deps: DocumentActionsDeps): Action<EditDocumentInput, DocumentView> {
	return actionFor<EditDocumentInput, DocumentView>(createDocumentActions(deps), "edit_document");
}

describe("edit_document — D7 stale (architecture.md §4.3 case 4)", () => {
	test("two edits, the second carrying version 1, is refused and writes nothing", async ({
		db,
	}) => {
		await seedUser(db, "writer-stale-1");
		const edit = editAction(writeDeps());
		const ctx = ctxFor(db, "writer-stale-1");

		const created = await edit.run(ctx, {
			id: "doc-stale-1",
			title: "First title",
			body: "first body",
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error("expected success");
		expect(created.data.document.version).toBe(1);

		const secondWriterWon = await edit.run(ctx, {
			id: "doc-stale-1",
			title: "Second writer's title",
			version: 1,
		});
		expect(secondWriterWon.ok).toBe(true);
		if (!secondWriterWon.ok) throw new Error("expected success");
		expect(secondWriterWon.data.document.version).toBe(2);

		const staleResult = await edit.run(ctx, {
			id: "doc-stale-1",
			title: "Stale writer's title",
			version: 1,
		});

		expect(staleResult.ok).toBe(false);
		if (staleResult.ok) throw new Error("expected a refusal");
		expect(staleResult.problems).toHaveLength(1);
		expect(staleResult.problems[0]?.code).toBe("stale");

		const row = await readRow(db, "doc-stale-1");
		expect(row?.title).toBe("Second writer's title");
		expect(row?.version).toBe(2);

		const changeRows = await readChanges(db, "doc-stale-1");
		expect(changeRows).toHaveLength(2); // created + the one successful edit, no third
	});
});

describe("edit_document — D-invariants (architecture.md §4.2)", () => {
	test("D2 parent_not_found — a document parent that does not exist", async ({ db }) => {
		await seedUser(db, "writer-d2-doc-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-d2-doc-1"), {
			title: "Orphan",
			body: "x",
			parent: { kind: "document", id: "does-not-exist" },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("parent_not_found");
		const rows = await db.select().from(documents).where(eq(documents.title, "Orphan"));
		expect(rows).toHaveLength(0);
	});

	test("D2 parent_not_found — a task parent that does not exist (deps.openParent)", async ({
		db,
	}) => {
		await seedUser(db, "writer-d2-task-1", { kind: "ai" });
		const deps = writeDeps({ openParent: async () => ({ exists: false }) });
		const result = await editAction(deps).run(ctxFor(db, "writer-d2-task-1"), {
			as: "artifact",
			title: "Output",
			body: "x",
			parent: { kind: "task", id: "nope" },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("parent_not_found");
	});

	test("a `routine`/`agent` parent has no existence port — no check runs (today's behaviour, kept)", async ({
		db,
	}) => {
		await seedUser(db, "writer-d2-routine-1", { kind: "ai" });
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-d2-routine-1"), {
			as: "document",
			title: "Prompt body",
			body: "x",
			parent: { kind: "routine", id: "no-such-routine" },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.parentKind).toBe("routine");
	});

	test("D3 cycle — moving a root under its own grandchild is refused", async ({ db }) => {
		await seedUser(db, "writer-d3-1");
		const root = await insertDocument(db, docValues({ id: "d3-root", title: "Root" }));
		const child = await insertDocument(
			db,
			docValues({ id: "d3-child", title: "Child", parentKind: "document", parentId: root.id }),
		);
		await insertDocument(
			db,
			docValues({
				id: "d3-grandchild",
				title: "Grandchild",
				parentKind: "document",
				parentId: child.id,
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-d3-1"), {
			id: root.id,
			parent: { kind: "document", id: "d3-grandchild" },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("cycle");

		const row = await readRow(db, root.id);
		expect(row?.parentId).toBeNull();
	});

	test("D4 depth_exceeded — a 32-deep chain refuses one more", async ({ db }) => {
		await seedUser(db, "writer-d4-1");
		let parentId: string | null = null;
		let deepestId = "";
		for (let depth = 1; depth <= 32; depth++) {
			const id = `d4-node-${depth}`;
			await insertDocument(
				db,
				docValues({
					id,
					title: id,
					parentKind: parentId ? "document" : null,
					parentId,
				}),
			);
			parentId = id;
			deepestId = id;
		}

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-d4-1"), {
			title: "One too deep",
			body: "x",
			parent: { kind: "document", id: deepestId },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("depth_exceeded");
	});

	test("D5 slot_taken — a second prompt on one routine is refused, only reachable at create", async ({
		db,
	}) => {
		await seedUser(db, "writer-d5-1", { kind: "ai" });
		const edit = editAction(writeDeps());
		const ctx = ctxFor(db, "writer-d5-1");
		const first = await edit.run(ctx, {
			as: "document",
			title: "The prompt",
			body: "x",
			slot: "prompt",
			parent: { kind: "routine", id: "routine-d5-1" },
		});
		expect(first.ok).toBe(true);

		const second = await edit.run(ctx, {
			as: "document",
			title: "A second prompt",
			body: "y",
			slot: "prompt",
			parent: { kind: "routine", id: "routine-d5-1" },
		});
		expect(second.ok).toBe(false);
		if (second.ok) throw new Error("expected a refusal");
		expect(second.problems[0]?.code).toBe("slot_taken");
	});

	test("D6 scope_too_wide — a factory-scoped child under a team-scoped parent is refused", async ({
		db,
	}) => {
		await seedTeam(db, "team-d6-1");
		await seedUser(db, "writer-d6-1", { teamId: "team-d6-1" });
		const parent = await insertDocument(
			db,
			docValues({ id: "d6-parent", title: "Team doc", scopeKind: "team", scopeId: "team-d6-1" }),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-d6-1"), {
			title: "Too wide",
			body: "x",
			scopeKind: "factory",
			parent: { kind: "document", id: parent.id },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("scope_too_wide");
	});

	test("D8 forbidden_parent — the named parent is another person's memory", async ({ db }) => {
		await seedUser(db, "writer-d8-owner");
		await seedUser(db, "writer-d8-other");
		const memory = await insertDocument(
			db,
			docValues({
				id: "d8-private-memory",
				title: "Private",
				scopeKind: "user",
				scopeId: "writer-d8-owner",
			}),
		);

		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-d8-other"), {
			title: "Sneaky child",
			body: "x",
			parent: { kind: "document", id: memory.id },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.problems[0]?.code).toBe("forbidden_parent");

		// the refused edit writes nothing
		const rows = await db.select().from(documents).where(eq(documents.title, "Sneaky child"));
		expect(rows).toHaveLength(0);
	});
});

describe("edit_document — the combined cases, architecture.md §4.3 (2-8; the cascade family 1a-1f is B6b's)", () => {
	test("case 2 — moving a slotted document is refused by I10 before D5 is ever consulted", async ({
		db,
	}) => {
		await seedUser(db, "writer-case2-1", { kind: "ai" });
		const edit = editAction(writeDeps());
		const ctx = ctxFor(db, "writer-case2-1");
		const prompt = await edit.run(ctx, {
			as: "document",
			title: "The prompt",
			body: "x",
			slot: "prompt",
			parent: { kind: "routine", id: "routine-case2-1" },
		});
		expect(prompt.ok).toBe(true);
		if (!prompt.ok) throw new Error("expected success");

		const moved = await edit.run(ctx, {
			id: prompt.data.document.id,
			parent: { kind: "routine", id: "routine-case2-2" },
		});
		expect(moved.ok).toBe(false);
		if (moved.ok) throw new Error("expected a refusal");
		expect(moved.problems[0]?.code).toBe("slotted_document_cannot_move");
	});

	test("case 3 — an explicit thread parent wins over the calling task's stamp", async ({ db }) => {
		await seedUser(db, "writer-case3-1", { kind: "ai" });
		const deps = writeDeps({
			openParent: async (_ctx, kind, id) => {
				if (kind === "thread" && id === "thread-case3-1") return { exists: true, teamId: "t-3" };
				if (kind === "task" && id === "task-case3-1") return { exists: true, teamId: "t-task-3" };
				throw new Error(`unexpected openParent(${kind}, ${id})`);
			},
		});
		const ctx = ctxFor(db, "writer-case3-1", {
			caller: { sessionId: "s3", taskId: "task-case3-1", threadId: null },
		});

		const result = await editAction(deps).run(ctx, {
			as: "artifact",
			title: "Attached to the thread",
			body: "x",
			parent: { kind: "thread", id: "thread-case3-1" },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.parentKind).toBe("thread");
		expect(result.data.document.parentId).toBe("thread-case3-1");
	});

	test("case 5 — memory + slot: the slot is silently forced to ordinary, no problem raised", async ({
		db,
	}) => {
		await seedUser(db, "writer-case5-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-case5-1"), {
			as: "memory",
			title: "My note",
			body: "x",
			slot: "skill",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.slot).toBe("ordinary");
	});

	test("case 6 — upsert-with-id + version: a version on a create is ignored, the row is created", async ({
		db,
	}) => {
		await seedUser(db, "writer-case6-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-case6-1"), {
			id: "brand-new",
			title: "New via id",
			body: "x",
			version: 3,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.id).toBe("brand-new");
		expect(result.data.document.version).toBe(1);
	});

	test("case 7 — upsert-with-id + visibility: an invisible existing id answers not_found and creates nothing", async ({
		db,
	}) => {
		await seedUser(db, "case7-writer-a");
		await seedUser(db, "case7-writer-b");
		const a = await editAction(writeDeps()).run(ctxFor(db, "case7-writer-a"), {
			id: "m1",
			as: "memory",
			title: "A's private note",
			body: "x",
		});
		expect(a.ok).toBe(true);

		const b = await editAction(writeDeps()).run(ctxFor(db, "case7-writer-b"), {
			id: "m1",
			title: "B tries to overwrite",
		});
		expect(b.ok).toBe(false);
		if (b.ok) throw new Error("expected a refusal");
		expect(b.problems).toHaveLength(1);
		expect(b.problems[0]?.code).toBe("not_found");

		const row = await readRow(db, "m1");
		expect(row?.title).toBe("A's private note");
		const rows = await db.select().from(documents).where(eq(documents.id, "m1"));
		expect(rows).toHaveLength(1);
	});

	test("case 8 — an artifact cannot be private, and a teammate on a different team can read a shared-task artifact", async ({
		db,
	}) => {
		await seedUser(db, "writer-case8-1", { kind: "ai" });
		await seedUser(db, "case8-teammate", { kind: "human" });

		const refused = await editAction(writeDeps()).run(ctxFor(db, "writer-case8-1"), {
			as: "artifact",
			title: "Private artifact?",
			body: "x",
			scopeKind: "user",
			parent: { kind: "task", id: "task-case8-1" },
		});
		expect(refused.ok).toBe(false);
		if (refused.ok) throw new Error("expected a refusal");
		expect(refused.problems[0]?.code).toBe("artifact_cannot_be_private");

		const deps = writeDeps({
			openParent: async () => ({ exists: true, teamId: "team-case8-owner" }),
		});
		const created = await editAction(deps).run(ctxFor(db, "writer-case8-1"), {
			as: "artifact",
			title: "Shared output",
			body: "x",
			parent: { kind: "task", id: "task-case8-1" },
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error("expected success");

		const openDoc = actionFor<OpenDocumentInput, DocumentView>(
			createDocumentActions(deps),
			"open_document",
		);
		const seen = await openDoc.run(ctxFor(db, "case8-teammate"), { id: created.data.document.id });
		expect(seen.ok).toBe(true);
	});
});

describe("edit_document — create (architecture.md §3.5 A3)", () => {
	test("no id — a new uuid is assigned", async ({ db }) => {
		await seedUser(db, "writer-create-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-create-1"), {
			title: "No id given",
			body: "x",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.id.length).toBeGreaterThan(0);
		const row = await readRow(db, result.data.document.id);
		expect(row?.title).toBe("No id given");
	});
});

describe("edit_document — `as` forcing, architecture.md §3.6", () => {
	test("as:'memory' forces private scope and is readable by the owner of the writing agent", async ({
		db,
	}) => {
		await seedUser(db, "memory-owner-1");
		await seedUser(db, "memory-agent-1", { kind: "ai", ownerUserId: "memory-owner-1" });

		const deps = writeDeps();
		const result = await editAction(deps).run(ctxFor(db, "memory-agent-1"), {
			as: "memory",
			title: "Agent's own note",
			body: "x",
			scopeKind: "team", // I3 would refuse this if it survived — it must never reach the row
			parent: null,
		});
		// I3/I4 refuse explicit scope/parent on a memory — this call is only
		// valid once those are absent; assert the refusal, then the real write.
		expect(result.ok).toBe(false);

		const ok = await editAction(deps).run(ctxFor(db, "memory-agent-1"), {
			as: "memory",
			title: "Agent's own note",
			body: "x",
		});
		expect(ok.ok).toBe(true);
		if (!ok.ok) throw new Error("expected success");
		expect(ok.data.document.scopeKind).toBe("user");
		expect(ok.data.document.scopeId).toBe("memory-agent-1");
		expect(ok.data.document.parentKind).toBeNull();
		expect(ok.data.document.as).toBe("memory");

		const openDoc = actionFor<OpenDocumentInput, DocumentView>(
			createDocumentActions(deps),
			"open_document",
		);
		const seenByOwner = await openDoc.run(ctxFor(db, "memory-owner-1"), {
			id: ok.data.document.id,
		});
		expect(seenByOwner.ok).toBe(true);
	});

	test("as:'artifact' from an agent in a task session gets the task stamped", async ({ db }) => {
		await seedUser(db, "artifact-agent-1", { kind: "ai" });
		const deps = writeDeps({
			openParent: async (_ctx, kind, id) => {
				if (kind === "task" && id === "task-artifact-1") {
					return { exists: true, teamId: "team-artifact-1" };
				}
				throw new Error(`unexpected openParent(${kind}, ${id})`);
			},
		});
		const ctx = ctxFor(db, "artifact-agent-1", {
			caller: { sessionId: "s1", taskId: "task-artifact-1", threadId: null },
		});

		const result = await editAction(deps).run(ctx, {
			as: "artifact",
			title: "Tool output",
			body: "the result",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.parentKind).toBe("task");
		expect(result.data.document.parentId).toBe("task-artifact-1");
		// same call proves the task-team fallback arm of A4, since the agent
		// has no team of its own here.
		expect(result.data.document.scopeKind).toBe("team");
		expect(result.data.document.scopeId).toBe("team-artifact-1");
	});

	test("as:'document' with no scope — the actor's own team wins, the task fallback is never consulted", async ({
		db,
	}) => {
		await seedTeam(db, "team-direct-1");
		await seedUser(db, "document-agent-1", { kind: "ai", teamId: "team-direct-1" });
		let openParentCalls = 0;
		const deps = writeDeps({
			openParent: async () => {
				openParentCalls++;
				return { exists: true, teamId: "should-never-be-used" };
			},
		});

		const result = await editAction(deps).run(ctxFor(db, "document-agent-1"), {
			as: "document",
			title: "Team doc",
			body: "x",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.scopeKind).toBe("team");
		expect(result.data.document.scopeId).toBe("team-direct-1");
		expect(openParentCalls).toBe(0);
	});

	test("as:'document' with no scope and no team — falls all the way to factory", async ({ db }) => {
		await seedUser(db, "document-human-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "document-human-1"), {
			as: "document",
			title: "Factory doc",
			body: "x",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.scopeKind).toBe("factory");
		expect(result.data.document.scopeId).toBeNull();
	});
});

describe("edit_document — the `changes` row, architecture.md §6.3", () => {
	test("create appends exactly one 'created' row with a null before and the full after", async ({
		db,
	}) => {
		await seedUser(db, "writer-changes-create-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-changes-create-1"), {
			id: "doc-changes-create-1",
			title: "New doc",
			body: "hello",
		});
		expect(result.ok).toBe(true);

		const rows = await readChanges(db, "doc-changes-create-1");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.kind).toBe("created");
		expect(rows[0]?.before).toBeNull();
		const after = JSON.parse(rows[0]?.after ?? "{}");
		expect(after.id).toBe("doc-changes-create-1");
		expect(after.title).toBe("New doc");
		expect(after.body).toBe("hello");
	});

	test("edit appends exactly one 'changed' row naming only the fields that differ, plus id", async ({
		db,
	}) => {
		await seedUser(db, "writer-changes-edit-1");
		const edit = editAction(writeDeps());
		const ctx = ctxFor(db, "writer-changes-edit-1");
		await edit.run(ctx, { id: "doc-changes-edit-1", title: "Before", body: "same body" });

		const result = await edit.run(ctx, { id: "doc-changes-edit-1", title: "After" });
		expect(result.ok).toBe(true);

		const rows = await readChanges(db, "doc-changes-edit-1");
		expect(rows).toHaveLength(2);
		const changedRow = rows.find((r) => r.kind === "changed");
		expect(changedRow).toBeDefined();
		const before = JSON.parse(changedRow?.before ?? "{}");
		const after = JSON.parse(changedRow?.after ?? "{}");
		expect(before).toEqual({ id: "doc-changes-edit-1", title: "Before" });
		expect(after).toEqual({ id: "doc-changes-edit-1", title: "After" });
	});

	test("a refused edit appends no `changes` row", async ({ db }) => {
		await seedUser(db, "writer-changes-refused-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-changes-refused-1"), {
			title: "  ",
		});
		expect(result.ok).toBe(false);
		const rows = await db.select().from(changes).where(eq(changes.object, "document"));
		expect(rows).toHaveLength(0);
	});
});

describe("edit_document — O1 onBodyChanged, architecture.md §0", () => {
	test("called once on create, and again only when body actually changes — not on a title-only edit", async ({
		db,
	}) => {
		await seedUser(db, "writer-body-1");
		const calls: string[] = [];
		const deps = writeDeps({
			onBodyChanged: async (_exec, documentId) => {
				calls.push(documentId);
			},
		});
		const edit = editAction(deps);
		const ctx = ctxFor(db, "writer-body-1");

		const created = await edit.run(ctx, {
			id: "doc-body-1",
			title: "T1",
			body: "original body",
		});
		expect(created.ok).toBe(true);
		expect(calls).toEqual(["doc-body-1"]);

		const titleOnly = await edit.run(ctx, { id: "doc-body-1", title: "T2" });
		expect(titleOnly.ok).toBe(true);
		expect(calls).toEqual(["doc-body-1"]); // unchanged

		const bodyEdit = await edit.run(ctx, { id: "doc-body-1", body: "new body" });
		expect(bodyEdit.ok).toBe(true);
		expect(calls).toEqual(["doc-body-1", "doc-body-1"]);
	});
});

describe("edit_document — usage columns, architecture.md §6.7", () => {
	test("editing does not bump readCount, and the four usage fields are never writable", async ({
		db,
	}) => {
		await seedUser(db, "writer-usage-1");
		const deps = writeDeps();
		const edit = editAction(deps);
		const ctx = ctxFor(db, "writer-usage-1");

		const created = await edit.run(ctx, { id: "doc-usage-1", title: "T1", body: "B1" });
		expect(created.ok).toBe(true);

		const openDoc = actionFor<OpenDocumentInput, DocumentView>(
			createDocumentActions(deps),
			"open_document",
		);
		const opened = await openDoc.run(ctx, { id: "doc-usage-1" });
		expect(opened.ok).toBe(true);
		if (!opened.ok) throw new Error("expected success");
		expect(opened.data.document.readCount).toBe(1);

		const edited = await edit.run(ctx, { id: "doc-usage-1", title: "T2" });
		expect(edited.ok).toBe(true);
		if (!edited.ok) throw new Error("expected success");
		expect(edited.data.document.readCount).toBe(1); // unaffected by the edit
		expect(edited.data.document.lastReadAt).not.toBeNull();
		expect(edited.data.document.sessionUseCount).toBe(0);
		expect(edited.data.document.lastUsedAt).toBeNull();

		const row = await readRow(db, "doc-usage-1");
		expect(row?.readCount).toBe(1);
		expect(row?.sessionUseCount).toBe(0);
		expect(row?.lastUsedAt).toBeNull();
	});
});

describe("edit_document — status archive/restore, architecture.md §4.1 I12", () => {
	test("archive, then a further edit is refused until restored", async ({ db }) => {
		await seedUser(db, "writer-status-1");
		const edit = editAction(writeDeps());
		const ctx = ctxFor(db, "writer-status-1");

		await edit.run(ctx, { id: "doc-status-1", title: "T1", body: "B1", status: "active" });

		const archived = await edit.run(ctx, { id: "doc-status-1", status: "archived" });
		expect(archived.ok).toBe(true);
		if (!archived.ok) throw new Error("expected success");
		expect(archived.data.document.status).toBe("archived");

		const blocked = await edit.run(ctx, { id: "doc-status-1", title: "Sneaky while archived" });
		expect(blocked.ok).toBe(false);
		if (blocked.ok) throw new Error("expected a refusal");
		expect(blocked.problems[0]?.code).toBe("status_from_archived");

		const restored = await edit.run(ctx, { id: "doc-status-1", status: "active" });
		expect(restored.ok).toBe(true);
		if (!restored.ok) throw new Error("expected success");
		expect(restored.data.document.status).toBe("active");

		const afterRestore = await edit.run(ctx, { id: "doc-status-1", title: "Now allowed" });
		expect(afterRestore.ok).toBe(true);
		if (!afterRestore.ok) throw new Error("expected success");
		expect(afterRestore.data.document.title).toBe("Now allowed");
	});
});

describe("edit_document — the post-commit push, architecture.md §7", () => {
	test("pushes on document:<id> with the real before/after and on documents with both redacted to null", async ({
		db,
	}) => {
		await seedUser(db, "writer-push-1");
		const pushed: { topic: string; envelope: unknown }[] = [];
		const deps = writeDeps({
			wsPush: (topic, envelope) => {
				pushed.push({ topic, envelope });
			},
		});

		const result = await editAction(deps).run(ctxFor(db, "writer-push-1"), {
			id: "doc-push-1",
			title: "Pushed",
			body: "x",
		});
		expect(result.ok).toBe(true);

		expect(pushed).toHaveLength(2);
		const docTopic = pushed.find((p) => p.topic === "document:doc-push-1");
		const globalTopic = pushed.find((p) => p.topic === "documents");
		expect(docTopic).toBeDefined();
		expect(globalTopic).toBeDefined();

		const docEnvelope = docTopic?.envelope as { kind: string; data: Record<string, unknown> };
		expect(docEnvelope.kind).toBe("document.created");
		expect(docEnvelope.data.after).toMatchObject({ title: "Pushed" });

		const globalEnvelope = globalTopic?.envelope as { kind: string; data: Record<string, unknown> };
		expect(globalEnvelope.kind).toBe("document.created");
		expect(globalEnvelope.data.before).toBeNull();
		expect(globalEnvelope.data.after).toBeNull();
	});

	test("no wsPush configured — the edit still succeeds", async ({ db }) => {
		await seedUser(db, "writer-push-2");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-push-2"), {
			title: "No push configured",
			body: "x",
		});
		expect(result.ok).toBe(true);
	});
});

describe("edit_document — never a read, architecture.md §6.7", () => {
	test("an edit returns through assembleDocumentView, not open_document.run — readCount stays 0 through the edit itself", async ({
		db,
	}) => {
		await seedUser(db, "writer-never-read-1");
		const result = await editAction(writeDeps()).run(ctxFor(db, "writer-never-read-1"), {
			title: "Never a read",
			body: "x",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected success");
		expect(result.data.document.readCount).toBe(0);
		const row = await readRow(db, result.data.document.id);
		expect(row?.readCount).toBe(0);
	});
});
