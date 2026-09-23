/**
 * Review fix B2 — `deps.folders.give` was called with no team check at all:
 * origin/main's `routes/filesystems.ts:77-88` refused a mismatched team with
 * `TEAM_MISMATCH`; that route (and its gate) was deleted with nothing to
 * replace it, so any agent could be given any team's folder. architecture.md
 * §6: "`give` checks the team with `folders.list({teamId})`". This file
 * proves the gate is back under `folder_other_team`, and that "already
 * given" (the port's own `CONFLICT`) is its OWN problem code —
 * `folder_already_given` — not reused from `folder_other_team`.
 *
 * Also N1 — a folder/connection step failing after the row was already
 * committed used to `return` before `ctx.eventBus.emit`, so the edit's own
 * `user.changed` never reached anyone in reach even though the row had
 * changed. This file proves the event still fires when `give` is refused.
 */
import { changes, type HyperIdleDb, teams, users, type WriteExecutor } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import type {
	ActionResult,
	EditUserInput,
	OpenUserInput,
	SearchUsersInput,
	UserView,
} from "@hyperidle/domain-model";
import { EventBus, type ObjectChangeEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import { getSubscription } from "../subscriptions-store.js";
import {
	createUserActions,
	type UserActionsDeps,
	type UserActionsFolderView,
} from "../user-actions.js";

const NOW = "2026-01-01T00:00:00.000Z";

async function seedFounder(db: HyperIdleDb, id = "u-founder"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

function realDocumentActions(): readonly Action[] {
	const deps: DocumentActionsDeps = {
		changes: {
			appendChange: async (exec: WriteExecutor, row) => {
				await exec.insert(changes).values(row);
			},
		},
		users: {
			getUserById: async (exec, id) => {
				const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
			listOwnedBy: async (exec, ownerId) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
		},
		org: {
			getTeam: async (exec, q) => {
				const [row] = await exec.select().from(teams).where(eq(teams.id, q.id)).limit(1);
				return row;
			},
		},
		openParent: () => {
			throw new Error("user-actions-folders test: openParent is unreachable");
		},
		systemParentExists: async (exec, kind, id) => {
			if (kind === "agent") {
				const [row] = await exec
					.select({ id: users.id })
					.from(users)
					.where(eq(users.id, id))
					.limit(1);
				return row !== undefined;
			}
			if (kind === "subscription")
				return (await getSubscription(exec as HyperIdleDb, id)) !== undefined;
			return false;
		},
		onBodyChanged: async () => undefined,
	};
	return createDocumentActions(deps) as readonly Action[];
}

function runnerFor<I, O>(
	actions: readonly Action[],
	name: string,
): (ctx: ActionContext, input: I) => Promise<ActionResult<O>> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found.run as never;
}

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
		},
		readServerConfig: async () => ({ harnessDisabled: [] }),
		behaviour: {
			list: async () => [],
			patch: async () => {
				throw new Error("behaviour.patch: not exercised in this test");
			},
		},
		searchDocuments: runnerFor(documentActions, "search_documents"),
		editDocument: runnerFor(documentActions, "edit_document"),
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
		teamId,
		createdAt: NOW,
	});
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

	test("an agent with no team cannot receive any folder", async ({ db }) => {
		await seedFounder(db);
		const owner = await (async () => {
			const bus = new EventBus();
			const { editUser } = actionsFor(buildDeps());
			const result = await editUser(ctxFor(db, "u-founder", bus), {
				kind: "human",
				name: "Owner",
				team: { name: "Owner Team" },
			});
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("setup failed");
			return result.data.user?.id as string;
		})();
		const noTeamFolder = codeFolder("folder-1", "some-team");
		const { port } = buildFoldersFake([noTeamFolder]);
		const deps = buildDeps(port);
		const { editUser } = actionsFor(deps);
		const agent = await editUser(ctxFor(db, owner, new EventBus()), {
			kind: "ai",
			name: "Orphan",
			ownerUserId: owner,
			identity: "hi",
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id as string;
		// This owner has no team either, so the agent's effective team is null.
		const result = await editUser(ctxFor(db, agentId, new EventBus()), {
			id: agentId,
			folders: { give: ["folder-1"] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("folder_other_team");
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
