/**
 * The layer's own composition for the action mechanism: wires
 * `@hyperidle/task`'s `createTaskActions`, `@hyperidle/thread`'s
 * `createThreadActions` and `@hyperidle/settings`'s `createPlatformActions`
 * deps to the real Services, and returns the ONE composed list every
 * projection (HTTP, MCP, UI) reads.
 */
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { appendChange, listChanges } from "@hyperidle/changes";
import type { HyperIdleDb, User, WriteExecutor } from "@hyperidle/db";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import type {
	ActionResult,
	AdjustThreadInput,
	AgentWorkIntentRecorderFn,
	DocumentRow,
	DocumentView,
	EditDocumentInput,
	HarnessDescriptor,
	OpenThreadInput,
	ReviewVerdictRecorderFn,
	SearchDocumentsInput,
	TaskView,
	ThreadView,
} from "@hyperidle/domain-model";
import { derivePrimaryHarness } from "@hyperidle/harness-capability";
import {
	createPlatformActions,
	markDetached,
	type PlatformActionsDeps,
	readServerConfig,
} from "@hyperidle/settings";
import { createTaskActions, type TaskActionsDeps } from "@hyperidle/task";
import { createThreadActions, type ThreadActionsDeps } from "@hyperidle/thread";
import {
	createUserActions,
	deleteSubscriptions,
	findUser,
	getSubscription,
	getTeam,
	insertSubscription,
	insertUserIfAbsent,
	listUsers,
	nextCronMatch,
	parseCron,
	requireRunnableAgent,
	setAgentsStatus,
	setSubscriptionsPaused,
	type UserActionsDeps,
} from "@hyperidle/user";
import type { HarnessCapabilityReader } from "../services/harness-capability-reader.js";
import { computeApprovalRate } from "../services/policy-bindings.js";
import {
	buildTaskRunResolverDeps,
	resolveAgentIdentityBody,
} from "../services/task-run-resolver-bindings.js";
import type { Action, ActionContext, SearchDocumentsRunFn } from "./action.js";

/**
 * The team-then-any-human ladder `send_message`'s no-target fallback needs —
 * first by `(createdAt, id)` so a team with two humans still resolves to
 * exactly one.
 */
async function soleHumanForAgent(exec: WriteExecutor, agentId: string): Promise<User | undefined> {
	const byCreated = (a: User, b: User): number =>
		a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);
	const agent = await findUser(exec, { id: agentId });
	if (agent?.teamId) {
		const teamHumans = await listUsers(exec, { kind: "human", teamIds: [agent.teamId] });
		if (teamHumans.length > 0) return [...teamHumans].sort(byCreated)[0];
	}
	const anyHumans = await listUsers(exec, { kind: "human" });
	return [...anyHumans].sort(byCreated)[0];
}

function buildThreadActionsDeps(
	bindings: {
		readonly agentOrchestration: AgentOrchestrationPort;
		readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
		readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
		readonly wsPush?: (topic: string, envelope: unknown) => void;
	},
	searchDocuments: SearchDocumentsRunFn,
): ThreadActionsDeps {
	return {
		changes: { appendChange },
		users: {
			getUserById: (exec, id) => findUser(exec, { id }),
			listByIds: (exec, ids) => listUsers(exec, { ids: [...ids] }),
			listByTeamIds: (exec, teamIds) => listUsers(exec, { teamIds: [...teamIds] }),
			listOwnedBy: (exec, ownerId) => listUsers(exec, { ownerUserId: ownerId }),
			soleHumanForAgent,
		},
		searchDocuments,
		org: { getTeam: (exec, q) => getTeam(exec, q) },
		settings: { readServerConfig: (db) => readServerConfig(db) },
		agents: {
			requireRunnableAgent: (db, agentId) => requireRunnableAgent(db, agentId),
			// §8.3: bound to searchDocuments now, never a direct table read — the
			// same runner, ctx and all, `ctx.agents.getAgentIdentity` used to reach
			// past a document-owned function for.
			getAgentIdentity: (ctx, agentId) => resolveAgentIdentityBody(ctx, agentId, searchDocuments),
		},
		agentWorkIntentRecorder: bindings.agentWorkIntentRecorder,
		reviewVerdictRecorder: bindings.reviewVerdictRecorder,
		linkReviewToSession: (sessionId, reviewMessageId) =>
			bindings.agentOrchestration.gate.linkReview(sessionId, reviewMessageId),
		...(bindings.wsPush ? { wsPush: bindings.wsPush } : {}),
	};
}

