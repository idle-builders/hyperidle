/**
 * Proves that `edit_user` without an id (create) honours `folders` and
 * `connections` the same way an edit does.
 *
 * Real PGlite via `{ db }`; `searchDocuments`/`editDocument` are the real
 * `@hyperidle/document` actions; `spaceFolders`/`connections` are working
 * in-memory fakes that actually store state, so a folder added on create
 * is really found again by `open_user`.
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

/** A working in-memory spaceFolders fake that actually stores what it is given. */
function buildSpaceFoldersFake(): UserActionsDeps["spaceFolders"] {
	const store = new Map<string, UserActionsFolderView[]>();
	return {
		list: async (agentId) => store.get(agentId) ?? [],
		add: async (agentId, path, name?) => {
			const folderName = name ?? path.split("/").pop() ?? path;
			const existing = store.get(agentId) ?? [];
			const folder: UserActionsFolderView = {
				name: folderName,
				path,
				isGit: false,
				isMissing: false,
			};
			store.set(agentId, [...existing, folder]);
			return { ok: true };
		},
		remove: async (agentId, name) => {
			const existing = store.get(agentId) ?? [];
			const idx = existing.findIndex((f) => f.name === name);
			if (idx === -1) return { ok: false, code: "NOT_FOUND" };
			store.set(
				agentId,
				existing.filter((_, i) => i !== idx),
			);
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
				login: "owner" as const,
				spacePath: null,
				...runConfigStore.get(agentId),
			}),
			write: async (agentId, patch) => {
				runConfigStore.set(agentId, { ...runConfigStore.get(agentId), ...patch });
			},
			ensureSpace: async (agentId, agentName) => {
				const spacePath = `/spaces/${agentName}`;
				runConfigStore.set(agentId, { ...runConfigStore.get(agentId), spacePath });
				return spacePath;
			},
		},
		spaceFolders: buildSpaceFoldersFake(),
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

describe("edit_user — create honours folders and connections", () => {
	test("an agent created with a folder — open_user finds it", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);

		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Folder Team"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "FolderAgent",
			ownerUserId: ownerId,
			teams: ["Folder Team"],
			identity: "I work with files.",
			folders: {
				add: [{ path: "/Users/owner/projects" }],
			},
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const agentId = result.data.user?.id as string;

		// The create's own response already carries the folder.
		expect(result.data.folders).toHaveLength(1);
		expect(result.data.folders[0]?.path).toBe("/Users/owner/projects");

		// A fresh open_user finds it too.
		const reopened = await openUser(ctxFor(db, agentId), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		expect(reopened.data.folders).toHaveLength(1);
		expect(reopened.data.folders[0]?.path).toBe("/Users/owner/projects");
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

describe("edit_user — a failed folder step on create never leaves a half-made person", () => {
	test("folders are not supported for persons — create still returns ok:true with empty folders", async ({
		db,
	}) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);

		// Person with a folder input — folders_not_supported is logged but create still returns ok:true.
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Grace",
			teams: ["Grace's Team"],
			folders: {
				add: [{ path: "/Users/grace/notes" }],
			},
		});

		// Person and team really were created — the caller gets the row, not a bare refusal.
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
