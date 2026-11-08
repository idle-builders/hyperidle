/**
 * `search_users` / `open_user` / `edit_user` — real PGlite via the `{ db }`
 * fixture. `searchDocuments`/`editDocument` are the REAL `@hyperidle/document`
 * actions (the one genuinely external crossing this module has, same idiom
 * `platform-actions.integration.test.ts` established).
 */
import { changes, documents, type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type {
	EditUserInput,
	OpenUserInput,
	SearchUsersInput,
	UserView,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { findUserByKey } from "@hyperidle/user";
import { eq } from "drizzle-orm";
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

describe("edit_user — the system actor", () => {
	test("is refused, so nobody can make HyperIdle's own voice a runnable or subscribed agent", async ({
		db,
	}) => {
		await seedFounder(db);
		await db.insert(users).values({
			id: "system:propagation",
			kind: "ai",
			name: "HyperIdle",
			role: "system",
			status: "active",
			createdAt: NOW,
		});
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			id: "system:propagation",
			what: "Updated",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("system_actor");
	});
});

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

describe("edit_user — an agent created with identity and subscriptions in one call", () => {
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
			subscriptions: { add: [{ event: "task.changed" }] },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

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
			id: "inbox-reader-1",
			key: "inbox-reader-1",
			reason: "message",
			createdAt: NOW,
			userId: "u-reader",
			changeId: changeRow?.id as string,
			seenAt: null,
			readAt: null,
		});

		const deps = buildDeps();
		const { editUser, openUser } = actionsFor(deps);
		const result = await editUser(ctxFor(db, "u-reader"), {
			id: "u-reader",
			inbox: { read: ["inbox-reader-1"] },
		});
		expect(result.ok).toBe(true);

		const reopened = await openUser(ctxFor(db, "u-reader"), {});
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		const row = reopened.data.inbox?.find((r) => r.change?.id === "c1");
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

	test("unknown_actor: a rowless caller cannot create an agent", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-nobody"), {
			kind: "ai",
			name: "Bot",
			teams: ["Rho"],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_actor");
	});

	test("a rowless caller can create a second human as member", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-nobody"), {
			kind: "human",
			name: "Second",
			teams: ["Rho"],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.user?.role).toBe("member");
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

describe("edit_user — key minting security rules", () => {
	test("non-owner asking key:new for an owned agent is refused", async ({ db }) => {
		await seedFounder(db);
		await db.insert(users).values([
			{
				id: "u-other-human",
				kind: "human",
				name: "Other",
				role: "member",
				status: "active",
				createdAt: NOW,
			},
			{
				id: "u-owned-agent",
				kind: "ai",
				name: "Bot",
				role: "agent",
				status: "active",
				ownerUserId: "u-founder",
				createdAt: NOW,
			},
		]);
		await db
			.insert(teams)
			.values({ id: "t-alpha", name: "Alpha", createdAt: NOW })
			.onConflictDoNothing();
		await db.insert(userTeams).values({ userId: "u-owned-agent", teamId: "t-alpha" });

		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-other-human"), {
			id: "u-owned-agent",
			key: "new",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("not_assigned_to_you");
	});

	test("owner may give key to their own agent", async ({ db }) => {
		await seedFounder(db);
		await db.insert(users).values({
			id: "u-owned-agent-2",
			kind: "ai",
			name: "Bot2",
			role: "agent",
			status: "active",
			ownerUserId: "u-founder",
			createdAt: NOW,
		});
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), { id: "u-owned-agent-2", key: "new" });
		expect(result.ok).toBe(true);
		expect(result.ok && result.data.key).toBeDefined();
	});

	test("team member may give key to an unowned team agent", async ({ db }) => {
		await seedFounder(db);
		await db.insert(users).values({
			id: "u-team-member",
			kind: "human",
			name: "Member",
			role: "member",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: "u-team-agent",
			kind: "ai",
			name: "TeamBot",
			role: "agent",
			status: "active",
			ownerUserId: null,
			createdAt: NOW,
		});
		await db
			.insert(teams)
			.values({ id: "t-shared", name: "Shared", createdAt: NOW })
			.onConflictDoNothing();
		await db.insert(userTeams).values({ userId: "u-team-member", teamId: "t-shared" });
		await db.insert(userTeams).values({ userId: "u-team-agent", teamId: "t-shared" });
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-team-member"), { id: "u-team-agent", key: "new" });
		expect(result.ok).toBe(true);
		expect(result.ok && result.data.key).toBeDefined();
	});

	test("non-team-member is refused for an unowned team agent", async ({ db }) => {
		await seedFounder(db);
		await db.insert(users).values([
			{
				id: "u-outsider",
				kind: "human",
				name: "Outsider",
				role: "member",
				status: "active",
				createdAt: NOW,
			},
			{
				id: "u-team-agent-2",
				kind: "ai",
				name: "TeamBot2",
				role: "agent",
				status: "active",
				ownerUserId: null,
				createdAt: NOW,
			},
		]);
		await db
			.insert(teams)
			.values({ id: "t-exclusive", name: "Exclusive", createdAt: NOW })
			.onConflictDoNothing();
		await db.insert(userTeams).values({ userId: "u-team-agent-2", teamId: "t-exclusive" });
		// u-outsider is NOT in t-exclusive
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-outsider"), { id: "u-team-agent-2", key: "new" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("not_assigned_to_you");
	});

	test("unassigned agent (no owner, no team) is refused for everyone", async ({ db }) => {
		await seedFounder(db);
		await db.insert(users).values({
			id: "u-unassigned-agent",
			kind: "ai",
			name: "Stray",
			role: "agent",
			status: "active",
			ownerUserId: null,
			createdAt: NOW,
		});
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			id: "u-unassigned-agent",
			key: "new",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("not_assigned_to_you");
	});

	test("key:new for a human user is refused", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());

		const result = await editUser(ctxFor(db, "u-founder"), { id: "u-founder", key: "new" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("agents_only");
	});

	test("newest key wins: second mint invalidates the first", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const agent = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Runner",
			teams: ["Alpha"],
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id;
		if (!agentId) return;

		// Put u-founder in the agent's team so the key guard passes.
		const agentTeamRows = await db.select().from(userTeams).where(eq(userTeams.userId, agentId));
		const sharedTeamId = agentTeamRows[0]?.teamId;
		if (sharedTeamId) {
			await db.insert(userTeams).values({ userId: "u-founder", teamId: sharedTeamId });
		}

		const first = await editUser(ctxFor(db, "u-founder"), { id: agentId, key: "new" });
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const key1 = first.data.key;
		expect(key1).toBeDefined();
		if (!key1) return;

		const second = await editUser(ctxFor(db, "u-founder"), { id: agentId, key: "new" });
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		const key2 = second.data.key;
		expect(key2).toBeDefined();
		if (!key2) return;

		expect(await findUserByKey(db, key1)).toBeUndefined();
		expect(await findUserByKey(db, key2)).toMatchObject({ id: agentId });
	});

	test("key:new combined with another field is refused", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const agent = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Bot",
			teams: ["Alpha"],
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id;
		if (!agentId) return;

		const result = await editUser(ctxFor(db, "u-founder"), {
			id: agentId,
			key: "new",
			name: "NewName",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("key_alone");
	});

	test("key:new emits user.changed for the agent on the event bus", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const agent = await editUser(ctxFor(db, "u-founder"), {
			kind: "ai",
			name: "Bot",
			teams: ["Alpha"],
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id;
		if (!agentId) return;

		// Put u-founder in the agent's team so the key guard passes (unowned agent needs
		// the actor to share a team with it).
		const agentTeamRows = await db.select().from(userTeams).where(eq(userTeams.userId, agentId));
		const sharedTeamId = agentTeamRows[0]?.teamId;
		if (sharedTeamId) {
			await db.insert(userTeams).values({ userId: "u-founder", teamId: sharedTeamId });
		}

		const eventBus = new EventBus();
		const changedIds: string[] = [];
		eventBus.on("user.changed", (e) => changedIds.push(e.change.objectId));

		const result = await editUser(
			{ actor: "u-founder", db, eventBus, now: NOW },
			{
				id: agentId,
				key: "new",
			},
		);
		expect(result.ok).toBe(true);
		expect(changedIds).toStrictEqual([agentId]);
	});
});

