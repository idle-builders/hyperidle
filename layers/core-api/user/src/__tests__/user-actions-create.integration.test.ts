/**
 * Proves that `edit_user` without an id (create) honours expected invariants.
 *
 * Real PGlite via `{ db }`; `searchDocuments`/`editDocument` are the real
 * `@hyperidle/document` actions.
 */
import { changes, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type {
	EditUserInput,
	OpenUserInput,
	SearchUsersInput,
	UserView,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { ActionContext } from "../action-types.js";
import { createUserActions, type UserActionsDeps } from "../user-actions.js";
import { NOW, realDocumentActions, runnerFor, seedFounder } from "./_helpers.js";

function buildDeps(): UserActionsDeps {
	const documentActions = realDocumentActions();
	return {
		changes: {
			appendChange: async (exec, row) => {
				const [inserted] = await (exec as HyperIdleDb).insert(changes).values(row).returning();
				if (!inserted) throw new Error("appendChange: insert returned no row");
				return inserted;
			},
			listByIds: async (db, ids) => {
				if (ids.length === 0) return [];
				const rows = await db.select().from(changes);
				return rows.filter((r) => ids.includes(r.id));
			},
		},
		searchDocuments: runnerFor(documentActions, "search_documents"),
		editDocument: runnerFor(documentActions, "edit_document"),
		onPluginPartEdited: async () => {},
	};
}

function ctxFor(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: NOW };
}

function actionsFor(deps: UserActionsDeps) {
	const actions = createUserActions(deps);
	return {
		searchUsers: runnerFor<SearchUsersInput, unknown>(actions, "search_users"),
		openUser: runnerFor<OpenUserInput, UserView>(actions, "open_user"),
		editUser: runnerFor<EditUserInput, UserView>(actions, "edit_user"),
	};
}

describe("edit_user — the welcome screen's first person is the founder", () => {
	test("a fresh database's first human is created with role 'founder'", async ({ db }) => {
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);

		// No seedFounder: this is a genuinely empty database.
		const result = await editUser(ctxFor(db, "u-nobody"), {
			kind: "human",
			name: "Ada",
			teams: ["Welcome Team"],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.user?.role).toBe("founder");
	});
});

describe("edit_user — creates a person with a team", () => {
	test("person is created and open_user finds them", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);

		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Grace",
			teams: ["Grace's Team"],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.user?.name).toBe("Grace");
		expect(result.data.user?.teams[0]?.name).toBe("Grace's Team");

		const personId = result.data.user?.id as string;
		const reopened = await openUser(ctxFor(db, personId), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		expect(reopened.data.user?.id).toBe(personId);
	});
});
