/**
 * `search_users` / `open_user` / `edit_user` — real PGlite via the `{ db }`
 * fixture. `searchDocuments`/`editDocument` are the REAL `@hyperidle/document`
 * actions (the one genuinely external crossing this module has, same idiom
 * `platform-actions.integration.test.ts` established); `runConfig`/
 * `folders`/`connections` are in-memory fakes — the real thing lives in
 * `agent-orchestration`, a different Layer this package's own tests do not
 * boot.
 */
import { changes, documents, type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	type EditUserInput,
	type OpenUserInput,
	type SearchUsersInput,
	type UserView,
	UserViewSchema,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { ActionContext } from "../action-types.js";
import { createUserActions, type UserActionsDeps } from "../user-actions.js";
import { NOW, realDocumentActions, runnerFor, seedFounder } from "./_helpers.js";

/** In-memory fakes for the ports that genuinely live in agent-orchestration —
 * a different Layer, never booted by this package's own tests. */
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
		folders: {
			list: async () => [],
			add: async () => ({ ok: false, code: "TEAM_NOT_FOUND" }) as const,
			remove: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
			give: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
			take: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
		},
		connections: {
			list: async () => ({ connections: [], inherited: [] }),
			add: async () => ({ ok: false, code: "MISSING_ROOT_SECRET" }) as const,
			remove: async () => ({ ok: false, code: "NOT_FOUND" }) as const,
		},
		searchDocuments: runnerFor(documentActions, "search_documents"),
		editDocument: runnerFor(documentActions, "edit_document"),
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

describe("edit_user — create a person with a team by name", () => {
	test("names a team that does not exist yet — it is created", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Ada",
			teams: ["Alpha"],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.user?.teams[0]?.name).toBe("Alpha");

		const [row] = await db.select().from(teams).where(eq(teams.name, "Alpha"));
		expect(row).toBeDefined();
	});
});

describe("edit_user — a person in several teams, an agent in one", () => {
	test("a person put in two teams is found by search_users in each, and open_user lists both", async ({
		db,
	}) => {
		await seedFounder(db);
		const { editUser, searchUsers, openUser } = actionsFor(buildDeps());
		const created = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Maya",
			teams: ["Support"],
		});
		if (!created.ok) throw new Error("create failed");
		const mayaId = created.data.user?.id as string;

		const edited = await editUser(ctxFor(db, mayaId), {
			id: mayaId,
			teams: ["Support", "Product"],
		});
		expect(edited.ok).toBe(true);

		const opened = await openUser(ctxFor(db, mayaId), { id: mayaId });
		if (!opened.ok) throw new Error("open failed");
		const teamsOfMaya = opened.data.user?.teams ?? [];
		expect(teamsOfMaya.map((t) => t.name).sort()).toEqual(["Product", "Support"]);

		for (const team of teamsOfMaya) {
			const found = await searchUsers(ctxFor(db, mayaId), { teamId: team.id });
			if (!found.ok) throw new Error("search failed");
			expect((found.data as Array<{ id: string }>).map((u) => u.id)).toEqual([mayaId]);
		}
	});

	test("agent_one_team: an agent given two teams is refused", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const agent = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Builder",
			teams: ["Product"],
		});
		if (!agent.ok) throw new Error("create failed");

		const result = await editUser(ctxFor(db, "u-founder"), {
			id: agent.data.user?.id as string,
			teams: ["Product", "Support"],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("agent_one_team");
	});

	test("agent_team_not_owners: an owned agent given a team its owner is not in is refused", async ({
		db,
	}) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Maya",
			teams: ["Support", "Product"],
		});
		if (!owner.ok) throw new Error("create failed");
		const ownerId = owner.data.user?.id as string;

		const refused = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Designer",
			ownerUserId: ownerId,
			teams: ["Sales"],
		});
		expect(refused.ok).toBe(false);
		if (refused.ok) return;
		expect(refused.problems[0]?.code).toBe("agent_team_not_owners");

		const allowed = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Designer",
			ownerUserId: ownerId,
			teams: ["Support"],
		});
		if (!allowed.ok) throw new Error("create failed");
		expect(allowed.data.user?.teams.map((t) => t.name)).toEqual(["Support"]);
	});
});

describe("edit_user — an agent created with run config, identity and subscriptions in one call", () => {
	test("the create succeeds and every piece lands", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Gamma"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Librarian",
			ownerUserId: ownerId,
			teams: ["Gamma"],
			status: "active",
			identity: "You catalogue things.",
			runConfig: { harnessType: "claude-code", modelId: "sonnet" },
			subscriptions: { add: [{ event: "task.changed" }] },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.runConfig?.harnessType).toBe("claude-code");
		expect(result.data.subscriptions).toHaveLength(1);
		expect(result.data.subscriptions[0]?.event).toBe("task.changed");
		expect(result.data.documentIds.some((d) => d.slot === "agent_file")).toBe(true);
	});
});