describe("edit_user defaultRunnerFor", () => {
	test("member moves the default runner to themselves; old holder loses it", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());

		// Finn creates the team (is default runner); Ada joins it
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const teamId = finnResult.data.user?.teams?.[0]?.id ?? "";
		expect(teamId).not.toBe("");

		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["Acme"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";
		expect(adaId).not.toBe("");

		// Finn is default runner (joined first)
		const membershipsBefore = await db.select().from(userTeams).where(eq(userTeams.teamId, teamId));
		expect(membershipsBefore.find((m) => m.userId === finnId)?.isDefaultRunner).toBe(true);

		// Ada moves herself to default runner
		const result = await editUser(ctxFor(db, adaId), { id: adaId, defaultRunnerFor: teamId });
		expect(result.ok).toBe(true);

		const membershipsAfter = await db.select().from(userTeams).where(eq(userTeams.teamId, teamId));
		expect(membershipsAfter.find((m) => m.userId === finnId)?.isDefaultRunner).toBe(false);
		expect(membershipsAfter.find((m) => m.userId === adaId)?.isDefaultRunner).toBe(true);
		expect(membershipsAfter.filter((m) => m.isDefaultRunner)).toHaveLength(1);
	});

	test("non-member of the team is refused with not_in_team", async ({ db }) => {
		await seedFounder(db);
		// Pre-seed a global team so TeamA and TeamB are non-global (otherwise the first team
		// created becomes global and everyone auto-joins it, making Bo a member of TeamA).
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Ada in TeamA, Bo in TeamB
		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["TeamA"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";
		const teamAId = adaResult.data.user?.teams?.find((t) => t.name === "TeamA")?.id ?? "";
		const boResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Bo",
			teams: ["TeamB"],
		});
		if (!boResult.ok) throw new Error("bo create failed");
		const boId = boResult.data.user?.id ?? "";

		// Bo tries to set Ada as default runner of TeamA — Bo is not in TeamA
		const result = await editUser(ctxFor(db, boId), { id: adaId, defaultRunnerFor: teamAId });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems[0]?.code).toBe("not_in_team");
	});

	test("target not in team is refused with not_in_team", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());

		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["TeamA", "TeamB"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";
		const teamBId = adaResult.data.user?.teams?.find((t) => t.name === "TeamB")?.id ?? "";
		const boResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Bo",
			teams: ["TeamA"],
		});
		if (!boResult.ok) throw new Error("bo create failed");
		const boId = boResult.data.user?.id ?? "";

		// Ada tries to make Bo default runner of TeamB — Bo is not in TeamB
		const result = await editUser(ctxFor(db, adaId), { id: boId, defaultRunnerFor: teamBId });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems[0]?.code).toBe("not_in_team");
	});

	test("target is an agent — refused with person_only", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());

		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["Acme"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";
		const teamId = adaResult.data.user?.teams?.[0]?.id ?? "";
		const agentResult = await editUser(ctxFor(db, adaId), {
			kind: "ai",
			name: "Bot",
			teams: ["Acme"],
		});
		if (!agentResult.ok) throw new Error("agent create failed");
		const agentId = agentResult.data.user?.id ?? "";

		const result = await editUser(ctxFor(db, adaId), { id: agentId, defaultRunnerFor: teamId });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems[0]?.code).toBe("person_only");
	});
});

