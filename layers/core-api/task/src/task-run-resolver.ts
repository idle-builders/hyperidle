import type { HyperIdleDb, Task, Team, User } from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedContextBundle,
	DoneWhenLine,
	Reason,
	SessionDocumentLike,
} from "@hyperidle/domain-model";
import {
	bakeAgentRunnableConfig,
	DoneWhenLineSchema,
	ReasonSchema,
	toBakedContextDocuments,
} from "@hyperidle/domain-model";
import * as work from "./task-service.js";
import { taskDispatchAttemptStore } from "./task-service.js";

function parseDoneWhen(json: string): readonly DoneWhenLine[] {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item) => {
			const r = DoneWhenLineSchema.safeParse(item);
			return r.success ? [r.data] : [];
		});
	} catch {
		return [];
	}
}

function parseReasons(json: string): readonly Reason[] {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item) => {
			const r = ReasonSchema.safeParse(item);
			return r.success ? [r.data] : [];
		});
	} catch {
		return [];
	}
}

export interface TaskRunResolverDeps {
	/** The agent with its one team — `null` only for a factory-wide agent. */
	requireRunnableAgent(
		db: HyperIdleDb,
		agentId: string,
	): Promise<User & { readonly teamId: string | null }>;
	/** Required — a required port turns missing wiring into a compile error. */
	getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null>;
	getTeamById?(db: HyperIdleDb, id: string): Promise<Team | undefined>;
	assembleSessionDocuments?(
		db: HyperIdleDb,
		input: {
			readonly teamId: string;
			readonly taskDescription: string;
			readonly agentId: string;
			readonly agentDiscipline?: string | null;
		},
	): Promise<readonly SessionDocumentLike[]>;
}

/** The baked `task_run` request shape, matching `resolveIntentInputInternal`'s current return. */
export interface BakedTaskRunRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "task";
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId: string;
	readonly teamId: string;
	readonly sourceCorrelation: {
		readonly taskId: string;
		readonly teamId: string;
	};
	readonly contextBundle?: BakedContextBundle;
	/** Runnable-config snapshot baked from the same validated agent row — always present. */
	readonly agentConfig: BakedAgentRunnableConfig;
	// @lore: callingThreadId — NOT NULL column; one read, never resolve-or-create; always present
	readonly callingThreadId: string;
}

/** Bake the context bundle for a `task_run` session. Returns `undefined` (never throws) if the team can't be resolved. */
export async function bakeTaskContextBundle(
	db: HyperIdleDb,
	task: Task,
	ancestors: readonly Task[],
	agent: User,
	getTeamById: NonNullable<TaskRunResolverDeps["getTeamById"]>,
	assembleSessionDocuments: NonNullable<TaskRunResolverDeps["assembleSessionDocuments"]>,
): Promise<BakedContextBundle | undefined> {
	const team = await getTeamById(db, task.teamId);
	if (!team) return undefined;
	const knowledge = await assembleSessionDocuments(db, {
		teamId: task.teamId,
		taskDescription: task.description ?? task.title,
		agentId: agent.id,
		agentDiscipline: agent.discipline,
	});
	return {
		kind: "task",
		task: {
			id: task.id,
			title: task.title,
			description: task.description,
			state: task.state,
			doneWhen: parseDoneWhen(task.doneWhen),
			reasons: parseReasons(task.reasons),
		},
		// Root-first, so the agent reads the goal chain top-down.
		ancestors: ancestors.map((a) => ({
			id: a.id,
			title: a.title,
			description: a.description,
			doneWhen: parseDoneWhen(a.doneWhen),
		})),
		agent: { id: agent.id, name: agent.name, role: agent.role },
		team: { id: team.id, name: team.name },
		documents: toBakedContextDocuments(knowledge),
	};
}

/** Task states an agent-work dispatch attempt is eligible to launch against. */
const AGENT_WORK_ELIGIBLE_TASK_STATES: ReadonlySet<string> = new Set([
	"ready",
	"accepted",
	"in_progress",
]);

/** Discriminated input for the resolver — one real kind today (`task_run`). */
export type ResolveInput = { readonly kind: "task_run"; readonly attemptId: string };

/**
 * Resolve + validate a `task_run` at emit time: load the dispatch attempt
 * (rejecting if missing or no longer `"requested"`), load its task (rejecting
 * if missing / not agent-work-eligible / reassigned), validate runnability,
 * bake the full request including contextBundle.
 */
export async function resolveTaskRunRequest(
	db: HyperIdleDb,
	input: ResolveInput,
	deps: TaskRunResolverDeps,
): Promise<BakedTaskRunRequest> {
	const attempt = await taskDispatchAttemptStore.get(db, input.attemptId);
	if (attempt?.status !== "requested") {
		throw new Error("Task dispatch attempt is unavailable");
	}
	const task = await work.get(db, "task", attempt.taskId);
	if (!(task && AGENT_WORK_ELIGIBLE_TASK_STATES.has(task.state))) {
		throw new Error("Task is not eligible for agent work");
	}
	if (task.ownerAgentId && task.ownerAgentId !== attempt.agentId) {
		throw new Error("Task owner changed after intent creation");
	}
	const agent = await deps.requireRunnableAgent(db, attempt.agentId);
	// The agent's identity is a document bound to it; baked so the
	// provisioner never touches documents.
	const agentPersona = await deps.getAgentIdentity(db, agent.id);

	// Bake the contextBundle only when both context deps are supplied —
	// destructured into locals so TS keeps them narrowed non-optional inside
	// the block below, no non-null assertion needed.
	let contextBundle: BakedContextBundle | undefined;
	const { getTeamById, assembleSessionDocuments } = deps;
	if (getTeamById && assembleSessionDocuments) {
		// `listAncestorIds` returns nearest-first; the bundle wants root-first.
		const ancestorIds = await work.listAncestorIds(db, task.id);
		const ancestorRows =
			ancestorIds.length > 0 ? await work.list(db, "task", { ids: ancestorIds }) : [];
		const byId = new Map(ancestorRows.map((a) => [a.id, a]));
		const ancestors = [...ancestorIds]
			.reverse()
			.map((id) => byId.get(id))
			.filter((a): a is Task => a !== undefined);
		contextBundle = await bakeTaskContextBundle(
			db,
			task,
			ancestors,
			agent,
			getTeamById,
			assembleSessionDocuments,
		);
	}
	return {
		defaultAgentId: attempt.agentId,
		sourceKind: "task",
		sourceId: task.id,
		streamId: `task:${task.id}`,
		taskId: task.id,
		teamId: task.teamId,
		sourceCorrelation: { taskId: task.id, teamId: task.teamId },
		agentConfig: bakeAgentRunnableConfig(agent, agentPersona),
		callingThreadId: task.threadId,
		...(contextBundle ? { contextBundle } : {}),
	};
}
