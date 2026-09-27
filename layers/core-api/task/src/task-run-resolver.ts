/**
 * Placement ruling — the `task_run` emit-time resolver,
 * paired with its three real emit sites: `task-state-machine.ts`,
 * `bet-decomposition.ts` (same package, plain import) and
 * `layers/core-api/policy/src/handoff-protocol.ts` (a sibling package,
 * injected via `PolicyDeps` at the `policy-bindings.ts` composition root).
 * Does exactly what `resolveIntentInputInternal`'s "task_run" case does today
 * (`session-requests/src/service.ts:753-773`), reading only `work`'s own
 * tables (`taskDispatchAttempts`, `tasks`, `bets`) plus the shared
 * ast-`<userId>` runnability invariant.
 *
 * @lore Mechanism C: `requireRunnableAgent` (`@hyperidle/user`) is injected,
 * not statically imported — same shape as `assistant-turn-resolver.ts`'s
 * `AssistantTurnResolverDeps`. Return type widened to `Promise<User>` in
 * Increment 12 Wave B (was deliberately `Promise<unknown>` through Increment
 * 3-11 since this resolver only awaited the call for its throw-on-unrunnable
 * side effect) — the contextBundle bake below reuses `agent.name`/`agent.role`
 * from this SAME already-validated row (the H2/Increment 11 precedent:
 * `assistant-turn-resolver.ts`'s `agent.modelId`/`agent.modelProvider` reuse),
 * never a second read.
 */

import type { HyperIdleDb, Task, Team, User } from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedContextBundle,
	SessionDocumentLike,
} from "@hyperidle/domain-model";
import { bakeAgentRunnableConfig, toBakedContextDocuments } from "@hyperidle/domain-model";
import * as work from "./task-service.js";
import { taskDispatchAttemptStore } from "./task-service.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface TaskRunResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * The agent's identity document body, baked onto the request so the
	 * provisioner never reads `documents` — that table belongs to the
	 * document service. Injected (Mechanism C).
	 */
	/**
	 * The agent's identity document, baked onto the request.
	 *
	 * Required, not optional: while it was optional, two of the call sites that
	 * bake an assistant turn simply never wired it, compiled clean, and baked no
	 * identity at all. A required port turns that into a compile error.
	 */
	getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null>;
	/**
	 * Optional: `@hyperidle/user`'s
	 * `getTeam`, injected (Mechanism C — `@hyperidle/work`'s `package.json`
	 * depends only on `@hyperidle/db` + framework packages, never
	 * `@hyperidle/user`). Absent at a call site not yet wired to bake context
	 * (composition-root wiring is a later wave) — the resolver falls back to
	 * baking no `contextBundle` rather than throwing, matching every existing
	 * caller's current (context-free) behavior unchanged.
	 */
	getTeamById?(db: HyperIdleDb, id: string): Promise<Team | undefined>;
	/**
	 * Optional: `@hyperidle/document`'s
	 * `assembleSessionDocuments` (Wave A), injected for the same Mechanism C
	 * reason as `getTeamById` above.
	 */
	assembleSessionDocuments?(
		db: HyperIdleDb,
		input: {
			readonly teamId: string;
			readonly taskDescription: string;
			readonly agentId: string;
		},
	): Promise<readonly SessionDocumentLike[]>;
	/**
	 * Optional: `@hyperidle/settings`'s
	 * `readServerConfig`, injected (Mechanism C — `@hyperidle/work` cannot
	 * import `@hyperidle/settings` directly) for the `harnessDisabled` bake.
	 * Absent at a call site not yet wired — the resolver bakes no
	 * `harnessDisabled` (matching `admitSession`'s own "absent defaults to
	 * nothing disabled" degrade), never a live read reintroduced downstream.
	 */
	readServerConfig?(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
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
	/**
	 * The task/bet/agent/team content +
	 * ranked documents a `task_run` session's sandbox needs, baked at emit time
	 * from the SAME `task` (+ its `bet`) this resolver already loads to
	 * validate. Present only when `deps.getTeamById`/`deps.assembleSessionDocuments`
	 * were supplied (see `TaskRunResolverDeps` `@lore`).
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * The target agent's
	 * runnable-config snapshot, baked from the SAME already-`requireRunnableAgent`
	 * -validated `agent: User` row (`BakedAgentRunnableConfig`, `@hyperidle/work-intent-port`).
	 * Always present (no optional-deps gate) — `admitSession`'s Phase 1/3 need
	 * it for every `task_run` session, not just the ones with a `contextBundle`.
	 */
	readonly agentConfig: BakedAgentRunnableConfig;
	/**
	 * The server's
	 * disabled-harness-types list. Present only when `deps.readServerConfig`
	 * was supplied (see `TaskRunResolverDeps` `@lore`).
	 */
	readonly harnessDisabled?: readonly string[];
	/**
	 * @lore The task's own thread — a real, `NOT NULL` column, so this is
	 * one read, never a resolve-or-create. Always present.
	 */
	readonly callingThreadId: string;
}

/**
 * Bake the `contextBundle` (`kind:"task"`) a `task_run` session's sandbox
 * needs: the task/bet this resolver already loaded to validate, the
 * just-validated agent, the task's team, and the ranked+budgeted document
 * bundle (`@hyperidle/document`'s `assembleSessionDocuments`, injected).
 * Returns `undefined` (never throws) if the team can't be resolved — a
 * missing team would be a data-integrity surprise, not a reason to fail the
 * whole run's bake.
 */
/**
 * Exported so a caller that provisions a session WITHOUT going through the
 * emit-time pipeline can bake the same bundle the pipeline would — the eval
 * harness is one, and it must run the prompt production actually ships rather
 * than assembling a lookalike by hand.
 */
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
	});
	return {
		kind: "task",
		task: { id: task.id, title: task.title, description: task.description, state: task.state },
		// Root-first, so the agent reads the goal chain top-down.
		ancestors: ancestors.map((a) => ({
			id: a.id,
			title: a.title,
			description: a.description,
			doneCondition: a.doneCondition,
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

	// Bake the contextBundle only when the
	// caller supplied both context deps (see TaskRunResolverDeps `@lore`) —
	// destructured into locals so TS keeps them narrowed non-optional inside
	// the block below, no non-null assertion needed.
	let contextBundle: BakedContextBundle | undefined;
	const { getTeamById, assembleSessionDocuments, readServerConfig } = deps;
	if (getTeamById && assembleSessionDocuments) {
		// The containing work is now a chain, not a single bet.
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
	const harnessDisabled = readServerConfig
		? (await readServerConfig(db)).harnessDisabled
		: undefined;

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
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
		...(contextBundle ? { contextBundle } : {}),
	};
}