describe("default runner repair on team exit", () => {
	test("when the default runner leaves a team the next earliest person becomes the runner", async ({
		db,
	}) => {
		await seedFounder(db);
		// Pre-seed the global team so Acme is not global and Finn can leave it.
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner)
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const teamId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		// Ada joins Acme (Finn still default runner — joined first)
		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["Acme"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";

		const before = await db.select().from(userTeams).where(eq(userTeams.teamId, teamId));
		expect(before.find((m) => m.userId === finnId)?.isDefaultRunner).toBe(true);
		expect(before.find((m) => m.userId === adaId)?.isDefaultRunner).toBe(false);

		// Finn leaves Acme by joining a new team; Ada is now the only person in Acme.
		const leaveResult = await editUser(ctxFor(db, finnId), { id: finnId, teams: ["Solo"] });
		expect(leaveResult.ok).toBe(true);

		// Ada is now the default runner of Acme; exactly one default runner in the team.
		const acmeMemberships = await db.select().from(userTeams).where(eq(userTeams.teamId, teamId));
		expect(acmeMemberships.find((m) => m.userId === finnId)).toBeUndefined();
		expect(acmeMemberships.find((m) => m.userId === adaId)?.isDefaultRunner).toBe(true);
		expect(acmeMemberships.filter((m) => m.isDefaultRunner)).toHaveLength(1);
	});
});

