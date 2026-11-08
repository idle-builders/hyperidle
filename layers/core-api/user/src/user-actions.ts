/**
 * `search_users` / `open_user` / `edit_user` — the user module's own action
 * list, declared the way `@hyperidle/task`/`@hyperidle/thread`/
 * `@hyperidle/document`/`@hyperidle/settings` each declare theirs.
 * Declared in `framework/domain-model/src/actions/user.ts`.
 *
 * `Action`/`ActionContext` are this Service's own structural mirror
 * (`./action-types.js`). Everything this module reaches outside its own
 * five tables (`users`, `teams`, `org_edges`, `subscriptions`, `inbox`)
 * arrives through `UserActionsDeps`, bound in `compose.ts` — documents
 * through the composed `search_documents`/`edit_document` runners.
 */
import type { Change, HyperIdleDb, NewChange, NewUser, Team, WriteExecutor } from "@hyperidle/db";
import {
	type AddSubscriptionInput,
	type AgentCategory,
	type EditUserInput,
	editUser as editUserDeclaration,
	editUserInvariants,
	type InboxReason,
	type ObjectEventName,
	type OpenUserInput,
	type OrgEdgeMechanism,
	openUser as openUserDeclaration,
	PERSON_REASONS,
	type Problem,
	type SearchUsersInput,
	SYSTEM_ACTOR_ID,
	searchUsers as searchUsersDeclaration,
	teamMembershipProblems,
	type UserKind,
	type UserRow,
	type UserStatus,
	type UserView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { objectEvent } from "@hyperidle/event-bus";
import type {
	Action,
	ActionContext,
	EditDocumentRunFn,
	SearchDocumentsRunFn,
} from "./action-types.js";
import { type AgentIdentityPort, createAgentIdentityPort } from "./agent-identity.js";
import { nextCronMatch, parseCron } from "./cron.js";
import { deleteOrgEdge, listOrgEdges, resolveDisciplineUsers, upsertOrgEdge } from "./org-edges.js";
import {
	deleteSubscription,
	insertSubscription,
	listInboxRows,
	listSubscriptions,
	markInboxRead,
	markInboxSeen,
	updateSubscription,
} from "./subscriptions-store.js";
import {
	createTeam,
	ensureDefaultRunner,
	getGlobalTeam,
	getTeam,
	listDefaultRunners,
	listTeams,
	repairDefaultRunner,
	setDefaultRunner,
} from "./team-lookup.js";
import { giveUserKey, newUserKey } from "./user-key.js";
import {
	findUser,
	insertUser,
	listUsers,
	setUserTeams,
	type UserWithTeams,
	updateUser,
} from "./user-store.js";

// ---------------------------------------------------------------------------
// The deps bag — everything this module reaches outside its own tables.
// ---------------------------------------------------------------------------

export interface UserActionsDeps {
	readonly changes: {
		readonly appendChange: (exec: WriteExecutor, row: NewChange) => Promise<Change>;
		readonly listByIds: (db: HyperIdleDb, ids: readonly string[]) => Promise<readonly Change[]>;
	};
	readonly searchDocuments: SearchDocumentsRunFn;
	readonly editDocument: EditDocumentRunFn;
	/**
	 * A person changed what a plugin may have added — an agent's name, discipline or what it
	 * does, or a reason's trigger — so the plugin's version is no longer the one in use. Called
	 * inside the edit's transaction; a row no plugin added is left alone by the binding.
	 */
	readonly onPluginPartEdited: (
		exec: WriteExecutor,
		kind: "agent" | "subscription",
		entityId: string,
		actor: string,
		at: string,
	) => Promise<void>;
}

type Result<T> = { ok: true; data: T } | { ok: false; problems: Problem[] };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function problem(code: string, message: string, path?: string): { ok: false; problems: Problem[] } {
	return { ok: false, problems: [{ code, message, ...(path ? { path } : {}) }] };
}

const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(["active", "idle"]);

function isRunnableAgent(kind: string, status: string): boolean {
	return kind === "ai" && RUNNABLE_STATUSES.has(status);
}

/** `internal: true`, actor stamped to the agent whose scoped document this
 * touches — the read-only, system-level lookups `open_user`/`edit_user` make
 * for an agent's identity/skill documents and a subscription's prompt
 * document. `resolveViewer` (`@hyperidle/document`) grants a `scopeKind:
 * "user"` document to its own scope id regardless of who is actually asking
 * ("never counts as a read" only covers `open_document`'s bump — the
 * visibility gate itself is unaffected by `internal`), so these lookups run
 * as the agent, the same way `agent-identity.ts`'s `identityIdsFor` accepts
 * an explicit `viewerActor` rather than trusting whoever is asking. */
function internalCtx(ctx: ActionContext, subjectId: string): ActionContext {
	return { ...ctx, actor: subjectId, internal: true };
}

/** The teams named — each found by name (oldest), or created. */
async function findOrCreateTeams(
	tx: HyperIdleDb,
	names: readonly string[],
	now: string,
): Promise<Array<{ id: string; name: string }>> {
	const teams: Array<{ id: string; name: string }> = [];
	for (const name of new Set(names)) {
		const found = await getTeam(tx, { name });
		if (found) {
			teams.push({ id: found.id, name });
			continue;
		}
		const teamId = `team-${crypto.randomUUID()}`;
		await createTeam(tx, { id: teamId, name, createdAt: now });
		teams.push({ id: teamId, name });
	}
	return teams;
}

async function teamNames(db: HyperIdleDb, ids: readonly string[]): Promise<string[]> {
	return (await listTeams(db, { ids })).map((t) => t.name);
}

/** `teamMembershipProblems` for a user about to be in `teams` (names) — read what the
 * input alone cannot say: the owner's teams, and a person's own agents' teams. */
async function membershipProblemsFor(
	db: HyperIdleDb,
	subject: {
		readonly id: string | null;
		readonly kind: string;
		readonly ownerUserId: string | null;
	},
	teams: readonly string[],
): Promise<Problem[]> {
	const owner = subject.ownerUserId ? await findUser(db, { id: subject.ownerUserId }) : undefined;
	const owned = subject.id !== null ? await listUsers(db, { ownerUserId: subject.id }) : [];
	return teamMembershipProblems({
		kind: subject.kind,
		teams,
		ownerTeams: owner ? await teamNames(db, owner.teamIds) : null,
		ownedAgentTeams: await teamNames(db, [...new Set(owned.flatMap((a) => a.teamIds))]),
	});
}

/** Batch-builds `UserRow`s — the teams and outgoing org edges of every row,
 * in a fixed number of queries regardless of how many rows. */
async function toUserRows(db: HyperIdleDb, rows: readonly UserWithTeams[]): Promise<UserRow[]> {
	if (rows.length === 0) return [];
	const allTeamIds = [...new Set(rows.flatMap((r) => r.teamIds))];
	const teamRows: Team[] = await listTeams(db, { ids: allTeamIds });
	const teamById = new Map(teamRows.map((t) => [t.id, t] as const));
	const defaultRunnerById = await listDefaultRunners(db, allTeamIds);

	const edgeRows = await listOrgEdges(db, { fromUserIds: rows.map((r) => r.id) });
	const disciplineTargets = [
		...new Set(edgeRows.filter((e) => e.mechanism === "discipline").map((e) => e.target)),
	];
	const resolvedByTarget = await resolveDisciplineUsers(db, disciplineTargets);
	const edgesByUser = new Map<
		string,
		Array<{
			id: string;
			mechanism: OrgEdgeMechanism;
			target: string;
			resolvedUserIds: string[];
		}>
	>();
	for (const e of edgeRows) {
		const mechanism = e.mechanism as OrgEdgeMechanism;
		const list = edgesByUser.get(e.fromUserId) ?? [];
		list.push({
			id: e.id,
			mechanism,
			target: e.target,
			resolvedUserIds:
				mechanism === "discipline" ? [...(resolvedByTarget.get(e.target) ?? [])] : [],
		});
		edgesByUser.set(e.fromUserId, list);
	}

	return rows.map((r) => {
		const teams = r.teamIds.flatMap((id) => {
			const team = teamById.get(id);
			if (!team) return [];
			return [
				{
					id: team.id,
					name: team.name,
					isGlobal: team.isGlobal,
					defaultRunnerId: defaultRunnerById.get(team.id) ?? null,
				},
			];
		});
		return {
			id: r.id,
			kind: r.kind as UserKind,
			name: r.name,
			role: r.role,
			status: r.status as UserStatus,
			avatarUrl: r.avatarUrl ?? null,
			createdAt: r.createdAt,
			agentCategory: (r.agentCategory as AgentCategory | null) ?? null,
			ownerUserId: r.ownerUserId ?? null,
			health: r.health ?? null,
			discipline: r.discipline ?? null,
			what: r.what ?? null,
			hasKey: r.keyHash !== null && r.keyHash !== undefined,
			teams,
			edges: edgesByUser.get(r.id) ?? [],
		};
	});
}

function stringifyChange(row: {
	before: Record<string, unknown> | null;
	after: Record<string, unknown>;
}): { before: string | null; after: string } {
	return {
		before: row.before === null ? null : JSON.stringify(row.before),
		after: JSON.stringify(row.after),
	};
}

// ---------------------------------------------------------------------------
// search_users
// ---------------------------------------------------------------------------

async function searchUsersRun(
	ctx: ActionContext,
	input: SearchUsersInput,
): Promise<Result<UserRow[]>> {
	const rows = await listUsers(ctx.db, {
		ids: input.ids,
		kind: input.kind,
		ownerUserId: input.ownerUserId,
		status: input.status,
		nameContains: input.name,
		discipline: input.discipline,
		...(input.teamId !== undefined ? { teamIds: [input.teamId] } : {}),
	});
	const listed = rows.filter((r) => r.role !== "system" || (input.ids ?? []).includes(r.id));
	const views = await toUserRows(ctx.db, listed);
	views.sort((a, b) => a.name.localeCompare(b.name));
	const limit = input.limit ?? 500;
	return { ok: true, data: views.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// open_user
// ---------------------------------------------------------------------------

async function buildUserView(
	ctx: ActionContext,
	deps: UserActionsDeps,
	userRow: UserWithTeams | null,
	isSelf: boolean,
	unread = false,
): Promise<UserView> {
	if (!userRow) {
		return {
			user: null,
			documentIds: [],
			subscriptions: [],
			inbox: null,
		};
	}

	const [row] = await toUserRows(ctx.db, [userRow]);
	if (!row) throw new Error("open_user: toUserRows dropped a row it was given");

	let documentIds: UserView["documentIds"] = [];
	const ownDocs = await deps.searchDocuments(internalCtx(ctx, userRow.id), {
		parent: { kind: "agent", id: userRow.id },
	});
	if (ownDocs.ok) {
		const slots = userRow.kind === "ai" ? ["agent_file", "skill", "rule"] : ["agent_file"];
		documentIds = ownDocs.data
			.filter((d) => slots.includes(d.slot) && d.status !== "archived")
			.map((d) => ({ slot: d.slot, id: d.id }));
	}

	const subscriptionRows = await listSubscriptions(ctx.db, { userId: userRow.id });
	const promptDocByParent = new Map<string, string>();
	if (subscriptionRows.length > 0) {
		const found = await deps.searchDocuments(internalCtx(ctx, userRow.id), {
			parent: { kind: "subscription", ids: subscriptionRows.map((s) => s.id) },
			slot: "prompt",
		});
		if (found.ok) {
			for (const d of found.data) if (d.parentId) promptDocByParent.set(d.parentId, d.id);
		}
	}
	const subscriptions = subscriptionRows.map((s) => ({
		id: s.id,
		event: s.event as ObjectEventName | null,
		objectId: s.objectId,
		schedule: s.schedule,
		paused: s.paused,
		documentId: promptDocByParent.get(s.id) ?? null,
		nextRunAt: s.nextRunAt,
	}));

	let inbox: UserView["inbox"] = null;
	if (isSelf) {
		const inboxRows = await listInboxRows(ctx.db, { userId: userRow.id, limit: 50, unread });
		const changeRows = await deps.changes.listByIds(
			ctx.db,
			inboxRows.flatMap((r) => (r.changeId ? [r.changeId] : [])),
		);
		const changeById = new Map(changeRows.map((c) => [c.id, objectEvent(c).change] as const));
		inbox = inboxRows.map((r) => ({
			id: r.id,
			reason: r.reason as InboxReason,
			change: r.changeId ? (changeById.get(r.changeId) ?? null) : null,
			subscriptionId: r.subscriptionId,
			objectId: r.objectId,
			createdAt: r.createdAt,
			seenAt: r.seenAt,
			readAt: r.readAt,
		}));
	}

	return {
		user: row,
		documentIds,
		subscriptions,
		inbox,
	};
}

function makeOpenUserRun(deps: UserActionsDeps) {
	return async function openUserRun(
		ctx: ActionContext,
		input: OpenUserInput,
	): Promise<Result<UserView>> {
		const targetId = input.id ?? ctx.actor;
		const userRow = await findUser(ctx.db, { id: targetId });
		if (!userRow) {
			if (input.id !== undefined)
				return problem("not_found", `No user with id '${input.id}'.`, "id");
			// First-run: the caller has no row of its own yet.
			const data = await buildUserView(ctx, deps, null, true);
			return { ok: true, data };
		}
		const isSelf = userRow.id === ctx.actor;
		const data = await buildUserView(ctx, deps, userRow, isSelf, input.unread === true);
		return { ok: true, data };
	};
}

// ---------------------------------------------------------------------------
// edit_user — shared subscription validation
// ---------------------------------------------------------------------------

interface SubscriptionAddLike {
	readonly event?: string;
	readonly title?: string;
	readonly schedule?: string;
	readonly prompt?: string | null;
	readonly paused?: boolean;
}

/** DB-dependent subscription problems: `schedule_for_agents_only`,
 * `prompt_for_agents_only`, `agent_not_runnable`, `invalid_schedule` — asked
 * against the row's effective kind/status AFTER this call's own edits (an
 * agent this same call just made runnable already passes). */
function validateSubscriptionAdd(
	sub: SubscriptionAddLike,
	targetKind: string,
	targetStatus: string,
): Problem | null {
	if (sub.schedule !== undefined && targetKind !== "ai") {
		return {
			code: "schedule_for_agents_only",
			message: "Only an agent can run on a schedule.",
			path: "subscriptions",
		};
	}
	if (
		sub.event !== undefined &&
		(PERSON_REASONS as readonly string[]).includes(sub.event) &&
		targetKind === "ai"
	) {
		return {
			code: "reason_for_people_only",
			message: "This reason tells a person something; an agent starts on events or times.",
			path: "subscriptions",
		};
	}
	if (sub.prompt !== undefined && sub.prompt !== null && targetKind !== "ai") {
		return {
			code: "prompt_for_agents_only",
			message: "Only an agent's subscription carries a prompt.",
			path: "subscriptions",
		};
	}
	if (
		(sub.event !== undefined || sub.schedule !== undefined) &&
		targetKind === "ai" &&
		!isRunnableAgent(targetKind, targetStatus)
	) {
		return {
			code: "agent_not_runnable",
			message: "This agent is not runnable — it cannot be woken.",
			path: "subscriptions",
		};
	}
	if (sub.schedule !== undefined) {
		try {
			parseCron(sub.schedule);
		} catch {
			return {
				code: "invalid_schedule",
				message: `'${sub.schedule}' is not a valid schedule.`,
				path: "subscriptions",
			};
		}
	}
	return null;
}

function nextRunAtFor(schedule: string, now: string): string {
	return nextCronMatch(parseCron(schedule), new Date(now)).toISOString();
}

async function writeSubscriptionPrompt(
	ctx: ActionContext,
	deps: UserActionsDeps,
	title: string,
	agentId: string,
	subscriptionId: string,
	prompt: string,
): Promise<void> {
	const found = await deps.searchDocuments(internalCtx(ctx, agentId), {
		parent: { kind: "subscription", id: subscriptionId },
		slot: "prompt",
	});
	const existingDoc = found.ok ? found.data[0] : undefined;
	if (existingDoc) {
		await deps.editDocument(internalCtx(ctx, agentId), { id: existingDoc.id, body: prompt });
		return;
	}
	await deps.editDocument(internalCtx(ctx, agentId), {
		id: `doc_sp_${subscriptionId}`,
		title,
		body: prompt,
		slot: "prompt",
		status: "active",
		scopeKind: "user",
		scopeId: agentId,
		parent: { kind: "subscription", id: subscriptionId },
	});
}

/** A prompt document is titled with the name of what it does, when it has one. */
function promptTitle(agentName: string, title: string | undefined): string {
	return title ?? `${agentName} — subscription prompt`;
}

async function archiveSubscriptionPrompt(
	ctx: ActionContext,
	deps: UserActionsDeps,
	agentId: string,
	subscriptionId: string,
): Promise<void> {
	const found = await deps.searchDocuments(internalCtx(ctx, agentId), {
		parent: { kind: "subscription", id: subscriptionId },
		slot: "prompt",
	});
	const existingDoc = found.ok ? found.data[0] : undefined;
	if (existingDoc) {
		await deps.editDocument(internalCtx(ctx, agentId), { id: existingDoc.id, status: "archived" });
	}
}

/** An agent's `agent_file` says who it is; a person's says what agents should know about them. */
function identityTitle(kind: string, name: string): string {
	return kind === "ai" ? `${name} — identity` : `About ${name}`;
}

// ---------------------------------------------------------------------------
// edit_user — create
// ---------------------------------------------------------------------------

async function createUserRun(
	ctx: ActionContext,
	deps: UserActionsDeps,
	identity: AgentIdentityPort,
	input: EditUserInput,
): Promise<Result<UserView>> {
	const now = ctx.now;
	const kind = input.kind as UserKind;
	const name = input.name as string;

	// Nobody yet (a joiner, a laptop's first start) may only make themselves; the first person is the founder.
	const callerRow = await findUser(ctx.db, { id: ctx.actor });
	if (!callerRow && kind !== "human") {
		return problem("unknown_actor", "Only a person may make an agent.", "kind");
	}
	const firstPerson = !callerRow && (await findUser(ctx.db, { kind: "human" })) === undefined;

	if (input.ownerUserId !== undefined) {
		const ownerRow = await findUser(ctx.db, { id: input.ownerUserId });
		if (!ownerRow)
			return problem("unknown_owner", `No user with id '${input.ownerUserId}'.`, "ownerUserId");
	}
	const teamNamesIn = input.teams ?? [];
	const membership = await membershipProblemsFor(
		ctx.db,
		{ id: null, kind, ownerUserId: input.ownerUserId ?? null },
		teamNamesIn,
	);
	if (membership.length > 0) return { ok: false, problems: membership };

	// Only a "direct" edge's target is a userId — "team"'s is a teamId, and
	// "discipline"'s is an open-vocabulary craft string nothing enumerates
	// (same rule as `documents.discipline`). Checking every edge against
	// `users` regardless of mechanism would refuse every non-direct edge.
	for (const e of input.edges?.add ?? []) {
		if (e.mechanism !== "direct") continue;
		const target = await findUser(ctx.db, { id: e.target });
		if (!target) return problem("unknown_user", `No user with id '${e.target}'.`, "edges");
	}

	const status: UserStatus = input.status ?? "active";
	for (const sub of input.subscriptions?.add ?? []) {
		const failure = validateSubscriptionAdd(sub, kind, status);
		if (failure) return { ok: false, problems: [failure] };
	}

	const id = crypto.randomUUID();
	const changeActor = callerRow ? ctx.actor : id;
	const agentCategory: AgentCategory | null =
		kind === "ai" ? (input.agentCategory ?? (input.ownerUserId ? "individual" : "team")) : null;
	const role = input.role ?? (kind === "human" ? (firstPerson ? "founder" : "member") : "agent");

	const values: NewUser = {
		id,
		kind,
		name,
		role,
		status,
		avatarUrl: input.avatarUrl ?? null,
		createdAt: now,
		agentCategory,
		ownerUserId: input.ownerUserId ?? null,
		health: input.health ?? null,
		// Explicit only — never inherited from anything.
		discipline: input.discipline ?? null,
		what: input.what ?? null,
	};

	const addedSubscriptions: Array<{
		id: string;
		prompt: string | null | undefined;
		title: string | undefined;
	}> = [];
	let mainChangeRow: Change | undefined;
	let teams: Array<{ id: string; name: string }> = [];

	await ctx.db.transaction(async (txRaw) => {
		const tx = txRaw as HyperIdleDb;
		teams = await findOrCreateTeams(tx, teamNamesIn, now);

		// Every new person auto-joins the global team.
		if (kind === "human") {
			const globalTeam = await getGlobalTeam(tx);
			if (globalTeam && !teams.some((t) => t.id === globalTeam.id)) {
				teams = [...teams, { id: globalTeam.id, name: globalTeam.name }];
			}
		}

		await insertUser(tx, values);
		await setUserTeams(
			tx,
			id,
			teams.map((t) => t.id),
		);

		// Ensure each team has a default runner; set this person if none exists.
		if (kind === "human") {
			for (const team of teams) {
				await ensureDefaultRunner(tx, team.id, id);
			}
		}

		for (const e of input.edges?.add ?? []) {
			await upsertOrgEdge(tx, { fromUserId: id, mechanism: e.mechanism, target: e.target });
		}

		// A new person is told about every reason until they switch one off.
		const given = input.subscriptions?.add ?? [];
		const reasons: AddSubscriptionInput[] =
			kind === "human"
				? PERSON_REASONS.filter((r) => !given.some((g) => g.event === r)).map((event) => ({
						event,
					}))
				: [];
		for (const sub of [...reasons, ...given]) {
			const subId = crypto.randomUUID();
			const nextRunAt = sub.schedule !== undefined ? nextRunAtFor(sub.schedule, now) : null;
			await insertSubscription(tx, {
				id: subId,
				userId: id,
				event: sub.event ?? null,
				objectId: sub.objectId ?? null,
				schedule: sub.schedule ?? null,
				paused: sub.paused ?? false,
				nextRunAt,
				createdAt: now,
				updatedAt: now,
			});
			addedSubscriptions.push({ id: subId, prompt: sub.prompt, title: sub.title });
		}

		const { before, after } = stringifyChange({
			before: null,
			after: {
				kind,
				name,
				role,
				status,
				teamIds: teams.map((t) => t.id),
				ownerUserId: values.ownerUserId,
			},
		});
		mainChangeRow = await deps.changes.appendChange(tx, {
			id: crypto.randomUUID(),
			object: "user",
			objectId: id,
			kind: "created",
			actor: changeActor,
			before,
			after,
			at: now,
		});
	});

	if (input.identity !== undefined) {
		await identity.upsertAgentIdentity(ctx.db, {
			agentId: id,
			title: identityTitle(kind, name),
			body: input.identity ?? "",
			updatedBy: ctx.actor,
		});
	}
	for (const sub of addedSubscriptions) {
		if (typeof sub.prompt === "string")
			await writeSubscriptionPrompt(
				ctx,
				deps,
				promptTitle(name, sub.title),
				id,
				sub.id,
				sub.prompt,
			);
	}
	if (mainChangeRow) ctx.eventBus.emit(objectEvent(mainChangeRow));

	const userRow = await findUser(ctx.db, { id });
	const data = await buildUserView(ctx, deps, userRow ?? null, true);
	return { ok: true, data };
}

// ---------------------------------------------------------------------------
// edit_user — edit an existing user
// ---------------------------------------------------------------------------

const IDENTITY_FIELDS = [
	"name",
	"role",
	"avatarUrl",
	"status",
	"health",
	"discipline",
	"what",
] as const;

/** The agent fields a plugin's manifest declares, so the ones a plugin's version can be put back over. */
const PLUGIN_AGENT_FIELDS = ["name", "discipline", "what"] as const;

function touchesIdentityFields(input: EditUserInput): boolean {
	return IDENTITY_FIELDS.some((f) => input[f] !== undefined);
}

async function editExistingUserRun(
	ctx: ActionContext,
	deps: UserActionsDeps,
	identity: AgentIdentityPort,
	input: EditUserInput,
): Promise<Result<UserView>> {
	const id = input.id as string;
	const now = ctx.now;
	const existing = await findUser(ctx.db, { id });
	if (!existing) return problem("not_found", `No user with id '${id}'.`, "id");

	if (
		existing.kind === "human" &&
		(input.name !== undefined || input.avatarUrl !== undefined) &&
		ctx.actor !== id
	) {
		return problem(
			"own_profile_only",
			"Only this person may change their own name or avatar.",
			"name",
		);
	}
	if (input.status === "retired" && (existing.kind === "human" || existing.role === "system")) {
		return problem("cannot_retire", "A person or a system agent cannot be retired.", "status");
	}
	if (input.teams !== undefined) {
		const membership = await membershipProblemsFor(ctx.db, existing, input.teams);
		if (membership.length > 0) return { ok: false, problems: membership };
	}
	if (input.inbox !== undefined && ctx.actor !== id) {
		return problem("yourself_only", "Your inbox is edited on your own view only.", "inbox");
	}
	if (input.key !== undefined) {
		if (existing.kind !== "ai" || existing.role === "system") {
			return problem(
				"agents_only",
				"Only an agent is given a key here; a person gets theirs by signing in.",
				"key",
			);
		}
		if (existing.ownerUserId !== ctx.actor) {
			// Assigned to someone else — only that person may give a key.
			if (existing.ownerUserId !== null) {
				return problem(
					"not_assigned_to_you",
					"Only the person this agent works for, or someone in its team, may give it a key.",
					"key",
				);
			}
			// Unowned — allowed only when the actor is in one of the agent's teams.
			if (existing.teamIds.length === 0) {
				return problem(
					"not_assigned_to_you",
					"Only the person this agent works for, or someone in its team, may give it a key.",
					"key",
				);
			}
			const actorRow = await findUser(ctx.db, { id: ctx.actor });
			const actorTeamIds = new Set(actorRow?.teamIds ?? []);
			if (!existing.teamIds.some((t) => actorTeamIds.has(t))) {
				return problem(
					"not_assigned_to_you",
					"Only the person this agent works for, or someone in its team, may give it a key.",
					"key",
				);
			}
		}
	}

	// Only a "direct" edge's target is a userId — see the create-side `@lore`.
	for (const e of input.edges?.add ?? []) {
		if (e.mechanism !== "direct") continue;
		const target = await findUser(ctx.db, { id: e.target });
		if (!target) return problem("unknown_user", `No user with id '${e.target}'.`, "edges");
	}
	if (input.edges?.remove && input.edges.remove.length > 0) {
		const owned = await listOrgEdges(ctx.db, { fromUserIds: [id] });
		const ownedIds = new Set(owned.map((e) => e.id));
		for (const edgeId of input.edges.remove) {
			if (!ownedIds.has(edgeId))
				return problem("unknown_edge", `No edge '${edgeId}' on this user.`, "edges");
		}
	}

	const effectiveStatus = (input.status ?? existing.status) as UserStatus;
	for (const sub of input.subscriptions?.add ?? []) {
		const failure = validateSubscriptionAdd(sub, existing.kind, effectiveStatus);
		if (failure) return { ok: false, problems: [failure] };
	}
	const existingSubs = await listSubscriptions(ctx.db, { userId: id });
	const existingSubsById = new Map(existingSubs.map((s) => [s.id, s] as const));
	for (const change of input.subscriptions?.change ?? []) {
		const prev = existingSubsById.get(change.id);
		if (!prev)
			return problem(
				"unknown_subscription",
				`No subscription '${change.id}' on this user.`,
				"subscriptions",
			);
		if (change.event !== undefined && change.schedule !== undefined) {
			return problem(
				"event_or_schedule",
				"A subscription fires on exactly one of an event or a schedule.",
				"subscriptions",
			);
		}
		const failure = validateSubscriptionAdd(change, existing.kind, effectiveStatus);
		if (failure) return { ok: false, problems: [failure] };
	}
	for (const removeId of input.subscriptions?.remove ?? []) {
		if (!existingSubsById.has(removeId)) {
			return problem(
				"unknown_subscription",
				`No subscription '${removeId}' on this user.`,
				"subscriptions",
			);
		}
	}

	// defaultRunnerFor: validate before the transaction
	if (input.defaultRunnerFor !== undefined) {
		const teamId = input.defaultRunnerFor;
		// Actor must be in the team (check ACTOR's memberships, not the target's)
		const actorRow = await findUser(ctx.db, { id: ctx.actor });
		if (!actorRow?.teamIds.includes(teamId)) {
			return problem(
				"not_in_team",
				"Only a member of the team may change its default runner.",
				"defaultRunnerFor",
			);
		}
		// Target (the person being edited) must be a human in the team
		if (existing.kind !== "human") {
			return problem("person_only", "The default runner must be a person.", "defaultRunnerFor");
		}
		if (!existing.teamIds.includes(teamId)) {
			return problem(
				"not_in_team",
				"The new default runner must be a member of that team.",
				"defaultRunnerFor",
			);
		}
	}

	const touchesTeams = input.teams !== undefined;
	const touchesDefaultRunner = input.defaultRunnerFor !== undefined;
	const touchesEdges =
		(input.edges?.add?.length ?? 0) > 0 || (input.edges?.remove?.length ?? 0) > 0;
	const touchesSubscriptions =
		(input.subscriptions?.add?.length ?? 0) > 0 ||
		(input.subscriptions?.change?.length ?? 0) > 0 ||
		(input.subscriptions?.remove?.length ?? 0) > 0;
	// @lore: key rotation must emit user.changed — the old runner's WS subscriber gets a nudge, drains, hits 401, and marks away; no 30 s sweep needed.
	const touchesKey = input.key !== undefined;
	const appendsChange =
		touchesIdentityFields(input) ||
		touchesTeams ||
		touchesDefaultRunner ||
		touchesEdges ||
		touchesSubscriptions ||
		touchesKey;

	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	for (const f of IDENTITY_FIELDS) {
		if (input[f] !== undefined) {
			before[f] = existing[f] ?? null;
			after[f] = input[f];
		}
	}
	if (touchesKey) after.keyRotated = true;
	if (touchesEdges) after.edges = true;
	if (touchesSubscriptions) after.subscriptions = true;
	if (touchesDefaultRunner) after.defaultRunner = { teamId: input.defaultRunnerFor, userId: id };

	let teams: Array<{ id: string; name: string }> | undefined;
	const addedSubscriptions: Array<{
		id: string;
		prompt: string | null | undefined;
		title: string | undefined;
	}> = [];
	const changedSubscriptionPrompts: Array<{ id: string; prompt: string | null }> = [];
	let mainChangeRow: Change | undefined;

	await ctx.db.transaction(async (txRaw) => {
		const tx = txRaw as HyperIdleDb;
		if (input.teams !== undefined) {
			teams = await findOrCreateTeams(tx, input.teams, now);
			const newTeamIds = new Set(teams.map((t) => t.id));
			const oldTeamIds = new Set(existing.teamIds);
			await setUserTeams(tx, id, [...newTeamIds]);
			before.teamIds = existing.teamIds;
			after.teamIds = [...newTeamIds];

			// For teams the person left, repair the default runner in case they held it.
			for (const teamId of oldTeamIds) {
				if (!newTeamIds.has(teamId)) await repairDefaultRunner(tx, teamId);
			}
			// For teams the person joined, ensure there is a default runner.
			if (existing.kind === "human") {
				for (const teamId of newTeamIds) {
					if (!oldTeamIds.has(teamId)) await ensureDefaultRunner(tx, teamId, id);
				}
			}
		}

		if (input.defaultRunnerFor !== undefined) {
			await setDefaultRunner(tx, input.defaultRunnerFor, id);
		}

		const patch: Partial<NewUser> = {};
		for (const f of IDENTITY_FIELDS) {
			if (input[f] !== undefined) (patch as Record<string, unknown>)[f] = input[f];
		}
		if (Object.keys(patch).length > 0) await updateUser(tx, id, patch);
		if (PLUGIN_AGENT_FIELDS.some((f) => input[f] !== undefined && input[f] !== existing[f])) {
			await deps.onPluginPartEdited(tx, "agent", id, ctx.actor, now);
		}

		for (const e of input.edges?.add ?? []) {
			await upsertOrgEdge(tx, { fromUserId: id, mechanism: e.mechanism, target: e.target });
		}
		for (const edgeId of input.edges?.remove ?? []) {
			await deleteOrgEdge(tx, edgeId);
		}

		for (const sub of input.subscriptions?.add ?? []) {
			const subId = crypto.randomUUID();
			const nextRunAt = sub.schedule !== undefined ? nextRunAtFor(sub.schedule, now) : null;
			await insertSubscription(tx, {
				id: subId,
				userId: id,
				event: sub.event ?? null,
				objectId: sub.objectId ?? null,
				schedule: sub.schedule ?? null,
				paused: sub.paused ?? false,
				nextRunAt,
				createdAt: now,
				updatedAt: now,
			});
			addedSubscriptions.push({ id: subId, prompt: sub.prompt, title: sub.title });
		}
		for (const change of input.subscriptions?.change ?? []) {
			const subPatch: {
				event?: string | null;
				schedule?: string | null;
				paused?: boolean;
				nextRunAt?: string | null;
				updatedAt: string;
			} = { updatedAt: now };
			if (change.event !== undefined) {
				subPatch.event = change.event;
				subPatch.schedule = null;
				subPatch.nextRunAt = null;
			}
			if (change.schedule !== undefined) {
				subPatch.event = null;
				subPatch.schedule = change.schedule;
				subPatch.nextRunAt = nextRunAtFor(change.schedule, now);
			}
			if (change.paused !== undefined) subPatch.paused = change.paused;
			await updateSubscription(tx, change.id, subPatch);
			if (Object.keys(subPatch).length > 1) {
				await deps.onPluginPartEdited(tx, "subscription", change.id, ctx.actor, now);
			}
			if (change.prompt !== undefined)
				changedSubscriptionPrompts.push({ id: change.id, prompt: change.prompt });
		}
		for (const removeId of input.subscriptions?.remove ?? []) {
			await deleteSubscription(tx, removeId);
		}

		if (appendsChange) {
			const stringified = stringifyChange({ before, after });
			mainChangeRow = await deps.changes.appendChange(tx, {
				id: crypto.randomUUID(),
				object: "user",
				objectId: id,
				kind: "changed",
				actor: ctx.actor,
				before: stringified.before,
				after: stringified.after,
				at: now,
			});
		}

		if (input.inbox) {
			if (input.inbox.seen !== undefined) await markInboxSeen(tx, id, input.inbox.seen, now);
			if (input.inbox.read !== undefined) await markInboxRead(tx, id, input.inbox.read, now);
		}
	});

	for (const sub of addedSubscriptions) {
		if (typeof sub.prompt === "string")
			await writeSubscriptionPrompt(
				ctx,
				deps,
				promptTitle(existing.name, sub.title),
				id,
				sub.id,
				sub.prompt,
			);
	}
	for (const change of changedSubscriptionPrompts) {
		if (change.prompt === null) await archiveSubscriptionPrompt(ctx, deps, id, change.id);
		else
			await writeSubscriptionPrompt(
				ctx,
				deps,
				promptTitle(existing.name, undefined),
				id,
				change.id,
				change.prompt,
			);
	}

	if (input.identity !== undefined) {
		await identity.upsertAgentIdentity(ctx.db, {
			agentId: id,
			title: identityTitle(existing.kind, input.name ?? existing.name),
			body: input.identity ?? "",
			updatedBy: ctx.actor,
		});
	}

	if (input.status === "retired" && existing.kind === "ai") {
		await identity.archiveChildren(ctx.db, ctx.actor, id);
	}

	// The newest key wins: the runner that asked last is where the agent lives now.
	const key = input.key === "new" ? newUserKey() : undefined;
	if (key) await giveUserKey(ctx.db, id, key);

	if (mainChangeRow) ctx.eventBus.emit(objectEvent(mainChangeRow));

	const userRow = await findUser(ctx.db, { id });
	const isSelf = id === ctx.actor;
	const data = await buildUserView(ctx, deps, userRow ?? null, isSelf);
	return { ok: true, data: key ? { ...data, key } : data };
}

// ---------------------------------------------------------------------------
// The composed action list
// ---------------------------------------------------------------------------

export function createUserActions(deps: UserActionsDeps): readonly Action[] {
	function identityPortFor(ctx: ActionContext): AgentIdentityPort {
		return createAgentIdentityPort({
			searchDocuments: deps.searchDocuments,
			editDocument: deps.editDocument,
			eventBus: ctx.eventBus as EventBus,
		});
	}

	function editUserRun(ctx: ActionContext, input: EditUserInput): Promise<Result<UserView>> {
		const pureProblems = editUserInvariants(input);
		if (pureProblems.length > 0) return Promise.resolve({ ok: false, problems: pureProblems });
		if (input.id === SYSTEM_ACTOR_ID)
			return Promise.resolve({
				ok: false,
				problems: [{ code: "system_actor", message: "HyperIdle's own voice cannot be edited." }],
			});
		const identity = identityPortFor(ctx);
		if (input.id === undefined) return createUserRun(ctx, deps, identity, input);
		return editExistingUserRun(ctx, deps, identity, input);
	}

	return [
		{ declaration: searchUsersDeclaration, run: searchUsersRun } as Action,
		{ declaration: openUserDeclaration, run: makeOpenUserRun(deps) } as Action,
		{ declaration: editUserDeclaration, run: editUserRun } as Action,
	];
}
