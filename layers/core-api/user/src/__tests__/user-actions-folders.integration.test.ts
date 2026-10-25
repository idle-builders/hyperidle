/**
 * Review fix B2 — `deps.folders.give` was called with no team check at all:
 * origin/main's `routes/filesystems.ts:77-88` refused a mismatched team with
 * `TEAM_MISMATCH`; that route (and its gate) was deleted with nothing to
 * replace it, so any agent could be given any team's folder.
 * `give` checks the team with `folders.list({teamId})`. This file
 * proves the gate is back under `folder_other_team`, and that "already
 * given" (the port's own `CONFLICT`) is its OWN problem code —
 * `folder_already_given` — not reused from `folder_other_team`.
 *
 * Also N1 — a folder/connection step failing after the row was already
 * committed used to `return` before `ctx.eventBus.emit`, so the edit's own
 * `user.changed` never reached anyone in reach even though the row had
 * changed. This file proves the event still fires when `give` is refused.
 */
import { changes, type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type {
	EditUserInput,
	OpenUserInput,
	SearchUsersInput,
	UserView,
} from "@hyperidle/domain-model";
import { EventBus, type ObjectChangeEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { ActionContext } from "../action-types.js";
import {
	createUserActions,
	type UserActionsDeps,
	type UserActionsFolderView,
} from "../user-actions.js";
import { NOW, realDocumentActions, runnerFor, seedFounder } from "./_helpers.js";

/** A working in-memory folders fake, seeded directly (bypassing `add`) so a
 * test can pin a folder to an exact team. */
function buildFoldersFake(seed: readonly UserActionsFolderView[] = []): {
	readonly port: UserActionsDeps["folders"];
	readonly givenTo: ReadonlyMap<string, ReadonlySet<string>>;
} {
	const store = new Map<string, UserActionsFolderView>(seed.map((f) => [f.id, f]));
	const givenTo = new Map<string, Set<string>>();
	return {
		givenTo,
		port: {
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
			add: async () => ({ ok: false, code: "TEAM_NOT_FOUND" }) as const,
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
		},
	};
}

function buildDeps(
	foldersPort: UserActionsDeps["folders"] = buildFoldersFake().port,
): UserActionsDeps {
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
		folders: foldersPort,
		connections: {
			list: async () => ({ connections: [], inherited: [] }),
			add: async () => ({ ok: false, code: "MISSING_ROOT_SECRET" }) as const,
			remove: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
			withhold: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
		},
		searchDocuments: runnerFor(documentActions, "search_documents"),
		editDocument: runnerFor(documentActions, "edit_document"),
		onPluginPartEdited: async () => {},
	};
}

function ctxFor(db: HyperIdleDb, actor: string, bus: EventBus): ActionContext {
	return { actor, db, eventBus: bus, now: NOW };
}

function actionsFor(deps: UserActionsDeps) {
	const actions = createUserActions(deps);
	return {
		searchUsers: runnerFor<SearchUsersInput, unknown>(actions, "search_users"),
		openUser: runnerFor<OpenUserInput, UserView>(actions, "open_user"),
		editUser: runnerFor<EditUserInput, UserView>(actions, "edit_user"),
	};
}

async function seedTeamAgent(db: HyperIdleDb, teamId: string, agentId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: NOW }).onConflictDoNothing();
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "agent",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: agentId, teamId });
}

const codeFolder = (id: string, teamId: string): UserActionsFolderView => ({
	id,
	teamId,
	source: "test",
	kind: "code",
	connectionId: null,
	resourceRef: { kind: "code", repo: "org/repo", branch: "main" },
	writeback: "none",
	state: "attached",
	createdAt: NOW,
});