describe("global team membership invariant", () => {
	test("a person always stays in the global team when their teams are changed", async ({ db }) => {
		await seedFounder(db);
		// Pre-seed the global team so the next team (Acme) is not global.
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });

		const { editUser } = actionsFor(buildDeps());

		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";

		// Finn sets teams to ["Solo"] — removing Acme but should keep Company
		const leaveResult = await editUser(ctxFor(db, finnId), { id: finnId, teams: ["Solo"] });
		expect(leaveResult.ok).toBe(true);

		// Finn must still be in the global team
		const finnMemberships = await db.select().from(userTeams).where(eq(userTeams.userId, finnId));
		expect(finnMemberships.map((m) => m.teamId)).toContain("team-company");
	});
});

describe("defaultRunnerFor clears unowned agent keys", () => {
	test("becoming a team's default runner clears unowned agents' keys", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner); Ada joins Acme.
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const teamId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["Acme"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";

		// Add an unowned agent to Acme with a key hash.
		const agentId = "test-agent-acme";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Bot",
			role: "agent",
			status: "active",
			createdAt: NOW,
			keyHash: "some-hash-value",
		});
		await db.insert(userTeams).values({ userId: agentId, teamId, isDefaultRunner: false });

		// Ada becomes the default runner of Acme; agent keys should be cleared.
		const result = await editUser(ctxFor(db, finnId), { id: adaId, defaultRunnerFor: teamId });
		expect(result.ok).toBe(true);

		const [agentRow] = await db.select().from(users).where(eq(users.id, agentId));
		expect(agentRow?.keyHash).toBeNull();
	});
});

describe("ruling A: leaving default runner clears unowned agent keys", () => {
	test("when the default runner leaves a team, unowned agent keys are cleared", async ({ db }) => {
		await seedFounder(db);
		// Pre-seed the global team so Acme is not global and Finn can leave it.
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner); Ada joins Acme.
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const teamId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["Acme"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");

		// Add an unowned agent to Acme with a key hash.
		const agentId = "test-ruling-a-bot";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Bot",
			role: "agent",
			status: "active",
			createdAt: NOW,
			keyHash: "old-key-hash",
		});
		await db.insert(userTeams).values({ userId: agentId, teamId, isDefaultRunner: false });

		// Finn leaves Acme — he was the default runner.
		const leaveResult = await editUser(ctxFor(db, finnId), { id: finnId, teams: ["Solo"] });
		expect(leaveResult.ok).toBe(true);

		// Unowned agent's key must be cleared so the old runner loses its agent.
		const [agentRow] = await db.select().from(users).where(eq(users.id, agentId));
		expect(agentRow?.keyHash).toBeNull();
	});
});

describe("ruling B: personal agents leave with their owner", () => {
	test("when a person leaves a team, their owned agents move to the global team", async ({
		db,
	}) => {
		await seedFounder(db);
		// Pre-seed the global team so Acme is not global and Finn can leave it.
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme and joins the global (Company) team.
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const acmeId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		// Finn creates a personal agent in Acme.
		const agentResult = await editUser(ctxFor(db, finnId), {
			kind: "ai",
			name: "Finn Bot",
			ownerUserId: finnId,
			teams: ["Acme"],
		});
		if (!agentResult.ok) throw new Error("agent create failed");
		const agentId = agentResult.data.user?.id ?? "";

		// Assert agent is in Acme.
		const before = await db.select().from(userTeams).where(eq(userTeams.userId, agentId));
		expect(before.map((m) => m.teamId)).toContain(acmeId);

		// Finn leaves Acme (goes to Solo + stays in Company global).
		const leaveResult = await editUser(ctxFor(db, finnId), { id: finnId, teams: ["Solo"] });
		expect(leaveResult.ok).toBe(true);

		// Personal agent must no longer be in Acme.
		const after = await db.select().from(userTeams).where(eq(userTeams.userId, agentId));
		expect(after.map((m) => m.teamId)).not.toContain(acmeId);
		// Personal agent must be in the global team (Company).
		expect(after.map((m) => m.teamId)).toContain("team-company");
	});
});

