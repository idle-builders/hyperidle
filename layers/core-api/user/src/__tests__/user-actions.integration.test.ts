/**
 * `search_users` / `open_user` / `edit_user` — real PGlite via the `{ db }`
 * fixture. `searchDocuments`/`editDocument` are the REAL `@hyperidle/document`
 * actions (the one genuinely external crossing this module has, same idiom
 * `platform-actions.integration.test.ts` established); `runConfig`/
 * `folders`/`connections` are in-memory fakes — the real thing lives in
 * `agent-orchestration`, a different Layer this package's own tests do not
 * boot.
 */
import {
	changes,
	documents,
	type HyperIdleDb,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import type {
	ActionResult,
	EditUserInput,
	OpenUserInput,
	SearchUsersInput,
	UserView,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import { getSubscription } from "../subscriptions-store.js";
import { createUserActions, type UserActionsDeps } from "../user-actions.js";

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

/** The real document actions, wired with raw-drizzle deps — the same
 * standalone shape `compose.ts`'s `buildStandaloneDocumentActions` and
 * `platform-actions.integration.test.ts`'s own fixture use. */
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
			throw new Error("user-actions test: openParent is unreachable");
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
			team: { name: "Alpha" },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.user?.team?.name).toBe("Alpha");

		const [row] = await db.select().from(teams).where(eq(teams.name, "Alpha"));
		expect(row).toBeDefined();
	});
});

describe("edit_user — an owned agent's effective team", () => {
	test("open_user reports the owner's team, not its own (it has none)", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			team: { name: "Beta" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const deps = buildDeps();
		const { editUser: editUser2, openUser } = actionsFor(deps);
		const agent = await editUser2(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Assistant",
			ownerUserId: ownerId,
			identity: "You help.",
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		expect(agent.data.user?.team?.name).toBe("Beta");

		const reopened = await openUser(ctxFor(db, ownerId), { id: agent.data.user?.id });
		expect(reopened.ok).toBe(true);
		if (!reopened.ok) return;
		expect(reopened.data.user?.team?.name).toBe("Beta");
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
			team: { name: "Gamma" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Librarian",
			ownerUserId: ownerId,
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
			team: { name: "Delta" },
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
			teamId: "team-x",
			createdAt: NOW,
		});
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
			team: { name: "Epsilon" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const agent = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Helper",
			ownerUserId: ownerId,
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
			team: { name: "Zeta" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;

		const agent = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "Watcher",
			ownerUserId: ownerId,
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
			teamId: "team-inbox",
			createdAt: NOW,
		});
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
			team: { name: "Rho" },
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
			identity: "hi",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("unknown_owner");
	});

	test("owned_agent_has_no_team: naming a team on an existing owned agent is refused", async ({
		db,
	}) => {
		await seedFounder(db);
		const deps = buildDeps();
		const { editUser } = actionsFor(deps);
		const owner = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Owner",
			team: { name: "Eta" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const agent = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "A",
			ownerUserId: ownerId,
			identity: "hi",
		});
		expect(agent.ok).toBe(true);
		if (!agent.ok) return;
		const agentId = agent.data.user?.id as string;

		const result = await editUser(ctxFor(db, ownerId), { id: agentId, team: { name: "Theta" } });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems[0]?.code).toBe("owned_agent_has_no_team");
	});

	test("unknown_user: an org edge target that does not exist", async ({ db }) => {
		await seedFounder(db);
		const { editUser } = actionsFor(buildDeps());
		const result = await editUser(ctxFor(db, "u-founder"), {
			kind: "human",
			name: "Ada",
			team: { name: "Iota" },
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
			team: { name: "Kappa" },
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
			team: { name: "Lambda" },
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
			team: { name: "Mu" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "A",
			ownerUserId: ownerId,
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
			team: { name: "Nu" },
		});
		expect(owner.ok).toBe(true);
		if (!owner.ok) return;
		const ownerId = owner.data.user?.id as string;
		const result = await editUser(ctxFor(db, ownerId), {
			kind: "ai",
			name: "A",
			ownerUserId: ownerId,
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
			team: { name: "Xi" },
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
			team: { name: "Omicron" },
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
