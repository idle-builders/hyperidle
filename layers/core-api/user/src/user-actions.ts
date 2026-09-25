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
 * `edit_document` runners, harnesses/behaviour/server config through thin
 * function seams.
 *
 * @lore the deps bag omits `agentWorkIntentRecorder`/`searchTasks`/
 * `searchThreads`/`assembleSessionDocuments`/`wsPush` — architecture.md §6
 * lists them once for the whole package, but they exist to let a
 * subscription WAKE someone (§4's fire mechanism), and firing belongs to a
 * later `subscription-fire.ts` module in this same package. `edit_user`
 * only ever WRITES a subscription row; it never fires one. Pulling those
 * five deps in here now would leave them unused until that module lands and
 * unable to be proven red-then-green by this module's own tests — the firing
 * module adds its own narrower deps bag when it lands.
 */
import type {
	Change,
	HyperIdleDb,
	NewChange,
	NewUser,
	Team,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import {
	type AgentBehaviorConfigKind,
	type AgentBehaviorConfigView,
	type AgentCategory,
	type EditUserInput,
	editUser as editUserDeclaration,
	editUserInvariants,
	type HarnessDescriptor,
	type ObjectEventName,
	type OpenUserInput,
	type OrgEdgeMechanism,
	openUser as openUserDeclaration,
	type Problem,
	type SearchUsersInput,
	searchUsers as searchUsersDeclaration,
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
import { deleteOrgEdge, listOrgEdges, upsertOrgEdge } from "./org-edges.js";
import {
	deleteSubscription,
	insertSubscription,
	listInboxRows,
	listSubscriptions,
	markInboxRead,
	markInboxSeen,
	updateSubscription,
} from "./subscriptions-store.js";
import { createTeam, getTeam } from "./team-lookup.js";
import { findUser, insertUser, listUsers, updateUser } from "./user-store.js";

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
	/** §6: structural mirrors of the ports orchestration already exposes —
	 * `compose.ts` (the layer, which may import `@hyperidle/api-contract`)
	 * binds these straight to the real `AgentOrchestrationPort` members. */
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
	};
	/** Install-wide: this machine's harnesses, unstamped — `open_user` stamps
	 * `discovery.disabled` itself from `readServerConfig`, mirroring
	 * `routes/harnesses.ts`'s own `stampDisabled`. Absent when no adapter pool
	 * is wired (a composition without agent execution). */
	readonly harnesses?: {
		describe(): readonly HarnessDescriptor[];
		redetect(): Promise<void>;
	};
	/**
	 * Agent only — a derived trust signal (§ restored from the deleted
	 * `agent-profile.ts` route's `computeApprovalRate`). Absent → `null` on
	 * every agent's `reviewTrackRecord` (a composition without policy wired).
	 */
	readonly reviewTrackRecord?: (
		db: HyperIdleDb,
		agentId: string,
	) => Promise<{
		readonly approvalRate: number;
		readonly totalVerdicts: number;
		readonly recentVerdicts: ReadonlyArray<{
			readonly decision: string;
			readonly threadId: string;
			readonly createdAt: string;
		}>;
		readonly windowDays: number;
	}>;
	readonly readServerConfig: (
		db: HyperIdleDb,
	) => Promise<{ readonly harnessDisabled: readonly string[] }>;
	readonly behaviour: {
		list(
			db: HyperIdleDb,
			options?: { readonly kind?: AgentBehaviorConfigKind },
		): Promise<AgentBehaviorConfigView[]>;
		patch(
			db: HyperIdleDb,
			input: {
				readonly id: string;
				readonly fields: Record<string, string | boolean | null>;
				readonly createdByUserId?: string | null;
			},
		): Promise<AgentBehaviorConfigView>;
	};
	readonly searchDocuments: SearchDocumentsRunFn;
	readonly editDocument: EditDocumentRunFn;
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

function stampDisabled(
	descriptors: readonly HarnessDescriptor[],
	harnessDisabled: readonly string[],
): HarnessDescriptor[] {
	if (harnessDisabled.length === 0) return [...descriptors];
	return descriptors.map((d) =>
		harnessDisabled.includes(d.type) ? { ...d, discovery: { ...d.discovery, disabled: true } } : d,
	);
}

function effectiveTeamId(user: User, ownerById: ReadonlyMap<string, User>): string | null {
	if (user.teamId) return user.teamId;
	if (user.ownerUserId) return ownerById.get(user.ownerUserId)?.teamId ?? null;
	return null;
}

/** `internal: true`, actor stamped to the agent whose scoped document this
 * touches — the read-only, system-level lookups `open_user`/`edit_user` make
 * for an agent's identity/skill documents and a subscription's prompt
 * document. `resolveViewer` (`@hyperidle/document`) grants a `scopeKind:
 * "user"` document to its own scope id regardless of who is actually asking
 * (§6.7's "never counts as a read" only covers `open_document`'s bump — the
 * visibility gate itself is unaffected by `internal`), so these lookups run
 * as the agent, the same way `agent-identity.ts`'s `identityIdsFor` accepts
 * an explicit `viewerActor` rather than trusting whoever is asking. */
function internalCtx(ctx: ActionContext, subjectId: string): ActionContext {
	return { ...ctx, actor: subjectId, internal: true };
}

/** `@hyperidle/user`'s own `getTeam`/`listTeams` only batch by id via
 * `listTeams` — this loops `getTeam({id})` instead of adding a third team
 * export, since the batch here is small (distinct effective team ids among
 * one page of users) and every other read in this module already goes
 * through the store's narrow surface. */
async function listUsersTeams(db: HyperIdleDb, ids: ReadonlySet<string>): Promise<Team[]> {
	const found = await Promise.all([...ids].map((teamId) => getTeam(db, { id: teamId })));
	return found.filter((t): t is Team => t !== undefined);
}

/** Batch-builds `UserRow`s — the effective team and outgoing org edges of
 * every row, in two queries total regardless of how many rows. */
async function toUserRows(db: HyperIdleDb, rows: readonly User[]): Promise<UserRow[]> {
	if (rows.length === 0) return [];
	const ownerIds = [...new Set(rows.flatMap((r) => (r.ownerUserId ? [r.ownerUserId] : [])))];
	const owners = ownerIds.length > 0 ? await listUsers(db, { ids: ownerIds }) : [];
	const ownerById = new Map(owners.map((o) => [o.id, o] as const));

	const teamIds = new Set<string>();
	for (const r of rows) {
		const tid = effectiveTeamId(r, ownerById);
		if (tid) teamIds.add(tid);
	}
	const teamRows: Team[] = teamIds.size > 0 ? await listUsersTeams(db, teamIds) : [];
	const teamById = new Map(teamRows.map((t) => [t.id, t] as const));

	const edgeRows = await listOrgEdges(db, { fromUserIds: rows.map((r) => r.id) });
	const edgesByUser = new Map<
		string,
		Array<{ id: string; mechanism: OrgEdgeMechanism; target: string }>
	>();
	for (const e of edgeRows) {
		const list = edgesByUser.get(e.fromUserId) ?? [];
		list.push({ id: e.id, mechanism: e.mechanism as OrgEdgeMechanism, target: e.target });
		edgesByUser.set(e.fromUserId, list);
	}

	return rows.map((r) => {
		const tid = effectiveTeamId(r, ownerById);
		const team = tid ? teamById.get(tid) : undefined;
		return {
			id: r.id,
			kind: r.kind as UserKind,
			name: r.name,
			role: r.role,
			status: r.status as UserStatus,
			email: r.email ?? null,
			avatarUrl: r.avatarUrl ?? null,
			createdAt: r.createdAt,
			agentCategory: (r.agentCategory as AgentCategory | null) ?? null,
			ownerUserId: r.ownerUserId ?? null,
			health: r.health ?? null,
			team: team ? { id: team.id, name: team.name } : null,
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
	});
	// @lore The system actor (role "system") is plumbing — the row system
	// writes are attributed to — not a person or an agent anyone works with,
	// so no list shows it. A caller that names it in `ids` (resolving a
	// change's actor, a message's sender) still gets it. Presentation, not
	// access control: `open_user` answers for it as for any row.
	const listed = rows.filter((r) => r.role !== "system" || (input.ids ?? []).includes(r.id));
	let views = await toUserRows(ctx.db, listed);
	if (input.teamId !== undefined) {
		views = views.filter((v) => v.team?.id === input.teamId);
	}
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
	userRow: User | null,
	isSelf: boolean,
): Promise<UserView> {
	const harnessDisabled = (await deps.readServerConfig(ctx.db)).harnessDisabled;
	const runsOn = deps.harnesses ? stampDisabled(deps.harnesses.describe(), harnessDisabled) : [];

	if (!userRow) {
		return {
			user: null,
			runsOn,
			runConfig: null,
			documentIds: [],
			folders: [],
			subscriptions: [],
			connections: null,
			behaviour: null,
			inbox: null,
			reviewTrackRecord: null,
		};
	}

	const [row] = await toUserRows(ctx.db, [userRow]);
	if (!row) throw new Error("open_user: toUserRows dropped a row it was given");

	const runConfig = userRow.kind === "ai" ? await deps.runConfig.read(userRow.id) : null;

	// @lore BC5 T11: public for any caller, like the deleted agent-profile.ts
	// route was — a review track record is not a self-only fact.
	const reviewTrackRecord =
		userRow.kind === "ai" && deps.reviewTrackRecord
			? await deps.reviewTrackRecord(ctx.db, userRow.id)
			: null;

	let documentIds: UserView["documentIds"] = [];
	if (userRow.kind === "ai") {
		const found = await deps.searchDocuments(internalCtx(ctx, userRow.id), {
			parent: { kind: "agent", id: userRow.id },
		});
		if (found.ok) {
			documentIds = found.data
				.filter((d) => d.slot === "agent_file" || d.slot === "skill" || d.slot === "rule")
				.map((d) => ({ slot: d.slot, id: d.id }));
		}
	}

	const folders =
		userRow.kind === "ai"
			? await deps.folders.list({ agentUserId: userRow.id })
			: row.team
				? await deps.folders.list({ teamId: row.team.id })
				: [];

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
		schedule: s.schedule,
		paused: s.paused,
		documentId: promptDocByParent.get(s.id) ?? null,
		nextRunAt: s.nextRunAt,
	}));

	const connections = isSelf ? await deps.connections.list(userRow.id) : null;
	const behaviour = isSelf ? await deps.behaviour.list(ctx.db) : null;

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
	// `AgentOrchestrationFolderView`/`AgentOrchestrationConnectionView`), and
	// `behaviour` off `AgentBehaviorConfigView` — both structural mirrors of
	// the wire shape `UserView` names, which the domain-model action file may
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
		behaviour,
		inbox,
		reviewTrackRecord,
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
			// First-run: the caller has no row of its own yet (§7).
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
	readonly schedule?: string;
	readonly prompt?: string | null;
	readonly paused?: boolean;
}

