/**
 * `search_users` / `open_user` / `edit_user` — the user module's own action
 * list, declared the way `@hyperidle/task`/`@hyperidle/thread`/
 * `@hyperidle/document`/`@hyperidle/settings` each declare theirs.
 * Declared in `framework/domain-model/src/actions/user.ts`.
 *
 * `Action`/`ActionContext` are this Service's own structural mirror
 * (`./action-types.js`) — the same reason `@hyperidle/settings`'s
 * `platform-actions.ts` declares its own: a nested Service may not import
 * the layer's own `actions/action.ts`. Everything this module reaches
 * outside its own five tables (`users`, `teams`, `org_edges`,
 * `subscriptions`, `inbox`) arrives through `UserActionsDeps`, bound in
 * `compose.ts` — run config/folders/connections structurally mirror
 * `AgentOrchestrationPort`'s own sub-ports (this Service may not import
 * `@hyperidle/api-contract` — governance: "a service talks through its own
 * layer" — so the shapes are hand-typed here, the way `AgentOrchestrationPort`
 * itself mirrors `AgentRunConfig`/`ServiceConnectionView` rather than
 * importing them), documents through the composed `search_documents`/
 * `edit_document` runners, harnesses/server config through thin
 * function seams.
 *
 */
import type { Change, HyperIdleDb, NewChange, NewUser, Team, WriteExecutor } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import {
	type AddSubscriptionInput,
	type AgentCategory,
	type EditUserInput,
	editUser as editUserDeclaration,
	editUserInvariants,
	type HarnessDescriptor,
	type ObjectEventName,
	type OpenUserInput,
	type OrgEdgeMechanism,
	openUser as openUserDeclaration,
	PERSON_REASONS,
	type Problem,
	type SearchUsersInput,
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
import { connectionOwnerFor } from "./connection-owner.js";
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
import { createTeam, getTeam, listTeams } from "./team-lookup.js";
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

/** Hand-typed structural mirror of `AgentOrchestrationRunConfigView`
 * (`@hyperidle/api-contract`) — this Service may not import that package
 * directly (governance: "a service talks through its own layer"), so
 * `compose.ts` (the layer itself, which may) binds the real port here. */
export interface UserActionsRunConfigView {
	readonly harnessType: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
	readonly modelOptions: Readonly<Record<string, string | number | boolean>>;
}

export type UserActionsRunConfigPatch = {
	-readonly [K in keyof UserActionsRunConfigView]?: UserActionsRunConfigView[K];
};

/** Mirrors `AgentOrchestrationFolderView`. */
export interface UserActionsFolderView {
	readonly id: string;
	readonly teamId: string;
	readonly source: string;
	readonly kind: "code" | "doc_set";
	readonly connectionId: string | null;
	readonly resourceRef:
		| { readonly kind: "code"; readonly repo: string; readonly branch: string }
		| { readonly kind: "doc_set"; readonly folder: string };
	readonly writeback: "git" | "file" | "none";
	readonly state: "attached" | "reachable" | "needs_attention";
	readonly createdAt: string;
}

/** Mirrors `AgentOrchestrationConnectionView`. */
export interface UserActionsConnectionView {
	readonly id: string;
	readonly service: string;
	readonly via: string;
	readonly authSource: "token" | "mcp" | "inherited";
	readonly health: "working" | "needs-attention";
	readonly removable: boolean;
	readonly withheldFrom: readonly string[];
}

/** Mirrors `AgentOrchestrationConnectionCreateInput`'s discriminated union. */
export type UserActionsConnectionCreateInput =
	| { readonly service: string; readonly authSource: "token"; readonly token: string }
	| { readonly service?: string; readonly authSource: "mcp"; readonly serverUrl: string };

export type UserActionsRemoveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "NOT_FOUND" };

