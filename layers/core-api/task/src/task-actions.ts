import { randomUUID } from "node:crypto";
import type { HyperIdleDb, NewChange, NewTask, Team, User, WriteExecutor } from "@hyperidle/db";
import {
	type AgentWorkIntentRecorderInput,
	type Task as DomainTask,
	type EditTaskInput,
	editTask as editTaskDeclaration,
	openTask as openTaskDeclaration,
	type Problem,
	type SearchTasksInput,
	searchTasks as searchTasksDeclaration,
	type TaskListItem,
	type TaskNode,
	type TaskView,
	taskInvariants,
} from "@hyperidle/domain-model";
import type { Action, ActionContext } from "./action-types.js";
import { handleDependencyKilled } from "./dependency-watcher.js";
import type { BakedTaskRunRequest, TaskRunResolverDeps } from "./task-run-resolver.js";
import { resolveTaskRunRequest } from "./task-run-resolver.js";
import type { Task } from "./task-service.js";
import * as taskDb from "./task-service.js";
import { taskDispatchAttemptStore } from "./task-service.js";

/**
 * the task module's outward-facing deps: every one is a sibling
 * Service or the seam, which this nested Service may not import directly
 * (Mechanism C — the same shape `TaskStateMachineDeps` used).
 * the architecture doc §5.
 */
export interface TaskActionsDeps {
	readonly changes: {
		appendChange(exec: WriteExecutor, row: NewChange): Promise<unknown>;
	};
	readonly agentOrchestration: {
		// one direction, three verbs — see architecture.md's header. BC6 removes
		// all three together.
		submitWorkIntent(input: AgentWorkIntentRecorderInput): Promise<void>;
		stopRunsForTasks(
			taskIds: readonly string[],
		): Promise<readonly { taskId: string; sessionId: string }[]>;
		endRunForHandoff(sessionId: string, endedAt: string): Promise<void>;
	};
	readonly org: { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
	readonly users: { getUserById(exec: WriteExecutor, id: string): Promise<User | undefined> };
	readonly knowledge: {
		listItemIdsByParent(
			db: HyperIdleDb,
			q: { parentKind: "task"; parentId: string },
		): Promise<readonly string[]>;
		/** Existence check for `sourceKnowledgeItemId` — a dangling provenance FK
		 * becomes a `Problem` instead of a 500 (`routes/tasks.ts:356-369` today). */
		getItemById(exec: WriteExecutor, id: string): Promise<{ readonly id: string } | null>;
	};
	/**
	 * Not named on architecture.md §5's `TaskActionsDeps` block, but required
	 * by step 4's bake (`resolveTaskRunRequest`) — the same shape
	 * `TaskStateMachineDeps` carried before and the same singleton
	 * `task-run-resolver-bindings.ts` already wires. Builder decision: folded
	 * into this bag rather than a second constructor argument.
	 */
	readonly taskRunResolver: TaskRunResolverDeps;
}

/** Tasks a kill cascade never touches when it meets them BENEATH the root. */
const TERMINAL_TASK_STATES: readonly string[] = ["done", "killed"];

/** State a dispatch is eligible to launch from — the pickup guard. */
function isPickup(toState: string, fromState: string | undefined): boolean {
	return toState === "accepted" || (toState === "in_progress" && fromState !== "blocked");
}

function parseDependencyIds(dependencies: string | null): readonly string[] {
	if (!dependencies) return [];
	try {
		const parsed: unknown = JSON.parse(dependencies);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((v): v is string => typeof v === "string");
	} catch {
		return [];
	}
}

async function hasUnfinishedDependency(
	exec: WriteExecutor,
	dependencyIds: readonly string[],
): Promise<boolean> {
	for (const depId of dependencyIds) {
		const dep = await taskDb.get(exec, "task", depId);
		if (dep?.state !== "done") return true;
	}
	return false;
}

async function dependsOnTransitively(
	exec: WriteExecutor,
	fromId: string,
	targetId: string,
	depth = 0,
): Promise<boolean> {
	if (depth >= taskDb.MAX_TASK_DEPTH) return false;
	const from = await taskDb.get(exec, "task", fromId);
	const depIds = parseDependencyIds(from?.dependencies ?? null);
	for (const depId of depIds) {
		if (depId === targetId) return true;
		if (await dependsOnTransitively(exec, depId, targetId, depth + 1)) return true;
	}
	return false;
}

/** A task-shaped candidate `taskInvariants` runs over — never written. */
function candidateTask(prev: Task | null, input: EditTaskInput, resolvedState: string): DomainTask {
	const base: DomainTask = (prev as unknown as DomainTask | null) ?? {
		id: input.id ?? randomUUID(),
		parentTaskId: null,
		teamId: "",
		ownerAgentId: null,
		title: "",
		description: null,
		doneCondition: null,
		state: "proposed",
		dependencies: null,
		threadId: null,
		notes: null,
		createdAt: "",
		updatedAt: "",
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceKnowledgeItemId: null,
		completedAt: null,
		position: 0,
		needsReview: false,
	};
	return {
		...base,
		...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}),
		...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
		...(input.ownerAgentId !== undefined ? { ownerAgentId: input.ownerAgentId } : {}),
		...(input.title !== undefined ? { title: input.title } : {}),
		...(input.description !== undefined ? { description: input.description } : {}),
		...(input.doneCondition !== undefined ? { doneCondition: input.doneCondition } : {}),
		...(input.position !== undefined ? { position: input.position } : {}),
		...(input.needsReview !== undefined ? { needsReview: input.needsReview } : {}),
		...(input.dependencies !== undefined
			? { dependencies: input.dependencies ? JSON.stringify(input.dependencies) : null }
			: {}),
		...(input.sourceKnowledgeItemId !== undefined
			? { sourceKnowledgeItemId: input.sourceKnowledgeItemId }
			: {}),
		state: resolvedState as DomainTask["state"],
	};
}