/** DB-dependent subscription problems (§1): `schedule_for_agents_only`,
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
	ownerName: string,
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
		title: `${ownerName} — subscription prompt`,
		body: prompt,
		slot: "prompt",
		status: "active",
		scopeKind: "user",
		scopeId: agentId,
		parent: { kind: "subscription", id: subscriptionId },
	});
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
// @lore Review fix: `create` used to never call this at all (a welcome-screen
// folder pick was silently dropped) and `edit` returned the first port
// failure IMMEDIATELY — before the transaction's own `user.changed` row ever
// reached `ctx.eventBus.emit`, three loops and a `for` below. The row was
// already committed by that point, so the caller got told the whole edit
// was refused while it had, in fact, half-landed, and nobody in reach ever
// heard about the half that did. architecture.md §6 fixes the ORDER at
// "commit → port calls → emit" — port calls already run after commit, so
// the fix is not to move them earlier; it is to stop `return`ing out of the
// middle of that sequence. Both callers now run every port call through
// these two helpers, keep going through the rest of their own post-commit
// steps and the emit regardless of a port failure, and surface only the
// FIRST folder/connection problem to the caller at the very end.
// ---------------------------------------------------------------------------

/** `give`'s team-consistency gate — checks the
 * team with `folders.list({teamId})`, replacing origin/main's
 * `routes/filesystems.ts` `TEAM_MISMATCH` (route deleted, gate never
 * ported). A folder already given to this agent is CONFLICT from the port —
 * its own code, `folder_already_given`, distinct from a team mismatch.
 *
 * @lore review 1b N6: every one of these five port calls throws on a non-2xx
 * response the same way `deps.connections.add` does
 * (`agent-orchestration-port-composition.ts`) — `applyUserConnections`
 * already caught that; this function did not, so a seam blip escaped
 * uncaught, past both callers' post-commit sequence, and skipped the
 * `user.changed`/`user.created` emit even though the row itself had already
 * committed. Every call below is now caught the same way, turning a throw
 * into the same problem its neighbouring `!result.ok` branch already
 * returns — a thrown failure and a returned one are indistinguishable to
 * the caller, exactly like `applyUserConnections`. */
