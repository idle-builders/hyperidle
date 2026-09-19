/**
 * The layer's own composition for the action mechanism: wires
 * `@hyperidle/task`'s `createTaskActions` and `@hyperidle/thread`'s
 * `createThreadActions` deps to the real Services, and returns the ONE
 * composed list every projection (HTTP, MCP, UI) reads.
 */
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { appendChange } from "@hyperidle/changes";
import type { User, WriteExecutor } from "@hyperidle/db";
import type {
	ActionResult,
	AdjustThreadInput,
	AgentWorkIntentRecorderFn,
	OpenThreadInput,
	ReviewVerdictRecorderFn,
	ThreadView,
} from "@hyperidle/domain-model";
import {
	getAgentIdentity,
	get as getKnowledgeItem,
	listItemIdsByParent,
} from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { readServerConfig } from "@hyperidle/settings";
import { createTaskActions, type TaskActionsDeps } from "@hyperidle/task";
import { createThreadActions, type ThreadActionsDeps } from "@hyperidle/thread";
import { findUser, listUsers, requireRunnableAgent } from "@hyperidle/users";
import { taskRunResolverDeps } from "../services/task-run-resolver-bindings.js";
import type { Action, ActionContext } from "./action.js";

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

function buildThreadActionsDeps(bindings: {
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
	readonly wsPush?: (topic: string, envelope: unknown) => void;
}): ThreadActionsDeps {
	return {
		changes: { appendChange },
		users: {
			getUserById: (exec, id) => findUser(exec, { id }),
			listByIds: (exec, ids) => listUsers(exec, { ids: [...ids] }),
			listByTeamIds: (exec, teamIds) => listUsers(exec, { teamIds: [...teamIds] }),
			soleHumanForAgent,
		},
		knowledge: {
			getItemById: async (exec, id) => {
				const item = await getKnowledgeItem(exec, id);
				return item ? { id: item.id, title: item.title } : null;
			},
			findParent: async (exec, id) => {
				const item = await getKnowledgeItem(exec, id);
				return item?.parentKind && item.parentId
					? { parentKind: item.parentKind, parentId: item.parentId }
					: undefined;
			},
		},
		org: { getTeam: (exec, q) => getTeam(exec, q) },
		settings: { readServerConfig: (db) => readServerConfig(db) },
		agents: {
			requireRunnableAgent: (db, agentId) => requireRunnableAgent(db, agentId),
			getAgentIdentity: (db, agentId) => getAgentIdentity(db, agentId),
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
		knowledge: {
			listItemIdsByParent: (db, q) => listItemIdsByParent(db, q),
			getItemById: async (exec, id) => {
				const item = await getKnowledgeItem(exec, id);
				return item ? { id: item.id } : null;
			},
		},
		taskRunResolver: taskRunResolverDeps,
		adjustThread,
		openThread,
	};
}

/**
 * Runner lookup by declaration name, structurally typed — same shape both
 * `createActionsRouter`/`actionsAsTools` already loop over. Generic over the
 * input type so both `adjust_thread` (`AdjustThreadInput`) and `open_thread`
 * (`OpenThreadInput`) can be looked up here — both share the `ThreadView`
 * output.
 */
function runnerFor<I>(
	actions: readonly Action[],
	name: string,
): (ctx: ActionContext, input: I) => Promise<ActionResult<ThreadView>> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`buildCoreActions: no "${name}" action in the thread bag`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<ThreadView>>;
}

/**
 * `buildCoreActions` — the composed `readonly Action[]` every loop (HTTP
 * router, MCP tool adapter, the UI's `call()`, the governance rule) reads.
 *
 * Thread actions are built FIRST — the task bag needs `adjust_thread`'s
 * runner and the thread bag needs nothing from task (`ThreadActionsDeps`
 * names no task). The dependency is one-way, so build order alone settles
 * it; the returned array's own order is irrelevant.
 */
export function buildCoreActions(bindings: {
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
	readonly wsPush?: (topic: string, envelope: unknown) => void;
}): readonly Action[] {
	const threadActions = createThreadActions(buildThreadActionsDeps(bindings)) as readonly Action[];
	const adjustThread = runnerFor<AdjustThreadInput>(threadActions, "adjust_thread");
	const openThread = runnerFor<OpenThreadInput>(threadActions, "open_thread");
	const taskActions = createTaskActions(
		buildTaskActionsDeps(bindings.agentOrchestration, adjustThread, openThread),
	) as readonly Action[];
	return [...taskActions, ...threadActions];
}
