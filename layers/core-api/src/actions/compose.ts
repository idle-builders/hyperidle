/**
 * The layer's own composition for the action mechanism: wires
 * `@hyperidle/task`'s `createTaskActions`, `@hyperidle/thread`'s
 * `createThreadActions` and `@hyperidle/settings`'s `createPlatformActions`
 * deps to the real Services, and returns the ONE composed list every
 * projection (HTTP, MCP, UI) reads.
 */
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { appendChange } from "@hyperidle/changes";
import type { User, WriteExecutor } from "@hyperidle/db";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import type {
	ActionResult,
	AdjustThreadInput,
	AgentWorkIntentRecorderFn,
	DocumentRow,
	DocumentView,
	EditDocumentInput,
	OpenThreadInput,
	ReviewVerdictRecorderFn,
	SearchDocumentsInput,
	TaskView,
	ThreadView,
} from "@hyperidle/domain-model";
import { getRoutine, insertRoutine, setRoutinesLive, softDeleteRoutines } from "@hyperidle/routine";
import {
	createPlatformActions,
	markDetached,
	type PlatformActionsDeps,
	readServerConfig,
} from "@hyperidle/settings";
import { createTaskActions, type TaskActionsDeps } from "@hyperidle/task";
import { createThreadActions, type ThreadActionsDeps } from "@hyperidle/thread";
import {
	findUser,
	getTeam,
	insertUserIfAbsent,
	listUsers,
	nextCronMatch,
	parseCron,
	requireRunnableAgent,
	setAgentsStatus,
} from "@hyperidle/user";
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
		org: { getTeam: (exec, q) => getTeam(exec, q) },
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
 * `document`'s `systemParentExists` port — existence of an `agent`/`routine`
 * parent, asked only on the internal path (`ctx.internal`). An agent is a
 * `users` row (the same read `deps.users.getUserById` already wraps); a
 * routine is `@hyperidle/routine`'s own `getRoutine`, already imported by
 * this layer's `routines-routes.ts`.
 */
const systemParentExists: DocumentActionsDeps["systemParentExists"] = async (exec, kind, id) => {
	if (kind === "agent") return (await findUser(exec, { id })) !== undefined;
	return (await getRoutine(exec, id)) !== undefined;
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
 * agent is a `users` row, a routine is a `routines` row — is bound to the
 * real function, because `@hyperidle/settings` may not import
 * `@hyperidle/user`/`@hyperidle/routine`.
 */
function buildPlatformActionsDeps(
	documentActions: readonly Action[],
	pluginsBaseDir?: string,
): PlatformActionsDeps {
	return {
		agents: {
			insertIfAbsent: (exec, values) => insertUserIfAbsent(exec, values),
			setStatus: (exec, ids, status) => setAgentsStatus(exec, ids, status),
			list: (exec, ids) => listUsers(exec, { ids: [...ids] }),
		},
		routines: {
			insert: (exec, values, opts) =>
				insertRoutine(exec, values, { parseCron, nextCronMatch }, opts),
			setLive: (exec, ids, live) => setRoutinesLive(exec, ids, live),
			softDelete: (exec, ids) => softDeleteRoutines(exec, ids),
			get: (exec, id) => getRoutine(exec, id),
		},
		editDocument: runnerFor<EditDocumentInput, DocumentView>(documentActions, "edit_document"),
		searchDocuments: runnerFor<SearchDocumentsInput, DocumentRow[]>(
			documentActions,
			"search_documents",
		),
		...(pluginsBaseDir ? { pluginsBaseDir } : {}),
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
 * `platform` is built LAST, a fourth group after `document` — it needs
 * `edit_document`/`search_documents`, already real by then. The returned
 * array's own order is irrelevant.
 */
export function buildCoreActions(bindings: {
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
	readonly wsPush?: (topic: string, envelope: unknown) => void;
	readonly pluginsBaseDir?: string;
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
		buildPlatformActionsDeps(documentActions, bindings.pluginsBaseDir),
	) as readonly Action[];
	return [...taskActions, ...threadActions, ...documentActions, ...platformActions];
}

/**
 * A minimal, standalone document action list — never `buildCoreActions`'s
 * composed HTTP/MCP list — for the composition roots that need
 * `search_documents`/`edit_document` before or outside that list exists:
 * the pre-auth first-run setup route (`routes/users.ts`, called before any
 * request has reached `createCoreApiApp`) and the routine scheduler
 * (`service-bootstrap.ts`'s `registerAgentLayerServices`, wired from
 * `db`/`eventBus` alone — no task/thread action bags in scope at its own
 * composition root, so it cannot receive the real composed list's runner
 * the way `taskRunResolver`/`routine-scheduler-bindings.ts`'s OTHER two
 * ports do). `openParent` is honestly unreachable here: it fires only from
 * `edit_document` when the caller's `parent.kind` is `"task"`/`"thread"`,
 * and neither caller ever parents a document that way (an agent identity
 * document is agent-parented; the scheduler only ever searches, never
 * edits). Throws rather than fabricating a result if that invariant is
 * ever broken.
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
 * `search_documents` alone, standalone — `service-bootstrap.ts`'s routine
 * scheduler wiring and its `tools/eval`/`dispatch-test-helpers.ts` direct
 * `fireRoutine` callers (architecture.md §8.3: neither ever edits a
 * document) only ever need this one runner.
 */
export function createStandaloneSearchDocuments(): SearchDocumentsRunFn {
	return buildStandaloneDocumentRunners().searchDocuments;
}