async function applyUserFolders(
	deps: UserActionsDeps,
	id: string,
	teamId: string | null,
	folders: NonNullable<EditUserInput["folders"]>,
): Promise<Problem | null> {
	for (const body of folders.add ?? []) {
		if (!teamId) {
			return {
				code: "unknown_folder",
				message: "This user has no team to add a folder to.",
				path: "folders",
			};
		}
		let result: Awaited<ReturnType<typeof deps.folders.add>>;
		try {
			result = await deps.folders.add(teamId, body);
		} catch {
			return { code: "unknown_folder", message: "That team does not exist.", path: "folders" };
		}
		if (!result.ok) {
			return { code: "unknown_folder", message: "That team does not exist.", path: "folders" };
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
		if (!teamId) {
			return {
				code: "folder_other_team",
				message: "This agent has no team to receive a folder.",
				path: "folders",
			};
		}
		let teamFolders: readonly UserActionsFolderView[];
		try {
			teamFolders = await deps.folders.list({ teamId });
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
		// @lore the seam-backed `connections.add` binding
		// (`agent-orchestration-port-composition.ts`) throws on any non-2xx
		// response — including the seam's own schema rejection of a
		// mismatched pair (a bad `serverUrl`, a missing token) — rather than
		// returning the `{ok:false}` its own return type promises. This catch
		// makes the door honor what it already documented: every refused add,
		// thrown or returned, is one `connection_invalid`.
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
	return null;
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

	let ownerRow: User | undefined;
	if (input.ownerUserId !== undefined) {
		ownerRow = await findUser(ctx.db, { id: input.ownerUserId });
		if (!ownerRow)
			return problem("unknown_owner", `No user with id '${input.ownerUserId}'.`, "ownerUserId");
	}

	for (const e of input.edges?.add ?? []) {
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
	// @lore T23: A rowless caller creating a human can only be the welcome
	// screen's first `edit_user` call (the check above already refuses a
	// second one once any human exists) — so it gets "founder" the way
	// origin/main's now-deleted setup route hardcoded it, instead of the
	// "member" every later human default gets. Deciding it here, rather than
	// having SetupFlow.tsx pass role explicitly, keeps the welcome screen's
	// call body unchanged.
	const role = input.role ?? (kind === "human" ? (callerRow ? "member" : "founder") : "agent");

	const values: NewUser = {
		id,
		kind,
		name,
		role,
		status,
		email: input.email ?? null,
		avatarUrl: input.avatarUrl ?? null,
		createdAt: now,
		agentCategory,
		ownerUserId: input.ownerUserId ?? null,
		health: input.health ?? null,
		teamId: null,
	};

	const addedSubscriptions: Array<{ id: string; prompt: string | null | undefined }> = [];
	let mainChangeRow: Change | undefined;

	await ctx.db.transaction(async (txRaw) => {
		const tx = txRaw as HyperIdleDb;
		if (input.ownerUserId === undefined && input.team) {
			let teamRow = await getTeam(tx, { name: input.team.name });
			if (!teamRow) {
				const teamId = `team-${crypto.randomUUID()}`;
				await createTeam(tx, {
					id: teamId,
					name: input.team.name,
					createdAt: now,
				});
				teamRow = await getTeam(tx, { id: teamId });
			}
			values.teamId = teamRow?.id ?? null;
		}
		await insertUser(tx, values);

		for (const e of input.edges?.add ?? []) {
			await upsertOrgEdge(tx, { fromUserId: id, mechanism: e.mechanism, target: e.target });
		}

		for (const sub of input.subscriptions?.add ?? []) {
			const subId = crypto.randomUUID();
			const nextRunAt = sub.schedule !== undefined ? nextRunAtFor(sub.schedule, now) : null;
			await insertSubscription(tx, {
				id: subId,
				userId: id,
				event: sub.event ?? null,
				schedule: sub.schedule ?? null,
				paused: sub.paused ?? false,
				nextRunAt,
				createdAt: now,
				updatedAt: now,
			});
			addedSubscriptions.push({ id: subId, prompt: sub.prompt });
		}

		const { before, after } = stringifyChange({
			before: null,
			after: { kind, name, role, status, teamId: values.teamId, ownerUserId: values.ownerUserId },
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

	// -- post-commit: run config, folders + connections (§6 — the welcome
	// screen's own folder pick arrives here, B1), identity + subscription
	// prompt documents, behaviour, redetect. No port or document call inside
	// the transaction above. A folder/connection problem is held, not
	// returned, so every step below still runs and the row's own
	// `user.created` still reaches every subscriber in reach (see the
	// `applyUserFolders`/`applyUserConnections` @lore). --
	if (input.runConfig) await deps.runConfig.write(id, input.runConfig);

	let stepProblem: Problem | null = null;
	if (input.folders) {
		const effectiveTeamId = values.teamId ?? ownerRow?.teamId ?? null;
		stepProblem = await applyUserFolders(deps, id, effectiveTeamId, input.folders);
	}
	if (!stepProblem && input.connections) {
		stepProblem = await applyUserConnections(deps, id, input.connections);
	}

	if (kind === "ai" && input.identity !== undefined) {
		await identity.upsertAgentIdentity(ctx.db, {
			agentId: id,
			agentName: name,
			body: input.identity ?? "",
			updatedBy: ctx.actor,
		});
	}
	for (const sub of addedSubscriptions) {
		if (sub.prompt) await writeSubscriptionPrompt(ctx, deps, name, id, sub.id, sub.prompt);
	}
	if (input.behaviour) {
		for (const entry of input.behaviour) {
			await deps.behaviour.patch(ctx.db, {
				id: entry.id,
				fields: entry.fields,
				createdByUserId: ctx.actor,
			});
		}
	}
	if (input.redetectHarnesses && deps.harnesses) await deps.harnesses.redetect();

	if (mainChangeRow) ctx.eventBus.emit(objectEvent(mainChangeRow));

	// @lore review 1b N8: unlike `editExistingUserRun` (below), a create that
	// answers `ok:false` here does not describe a no-op — the person and team
	// rows are already committed. `edit_user`'s wire shape (`ActionResult` —
	// `framework/domain-model/src/actions/action.ts`, out of this item's
	// scope) is a strict `{ok:true,data} | {ok:false,problems}`, so there is
	// no shape that carries the row AND the problem at once; the two options
	// the review named are "refuse before the row is written" or "answer
	// `ok:true` with the row, the folder/connection problem reported some
	// other way". The welcome screen decides this: `SetupFlow.tsx` already
	// treats the person's own folder pick as best-effort (its own comment
	// says so) and never branches on a folder-specific problem — it only
	// checks `ok`/`user !== null` before using the new person's id to create
	// their assistant next. Refusing up front would mean re-running the
	// folder step BEFORE the team a fresh `input.team` creates even exists,
	// which is the "commit → port calls → emit" ordering §6/B1 already fixed
	// the other direction; undoing that ordering for create alone, to serve
	// one caller's retry safety, is the wrong trade. So: create always
	// answers `ok:true` with the row once it is truly committed — the
	// caller that asked for a folder/connection it didn't get can already
	// see that from the row's own `folders`/`connections` fields (silence by
	// omission, the same signal a person reads off Settings after a change
	// that quietly did not apply); the problem itself is still reported,
	// through the same logger every other non-fatal step failure in this
	// package already reports through (`subscription-fire.ts`,
	// `subscription-clock.ts`), so an operator can see it without the
	// caller having to retry-and-duplicate to surface it.
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

const IDENTITY_FIELDS = ["name", "role", "email", "avatarUrl", "status", "health"] as const;

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
		(input.name !== undefined || input.email !== undefined || input.avatarUrl !== undefined) &&
		ctx.actor !== id
	) {
		return problem(
			"own_profile_only",
			"Only this person may change their own name, email or avatar.",
			"name",
		);
	}
	if (input.status === "retired" && (existing.kind === "human" || existing.role === "system")) {
		return problem("cannot_retire", "A person or a system agent cannot be retired.", "status");
	}
	if (input.team !== undefined && existing.ownerUserId !== null) {
		return problem("owned_agent_has_no_team", "An owned agent takes its owner's team.", "team");
	}
	if (input.connections !== undefined && ctx.actor !== id) {
		return problem("yourself_only", "Connections are edited on your own view only.", "connections");
	}
	if (input.inbox !== undefined && ctx.actor !== id) {
		return problem("yourself_only", "Your inbox is edited on your own view only.", "inbox");
	}
	if (input.behaviour !== undefined && ctx.actor !== id) {
		return problem("yourself_only", "Behaviour is edited on your own view only.", "behaviour");
	}

	for (const e of input.edges?.add ?? []) {
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

	const touchesTeam = input.team !== undefined;
	const touchesEdges =
		(input.edges?.add?.length ?? 0) > 0 || (input.edges?.remove?.length ?? 0) > 0;
	const touchesSubscriptions =
		(input.subscriptions?.add?.length ?? 0) > 0 ||
		(input.subscriptions?.change?.length ?? 0) > 0 ||
		(input.subscriptions?.remove?.length ?? 0) > 0;
	const touchesRunConfig = input.runConfig !== undefined;
	const appendsChange =
		touchesIdentityFields(input) ||
		touchesTeam ||
		touchesEdges ||
		touchesSubscriptions ||
		touchesRunConfig;

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

	let resolvedTeamId: string | null | undefined;
	const addedSubscriptions: Array<{ id: string; prompt: string | null | undefined }> = [];
	const changedSubscriptionPrompts: Array<{ id: string; prompt: string | null }> = [];
	let mainChangeRow: Change | undefined;

	await ctx.db.transaction(async (txRaw) => {
		const tx = txRaw as HyperIdleDb;
		if (touchesTeam && input.team) {
			let teamRow = await getTeam(tx, { name: input.team.name });
			if (!teamRow) {
				const teamId = `team-${crypto.randomUUID()}`;
				await createTeam(tx, {
					id: teamId,
					name: input.team.name,
					createdAt: now,
				});
				teamRow = await getTeam(tx, { id: teamId });
			}
			resolvedTeamId = teamRow?.id ?? null;
			before.teamId = existing.teamId;
			after.teamId = resolvedTeamId;
		}

		const patch: Partial<NewUser> = {};
		for (const f of IDENTITY_FIELDS) {
			if (input[f] !== undefined) (patch as Record<string, unknown>)[f] = input[f];
		}
		if (resolvedTeamId !== undefined) patch.teamId = resolvedTeamId;
		if (Object.keys(patch).length > 0) await updateUser(tx, id, patch);

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
				schedule: sub.schedule ?? null,
				paused: sub.paused ?? false,
				nextRunAt,
				createdAt: now,
				updatedAt: now,
			});
			addedSubscriptions.push({ id: subId, prompt: sub.prompt });
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

	// -- post-commit: ports, documents, behaviour, redetect, retire archive.
	// No port or document call sits inside the transaction above. A
	// folder/connection problem is held, not returned, so the rest of this
	// sequence — including the `user.changed` emit below — still runs (see
	// `applyUserFolders`/`applyUserConnections` @lore). --
	if (input.runConfig) await deps.runConfig.write(id, input.runConfig);

	let stepProblem: Problem | null = null;
	if (input.folders) {
		// @lore review 1b N7: an owned agent's own `teamId` column is always
		// null (`createUserRun` never sets it when `ownerUserId` is given) — it
		// takes its owner's team, the same "effective team" `toUserRows` already
		// reports on `open_user`. `create` already resolved this correctly for
		// `folders.give` at creation time (`values.teamId ?? ownerRow?.teamId`);
		// this edit path fell back to `existing.teamId` alone, so an owned
		// agent's folder could never be given from Settings after creation even
		// though the SAME give at creation time would have succeeded — main
		// itself refused it too (`TEAM_MISMATCH` on a null team), so this was
		// not a regression, but create and edit disagreeing on one user's
		// effective team is its own bug.
		const ownerRow = existing.ownerUserId
			? await findUser(ctx.db, { id: existing.ownerUserId })
			: undefined;
		const teamId = resolvedTeamId ?? existing.teamId ?? ownerRow?.teamId ?? null;
		stepProblem = await applyUserFolders(deps, id, teamId, input.folders);
	}
	if (!stepProblem && input.connections) {
		stepProblem = await applyUserConnections(deps, id, input.connections);
	}

	for (const sub of addedSubscriptions) {
		if (sub.prompt) await writeSubscriptionPrompt(ctx, deps, existing.name, id, sub.id, sub.prompt);
	}
	for (const change of changedSubscriptionPrompts) {
		if (change.prompt === null) await archiveSubscriptionPrompt(ctx, deps, id, change.id);
		else await writeSubscriptionPrompt(ctx, deps, existing.name, id, change.id, change.prompt);
	}

	if (input.status === "retired" && existing.kind === "ai") {
		await identity.archiveChildren(ctx.db, ctx.actor, id);
	}

	if (input.behaviour) {
		for (const entry of input.behaviour) {
			await deps.behaviour.patch(ctx.db, {
				id: entry.id,
				fields: entry.fields,
				createdByUserId: ctx.actor,
			});
		}
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
