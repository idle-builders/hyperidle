/**
 * Review fix B1 — `edit_user` without an id used to never read `input.folders`
 * (nor `input.connections`) at all: the welcome screen's first call created
 * the person and the team but silently dropped the picked folder
 * (`SetupFlow.tsx` sends `edit_user({kind:"human", name, teams, folders:{add:
 * [...]}})` — the same body origin/main's
 * `SetupFlow.tsx:350` POSTed to `/api/filesystems`). This file proves create
 * now honours `folders`/`connections` the same way an edit does: a server
 * test creates a user with a folder and finds it via `open_user`.
 *
 * Real PGlite via `{ db }`; `searchDocuments`/`editDocument` are the real
 * `@hyperidle/document` actions, same idiom `user-actions.integration.test.ts`
 * uses; `folders`/`connections` are a working in-memory fake (the default
 * fixture in the sibling file always refuses — this one actually stores
 * state, since B1 needs to prove a folder that was added is later found).
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
import {
	createUserActions,
	type UserActionsConnectionCreateInput,
	type UserActionsConnectionView,
	type UserActionsDeps,
	type UserActionsFolderView,
} from "../user-actions.js";
import { NOW, realDocumentActions, runnerFor, seedFounder } from "./_helpers.js";

/** A working in-memory folders fake — unlike the sibling file's fixture
 * (which always refuses), this one actually stores what it is given, so a
 * folder added on create is really found again by `open_user`. */
function buildFoldersFake(): UserActionsDeps["folders"] {
	const store = new Map<string, UserActionsFolderView>();
	const givenTo = new Map<string, Set<string>>();
	let nextId = 1;
	return {
		list: async (query) => {
			if ("teamId" in query) {
				return [...store.values()].filter((f) => f.teamId === query.teamId);
			}
			const ids = [...givenTo.entries()]
				.filter(([, agents]) => agents.has(query.agentUserId))
				.map(([id]) => id);
			return ids.flatMap((id) => {
				const f = store.get(id);
				return f ? [f] : [];
			});
		},
		add: async (teamId, body) => {
			const id = `folder-${nextId++}`;
			const folder: UserActionsFolderView = {
				id,
				teamId,
				source: "test",
				kind: body.kind,
				connectionId: body.connectionId ?? null,
				resourceRef: body.resourceRef,
				writeback: body.writeback,
				state: "attached",
				createdAt: NOW,
			};
			store.set(id, folder);
			return { ok: true, folder };
		},
		remove: async (id) => {
			if (!store.has(id)) return { ok: false, code: "NOT_FOUND" };
			store.delete(id);
			return { ok: true };
		},
		give: async (id, agentUserId) => {
			if (!store.has(id)) return { ok: false, code: "NOT_FOUND" };
			const set = givenTo.get(id) ?? new Set<string>();
			if (set.has(agentUserId)) return { ok: false, code: "CONFLICT" };
			set.add(agentUserId);
			givenTo.set(id, set);
			return { ok: true };
		},
		take: async (id, agentUserId) => {
			const set = givenTo.get(id);
			if (!set?.has(agentUserId)) return { ok: false, code: "NOT_FOUND" };
			set.delete(agentUserId);
			return { ok: true };
		},
	};
}

function buildConnectionsFake(): UserActionsDeps["connections"] {
	const store = new Map<string, UserActionsConnectionView[]>();
	let nextId = 1;
	return {
		list: async (userId) => ({ connections: store.get(userId) ?? [], inherited: [] }),
		add: async (userId, input: UserActionsConnectionCreateInput) => {
			const connection: UserActionsConnectionView = {
				id: `conn-${nextId++}`,
				service: input.service ?? "mcp",
				via: "test",
				authSource: input.authSource,
				health: "working",
				removable: true,
				withheldFrom: [],
			};
			store.set(userId, [...(store.get(userId) ?? []), connection]);
			return { ok: true, connection };
		},
		remove: async (userId, id) => {
			const list = store.get(userId) ?? [];
			if (!list.some((c) => c.id === id)) return { ok: false, code: "NOT_FOUND" };
			store.set(
				userId,
				list.filter((c) => c.id !== id),
			);
			return { ok: true };
		},
		withhold: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
	};
}

