/**
 * A readability fix in the scope derivation (`edit_document`'s write path):
 * a `user`-scoped write with no `scopeId` given now defaults `scopeId` to
 * the actor — the same auto-fill the legacy `POST /knowledge` route gave
 * `scopeKind === "user"` at create (`routes/knowledge.ts:467-468`). Without
 * it, a `user`-scoped, non-memory row stored `scopeId: null`, which no
 * subject — not even its own writer — ever matches against
 * `canReadDocument`'s visibility predicate. Real PGlite via the `{ db }`
 * fixture.
 */
import {
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
import { eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import { createDocumentActions, type DocumentActionsDeps } from "../document-actions.js";

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

function ctxFor(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: "2026-06-01T00:00:00.000Z" };
}

function actionFor<I, O>(actions: readonly Action[], name: string): Action<I, O> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found as unknown as Action<I, O>;
}

/** Real queries against the real `users`/`teams` tables — never a stub of
 * the visibility predicate. `openParent`/`onBodyChanged` are not exercised
 * by this fix and are stubbed accordingly. */
function writeDeps(): DocumentActionsDeps {
	return {
		changes: { appendChange: async () => undefined },
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
			throw new Error("openParent not stubbed for this test");
		},
		onBodyChanged: async () => {},
	};
}

async function readRow(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	return row;
}

function editAction(deps: DocumentActionsDeps): Action<EditDocumentInput, DocumentView> {
	return actionFor<EditDocumentInput, DocumentView>(createDocumentActions(deps), "edit_document");
}

function openAction(deps: DocumentActionsDeps): Action<OpenDocumentInput, DocumentView> {
	return actionFor<OpenDocumentInput, DocumentView>(createDocumentActions(deps), "open_document");
}

describe("edit_document — a user-scoped write with no scopeId defaults to the actor (readability fix)", () => {
	test("scopeKind:'user' with no scopeId stores the actor as scopeId, so the writer can open it and a stranger gets not_found", async ({
		db,
	}) => {
		await seedUser(db, "writer-scope-default");
		await seedUser(db, "stranger-scope-default");
		const deps = writeDeps();

		const created = await editAction(deps).run(ctxFor(db, "writer-scope-default"), {
			as: "document",
			title: "User-scoped, no id given",
			body: "x",
			scopeKind: "user",
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error("expected success");
		expect(created.data.document.scopeKind).toBe("user");
		expect(created.data.document.scopeId).toBe("writer-scope-default");

		const row = await readRow(db, created.data.document.id);
		expect(row?.scopeId).toBe("writer-scope-default");

		const seenByWriter = await openAction(deps).run(ctxFor(db, "writer-scope-default"), {
			id: created.data.document.id,
		});
		expect(seenByWriter.ok).toBe(true);

		const seenByStranger = await openAction(deps).run(ctxFor(db, "stranger-scope-default"), {
			id: created.data.document.id,
		});
		expect(seenByStranger.ok).toBe(false);
		if (seenByStranger.ok) throw new Error("expected a refusal");
		expect(seenByStranger.problems[0]?.code).toBe("not_found");
	});
});