describe("agent key clear guards: only on actual runner change", () => {
	test("a non-runner member leaving leaves unowned agent keys untouched", async ({ db }) => {
		await seedFounder(db);
		// Pre-seed the global team so Acme is not global.
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner).
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const acmeId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		// Ada joins Acme (NOT the default runner — Finn still holds it).
		const adaResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Ada",
			teams: ["Acme"],
		});
		if (!adaResult.ok) throw new Error("ada create failed");
		const adaId = adaResult.data.user?.id ?? "";

		// Unowned agent in Acme with a key hash.
		const agentId = "guard-test-bot-1";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Bot",
			role: "agent",
			status: "active",
			createdAt: NOW,
			keyHash: "key-should-survive",
		});
		await db.insert(userTeams).values({ userId: agentId, teamId: acmeId, isDefaultRunner: false });

		// Ada leaves Acme — she was not the default runner.
		const leaveResult = await editUser(ctxFor(db, adaId), { id: adaId, teams: ["Solo"] });
		expect(leaveResult.ok).toBe(true);

		// Key must NOT be cleared — the runner (Finn) did not change.
		const [agentRow] = await db.select().from(users).where(eq(users.id, agentId));
		expect(agentRow?.keyHash).toBe("key-should-survive");
	});

	test("an agent changing teams leaves other agents' keys untouched", async ({ db }) => {
		await seedFounder(db);
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner); Finn is also in Company (global).
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const acmeId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		// A personally-owned agent of Finn's in Acme.
		// (owned agents must be in one of their owner's teams, so "Acme" is valid)
		const ownedResult = await editUser(ctxFor(db, finnId), {
			kind: "ai",
			name: "Finn Bot",
			ownerUserId: finnId,
			teams: ["Acme"],
		});
		if (!ownedResult.ok) throw new Error("owned agent create failed");
		const ownedAgentId = ownedResult.data.user?.id ?? "";

		// Unowned team agent in Acme with a key hash.
		const unownedId = "guard-test-bot-2";
		await db.insert(users).values({
			id: unownedId,
			kind: "ai",
			name: "Team Bot",
			role: "agent",
			status: "active",
			createdAt: NOW,
			keyHash: "unowned-key-stays",
		});
		await db.insert(userTeams).values({
			userId: unownedId,
			teamId: acmeId,
			isDefaultRunner: false,
		});

		// The owned agent moves from Acme to Company (Finn is also in Company, so valid).
		// An agent is never the default runner of a team, so no key-clear should happen.
		const moveResult = await editUser(ctxFor(db, finnId), {
			id: ownedAgentId,
			teams: ["Company"],
		});
		expect(moveResult.ok).toBe(true);

		// Unowned team agent's key must NOT be cleared (the agent that moved is not the runner).
		const [botRow] = await db.select().from(users).where(eq(users.id, unownedId));
		expect(botRow?.keyHash).toBe("unowned-key-stays");
	});

	test("setting the same runner again is a no-op for keys", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner).
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const acmeId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		// Unowned agent in Acme with a key hash.
		const agentId = "guard-test-bot-3";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Bot",
			role: "agent",
			status: "active",
			createdAt: NOW,
			keyHash: "key-must-stay",
		});
		await db.insert(userTeams).values({ userId: agentId, teamId: acmeId, isDefaultRunner: false });

		// Set Finn as runner again — same person, no actual change.
		const result = await editUser(ctxFor(db, finnId), { id: finnId, defaultRunnerFor: acmeId });
		expect(result.ok).toBe(true);

		// Key must NOT be cleared — the runner did not change.
		const [agentRow] = await db.select().from(users).where(eq(users.id, agentId));
		expect(agentRow?.keyHash).toBe("key-must-stay");
	});

	test("the runner leaving still clears unowned agent keys", async ({ db }) => {
		await seedFounder(db);
		await db
			.insert(teams)
			.values({ id: "team-company", name: "Company", createdAt: NOW, isGlobal: true });
		const { editUser } = actionsFor(buildDeps());

		// Finn creates Acme (Finn = default runner).
		const finnResult = await editUser(ctxFor(db, ""), {
			kind: "human",
			name: "Finn",
			teams: ["Acme"],
		});
		if (!finnResult.ok) throw new Error("finn create failed");
		const finnId = finnResult.data.user?.id ?? "";
		const acmeId = finnResult.data.user?.teams?.find((t) => t.name === "Acme")?.id ?? "";

		// Unowned agent in Acme with a key hash.
		const agentId = "guard-test-bot-4";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Bot",
			role: "agent",
			status: "active",
			createdAt: NOW,
			keyHash: "old-hash",
		});
		await db.insert(userTeams).values({ userId: agentId, teamId: acmeId, isDefaultRunner: false });

		// Finn leaves Acme — he was the default runner.
		const leaveResult = await editUser(ctxFor(db, finnId), { id: finnId, teams: ["Solo"] });
		expect(leaveResult.ok).toBe(true);

		// Key MUST be cleared — the runner left.
		const [agentRow] = await db.select().from(users).where(eq(users.id, agentId));
		expect(agentRow?.keyHash).toBeNull();
	});
});