function buildDeps(): UserActionsDeps {
	const documentActions = realDocumentActions();
	const runConfigStore = new Map<string, Record<string, unknown>>();
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
		runConfig: {
			read: async (agentId) => ({
				harnessType: null,
				modelId: null,
				modelProvider: null,
				maxConcurrentSessions: 1,
				modelOptions: {},
				...runConfigStore.get(agentId),
			}),
			write: async (agentId, patch) => {
				runConfigStore.set(agentId, { ...runConfigStore.get(agentId), ...patch });
			},
		},
		folders: buildFoldersFake(),
		connections: buildConnectionsFake(),
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

describe("edit_user — create honours folders and connections (B1)", () => {
	test("a person created with a picked folder — open_user finds it", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);

		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Ada",
			teams: ["Welcome Team"],
			folders: {
				add: [
					{
						kind: "doc_set",
						resourceRef: { kind: "doc_set", folder: "/Users/ada/notes" },
						writeback: "none",
					},
				],
			},
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const personId = result.data.user?.id as string;
		const teamId = result.data.user?.teams[0]?.id as string;

		// The create's own response already carries the folder — no dropped field.
		expect(result.data.folders).toHaveLength(1);
		expect(result.data.folders[0]?.teamId).toBe(teamId);

		// And it is durably there — a fresh `open_user` finds it too.
		const reopened = await openUser(ctxFor(db, personId), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		expect(reopened.data.folders).toHaveLength(1);
		expect(reopened.data.folders[0]?.resourceRef).toEqual({
			kind: "doc_set",
			folder: "/Users/ada/notes",
		});
	});

	test("an owned agent created with a connection — open_user finds it", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);

		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Connections Team"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const agent = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Assistant",
			ownerUserId: ownerId,
			teams: ["Connections Team"],
			identity: "You help.",
			connections: { add: [{ authSource: "mcp", serverUrl: "https://example.com/mcp" }] },
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id as string;

		const reopened = await openUser(ctxFor(db, agentId), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		expect(reopened.data.connections?.connections).toHaveLength(1);
	});
});

describe("edit_user — a failed folder step on create never leaves a half-made person (N8)", () => {
	test("the folder step fails, but the person and team WERE created — the caller gets the row, not a bare refusal", async ({
		db,
	}) => {
		await seedFounder(db);
		const refusingFolders: UserActionsDeps["folders"] = {
			...buildFoldersFake(),
			add: async () => ({ ok: false, code: "TEAM_NOT_FOUND" }) as const,
		};
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor({ ...deps, folders: refusingFolders });

		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Grace",
			teams: ["Grace's Team"],
			folders: {
				add: [
					{
						kind: "doc_set",
						resourceRef: { kind: "doc_set", folder: "/Users/grace/notes" },
						writeback: "none",
					},
				],
			},
		});

		// The person and team really were created — the caller must be told so
		// (a bare `ok:false` here is what drove the welcome screen to retry and
		// create a second person, N8). The folder itself did not attach.
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.user?.name).toBe("Grace");
		expect(result.data.user?.teams[0]?.name).toBe("Grace's Team");
		expect(result.data.folders).toHaveLength(0);

		const personId = result.data.user?.id as string;
		const reopened = await openUser(ctxFor(db, personId), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		expect(reopened.data.user?.id).toBe(personId);
	});
});

describe("edit_user — the welcome screen's first person is the founder", () => {
	test("a fresh database's first human is created with role 'founder'", async ({ db }) => {
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);

		// No seedFounder: this is a genuinely empty database, and the caller
		// (the welcome screen, pre-auth) has no user row of its own — exactly
		// what `SetupFlow.tsx`'s first `edit_user` call sends.
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