describe("edit_user — folders.give team gate (B2)", () => {
	test("giving a folder of another team is refused with folder_other_team", async ({ db }) => {
		await seedFounder(db);
		await seedTeamAgent(db, "team-a", "agent-a");
		const otherTeamFolder = codeFolder("folder-1", "team-b");
		const { port } = buildFoldersFake([otherTeamFolder]);
		const { editUser } = actionsFor(buildDeps(port));

		const result = await editUser(ctxFor(db, "agent-a", new EventBus()), {
			id: "agent-a",
			folders: { give: ["folder-1"] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("folder_other_team");
	});

	test("giving a folder of the agent's own team succeeds", async ({ db }) => {
		await seedFounder(db);
		await seedTeamAgent(db, "team-a", "agent-a");
		const ownTeamFolder = codeFolder("folder-1", "team-a");
		const { port } = buildFoldersFake([ownTeamFolder]);
		const { editUser } = actionsFor(buildDeps(port));

		const result = await editUser(ctxFor(db, "agent-a", new EventBus()), {
			id: "agent-a",
			folders: { give: ["folder-1"] },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.folders.some((f) => f.id === "folder-1")).toBe(true);
	});

	test("giving an already-given folder is refused with its own code, not folder_other_team", async ({
		db,
	}) => {
		await seedFounder(db);
		await seedTeamAgent(db, "team-a", "agent-a");
		const ownTeamFolder = codeFolder("folder-1", "team-a");
		const { port } = buildFoldersFake([ownTeamFolder]);
		const deps = buildDeps(port);
		const { editUser } = actionsFor(deps);

		const first = await editUser(ctxFor(db, "agent-a", new EventBus()), {
			id: "agent-a",
			folders: { give: ["folder-1"] },
		});
		expect(first.ok).toBe(true);

		const second = await editUser(ctxFor(db, "agent-a", new EventBus()), {
			id: "agent-a",
			folders: { give: ["folder-1"] },
		});
		expect(second.ok).toBe(false);
		if (second.ok) return;
		expect(second.problems[0]?.code).toBe("folder_already_given");
		expect(second.problems[0]?.code).not.toBe("folder_other_team");
	});

	test("a factory-wide agent, in no team, cannot receive any folder", async ({ db }) => {
		await seedFounder(db);
		await db.insert(users).values({
			id: "agent-everyone",
			kind: "ai",
			name: "Librarian",
			role: "agent",
			status: "active",
			createdAt: NOW,
		});
		const { port } = buildFoldersFake([codeFolder("folder-1", "some-team")]);
		const { editUser } = actionsFor(buildDeps(port));

		const result = await editUser(ctxFor(db, "agent-everyone", new EventBus()), {
			id: "agent-everyone",
			folders: { give: ["folder-1"] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("folder_other_team");
	});
});

describe("edit_user — a person in several teams names the team a folder belongs to", () => {
	test("no team named is refused; the named team gets the folder", async ({ db }) => {
		await seedFounder(db);
		const addedTo: string[] = [];
		const port: UserActionsDeps["folders"] = {
			...buildFoldersFake().port,
			add: async (teamId, body) => {
				addedTo.push(teamId);
				return { ok: true, folder: { ...codeFolder(`f-${teamId}`, teamId), ...body } };
			},
		};
		const { editUser } = actionsFor(buildDeps(port));
		const maya = await editUser(ctxFor(db, "u-founder", new EventBus()), {
			kind: "human",
			name: "Maya",
			teams: ["Support", "Product"],
		});
		if (!maya.ok) throw new Error("setup failed");
		const mayaId = maya.data.user?.id as string;
		const supportId = maya.data.user?.teams.find((t) => t.name === "Support")?.id;
		const folder = {
			kind: "doc_set" as const,
			resourceRef: { kind: "doc_set" as const, folder: "/support" },
			writeback: "none" as const,
		};

		const unnamed = await editUser(ctxFor(db, mayaId, new EventBus()), {
			id: mayaId,
			folders: { add: [folder] },
		});
		expect(unnamed.ok).toBe(false);
		if (unnamed.ok) return;
		expect(unnamed.problems[0]?.code).toBe("folder_team_required");

		const named = await editUser(ctxFor(db, mayaId, new EventBus()), {
			id: mayaId,
			folders: { add: [{ ...folder, team: "Support" }] },
		});
		expect(named.ok).toBe(true);
		expect(addedTo).toEqual([supportId]);
	});
});

describe("edit_user — a thrown folder-port call is caught like a connection failure (N6)", () => {
	test("give throwing (the seam's own non-2xx-throws-instead-of-returns shape) still commits the rename and emits user.changed", async ({
		db,
	}) => {
		await seedFounder(db);
		await seedTeamAgent(db, "team-a", "agent-a");
		const throwingPort: UserActionsDeps["folders"] = {
			...buildFoldersFake([codeFolder("folder-1", "team-a")]).port,
			give: async () => {
				throw new Error("seam: non-2xx response");
			},
		};
		const deps = buildDeps(throwingPort);
		const { editUser } = actionsFor(deps);

		const bus = new EventBus();
		const seen: ObjectChangeEvent[] = [];
		bus.on("user.changed", (e) => seen.push(e));

		const result = await editUser(ctxFor(db, "agent-a", bus), {
			id: "agent-a",
			role: "renamed-role",
			folders: { give: ["folder-1"] },
		});

		// The throw is caught and turned into a problem, exactly like a
		// connection add that throws — it must not escape uncaught and skip
		// the commit's own emit.
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.path).toBe("folders");

		expect(seen).toHaveLength(1);
		expect(seen[0]?.change.objectId).toBe("agent-a");

		const [row] = await db.select().from(users).where(eq(users.id, "agent-a"));
		expect(row?.role).toBe("renamed-role");
	});
});

describe("edit_user — an owned agent's own team (N7)", () => {
	test("an owned agent can be given a folder of its own team, one of its owner's, from Settings (edit)", async ({
		db,
	}) => {
		await seedFounder(db);
		const bus = new EventBus();
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);

		const owner = await editUser(ctxFor(db, "u-founder", bus), {
			kind: "human",
			name: "Owner",
			teams: ["Owner Team"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const ownerTeamId = owner.data.user?.teams[0]?.id as string;

		const agent = await editUser(ctxFor(db, ownerId, bus), {
			kind: "ai",
			name: "Owned Assistant",
			ownerUserId: ownerId,
			teams: ["Owner Team"],
			identity: "hi",
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id as string;

		const ownersTeamFolder = codeFolder("folder-1", ownerTeamId);
		const { port } = buildFoldersFake([ownersTeamFolder]);
		const deps2 = buildDeps(port);
		const { editUser: editUser2 } = actionsFor(deps2);

		const result = await editUser2(ctxFor(db, agentId, bus), {
			id: agentId,
			folders: { give: ["folder-1"] },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.folders.some((f) => f.id === "folder-1")).toBe(true);
	});
});

describe("edit_user — a failed folder step does not swallow user.changed (N1)", () => {
	test("a name change plus a refused give: the row updates AND the event still fires", async ({
		db,
	}) => {
		await seedFounder(db);
		await seedTeamAgent(db, "team-a", "agent-a");
		const otherTeamFolder = codeFolder("folder-1", "team-b");
		const { port } = buildFoldersFake([otherTeamFolder]);
		const deps = buildDeps(port);
		const { editUser } = actionsFor(deps);

		const bus = new EventBus();
		const seen: ObjectChangeEvent[] = [];
		bus.on("user.changed", (e) => seen.push(e));

		const result = await editUser(ctxFor(db, "agent-a", bus), {
			id: "agent-a",
			role: "renamed-role",
			folders: { give: ["folder-1"] },
		});

		// The caller is told the edit was refused (the folder step failed) —
		// but the row's own field change already landed, and the event still
		// reached the bus, exactly as it would for a clean edit.
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("folder_other_team");

		expect(seen).toHaveLength(1);
		expect(seen[0]?.change.objectId).toBe("agent-a");

		const [row] = await db.select().from(users).where(eq(users.id, "agent-a"));
		expect(row?.role).toBe("renamed-role");
	});
});