/** Only the fields that differ (plus `id`) — the `changes` row's diff shape. */
function diffFields(
	id: string,
	prev: Task | null,
	patch: Readonly<Record<string, unknown>>,
): { before: Record<string, unknown> | null; after: Record<string, unknown> } {
	if (prev === null) {
		return { before: null, after: { id, ...patch } };
	}
	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch)) {
		const prevValue = (prev as unknown as Record<string, unknown>)[key];
		if (prevValue !== value) {
			before[key] = prevValue;
			after[key] = value;
		}
	}
	return { before: { id, ...before }, after: { id, ...after } };
}

function buildChildren(all: readonly Task[], parentId: string): TaskNode[] {
	return all
		.filter((t) => t.parentTaskId === parentId)
		.map((t) => ({ ...(t as unknown as DomainTask), children: buildChildren(all, t.id) }));
}

function sumTokensActual(rows: readonly Task[]): number | null {
	let total = 0;
	let any = false;
	for (const t of rows) {
		if (!t.tokensActualJson) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(t.tokensActualJson);
		} catch {
			continue;
		}
		if (typeof parsed !== "object" || parsed === null) continue;
		const byTier = (parsed as { byTier?: unknown }).byTier;
		if (typeof byTier !== "object" || byTier === null) continue;
		for (const tier of Object.values(byTier)) {
			if (typeof tier !== "object" || tier === null) continue;
			for (const v of Object.values(tier)) {
				if (typeof v === "number") {
					total += v;
					any = true;
				}
			}
		}
	}
	return any ? total : null;
}