describe("edit_user — kept guards", () => {
	test("own_profile_only: a person cannot rename another person", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const other = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Other",
			teams: ["Delta"],
		});
		expect(other.ok).toBe(true);
		if (!other.ok) return;
		const otherId = other.data.user?.id as string;

		const result = await editUser(ctxFor(db, "u-founder"), { id: otherId, name: "Renamed" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("own_profile_only");
	});

	test("cannot_retire: a person cannot be retired", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const result = await editUser(ctxFor(db, "u-founder"), { id: "u-founder", status: "retired" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("cannot_retire");
	});

	test("cannot_retire: a system agent cannot be retired", async ({ db }) => {
		await seedFounder(db);
		await db.insert(teams).values({ id: "team-x", name: "X", createdAt: NOW });
		await db.insert(users).values({
			id: "a-system",
			kind: "ai",
			name: "System",
			role: "system",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(userTeams).values({ userId: "a-system", teamId: "team-x" });
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const result = await editUser(ctxFor(db, "u-founder"), { id: "a-system", status: "retired" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("cannot_retire");
	});
});

describe("edit_user — retire archives the identity", () => {
	test("a retired agent's identity document is archived", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Epsilon"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const agent = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Helper",
			ownerUserId: ownerId,
			teams: ["Epsilon"],
			identity: "You help.",
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id as string;
		const identityDocId = agent.data.documentIds.find((d) => d.slot === "agent_file")?.id as string;

		const retired = await editUser(ctxFor(db, ownerId), { id: agentId, status: "retired" });
		expect(retired.ok).toBe(true);

		const [row] = await db.select().from(documents).where(eq(documents.id, identityDocId));
		expect(row?.status).toBe("archived");
	});
});

describe("edit_user — a subscription prompt document parented to the subscription", () => {
	test("the prompt document is parented to the subscription, in the agent's own scope", async ({
		db,
	}) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Zeta"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const agent = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Watcher",
			ownerUserId: ownerId,
			teams: ["Zeta"],
			subscriptions: { add: [{ event: "task.changed", prompt: "Check the task." }] },
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const subscriptionId = agent.data.subscriptions[0]?.id as string;
		const documentId = agent.data.subscriptions[0]?.documentId as string;
		expect(documentId).toBeDefined();

		const [row] = await db.select().from(documents).where(eq(documents.id, documentId));
		expect(row?.parentKind).toBe("subscription");
		expect(row?.parentId).toBe(subscriptionId);
		expect(row?.scopeKind).toBe("user");
		expect(row?.scopeId).toBe(agent.data.user?.id);
		expect(row?.body).toBe("Check the task.");
	});
});

describe("edit_user — following one object", () => {
	test("a person follows a task and stops following it, read back on their page", async ({
		db,
	}) => {
		await seedFounder(db);
		const { editUser, openUser } = actionsFor(buildDeps());
		const followed = await editUser(ctxFor(db, "u-founder"), {
			id: "u-founder",
			subscriptions: { add: [{ event: "task.changed", objectId: "task-1" }] },
		});
		expect(followed.ok && followed.data.subscriptions.map((s) => [s.event, s.objectId])).toEqual([
			["task.changed", "task-1"],
		]);
		const id = followed.ok ? (followed.data.subscriptions[0]?.id ?? "") : "";

		await editUser(ctxFor(db, "u-founder"), { id: "u-founder", subscriptions: { remove: [id] } });
		const opened = await openUser(ctxFor(db, "u-founder"), { id: "u-founder" });
		expect(opened.ok && opened.data.subscriptions).toEqual([]);
	});
});

describe("edit_user — inbox marks", () => {
	test("marking a change read stamps both readAt and seenAt", async ({ db }) => {
		await seedFounder(db);
		await db.insert(teams).values({ id: "team-inbox", name: "Inbox", createdAt: NOW });
		await db.insert(users).values({
			id: "u-reader",
			kind: "human",
			name: "Reader",
			role: "member",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(userTeams).values({ userId: "u-reader", teamId: "team-inbox" });
		const [changeRow] = await db
			.insert(changes)
			.values({
				id: "c1",
				object: "user",
				objectId: "u-reader",
				kind: "changed",
				actor: "u-reader",
				before: null,
				after: "{}",
				at: NOW,
			})
			.returning();
		const { insertInboxRow } = await import("../subscriptions-store.js");
		await insertInboxRow(db, {
			userId: "u-reader",
			changeId: changeRow?.id as string,
			seenAt: null,
			readAt: null,
		});

		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);
		const result = await editUser(ctxFor(db, "u-reader"), {
			id: "u-reader",
			inbox: { read: ["c1"] },
		});
		expect(result.ok).toBe(true);

		const reopened = await openUser(ctxFor(db, "u-reader"), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		const row = reopened.data.inbox?.find((r) => r.change.id === "c1");
		expect(row?.readAt).not.toBeNull();
		expect(row?.seenAt).not.toBeNull();
	});
});

describe("edit_user — every DB-dependent problem code", () => {
	test("not_found: editing an unknown id", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), { id: "ghost", name: "X" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("not_found");
	});

	test("unknown_actor: a rowless caller may only create the first person", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-nobody"), {
			kind: "human",
			name: "Second",
			teams: ["Rho"],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_actor");
	});

	test("unknown_owner: an agent named to an owner that does not exist", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Orphan",
			ownerUserId: "ghost-owner",
			teams: ["Ghost Team"],
			identity: "hi",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_owner");
	});

	test("unknown_user: an org edge target that does not exist", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Ada",
			teams: ["Iota"],
			edges: { add: [{ mechanism: "direct", target: "ghost" }] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_user");
	});

	test("schedule_for_agents_only: a person cannot run on a schedule", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Ada",
			teams: ["Kappa"],
			subscriptions: { add: [{ schedule: "0 9 * * *" }] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("schedule_for_agents_only");
	});

	test("prompt_for_agents_only: a person's subscription cannot carry a prompt", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Ada",
			teams: ["Lambda"],
			subscriptions: { add: [{ event: "task.changed", prompt: "hi" }] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("prompt_for_agents_only");
	});

	test("agent_not_runnable: an inactive agent cannot get a subscription", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Mu"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "A",
			ownerUserId: ownerId,
			teams: ["Mu"],
			status: "inactive",
			identity: "hi",
			subscriptions: { add: [{ event: "task.changed" }] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("agent_not_runnable");
	});

	test("invalid_schedule: a malformed cron expression is refused", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Nu"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "A",
			ownerUserId: ownerId,
			teams: ["Nu"],
			identity: "hi",
			subscriptions: { add: [{ schedule: "not a cron" }] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("invalid_schedule");
	});

	test("unknown_subscription: removing a subscription that is not this user's", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Xi"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const result = await editUser(ctxFor(db, ownerId), {
			id: ownerId,
			subscriptions: { remove: ["ghost-sub"] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_subscription");
	});

	test("unknown_edge: removing an edge that does not belong to this user", async ({ db }) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			teams: ["Omicron"],
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const result = await editUser(ctxFor(db, ownerId), {
			id: ownerId,
			edges: { remove: ["ghost-edge"] },
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_edge");
	});
});

describe("open_user — the declared output shape matches what the connections door returns", () => {
	test("an install with inherited connections parses against UserViewSchema", async ({ db }) => {
		await seedFounder(db);
		// The real connections door (`agent-orchestration/connections`'s
		// `projectFacts`) projects inherited rows into the same
		// `ServiceConnectionView` shape (id/service/via/authSource/health/
		// removable) held connections use — see `listConnectionsForUser` and
		// `SettingsConnections.test.tsx`'s fixture. This fake stands in for
		// that door with a row shaped exactly like the real one.
		const deps: UserActionsDeps = {
			...buildDeps(),
			connections: {
				...buildDeps().connections,
				list: async () => ({
					connections: [],
					inherited: [
						{
							id: "inherited:claude-code:github",
							service: "github",
							via: "claude-code · github",
							authSource: "inherited",
							health: "working",
							removable: false,
						},
					],
				}),
			},
		};
		const { openUser } = actionsFor(deps);
		const result = await openUser(ctxFor(db, "u-founder"), {});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const parsed = UserViewSchema.safeParse(result.data);
		expect(parsed.success).toBe(true);
	});
});

describe("edit_user — a discipline edge resolves to the users holding it", () => {
	test("resolvedUserIds names every user whose own discipline matches, case-insensitively, never one that doesn't", async ({
		db,
	}) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);

		const designer = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Dana",
			teams: ["Design Team"],
			discipline: "Design",
		});
		expect(designer.ok).toBe(true);

		const builder = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Bo",
			teams: ["Build Team"],
			discipline: "builder",
		});
		expect(builder.ok).toBe(true);

		const withEdge = await editUser(ctxFor(db, "u-founder"), {
			id: "u-founder",
			edges: { add: [{ mechanism: "discipline", target: "design" }] },
		});
		expect(withEdge.ok).toBe(true);
		if (!withEdge.ok) return;

		const edge = withEdge.data.user?.edges.find((e) => e.mechanism === "discipline");
		expect(edge).toBeDefined();
		expect(edge?.resolvedUserIds).toContain(designer.ok ? designer.data.user?.id : undefined);
		expect(edge?.resolvedUserIds).not.toContain(builder.ok ? builder.data.user?.id : undefined);

		// Recomputed on every read, not just at write time.
		const reopened = await openUser(ctxFor(db, "u-founder"), { id: "u-founder" });
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		const reopenedEdge = reopened.data.user?.edges.find((e) => e.mechanism === "discipline");
		expect(reopenedEdge?.resolvedUserIds).toContain(
			designer.ok ? designer.data.user?.id : undefined,
		);
	});
});