function buildTaskActionsDeps(
	agentOrchestration: AgentOrchestrationPort,
	adjustThread: (ctx: ActionContext, input: AdjustThreadInput) => Promise<ActionResult<ThreadView>>,
	openThread: (ctx: ActionContext, input: OpenThreadInput) => Promise<ActionResult<ThreadView>>,
	searchDocuments: SearchDocumentsRunFn,
): TaskActionsDeps {
	return {
		changes: { appendChange },
		agentOrchestration: {
			submitWorkIntent: async (input) => {
				await agentOrchestration.intents.submit(input);
			},
			stopRunsForTasks: (taskIds) => agentOrchestration.runs.stopForTasks(taskIds),
			endRunForHandoff: (sessionId, endedAt) =>
				agentOrchestration.runs.endForHandoff(sessionId, endedAt),
		},
		users: { getUserById: (exec, id) => findUser(exec, { id }) },
		searchDocuments,
		taskRunResolver: buildTaskRunResolverDeps(searchDocuments),
		adjustThread,
		openThread,
	};
}

/**
 * Runner lookup by declaration name, structurally typed — same shape both
 * `createActionsRouter`/`actionsAsTools` already loop over. Generic over both
 * the input and output type so every call site (`adjust_thread`/`open_thread`
 * sharing `ThreadView`, `open_task` returning `TaskView`) can be looked up
 * here through the one function.
 */
export function runnerFor<I, O>(
	actions: readonly Action[],
	name: string,
): (ctx: ActionContext, input: I) => Promise<ActionResult<O>> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`buildCoreActions: no "${name}" action in the composed list`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/**
 * §8.2's build-order break: `task`/`thread` need `search_documents` and
 * `document` needs `open_task`/`open_thread` — a real cycle if every bag were
 * built from concrete arrays. It isn't one, because this closes over a `let`
 * assigned once `document` is actually built (`buildCoreActions` below) and
 * only ever gets CALLED after `buildCoreActions` has returned — by then the
 * `let` is populated. @lore Do not "fix" this into eagerly resolving the
 * runner at build time; that reintroduces the cycle it exists to avoid.
 */
function lazySearchDocuments(getDocumentActions: () => readonly Action[]): SearchDocumentsRunFn {
	return (ctx, input) =>
		runnerFor<SearchDocumentsInput, DocumentRow[]>(getDocumentActions(), "search_documents")(
			ctx,
			input,
		);
}

/**
 * `document`'s `openParent` port (architecture.md §8.1) — existence of a
 * `task`/`thread` parent, plus that parent's team, asked of the module that
 * owns it via its own `open_task`/`open_thread` runner rather than a second
 * import. Only `task` carries a team on its own row (§0 A4); a `thread`
 * parent's existence is enough, so its arm never reads `teamId`.
 */
function buildOpenParent(
	taskActions: readonly Action[],
	threadActions: readonly Action[],
): DocumentActionsDeps["openParent"] {
	const openTask = runnerFor<{ readonly id: string }, TaskView>(taskActions, "open_task");
	const openThread = runnerFor<OpenThreadInput, ThreadView>(threadActions, "open_thread");
	return async (ctx, kind, id) => {
		if (kind === "task") {
			const result = await openTask(ctx, { id });
			return result.ok ? { exists: true, teamId: result.data.task.teamId } : { exists: false };
		}
		const result = await openThread(ctx, { id });
		return result.ok ? { exists: true } : { exists: false };
	};
}

/**
 * `document`'s `systemParentExists` port — existence of an `agent`/
 * `subscription` parent, asked only on the internal path (`ctx.internal`).
 * An agent is a `users` row (the same read `deps.users.getUserById` already
 * wraps); a subscription is `@hyperidle/user`'s own `getSubscription` — the
 * user module owns `subscriptions` too.
 *
 * @lore BC5 T7b: `routine` is gone — `DOCUMENT_PARENT_KINDS` no longer
 * names it, so this is exhaustive over `agent`/`subscription` now.
 */
const systemParentExists: DocumentActionsDeps["systemParentExists"] = async (exec, kind, id) => {
	if (kind === "agent") return (await findUser(exec, { id })) !== undefined;
	return (await getSubscription(exec, id)) !== undefined;
};

/**
 * `document`'s deps (architecture.md §8.1, §7). `wsPush` binds here — the
 * websocket nudge — the same optional pass-through `buildThreadActionsDeps`
 * already does; `createDocumentActions`'s own `pushChanges` no-ops when it is
 * absent (test compositions that don't need WS pushes).
 */