export function createTaskActions(deps: TaskActionsDeps): readonly Action[] {
	async function openTaskRun(
		ctx: ActionContext,
		input: { id: string },
	): Promise<{ ok: true; data: TaskView } | { ok: false; problems: readonly Problem[] }> {
		const task = await taskDb.get(ctx.db, "task", input.id);
		if (!task) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Task ${input.id} not found` }],
			};
		}

		const ancestorIds = await taskDb.listAncestorIds(ctx.db, input.id);
		const ancestorTasks =
			ancestorIds.length > 0 ? await taskDb.list(ctx.db, "task", { ids: ancestorIds }) : [];
		const ancestorById = new Map(ancestorTasks.map((t) => [t.id, t]));
		const ancestors: DomainTask[] = [...ancestorIds].reverse().flatMap((id) => {
			const t = ancestorById.get(id);
			return t ? [t as unknown as DomainTask] : [];
		});

		const subtreeIds = await taskDb.listSubtreeIds(ctx.db, input.id);
		const subtreeTasks =
			subtreeIds.length > 0 ? await taskDb.list(ctx.db, "task", { ids: subtreeIds }) : [task];
		const children = buildChildren(subtreeTasks, input.id);
		const tokensActualRollup = sumTokensActual(subtreeTasks);
		const attachments = await deps.knowledge.listItemIdsByParent(ctx.db, {
			parentKind: "task",
			parentId: input.id,
		});

		return {
			ok: true,
			data: {
				task: task as unknown as DomainTask,
				ancestors,
				children,
				tokensActualRollup,
				threadId: task.threadId,
				attachments: [...attachments],
			},
		};
	}

	async function searchTasksRun(
		ctx: ActionContext,
		input: SearchTasksInput,
	): Promise<{ ok: true; data: TaskListItem[] } | { ok: false; problems: readonly Problem[] }> {
		if (input.ids !== undefined) {
			const rows = await taskDb.list(ctx.db, "task", { ids: input.ids });
			const excluded = new Set(input.excludeIds ?? []);
			return { ok: true, data: rows.filter((r) => !excluded.has(r.id)) as unknown as DomainTask[] };
		}
		if (input.text !== undefined) {
			const rows = await taskDb.list(ctx.db, "task", {
				text: input.text,
				...(input.excludeKilled ? { excludeKilled: true as const } : {}),
				...(input.limit !== undefined ? { limit: input.limit } : {}),
			});
			const excluded = new Set(input.excludeIds ?? []);
			return { ok: true, data: rows.filter((r) => !excluded.has(r.id)) as unknown as DomainTask[] };
		}
		const rows = await taskDb.list(ctx.db, "task", {
			...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}),
			...(input.ownerAgentId !== undefined ? { ownerAgentId: input.ownerAgentId } : {}),
			...(input.state !== undefined ? { state: input.state } : {}),
			...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
			...(input.limit !== undefined ? { limit: input.limit } : {}),
		});
		const excluded = new Set(input.excludeIds ?? []);
		return { ok: true, data: rows.filter((r) => !excluded.has(r.id)) as unknown as DomainTask[] };
	}

	/**
	 * Kill `rootTaskId` and its whole subtree, INSIDE the caller's own open
	 * transaction — collateral, never a second decision
	 * (the architecture doc §6 row 6). Returns every id killed
	 * (root first is not guaranteed; deepest-first is) so the caller can stop
	 * runs and free dependents after commit.
	 */
	async function killSubtreeInTx(
		tx: WriteExecutor,
		rootTaskId: string,
		actor: string,
		now: string,
	): Promise<readonly string[]> {
		const subtreeIds = await taskDb.listSubtreeIds(tx, rootTaskId);
		if (subtreeIds.length === 0) return [];
		const subtree = await taskDb.list(tx, "task", { ids: subtreeIds });
		const doomed = subtree.filter((t) =>
			t.id === rootTaskId ? t.state !== "killed" : !TERMINAL_TASK_STATES.includes(t.state),
		);
		const depthOrder = new Map(subtreeIds.map((id, i) => [id, i]));
		const deepestFirst = [...doomed].sort(
			(a, b) => (depthOrder.get(b.id) ?? 0) - (depthOrder.get(a.id) ?? 0),
		);
		const killed: string[] = [];
		for (const t of deepestFirst) {
			const { before, after } = diffFields(t.id, t, { state: "killed" });
			await taskDb.transition(tx, "task", {
				id: t.id,
				guard: { field: "state", equals: t.state },
				patch: { state: "killed", updatedAt: now },
			});
			await deps.changes.appendChange(tx, {
				id: randomUUID(),
				object: "task",
				objectId: t.id,
				kind: "changed",
				actor,
				before: JSON.stringify(before),
				after: JSON.stringify(after),
				at: now,
			});
			killed.push(t.id);
		}
		return killed;
	}

	async function editTaskRun(
		ctx: ActionContext,
		input: EditTaskInput,
	): Promise<{ ok: true; data: TaskView } | { ok: false; problems: readonly Problem[] }> {
		// -- 1. load prev --------------------------------------------------------
		const prev = input.id ? ((await taskDb.get(ctx.db, "task", input.id)) ?? null) : null;
		if (input.id && !prev) {
			return {
				ok: false,
				problems: [{ code: "not_found", message: `Task ${input.id} not found` }],
			};
		}

		let teamId = input.teamId ?? prev?.teamId;
		if (!prev && input.parentTaskId) {
			const parent = await taskDb.get(ctx.db, "task", input.parentTaskId);
			if (!parent) {
				return {
					ok: false,
					problems: [
						{ code: "parent_not_found", message: "Parent task not found", path: "parentTaskId" },
					],
				};
			}
			teamId ??= parent.teamId;
		}
		if (input.sourceKnowledgeItemId !== undefined) {
			const srcItem = await deps.knowledge.getItemById(ctx.db, input.sourceKnowledgeItemId);
			if (!srcItem) {
				return {
					ok: false,
					problems: [
						{
							code: "source_knowledge_item_not_found",
							message: `Knowledge item '${input.sourceKnowledgeItemId}' not found`,
							path: "sourceKnowledgeItemId",
						},
					],
				};
			}
		}
		if (input.version !== undefined && prev !== null && prev.updatedAt !== input.version) {
			return {
				ok: false,
				problems: [{ code: "stale", message: "The task changed since you last read it." }],
			};
		}

		// -- resolve the target state, including the auto-park-to-hold rule -----
		let resolvedState = input.state ?? prev?.state ?? "proposed";
		const dependencyIds =
			input.dependencies !== undefined
				? (input.dependencies ?? [])
				: parseDependencyIds(prev?.dependencies ?? null);
		if (
			input.state === undefined &&
			input.dependencies !== undefined &&
			input.dependencies !== null &&
			input.dependencies.length > 0 &&
			prev !== null &&
			(await hasUnfinishedDependency(ctx.db, input.dependencies))
		) {
			resolvedState = "hold";
		} else if (
			!prev &&
			dependencyIds.length > 0 &&
			(await hasUnfinishedDependency(ctx.db, dependencyIds))
		) {
			resolvedState = "hold";
		}

		const next = candidateTask(prev, input, resolvedState);
		if (teamId) next.teamId = teamId;

		// -- 2. pure invariants ---------------------------------------------------
		const problems: Problem[] = [...taskInvariants(next, prev as unknown as DomainTask | null)];

		// -- 3. server invariants (need the database) ------------------------------
		if (input.parentTaskId !== undefined && input.parentTaskId !== null && prev) {
			if (input.parentTaskId === prev.id) {
				problems.push({
					code: "cycle",
					message: "A task cannot be its own parent.",
					path: "parentTaskId",
				});
			} else {
				const subtree = await taskDb.listSubtreeIds(ctx.db, prev.id);
				if (subtree.includes(input.parentTaskId)) {
					problems.push({
						code: "cycle",
						message: "That would make the task its own ancestor.",
						path: "parentTaskId",
					});
				}
			}
		}
		if (input.dependencies) {
			for (const depId of input.dependencies) {
				if (prev && depId === prev.id) {
					problems.push({
						code: "cycle",
						message: "A task cannot depend on itself.",
						path: "dependencies",
					});
					continue;
				}
				const dep = await taskDb.get(ctx.db, "task", depId);
				if (!dep) {
					problems.push({
						code: "dependency_not_found",
						message: `Dependency '${depId}' not found`,
						path: "dependencies",
					});
					continue;
				}
				if (dep.state === "killed") {
					problems.push({
						code: "dependency_killed",
						message: `Dependency '${depId}' was killed and can never finish.`,
						path: "dependencies",
					});
				}
				if (prev && (await dependsOnTransitively(ctx.db, depId, prev.id))) {
					problems.push({
						code: "cycle",
						message: `Dependency '${depId}' already depends on this task, transitively.`,
						path: "dependencies",
					});
				}
			}
		}
		const wasPickup = prev !== null && isPickup(resolvedState, prev.state);
		if (
			wasPickup &&
			dependencyIds.length > 0 &&
			(await hasUnfinishedDependency(ctx.db, dependencyIds))
		) {
			problems.push({
				code: "dependency_blocked",
				message: "This task is waiting on a dependency that has not finished.",
				path: "state",
			});
		}
		const dispatchingOwner = next.ownerAgentId;
		if (
			resolvedState === "accepted" &&
			dispatchingOwner &&
			prev?.state !== "accepted" &&
			problems.length === 0
		) {
			const team = await deps.org.getTeam(ctx.db, { id: next.teamId });
			if (!team) {
				problems.push({ code: "team_not_found", message: "Team not found.", path: "teamId" });
			} else {
				const running = await taskDb.countTeamTasksInProgress(ctx.db, next.teamId);
				if (running >= team.capacity) {
					problems.push({
						code: "capacity_exceeded",
						message: `Team is already at its capacity of ${team.capacity} in-progress tasks.`,
					});
				}
			}
		}
		if (
			input.ownerAgentId !== undefined &&
			input.ownerAgentId !== null &&
			input.ownerAgentId !== prev?.ownerAgentId
		) {
			const owner = await deps.users.getUserById(ctx.db, input.ownerAgentId);
			if (!owner) {
				problems.push({
					code: "owner_not_found",
					message: "Owner does not exist.",
					path: "ownerAgentId",
				});
			}
		}

		if (problems.length > 0) {
			return { ok: false, problems };
		}

		// -- 4. inside one transaction --------------------------------------------
		const now = ctx.now;
		let killedIds: readonly string[] = [];
		let dispatch:
			| {
					attemptId: string;
					ownerAgentId: string;
					occasion: "accepted" | "retry" | "owner_handoff";
					bakedRequest: BakedTaskRunRequest;
			  }
			| undefined;
		let predecessorSessionId: string | undefined;

		await ctx.db.transaction(async (tx) => {
			const taskId = prev?.id ?? next.id;

			if (input.ownerAgentId !== undefined && input.ownerAgentId !== prev?.ownerAgentId && prev) {
				const prevOwnerWasAgent = Boolean(prev.ownerAgentId);
				const stillLive = prev.state === "accepted" || prev.state === "in_progress";
				if (prevOwnerWasAgent && stillLive && input.ownerAgentId) {
					predecessorSessionId = await taskDispatchAttemptStore.findLiveSessionId(tx, prev.id);
				}
			}

			const patch: Record<string, unknown> = {
				parentTaskId: next.parentTaskId,
				teamId: next.teamId,
				ownerAgentId: next.ownerAgentId,
				title: next.title,
				description: next.description,
				doneCondition: next.doneCondition,
				state: resolvedState,
				dependencies: next.dependencies,
				position: next.position,
				needsReview: next.needsReview,
				sourceKnowledgeItemId: next.sourceKnowledgeItemId,
				updatedAt: now,
			};
			if (input.outcome) {
				patch.outcomeVerdict = input.outcome.verdict;
				patch.outcomeSummary = input.outcome.summary ?? null;
				patch.outcomeRecordedAt = now;
				patch.outcomeRecordedBy = ctx.actor;
			}

			if (!prev) {
				const values: NewTask = {
					id: taskId,
					parentTaskId: next.parentTaskId,
					teamId: next.teamId,
					ownerAgentId: next.ownerAgentId,
					title: next.title,
					description: next.description,
					doneCondition: next.doneCondition,
					state: resolvedState,
					dependencies: next.dependencies,
					position:
						next.position ||
						(await taskDb.maxSiblingPosition(tx, next.parentTaskId, next.teamId)) + 1,
					needsReview: next.needsReview,
					sourceKnowledgeItemId: next.sourceKnowledgeItemId,
					createdAt: now,
					updatedAt: now,
				};
				await taskDb.create(tx, "task", values);
				const { before, after } = diffFields(
					taskId,
					null,
					values as unknown as Record<string, unknown>,
				);
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "task",
					objectId: taskId,
					kind: "created",
					actor: ctx.actor,
					before: before ? JSON.stringify(before) : null,
					after: JSON.stringify(after),
					at: now,
				});
			} else {
				const { before, after } = diffFields(taskId, prev, patch);
				await taskDb.update(tx, "task", taskId, patch as never);
				if (input.appendNote) {
					await taskDb.update(tx, "task", taskId, {
						notes: { appendNote: `[${now} ${ctx.actor}] ${input.appendNote}` },
					});
					after.appendNote = `[${now} ${ctx.actor}] ${input.appendNote}`;
				}
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "task",
					objectId: taskId,
					kind: "changed",
					actor: ctx.actor,
					before: before ? JSON.stringify(before) : null,
					after: JSON.stringify(after),
					at: now,
				});
			}

			if (resolvedState === "killed" && (!prev || prev.state !== "killed")) {
				killedIds = await killSubtreeInTx(tx, taskId, ctx.actor, now);
			}

			// -- the dispatch branch: an accept, or an owner change to an agent --
			if (
				resolvedState === "accepted" &&
				next.ownerAgentId &&
				prev?.state !== "accepted" &&
				prev?.state !== "in_progress"
			) {
				const occasion = prev?.state === "hold" ? "retry" : "accepted";
				const inserted = await taskDispatchAttemptStore.insertAttempt(tx, {
					taskId,
					occasion,
					agentId: next.ownerAgentId,
					now,
				});
				const bakedRequest = await resolveTaskRunRequest(
					tx as HyperIdleDb,
					{ kind: "task_run", attemptId: inserted.id },
					deps.taskRunResolver,
				);
				dispatch = {
					attemptId: inserted.id,
					ownerAgentId: next.ownerAgentId,
					occasion,
					bakedRequest,
				};
			} else if (
				input.ownerAgentId !== undefined &&
				input.ownerAgentId !== null &&
				input.ownerAgentId !== prev?.ownerAgentId &&
				prev &&
				(prev.state === "accepted" || prev.state === "in_progress")
			) {
				const inserted = await taskDispatchAttemptStore.insertAttempt(tx, {
					taskId,
					occasion: "owner_handoff",
					agentId: input.ownerAgentId,
					predecessorSessionId: predecessorSessionId ?? null,
					now,
				});
				const bakedRequest = await resolveTaskRunRequest(
					tx as HyperIdleDb,
					{ kind: "task_run", attemptId: inserted.id },
					deps.taskRunResolver,
				);
				dispatch = {
					attemptId: inserted.id,
					ownerAgentId: input.ownerAgentId,
					occasion: "owner_handoff",
					bakedRequest,
				};
			}
		});

		// -- 5. after commit --------------------------------------------------------
		if (killedIds.length > 0) {
			await deps.agentOrchestration.stopRunsForTasks(killedIds);
		}
		if (predecessorSessionId && dispatch?.occasion === "owner_handoff") {
			await deps.agentOrchestration.endRunForHandoff(predecessorSessionId, now);
		}
		if (prev === null || prev.state !== resolvedState) {
			ctx.eventBus.emit({
				type: "task_state_changed",
				streamId: prev?.id ?? next.id,
				taskId: prev?.id ?? next.id,
				fromState: (prev?.state ?? "proposed") as DomainTask["state"],
				toState: resolvedState as DomainTask["state"],
				timestamp: Date.now(),
			});
		}
		for (const killedId of killedIds) {
			if (killedId === (prev?.id ?? next.id)) continue;
			ctx.eventBus.emit({
				type: "task_state_changed",
				streamId: killedId,
				taskId: killedId,
				fromState: "proposed",
				toState: "killed",
				timestamp: Date.now(),
				cascade: true,
			});
		}
		if (dispatch) {
			await deps.agentOrchestration.submitWorkIntent({
				kind: "task_run",
				sourceKind: "task_dispatch_attempt",
				sourceId: dispatch.attemptId,
				requestedBy: dispatch.ownerAgentId,
				idempotencyKey: `task-dispatch:${dispatch.attemptId}`,
				bakedRequest: dispatch.bakedRequest,
			});
		}
		for (const killedId of killedIds) {
			await handleDependencyKilled(
				{ actor: "system:propagation", db: ctx.db, eventBus: ctx.eventBus, now: ctx.now },
				killedId,
				editTaskRun,
			);
		}

		return openTaskRun(ctx, { id: prev?.id ?? next.id });
	}

	return [
		{ declaration: searchTasksDeclaration, run: searchTasksRun } as Action,
		{ declaration: openTaskDeclaration, run: openTaskRun } as Action,
		{ declaration: editTaskDeclaration, run: editTaskRun } as Action,
	];
}