export interface UserActionsDeps {
	readonly changes: {
		readonly appendChange: (exec: WriteExecutor, row: NewChange) => Promise<Change>;
		readonly listByIds: (db: HyperIdleDb, ids: readonly string[]) => Promise<readonly Change[]>;
	};
	/** Structural mirrors of the ports orchestration already exposes —
	 * `compose.ts` binds these straight to the real `AgentOrchestrationPort` members. */
	readonly runConfig: {
		read(agentId: string): Promise<UserActionsRunConfigView>;
		write(agentId: string, patch: UserActionsRunConfigPatch): Promise<void>;
	};
	readonly folders: {
		list(
			query: { readonly teamId: string } | { readonly agentUserId: string },
		): Promise<readonly UserActionsFolderView[]>;
		add(
			teamId: string,
			body: {
				readonly kind: "code" | "doc_set";
				readonly connectionId?: string | null;
				readonly resourceRef: UserActionsFolderView["resourceRef"];
				readonly writeback: "git" | "file" | "none";
			},
		): Promise<
			| { readonly ok: true; readonly folder: UserActionsFolderView }
			| { readonly ok: false; readonly code: "TEAM_NOT_FOUND" }
		>;
		remove(id: string): Promise<UserActionsRemoveResult>;
		give(
			id: string,
			agentUserId: string,
		): Promise<
			{ readonly ok: true } | { readonly ok: false; readonly code: "NOT_FOUND" | "CONFLICT" }
		>;
		take(id: string, agentUserId: string): Promise<UserActionsRemoveResult>;
	};
	readonly connections: {
		list(userId: string): Promise<{
			readonly connections: readonly UserActionsConnectionView[];
			readonly inherited: readonly UserActionsConnectionView[];
		}>;
		add(
			userId: string,
			input: UserActionsConnectionCreateInput,
		): Promise<
			| { readonly ok: true; readonly connection: UserActionsConnectionView }
			| { readonly ok: false; readonly code: "MISSING_ROOT_SECRET" | "DUPLICATE_CONNECTION" }
		>;
		remove(userId: string, id: string): Promise<UserActionsRemoveResult>;
		withhold(
			userId: string,
			id: string,
			agentUserId: string,
			keep: boolean,
		): Promise<UserActionsRemoveResult>;
	};
	/** Install-wide: this machine's harnesses. Absent when no adapter pool
	 * is wired (a composition without agent execution). */
	readonly harnesses?: {
		describe(): readonly HarnessDescriptor[];
		redetect(): Promise<void>;
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

const logger = createLogger({ pkg: "user.user-actions" });

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
	const teamRows: Team[] = await listTeams(db, {
		ids: [...new Set(rows.flatMap((r) => r.teamIds))],
	});
	const teamById = new Map(teamRows.map((t) => [t.id, t] as const));

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
			return team ? [{ id: team.id, name: team.name }] : [];
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
): Promise<UserView> {
	const runsOn = deps.harnesses ? [...deps.harnesses.describe()] : [];

	if (!userRow) {
		return {
			user: null,
			runsOn,
			runConfig: null,
			documentIds: [],
			folders: [],
			subscriptions: [],
			connections: null,
			inbox: null,
		};
	}

	const [row] = await toUserRows(ctx.db, [userRow]);
	if (!row) throw new Error("open_user: toUserRows dropped a row it was given");

	const runConfig = userRow.kind === "ai" ? await deps.runConfig.read(userRow.id) : null;

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

	const folders =
		userRow.kind === "ai"
			? await deps.folders.list({ agentUserId: userRow.id })
			: (await Promise.all(userRow.teamIds.map((teamId) => deps.folders.list({ teamId })))).flat();

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

	const connectionOwner = isSelf
		? userRow.id
		: userRow.kind === "ai"
			? await connectionOwnerFor(ctx.db, userRow.id)
			: null;
	const connections = connectionOwner ? await deps.connections.list(connectionOwner) : null;

	let inbox: UserView["inbox"] = null;
	if (isSelf) {
		const inboxRows = await listInboxRows(ctx.db, { userId: userRow.id, limit: 50 });
		const changeRows = await deps.changes.listByIds(
			ctx.db,
			inboxRows.map((r) => r.changeId),
		);
		const changeById = new Map(changeRows.map((c) => [c.id, objectEvent(c).change] as const));
		inbox = inboxRows.flatMap((r) => {
			const change = changeById.get(r.changeId);
			return change ? [{ change, seenAt: r.seenAt, readAt: r.readAt }] : [];
		});
	}

	// Cast: `runConfig`/`folders`/`connections` come straight off
	// `AgentOrchestrationPort` (`AgentOrchestrationRunConfigView`/
	// `AgentOrchestrationFolderView`/`AgentOrchestrationConnectionView`) —
	// structural mirrors of the wire shape `UserView` names, which the domain-model action file may
	// not import (zero-runtime-deps). `readonly` arrays don't structurally
	// satisfy a mutable wire array either. The real values are always one of
	// the wire enum's members; the cast is the same trust boundary
	// `agent-orchestration-port-composition.ts` already carries the other
	// direction.
	return {
		user: row,
		runsOn,
		runConfig,
		documentIds,
		folders,
		subscriptions,
		connections,
		inbox,
	} as UserView;
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
		const data = await buildUserView(ctx, deps, userRow, isSelf);
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

// ---------------------------------------------------------------------------
// edit_user — folders and connections, shared by create and edit
//
// ---------------------------------------------------------------------------

/** A folder is added to one of the user's teams — the one named, or their only
 * one. `give`'s team-consistency gate checks the folder is one of those teams'
 * with `folders.list({teamId})`. A folder already given to this
 * agent is CONFLICT from the port — its own code, `folder_already_given`,
 * distinct from a team mismatch.
 *
 * Port calls throw on non-2xx; each is wrapped to convert thrown failure into
 * the same problem as a returned !ok — thrown and returned failures are indistinguishable to the caller. */
async function applyUserFolders(
	deps: UserActionsDeps,
	id: string,
	teams: readonly { readonly id: string; readonly name: string }[],
	folders: NonNullable<EditUserInput["folders"]>,
	recipients: (teamId: string) => Promise<readonly string[]>,
): Promise<Problem | null> {
	for (const { team: teamName, ...body } of folders.add ?? []) {
		const team =
			teamName !== undefined
				? teams.find((t) => t.name === teamName)
				: teams.length === 1
					? teams[0]
					: undefined;
		if (!team) {
			return {
				code: "folder_team_required",
				message:
					teamName !== undefined
						? `'${teamName}' is not one of this user's teams.`
						: "Name which of this user's teams the folder belongs to.",
				path: "folders",
			};
		}
		let result: Awaited<ReturnType<typeof deps.folders.add>>;
		try {
			result = await deps.folders.add(team.id, body);
		} catch {
			return { code: "unknown_folder", message: "That team does not exist.", path: "folders" };
		}
		if (!result.ok) {
			return { code: "unknown_folder", message: "That team does not exist.", path: "folders" };
		}
		for (const agentId of await recipients(team.id)) {
			await deps.folders.give(result.folder.id, agentId);
		}
	}
	for (const folderId of folders.remove ?? []) {
		let result: Awaited<ReturnType<typeof deps.folders.remove>>;
		try {
			result = await deps.folders.remove(folderId);
		} catch {
			return { code: "unknown_folder", message: `No folder '${folderId}'.`, path: "folders" };
		}
		if (!result.ok) {
			return { code: "unknown_folder", message: `No folder '${folderId}'.`, path: "folders" };
		}
	}
	for (const folderId of folders.give ?? []) {
		if (teams.length === 0) {
			return {
				code: "folder_other_team",
				message: "This agent has no team to receive a folder.",
				path: "folders",
			};
		}
		let teamFolders: readonly UserActionsFolderView[];
		try {
			teamFolders = (
				await Promise.all(teams.map((team) => deps.folders.list({ teamId: team.id })))
			).flat();
		} catch {
			return {
				code: "folder_other_team",
				message: `Folder '${folderId}' does not belong to this agent's team.`,
				path: "folders",
			};
		}
		if (!teamFolders.some((f) => f.id === folderId)) {
			return {
				code: "folder_other_team",
				message: `Folder '${folderId}' does not belong to this agent's team.`,
				path: "folders",
			};
		}
		let result: Awaited<ReturnType<typeof deps.folders.give>>;
		try {
			result = await deps.folders.give(folderId, id);
		} catch {
			return { code: "unknown_folder", message: `No folder '${folderId}'.`, path: "folders" };
		}
		if (!result.ok) {
			return result.code === "CONFLICT"
				? {
						code: "folder_already_given",
						message: `Folder '${folderId}' is already given to this agent.`,
						path: "folders",
					}
				: { code: "unknown_folder", message: `No folder '${folderId}'.`, path: "folders" };
		}
	}
	for (const folderId of folders.take ?? []) {
		let result: Awaited<ReturnType<typeof deps.folders.take>>;
		try {
			result = await deps.folders.take(folderId, id);
		} catch {
			return {
				code: "unknown_folder",
				message: `No folder '${folderId}' given to this agent.`,
				path: "folders",
			};
		}
		if (!result.ok) {
			return {
				code: "unknown_folder",
				message: `No folder '${folderId}' given to this agent.`,
				path: "folders",
			};
		}
	}
	return null;
}

async function applyUserConnections(
	db: HyperIdleDb,
	deps: UserActionsDeps,
	id: string,
	connections: NonNullable<EditUserInput["connections"]>,
): Promise<Problem | null> {
	for (const conn of connections.add ?? []) {
		// `EditUserConnectionsSchema`'s flat `{service, authSource, token?,
		// serverUrl?}` (today's `POST /filesystems` body shape) is wider than
		// the port's own discriminated union — the port itself is the one
		// that refuses a mismatched pair (`connection_invalid` below). One
		// audited cast, widened through a local `unknown` binding rather than
		// a chained `as unknown as` (forbidden — `design/no-unknown-cast`).
		//
		// @lore: connections.add seam — throws on non-2xx instead of returning {ok:false}; catch converts throw to connection_invalid, matching returned failures
		const connWidened: unknown = conn;
		let result: Awaited<ReturnType<typeof deps.connections.add>>;
		try {
			result = await deps.connections.add(
				id,
				connWidened as Parameters<typeof deps.connections.add>[1],
			);
		} catch {
			return {
				code: "connection_invalid",
				message: "That connection could not be added.",
				path: "connections",
			};
		}
		if (!result.ok) {
			return {
				code: "connection_invalid",
				message: "That connection could not be added.",
				path: "connections",
			};
		}
	}
	for (const connId of connections.remove ?? []) {
		const result = await deps.connections.remove(id, connId);
		if (!result.ok) {
			return {
				code: "unknown_connection",
				message: `No connection '${connId}'.`,
				path: "connections",
			};
		}
	}
	const keeps = [
		...(connections.give ?? []).map((connId) => [connId, false] as const),
		...(connections.take ?? []).map((connId) => [connId, true] as const),
	];
	if (keeps.length > 0) {
		const owner = await connectionOwnerFor(db, id);
		for (const [connId, keep] of keeps) {
			const result = owner
				? await deps.connections.withhold(owner, connId, id, keep)
				: ({ ok: false, code: "NOT_FOUND" } as const);
			if (!result.ok) {
				return {
					code: "unknown_connection",
					message: `No connection '${connId}' of this agent's owner.`,
					path: "connections",
				};
			}
		}
	}
	return null;
}

/**
 * Who a new folder goes to: every agent of its owner in that team — a person's own agents, or an
 * agent's owner's. An agent no one owns keeps it to itself.
 */
async function folderRecipients(
	db: HyperIdleDb,
	user: { readonly id: string; readonly kind: string; readonly ownerUserId: string | null },
	teamId: string,
): Promise<string[]> {
	const owner = user.kind === "human" ? user.id : user.ownerUserId;
	if (!owner) return [user.id];
	const agents = await listUsers(db, { ownerUserId: owner, kind: "ai" });
	return agents
		.filter((a) => a.status !== "retired" && a.teamIds.includes(teamId))
		.map((a) => a.id);
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

	const callerRow = await findUser(ctx.db, { id: ctx.actor });
	if (!callerRow) {
		if (kind !== "human") {
			return problem("unknown_actor", "Only a person may create the first user.", "kind");
		}
		const anyHuman = await listUsers(ctx.db, { kind: "human" });
		if (anyHuman.length > 0) {
			return problem("unknown_actor", "A person already exists — sign in.", "kind");
		}
	}

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
	const role = input.role ?? (kind === "human" ? (callerRow ? "member" : "founder") : "agent");

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
		await insertUser(tx, values);
		await setUserTeams(
			tx,
			id,
			teams.map((t) => t.id),
		);

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

	// -- post-commit: run config, folders + connections, identity + subscription
	// prompt documents, redetect. No port or document call inside
	// the transaction above. A folder/connection problem is held, not
	// returned, so every step below still runs and the row's own
	// `user.created` still reaches every subscriber in reach. --
	if (input.runConfig) await deps.runConfig.write(id, input.runConfig);

	let stepProblem: Problem | null = null;
	if (input.folders) {
		stepProblem = await applyUserFolders(deps, id, teams, input.folders, (teamId) =>
			folderRecipients(ctx.db, { id, kind, ownerUserId: values.ownerUserId ?? null }, teamId),
		);
	}
	if (!stepProblem && input.connections) {
		stepProblem = await applyUserConnections(ctx.db, deps, id, input.connections);
	}

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
	if (input.redetectHarnesses && deps.harnesses) await deps.harnesses.redetect();

	if (mainChangeRow) ctx.eventBus.emit(objectEvent(mainChangeRow));

	// create always answers ok:true once the row is committed — folder/connection problem is logged, not returned (row is already committed)
	if (stepProblem) {
		logger.warn("create: folder/connection step failed after the row committed", {
			userId: id,
			code: stepProblem.code,
			path: stepProblem.path,
		});
	}

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
	if ((input.connections?.add || input.connections?.remove) && ctx.actor !== id) {
		return problem("yourself_only", "Connections are added on your own view only.", "connections");
	}
	if ((input.connections?.give || input.connections?.take) && existing.kind !== "ai") {
		return problem(
			"agents_only",
			"A service is given to or kept from an agent; a person reaches their own.",
			"connections",
		);
	}
	if (input.inbox !== undefined && ctx.actor !== id) {
		return problem("yourself_only", "Your inbox is edited on your own view only.", "inbox");
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

	const touchesTeams = input.teams !== undefined;
	const touchesEdges =
		(input.edges?.add?.length ?? 0) > 0 || (input.edges?.remove?.length ?? 0) > 0;
	const touchesSubscriptions =
		(input.subscriptions?.add?.length ?? 0) > 0 ||
		(input.subscriptions?.change?.length ?? 0) > 0 ||
		(input.subscriptions?.remove?.length ?? 0) > 0;
	const touchesRunConfig = input.runConfig !== undefined;
	const touchesReach = input.folders !== undefined || input.connections !== undefined;
	const appendsChange =
		touchesIdentityFields(input) ||
		touchesTeams ||
		touchesEdges ||
		touchesSubscriptions ||
		touchesRunConfig ||
		touchesReach;

	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	for (const f of IDENTITY_FIELDS) {
		if (input[f] !== undefined) {
			before[f] = existing[f] ?? null;
			after[f] = input[f];
		}
	}
	if (touchesEdges) after.edges = true;
	if (touchesSubscriptions) after.subscriptions = true;
	if (touchesRunConfig) after.runConfig = input.runConfig;
	if (touchesReach) after.reach = true;

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
			await setUserTeams(
				tx,
				id,
				teams.map((t) => t.id),
			);
			before.teamIds = existing.teamIds;
			after.teamIds = teams.map((t) => t.id);
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

	// -- post-commit: ports, documents, redetect, retire archive.
	// No port or document call sits inside the transaction above. A
	// folder/connection problem is held, not returned, so the rest of this
	// sequence — including the `user.changed` emit below — still runs. --
	if (input.runConfig) await deps.runConfig.write(id, input.runConfig);

	let stepProblem: Problem | null = null;
	if (input.folders) {
		const folderTeams =
			teams ??
			(await listTeams(ctx.db, { ids: existing.teamIds })).map((t) => ({ id: t.id, name: t.name }));
		stepProblem = await applyUserFolders(deps, id, folderTeams, input.folders, (teamId) =>
			folderRecipients(ctx.db, existing, teamId),
		);
	}
	if (!stepProblem && input.connections) {
		stepProblem = await applyUserConnections(ctx.db, deps, id, input.connections);
	}

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

	if (input.redetectHarnesses && deps.harnesses) await deps.harnesses.redetect();

	if (mainChangeRow) ctx.eventBus.emit(objectEvent(mainChangeRow));

	if (stepProblem) return { ok: false, problems: [stepProblem] };

	const userRow = await findUser(ctx.db, { id });
	const isSelf = id === ctx.actor;
	const data = await buildUserView(ctx, deps, userRow ?? null, isSelf);
	return { ok: true, data };
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
