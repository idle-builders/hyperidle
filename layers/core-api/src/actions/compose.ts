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
	EditTaskInput,
	HarnessDescriptor,
	OpenThreadInput,
	ReviewVerdictRecorderFn,
	SearchDocumentsInput,
	TaskView,
	ThreadView,
} from "@hyperidle/domain-model";
import { derivePrimaryHarness } from "@hyperidle/harness-capability";
import { createPlatformActions, markDetached, type PlatformActionsDeps } from "@hyperidle/settings";
import { createTaskActions, type TaskActionsDeps } from "@hyperidle/task";
import { createThreadActions, listMessages, type ThreadActionsDeps } from "@hyperidle/thread";
import {
	createUserActions,
	deleteSubscriptions,
	findUser,
	getSubscription,
	getTeam,
	insertSubscription,
	insertUserIfAbsent,
	listSubscriptions,
	listUsers,
	nextCronMatch,
	parseCron,
	requireRunnableAgent,
	setAgentsStatus,
	setSubscriptionsPaused,
	type UserActionsDeps,
	updateSubscription,
	updateUser,
} from "@hyperidle/user";
import type { HarnessCapabilityReader } from "../services/harness-capability-reader.js";
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
	if (agent && agent.teamIds.length > 0) {
		const teamHumans = await listUsers(exec, { kind: "human", teamIds: [...agent.teamIds] });
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
	moveTaskToReview: (taskId: string, ctx: ActionContext) => Promise<void>,
): ThreadActionsDeps {
	return {
		changes: { appendChange },
		users: {
			getUserById: (exec, id) => findUser(exec, { id }),
			listByIds: (exec, ids) => listUsers(exec, { ids: [...ids] }),
			listEveryone: (exec) => listUsers(exec),
			soleHumanForAgent,
		},
		searchDocuments,
		org: { getTeam: (exec, q) => getTeam(exec, q) },
		agents: {
			requireRunnableAgent: (db, agentId) => requireRunnableAgent(db, agentId),
			// bound to searchDocuments; never a direct table read
			getAgentIdentity: (ctx, agentId) => resolveAgentIdentityBody(ctx, agentId, searchDocuments),
		},
		agentWorkIntentRecorder: bindings.agentWorkIntentRecorder,
		reviewVerdictRecorder: bindings.reviewVerdictRecorder,
		linkReviewToSession: (sessionId, reviewMessageId) =>
			bindings.agentOrchestration.gate.linkReview(sessionId, reviewMessageId),
		moveTaskToReview,
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
		listAsksForThreads: (db, threadIds) => {
			if (threadIds.length === 0) return Promise.resolve([]);
			return listMessages(db, {
				threadIds: [...threadIds],
				types: ["review", "questionnaire"],
			});
		},
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

// @lore: lazy to break build-order cycle (task/thread need search_documents, document needs open_task/open_thread) — do NOT eagerly resolve at build time
function lazySearchDocuments(getDocumentActions: () => readonly Action[]): SearchDocumentsRunFn {
	return (ctx, input) =>
		runnerFor<SearchDocumentsInput, DocumentRow[]>(getDocumentActions(), "search_documents")(
			ctx,
			input,
		);
}

// @lore: lazy to break build-order cycle (task is built after thread, but a review card must move its task to review state) — do NOT eagerly resolve at build time
function lazyMoveTaskToReview(
	getTaskActions: () => readonly Action[],
): (taskId: string, ctx: ActionContext) => Promise<void> {
	return async (taskId, ctx) => {
		const editTask = runnerFor<EditTaskInput, TaskView>(getTaskActions(), "edit_task");
		await editTask({ ...ctx, internal: true }, { id: taskId, state: "review" });
		// non-ok silently ignored: task may already be in a terminal state
	};
}

// document's openParent port — existence of a task/thread parent; task arm also reads teamId, thread arm does not.
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

// document's systemParentExists port — existence of an agent/subscription parent, checked on the internal path only.
const systemParentExists: DocumentActionsDeps["systemParentExists"] = async (exec, kind, id) => {
	if (kind === "agent") return (await findUser(exec, { id })) !== undefined;
	return (await getSubscription(exec, id)) !== undefined;
};

// document's followersOf port — who follows one document, read from the user module's subscriptions.
const followersOf: DocumentActionsDeps["followersOf"] = async (exec, documentId) =>
	(await listSubscriptions(exec, { objectId: documentId })).map((s) => s.userId);

// document's deps. wsPush is optional — absent in test compositions that don't need WS pushes.
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
		followersOf,
		// bound to the settings package's contribution tracker — a
		// document's `body` changing detaches it from the plugin that seeded it.
		onBodyChanged: (exec, documentId, actor) =>
			markDetached(exec, {
				kind: "document",
				entityId: documentId,
				ts: new Date().toISOString(),
				by: actor,
			}),
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
		teams: { exists: async (exec, teamId) => (await getTeam(exec, { id: teamId })) !== undefined },
		viewerTeamIds: async (exec, actorId) => (await findUser(exec, { id: actorId }))?.teamIds ?? [],
		agents: {
			insertIfAbsent: (exec, values, teamId) => insertUserIfAbsent(exec, values, teamId),
			setStatus: (exec, ids, status) => setAgentsStatus(exec, ids, status),
			list: (exec, ids) => listUsers(exec, { ids: [...ids] }),
			restore: (exec, id, values) => updateUser(exec as HyperIdleDb, id, values),
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
				return row ? { label: row.event ?? row.schedule ?? "", userId: row.userId } : undefined;
			},
			restore: (exec, id, values) => {
				const now = new Date();
				return updateSubscription(exec as HyperIdleDb, id, {
					...values,
					nextRunAt:
						values.schedule === null
							? null
							: nextCronMatch(parseCron(values.schedule), now).toISOString(),
					updatedAt: now.toISOString(),
				});
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
 * The harness a plugin's agents land on: the first ready one on this machine.
 */
function firstAvailableHarness(
	_db: HyperIdleDb,
	adapterPool: HarnessCapabilityReader,
): Promise<ReturnType<typeof derivePrimaryHarness> | null> {
	const ready = adapterPool.describe().find((d) => d.discovery.state === "ready");
	return Promise.resolve(ready ? derivePrimaryHarness(ready) : null);
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
 * `documentActions`, exactly like `platform`'s own deps above.
 * `harnesses` is absent when no adapter pool is wired (a
 * composition without agent execution) — `open_user`'s `runsOn` then answers
 * `[]` (no pool).
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
		editDocument: runnerFor<EditDocumentInput, DocumentView>(documentActions, "edit_document"),
		searchDocuments: runnerFor<SearchDocumentsInput, DocumentRow[]>(
			documentActions,
			"search_documents",
		),
		onPluginPartEdited: (exec, kind, entityId, actor, at) =>
			markDetached(exec, { kind, entityId, ts: at, by: actor }),
	};
}

/**
 * `buildCoreActions` — the composed `readonly Action[]` every loop (HTTP
 * router, MCP tool adapter, the UI's `call()`, the governance rule) reads.
 *
 * Thread actions are built FIRST — the task bag needs `adjust_thread`'s
 * runner and the thread bag needs nothing from task (`ThreadActionsDeps`
 * names no task). `document` is built next — it needs `open_task`/
 * `open_thread`, both already real arrays by then.
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
	let taskActionsForThread: readonly Action[] = [];
	const searchDocuments = lazySearchDocuments(() => documentActions);
	const moveTaskToReview = lazyMoveTaskToReview(() => taskActionsForThread);
	const threadActions = createThreadActions(
		buildThreadActionsDeps(bindings, searchDocuments, moveTaskToReview),
	) as readonly Action[];
	const adjustThread = runnerFor<AdjustThreadInput, ThreadView>(threadActions, "adjust_thread");
	const openThread = runnerFor<OpenThreadInput, ThreadView>(threadActions, "open_thread");
	const taskActions = createTaskActions(
		buildTaskActionsDeps(bindings.agentOrchestration, adjustThread, openThread, searchDocuments),
	) as readonly Action[];
	taskActionsForThread = taskActions;
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
 * composed HTTP/MCP list — for the callers that need
 * `search_documents`/`edit_document` outside that list (the eval tools).
 * `openParent` is honestly
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
		followersOf,
		onBodyChanged: (exec, documentId, actor) =>
			markDetached(exec, {
				kind: "document",
				entityId: documentId,
				ts: new Date().toISOString(),
				by: actor,
			}),
	}) as readonly Action[];
}

/**
 * `search_documents` and `edit_document`, standalone (see
 * `buildStandaloneDocumentActions` above).
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