function buildDocumentActionsDeps(
	taskActions: readonly Action[],
	threadActions: readonly Action[],
	wsPush?: (topic: string, envelope: unknown) => void,
): DocumentActionsDeps {
	return {
		changes: { appendChange },
		users: {
			getUserById: (exec, id) => findUser(exec, { id }),
			listOwnedBy: (exec, ownerId) => listUsers(exec, { ownerUserId: ownerId }),
		},
		org: { getTeam: (exec, q) => getTeam(exec, q) },
		openParent: buildOpenParent(taskActions, threadActions),
		systemParentExists,
		// O1(b): bound to the settings package's contribution tracker — a
		// document's `body` changing detaches it from the plugin that seeded
		// it, the same event `routes/knowledge.ts:666` (pre-item) raised.
		onBodyChanged: (exec, documentId) =>
			markDetached(exec, { kind: "document", entityId: documentId, ts: new Date().toISOString() }),
		...(wsPush ? { wsPush } : {}),
	};
}

/**
 * `platform`'s deps: `editDocument`/`searchDocuments`
 * are extracted from the already-built `documentActions` through `runnerFor`
 * — no lazy binding needed here (unlike `document`'s own `searchDocuments`
 * closure), because `platform` is built AFTER `document`, never before.
 * Everything else outside `@hyperidle/settings`'s own three tables — an
 * agent is a `users` row, a subscription is a `subscriptions` row — is
 * bound to the real function, because `@hyperidle/settings` may not import
 * `@hyperidle/user`.
 *
 * @lore BC5 T7b: `routines` renamed `subscriptions` — the owner-side
 * `nextRunAt` computation (`insertRoutine`'s own `{parseCron, nextCronMatch}`
 * cron-ops idiom) moves here: a schedule subscription's `nextRunAt` is
 * computed at insert time the same way `user-actions.ts`'s own
 * `nextRunAtFor` does, since `@hyperidle/settings` may not import
 * `@hyperidle/user`'s cron helpers either.
 */
function buildPlatformActionsDeps(
	documentActions: readonly Action[],
	agentOrchestration: AgentOrchestrationPort,
	dirs: { readonly pluginsBaseDir?: string; readonly bundledPluginsDir?: string },
	adapterPool?: HarnessCapabilityReader,
): PlatformActionsDeps {
	return {
		runConfig: agentOrchestration.runConfig,
		...(adapterPool
			? { firstAvailableHarness: (db: HyperIdleDb) => firstAvailableHarness(db, adapterPool) }
			: {}),
		// @lore Own team, else the owner's: an owned agent has no team of its own
		// (a fresh install's only agent is one), and with its own team alone it
		// could never offer its person a team plugin. The same effective-team rule
		// `open_user` answers with; read here with two `findUser` lookups.
		teams: { exists: async (exec, teamId) => (await getTeam(exec, { id: teamId })) !== undefined },
		viewerTeamId: async (exec, actorId) => {
			const viewer = await findUser(exec, { id: actorId });
			if (!viewer) return null;
			if (viewer.teamId) return viewer.teamId;
			if (!viewer.ownerUserId) return null;
			return (await findUser(exec, { id: viewer.ownerUserId }))?.teamId ?? null;
		},
		agents: {
			insertIfAbsent: (exec, values) => insertUserIfAbsent(exec, values),
			setStatus: (exec, ids, status) => setAgentsStatus(exec, ids, status),
			list: (exec, ids) => listUsers(exec, { ids: [...ids] }),
		},
		subscriptions: {
			insert: async (exec, values, opts) => {
				const nextRunAt =
					values.schedule !== null
						? nextCronMatch(parseCron(values.schedule), new Date(values.createdAt)).toISOString()
						: null;
				await insertSubscription(
					exec,
					{
						id: values.id,
						userId: values.userId,
						event: values.event,
						schedule: values.schedule,
						paused: false,
						nextRunAt,
						createdAt: values.createdAt,
						updatedAt: values.createdAt,
					},
					opts,
				);
			},
			setLive: (exec, ids, live) =>
				setSubscriptionsPaused(exec, ids, !live, new Date().toISOString()),
			remove: (exec, ids) => deleteSubscriptions(exec, ids),
			get: async (exec, id) => {
				const row = await getSubscription(exec, id);
				return row ? { label: row.event ?? row.schedule ?? "" } : undefined;
			},
		},
		editDocument: runnerFor<EditDocumentInput, DocumentView>(documentActions, "edit_document"),
		searchDocuments: runnerFor<SearchDocumentsInput, DocumentRow[]>(
			documentActions,
			"search_documents",
		),
		...(dirs.pluginsBaseDir ? { pluginsBaseDir: dirs.pluginsBaseDir } : {}),
		...(dirs.bundledPluginsDir ? { bundledPluginsDir: dirs.bundledPluginsDir } : {}),
	};
}

/**
 * The harness a plugin's agents land on: the first one this machine can run
 * right now (discovery `ready`) that the person has not switched off — the
 * same first-ready choice the welcome screen preselects — as `edit_user`'s
 * run-config pick.
 */
async function firstAvailableHarness(
	db: HyperIdleDb,
	adapterPool: HarnessCapabilityReader,
): Promise<ReturnType<typeof derivePrimaryHarness> | null> {
	const { harnessDisabled } = await readServerConfig(db);
	const ready = adapterPool
		.describe()
		.find((d) => d.discovery.state === "ready" && !harnessDisabled.includes(d.type));
	return ready ? derivePrimaryHarness(ready) : null;
}

/**
 * One audited cast: `HarnessCapabilityDescriptor` (the real pool's own type)
 * and `HarnessDescriptor` (`user-actions.ts`'s zod-mirrored dep shape, which
 * `@hyperidle/user` may not import `@hyperidle/harness-capability` to name
 * directly) differ only in array mutability, never in the values themselves.
 */
function toHarnessDescriptors(
	descriptors: readonly import("@hyperidle/harness-capability").HarnessCapabilityDescriptor[],
): readonly HarnessDescriptor[] {
	const widened: unknown = descriptors;
	return widened as readonly HarnessDescriptor[];
}

/**
 * `user`'s deps: `runConfig`/`folders`/`connections`
 * come straight off `AgentOrchestrationPort` (the same port `runConfig`
 * already reaches through) — `@hyperidle/user` hand-types structural mirrors
 * of these three sub-ports rather than importing `@hyperidle/api-contract`
 * itself (governance: "a service talks through its own layer"), and this
 * assignment is where that mirror meets the real thing.
 * `editDocument`/`searchDocuments` are extracted from the already-built
 * `documentActions`, exactly like `platform`'s own deps above;
 * `readServerConfig` binds to `@hyperidle/settings`'s own typed
 * function, because `@hyperidle/user` may not import that sibling Service
 * either. `harnesses` is absent when no adapter pool is wired (a
 * composition without agent execution) — `open_user`'s `runsOn` then answers
 * `[]`, the same "no pool" shape `routes/harnesses.ts` itself never mounts
 * under.
 */
function buildUserActionsDeps(
	documentActions: readonly Action[],
	agentOrchestration: AgentOrchestrationPort,
	adapterPool?: HarnessCapabilityReader,
	onHarnessRedetect?: () => Promise<void>,
): UserActionsDeps {
	return {
		changes: {
			appendChange,
			listByIds: (db, ids) => listChanges(db, { ids }),
		},
		runConfig: agentOrchestration.runConfig,
		folders: agentOrchestration.folders,
		connections: agentOrchestration.connections,
		...(adapterPool
			? {
					harnesses: {
						describe: () => toHarnessDescriptors(adapterPool.describe()),
						redetect: async () => {
							await Promise.all([adapterPool.refresh(), onHarnessRedetect?.()]);
						},
					},
				}
			: {}),
		readServerConfig: (db) => readServerConfig(db),
		// @lore BC5 T11: restored from the deleted `agent-profile.ts` route —
		// same `computeApprovalRate` call, same 30-day window, same 10-verdict cap.
		reviewTrackRecord: async (db, agentId) => {
			const result = await computeApprovalRate(db, agentId, 30, 10);
			return {
				approvalRate: result.approvalRate,
				totalVerdicts: result.totalVerdicts,
				recentVerdicts: result.recentVerdicts.map((v) => ({
					decision: v.decision,
					threadId: v.threadId,
					createdAt: v.createdAt,
				})),
				windowDays: 30,
			};
		},
		editDocument: runnerFor<EditDocumentInput, DocumentView>(documentActions, "edit_document"),
		searchDocuments: runnerFor<SearchDocumentsInput, DocumentRow[]>(
			documentActions,
			"search_documents",
		),
	};
}

/**
 * `buildCoreActions` — the composed `readonly Action[]` every loop (HTTP
 * router, MCP tool adapter, the UI's `call()`, the governance rule) reads.
 *
 * Thread actions are built FIRST — the task bag needs `adjust_thread`'s
 * runner and the thread bag needs nothing from task (`ThreadActionsDeps`
 * names no task). `document` is built next — it needs `open_task`/
 * `open_thread`, both already real arrays by then (architecture.md §8.2).
 * `platform` is built fourth, after `document` — it needs `edit_document`/
 * `search_documents`, already real by then. `user` is built FIFTH, after
 * `platform` — it needs the same two document runners,
 * already real by then too. The returned array's own order is irrelevant.
 */
export function buildCoreActions(bindings: {
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
	readonly wsPush?: (topic: string, envelope: unknown) => void;
	readonly pluginsBaseDir?: string;
	readonly bundledPluginsDir?: string;
	readonly adapterPool?: HarnessCapabilityReader;
	readonly onHarnessRedetect?: () => Promise<void>;
}): readonly Action[] {
	let documentActions: readonly Action[] = [];
	const searchDocuments = lazySearchDocuments(() => documentActions);
	const threadActions = createThreadActions(
		buildThreadActionsDeps(bindings, searchDocuments),
	) as readonly Action[];
	const adjustThread = runnerFor<AdjustThreadInput, ThreadView>(threadActions, "adjust_thread");
	const openThread = runnerFor<OpenThreadInput, ThreadView>(threadActions, "open_thread");
	const taskActions = createTaskActions(
		buildTaskActionsDeps(bindings.agentOrchestration, adjustThread, openThread, searchDocuments),
	) as readonly Action[];
	documentActions = createDocumentActions(
		buildDocumentActionsDeps(taskActions, threadActions, bindings.wsPush),
	) as readonly Action[];
	const platformActions = createPlatformActions(
		buildPlatformActionsDeps(
			documentActions,
			bindings.agentOrchestration,
			bindings,
			bindings.adapterPool,
		),
	) as readonly Action[];
	const userActions = createUserActions(
		buildUserActionsDeps(
			documentActions,
			bindings.agentOrchestration,
			bindings.adapterPool,
			bindings.onHarnessRedetect,
		),
	) as readonly Action[];
	return [...taskActions, ...threadActions, ...documentActions, ...platformActions, ...userActions];
}

/**
 * A minimal, standalone document action list — never `buildCoreActions`'s
 * composed HTTP/MCP list — for the composition roots that need
 * `search_documents`/`edit_document` before or outside that list exists:
 * the pre-auth first-run setup route (`routes/users.ts`, called before any
 * request has reached `createCoreApiApp`). `openParent` is honestly
 * unreachable here: it fires only from `edit_document` when the caller's
 * `parent.kind` is `"task"`/`"thread"`, and this caller never parents a
 * document that way (an agent identity document is agent-parented). Throws
 * rather than fabricating a result if that invariant is ever broken.
 */
function buildStandaloneDocumentActions(): readonly Action[] {
	return createDocumentActions({
		changes: { appendChange },
		users: {
			getUserById: (exec, id) => findUser(exec, { id }),
			listOwnedBy: (exec, ownerId) => listUsers(exec, { ownerUserId: ownerId }),
		},
		org: { getTeam: (exec, q) => getTeam(exec, q) },
		openParent: () => {
			throw new Error(
				"buildStandaloneDocumentActions: openParent is unreachable — this composition never parents a document to a task or thread",
			);
		},
		systemParentExists,
		onBodyChanged: (exec, documentId) =>
			markDetached(exec, { kind: "document", entityId: documentId, ts: new Date().toISOString() }),
	}) as readonly Action[];
}

/**
 * `search_documents` and `edit_document`, standalone (see
 * `buildStandaloneDocumentActions` above) — `routes/users.ts`'s pre-auth
 * setup route feeds both into `createAgentIdentityPort`.
 */
export function buildStandaloneDocumentRunners(): {
	readonly searchDocuments: SearchDocumentsRunFn;
	readonly editDocument: (
		ctx: ActionContext,
		input: EditDocumentInput,
	) => Promise<ActionResult<DocumentView>>;
} {
	const documentActions = buildStandaloneDocumentActions();
	return {
		searchDocuments: runnerFor<SearchDocumentsInput, DocumentRow[]>(
			documentActions,
			"search_documents",
		),
		editDocument: runnerFor<EditDocumentInput, DocumentView>(documentActions, "edit_document"),
	};
}

/**
 * `search_documents` alone, standalone — `tools/eval`'s scenario runners
 * (never edit a document) only ever need this one
 * runner.
 */
export function createStandaloneSearchDocuments(): SearchDocumentsRunFn {
	return buildStandaloneDocumentRunners().searchDocuments;
}
