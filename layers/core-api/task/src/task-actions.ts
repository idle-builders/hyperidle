import { randomUUID } from "node:crypto";
import type { Change, HyperIdleDb, NewChange, NewTask, User, WriteExecutor } from "@hyperidle/db";
import {
	type ActionResult,
	type AdjustThreadInput,
	type AgentWorkIntentRecorderInput,
	canTransitionTaskState,
	computeTaskNeed,
	type DocumentRow,
	type Task as DomainTask,
	DoneWhenLineSchema,
	type EditTaskInput,
	editTask as editTaskDeclaration,
	type OpenThreadInput,
	openTask as openTaskDeclaration,
	type Problem,
	ReasonSchema,
	type SearchDocumentsInput,
	type SearchTasksInput,
	searchTasks as searchTasksDeclaration,
	type TaskListItem,
	type TaskNeed,
	type TaskNode,
	type TaskView,
	type ThreadView,
	taskInvariants,
} from "@hyperidle/domain-model";
import { objectEvent } from "@hyperidle/event-bus";
import type { Action, ActionContext } from "./action-types.js";
import { handleDependencyKilled } from "./dependency-watcher.js";
import type { BakedTaskRunRequest, TaskRunResolverDeps } from "./task-run-resolver.js";
import { resolveTaskRunRequest } from "./task-run-resolver.js";
import type { Task } from "./task-service.js";
import * as taskDb from "./task-service.js";
import { taskDispatchAttemptStore } from "./task-service.js";

/**
 * Parse the JSON text columns `done_when` and `reasons` of a DB row into a domain Task.
 * Invalid JSON or schema mismatches fall back to empty arrays rather than throwing — the
 * rows were valid when written; a parse failure here means a schema gap, not corrupt data.
 */
function toTask(row: Task): DomainTask {
	let doneWhen: DomainTask["doneWhen"] = [];
	try {
		const parsed: unknown = JSON.parse(row.doneWhen);
		if (Array.isArray(parsed)) {
			doneWhen = parsed.flatMap((item) => {
				const r = DoneWhenLineSchema.safeParse(item);
				return r.success ? [r.data] : [];
			});
		}
	} catch {
		// leave empty
	}

	let reasons: DomainTask["reasons"] = [];
	try {
		const parsed: unknown = JSON.parse(row.reasons);
		if (Array.isArray(parsed)) {
			reasons = parsed.flatMap((item) => {
				const r = ReasonSchema.safeParse(item);
				return r.success ? [r.data] : [];
			});
		}
	} catch {
		// leave empty
	}

	return { ...(row as unknown as DomainTask), doneWhen, reasons, need: null };
}

/** Task action dependencies — every one is a sibling Service or the seam; this module may not import any directly (service boundary). */
export interface TaskActionsDeps {
	readonly changes: {
		appendChange(exec: WriteExecutor, row: NewChange): Promise<Change>;
	};
	readonly agentOrchestration: {
		submitWorkIntent(input: AgentWorkIntentRecorderInput): Promise<void>;
		stopRunsForTasks(
			taskIds: readonly string[],
		): Promise<readonly { taskId: string; sessionId: string }[]>;
		endRunForHandoff(sessionId: string, endedAt: string): Promise<void>;
	};
	readonly users: { getUserById(exec: WriteExecutor, id: string): Promise<User | undefined> };
	/** The ONE door onto `document` — task never imports `@hyperidle/document`, never opens a document, and never calls this inside its own open transaction (a runner call inside `ctx.db.transaction` hangs PGlite). */
	readonly searchDocuments: (
		ctx: ActionContext,
		input: SearchDocumentsInput,
	) => Promise<ActionResult<DocumentRow[]>>;
	readonly taskRunResolver: TaskRunResolverDeps;
	readonly adjustThread: (
		ctx: ActionContext,
		input: AdjustThreadInput,
	) => Promise<ActionResult<ThreadView>>;
	/**
	 * Same injection shape as `adjustThread`, for the read `adjustThread`
	 * needs before it can decide whether a write is even necessary —
	 * `adjust_thread.members` is a full replacement (locked), never a union, so
	 * adding a member means reading the thread's current ones first.
	 */
	readonly openThread: (
		ctx: ActionContext,
		input: OpenThreadInput,
	) => Promise<ActionResult<ThreadView>>;
	/** Batch-fetch the review and question messages, answered ones too, for multiple threads — needed to compute `need` without N+1 queries. Injected from `@hyperidle/thread` via the composition root. */
	readonly listAsksForThreads: (
		db: HyperIdleDb,
		threadIds: readonly string[],
	) => Promise<
		ReadonlyArray<{
			readonly threadId: string;
			readonly type: string;
			readonly resolvedAt: string | null;
		}>
	>;
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
	const base: DomainTask = (prev ? toTask(prev) : null) ?? {
		id: input.id ?? randomUUID(),
		parentTaskId: null,
		teamId: "",
		ownerAgentId: null,
		title: "",
		description: null,
		doneWhen: [],
		state: "proposed",
		dependencies: null,
		threadId: "",
		notes: null,
		createdAt: "",
		updatedAt: "",
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceDocumentId: null,
		completedAt: null,
		position: 0,
		reasons: [],
		paused: null,
		startedBy: null,
		need: null,
	};
	return {
		...base,
		...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}),
		...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
		...(input.ownerAgentId !== undefined ? { ownerAgentId: input.ownerAgentId } : {}),
		...(input.title !== undefined ? { title: input.title } : {}),
		...(input.description !== undefined ? { description: input.description } : {}),
		...(input.doneWhen !== undefined ? { doneWhen: input.doneWhen } : {}),
		...(input.position !== undefined ? { position: input.position } : {}),
		...(input.reasons !== undefined ? { reasons: input.reasons } : {}),
		...(input.dependencies !== undefined
			? { dependencies: input.dependencies ? JSON.stringify(input.dependencies) : null }
			: {}),
		...(input.sourceDocumentId !== undefined ? { sourceDocumentId: input.sourceDocumentId } : {}),
		...(input.tokensActualJson !== undefined ? { tokensActualJson: input.tokensActualJson } : {}),
		...(input.paused !== undefined ? { paused: input.paused } : {}),
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

function buildChildren(
	all: readonly Task[],
	parentId: string,
	needMap: ReadonlyMap<string, TaskNeed>,
): TaskNode[] {
	return all
		.filter((t) => t.parentTaskId === parentId)
		.map((t) => {
			const children = buildChildren(all, t.id, needMap);
			const need = needMap.get(t.id) ?? null;
			let openBelowInput = 0;
			let openBelowReview = 0;
			for (const child of children) {
				if (child.need === "input") openBelowInput++;
				if (child.need === "review") openBelowReview++;
				openBelowInput += child.openBelow.input;
				openBelowReview += child.openBelow.review;
			}
			return {
				...toTask(t),
				need,
				children,
				openBelow: { input: openBelowInput, review: openBelowReview },
			};
		});
}

/** Group message stubs by threadId for O(1) lookup per task. */
function groupByThread<T extends { readonly threadId: string }>(
	msgs: ReadonlyArray<T>,
): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const m of msgs) {
		let arr = map.get(m.threadId);
		if (!arr) {
			arr = [];
			map.set(m.threadId, arr);
		}
		arr.push(m);
	}
	return map;
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
			return t ? [toTask(t)] : [];
		});

		const subtreeIds = await taskDb.listSubtreeIds(ctx.db, input.id);
		const subtreeTasks =
			subtreeIds.length > 0 ? await taskDb.list(ctx.db, "task", { ids: subtreeIds }) : [task];

		// Batch one message query for all threadIds in scope (ancestors + subtree).
		const allThreadIds = [
			...new Set([...ancestorTasks.map((t) => t.threadId), ...subtreeTasks.map((t) => t.threadId)]),
		];
		const asks = allThreadIds.length > 0 ? await deps.listAsksForThreads(ctx.db, allThreadIds) : [];
		const msgsByThread = groupByThread(asks);

		// Compute need for every task in scope.
		const needMap = new Map<string, TaskNeed>();
		for (const t of [...ancestorTasks, ...subtreeTasks]) {
			const domainTask = toTask(t);
			const msgs = msgsByThread.get(t.threadId) ?? [];
			needMap.set(t.id, computeTaskNeed(t.state, msgs));
		}

		const rootNeed = needMap.get(input.id) ?? null;
		const children = buildChildren(subtreeTasks, input.id, needMap);

		// Compute openBelow for the root task itself (sum of direct children + their descendants).
		let rootOpenBelowInput = 0;
		let rootOpenBelowReview = 0;
		for (const child of children) {
			if (child.need === "input") rootOpenBelowInput++;
			if (child.need === "review") rootOpenBelowReview++;
			rootOpenBelowInput += child.openBelow.input;
			rootOpenBelowReview += child.openBelow.review;
		}

		const tokensActualRollup = sumTokensActual(subtreeTasks);
		// searchDocuments, never a raw table read — an artifact's `parent_kind IN ('task','thread')` visibility arm means this never needs a separate scope check.
		const artifactsResult = await deps.searchDocuments(ctx, {
			parent: { kind: "task", id: input.id },
		});
		const attachments = artifactsResult.ok ? artifactsResult.data.map((d) => d.id) : [];

		// Annotate ancestors with their computed need.
		const ancestorsWithNeed = ancestors.map((a) => ({ ...a, need: needMap.get(a.id) ?? null }));

		return {
			ok: true,
			data: {
				task: { ...toTask(task), need: rootNeed },
				ancestors: ancestorsWithNeed,
				children,
				openBelow: { input: rootOpenBelowInput, review: rootOpenBelowReview },
				tokensActualRollup,
				threadId: task.threadId,
				attachments: [...attachments],
			},
		};
	}

	/** Annotate a list of domain tasks with their computed `need` via one batched message query. */
	async function withNeed(db: HyperIdleDb, domainTasks: DomainTask[]): Promise<DomainTask[]> {
		if (domainTasks.length === 0) return domainTasks;
		const threadIds = [...new Set(domainTasks.map((t) => t.threadId))];
		const asks = await deps.listAsksForThreads(db, threadIds);
		const msgsByThread = groupByThread(asks);
		return domainTasks.map((t) => ({
			...t,
			need: computeTaskNeed(t.state, msgsByThread.get(t.threadId) ?? []),
		}));
	}

	async function searchTasksRun(
		ctx: ActionContext,
		input: SearchTasksInput,
	): Promise<{ ok: true; data: TaskListItem[] } | { ok: false; problems: readonly Problem[] }> {
		if (input.ids !== undefined) {
			const rows = await taskDb.list(ctx.db, "task", {
				ids: input.ids,
				...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
			});
			const excluded = new Set(input.excludeIds ?? []);
			return {
				ok: true,
				data: await withNeed(ctx.db, rows.filter((r) => !excluded.has(r.id)).map(toTask)),
			};
		}
		if (input.text !== undefined) {
			const rows = await taskDb.list(ctx.db, "task", {
				text: input.text,
				...(input.excludeKilled ? { excludeKilled: true as const } : {}),
				...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
				...(input.limit !== undefined ? { limit: input.limit } : {}),
			});
			const excluded = new Set(input.excludeIds ?? []);
			return {
				ok: true,
				data: await withNeed(ctx.db, rows.filter((r) => !excluded.has(r.id)).map(toTask)),
			};
		}
		const rows = await taskDb.list(ctx.db, "task", {
			...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}),
			...(input.ownerAgentId !== undefined ? { ownerAgentId: input.ownerAgentId } : {}),
			...(input.startedBy !== undefined ? { startedBy: input.startedBy } : {}),
			...(input.state !== undefined ? { state: input.state } : {}),
			...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
			...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
			...(input.limit !== undefined ? { limit: input.limit } : {}),
		});
		const excluded = new Set(input.excludeIds ?? []);
		return {
			ok: true,
			data: await withNeed(ctx.db, rows.filter((r) => !excluded.has(r.id)).map(toTask)),
		};
	}

	/**
	 * Kill `rootTaskId` and its whole subtree, INSIDE the caller's own open
	 * transaction — collateral, never a second decision. Returns every task
	 * killed with its real prior state so the caller can stop runs, free
	 * dependents and emit the true `fromState` after commit.
	 */
	async function killSubtreeInTx(
		tx: WriteExecutor,
		rootTaskId: string,
		actor: string,
		now: string,
		rootFromState: string,
	): Promise<
		readonly { readonly id: string; readonly fromState: string; readonly row: Change | null }[]
	> {
		const subtreeIds = await taskDb.listSubtreeIds(tx, rootTaskId);
		if (subtreeIds.length === 0) return [];
		// The root's own row was already flipped to "killed" by the caller's
		// main upsert/update — by the time this function re-reads the subtree
		// via `tx`, the root's state has already moved. A doomed-filter keyed
		// on the ROOT's CURRENT state would therefore always exclude it (it is
		// never "not killed" here), silently dropping it from the returned id
		// list every caller (stopRunsForTasks, handleDependencyKilled, the
		// cascade event emit) needs it in. The guard this function is called
		// under (`resolvedState === "killed" && prev.state !== "killed"`)
		// already proves the root is a genuine fresh kill, and the root's own
		// `changes` row was already appended by that main update path — so the
		// root needs no second transition or changes row here, only inclusion
		// in the returned id list. `row` is `null` for the root for the same
		// reason — its object-change event is the main path's own emit.
		const descendantIds = subtreeIds.filter((id) => id !== rootTaskId);
		if (descendantIds.length === 0) {
			return [{ id: rootTaskId, fromState: rootFromState, row: null }];
		}
		const subtree = await taskDb.list(tx, "task", { ids: descendantIds });
		const doomed = subtree.filter((t) => !TERMINAL_TASK_STATES.includes(t.state));
		const depthOrder = new Map(subtreeIds.map((id, i) => [id, i]));
		const deepestFirst = [...doomed].sort(
			(a, b) => (depthOrder.get(b.id) ?? 0) - (depthOrder.get(a.id) ?? 0),
		);
		const killed: { readonly id: string; readonly fromState: string; readonly row: Change }[] = [];
		for (const t of deepestFirst) {
			const { before, after } = diffFields(t.id, t, { state: "killed" });
			await taskDb.transition(tx, "task", {
				id: t.id,
				guard: { field: "state", equals: t.state },
				patch: { state: "killed", updatedAt: now },
			});
			const row = await deps.changes.appendChange(tx, {
				id: randomUUID(),
				object: "task",
				objectId: t.id,
				kind: "changed",
				actor,
				before: JSON.stringify(before),
				after: JSON.stringify(after),
				at: now,
			});
			killed.push({ id: t.id, fromState: t.state, row });
		}
		return [...killed, { id: rootTaskId, fromState: rootFromState, row: null }];
	}

	/**
	 * Pause (or lift the pause on) every part below `rootTaskId`, inside the caller's transaction.
	 * A pause skips parts already done or killed; lifting it clears every part that carries one.
	 */
	async function pauseSubtreeInTx(
		tx: WriteExecutor,
		rootTaskId: string,
		paused: DomainTask["paused"],
		actor: string,
		now: string,
	): Promise<readonly Change[]> {
		const ids = (await taskDb.listSubtreeIds(tx, rootTaskId)).filter((id) => id !== rootTaskId);
		if (ids.length === 0) return [];
		const parts = await taskDb.list(tx, "task", { ids });
		const moving = parts.filter((t) =>
			paused === null
				? t.paused !== null
				: t.paused !== paused && !TERMINAL_TASK_STATES.includes(t.state),
		);
		const rows: Change[] = [];
		for (const t of moving) {
			const { before, after } = diffFields(t.id, t, { paused });
			await taskDb.update(tx, "task", t.id, { paused, updatedAt: now });
			rows.push(
				await deps.changes.appendChange(tx, {
					id: randomUUID(),
					object: "task",
					objectId: t.id,
					kind: "changed",
					actor,
					before: JSON.stringify(before),
					after: JSON.stringify(after),
					at: now,
				}),
			);
		}
		return rows;
	}

	/**
	 * After a pause is lifted: every part that waited only for finished parts starts, and after a
	 * stop each agent goes back to the part it was working on — a leaf still under way that waits
	 * on nobody's answer or review.
	 */
	async function resumeSubtree(
		ctx: ActionContext,
		rootTaskId: string,
		wasStopped: boolean,
	): Promise<void> {
		const ids = await taskDb.listSubtreeIds(ctx.db, rootTaskId);
		const waiting = (await taskDb.list(ctx.db, "task", { ids })).filter((t) => t.state === "hold");
		for (const t of waiting) {
			const waitsFor = parseDependencyIds(t.dependencies);
			if (waitsFor.length > 0 && !(await hasUnfinishedDependency(ctx.db, waitsFor))) {
				await editTaskRun(ctx, { id: t.id, state: "accepted" });
			}
		}
		if (!wasStopped) return;
		const view = await openTaskRun(ctx, { id: rootTaskId });
		if (!view.ok) return;
		const working = (nodes: readonly TaskNode[]): TaskNode[] =>
			nodes.flatMap((n) =>
				n.children.length > 0
					? working(n.children)
					: n.state === "in_progress" && n.need === null && n.ownerAgentId
						? [n]
						: [],
			);
		const top = view.data.task;
		const leaves =
			view.data.children.length > 0
				? working(view.data.children)
				: top.state === "in_progress" && top.need === null && top.ownerAgentId
					? [top]
					: [];
		for (const leaf of leaves) await restart(ctx, leaf.id, leaf.ownerAgentId ?? "");
	}

	/** Send the owner back to a part a stop cut off; one restart per stop, so it is not one-per-occasion. */
	async function restart(ctx: ActionContext, taskId: string, agentId: string): Promise<void> {
		const dispatched = await ctx.db.transaction(async (tx) => {
			const inserted = await taskDispatchAttemptStore.insertAttempt(tx, {
				taskId,
				occasion: "restart",
				agentId,
				now: ctx.now,
			});
			if (!inserted.id) return null;
			const bakedRequest = await resolveTaskRunRequest(
				tx as HyperIdleDb,
				{ kind: "task_run", attemptId: inserted.id },
				deps.taskRunResolver,
			);
			return { attemptId: inserted.id, bakedRequest };
		});
		if (!dispatched) return;
		await deps.agentOrchestration.submitWorkIntent({
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: dispatched.attemptId,
			requestedBy: agentId,
			idempotencyKey: `task-dispatch:${dispatched.attemptId}`,
			bakedRequest: dispatched.bakedRequest,
		});
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
		/** A new part of a paused task is paused with it. */
		let parentPaused: DomainTask["paused"] = null;
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
			parentPaused = toTask(parent).paused;
		}
		if (input.sourceDocumentId !== undefined) {
			const srcResult = await deps.searchDocuments(ctx, { ids: [input.sourceDocumentId] });
			const srcItem = srcResult.ok ? srcResult.data[0] : undefined;
			if (!srcItem) {
				return {
					ok: false,
					problems: [
						{
							code: "source_document_not_found",
							message: `Document '${input.sourceDocumentId}' not found`,
							path: "sourceDocumentId",
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
			// Parking must not require `state` to be absent — only that it isn't
			// an actual CHANGE. The edit panel's write always includes `state`,
			// set to the task's own current value.
			(input.state === undefined || input.state === prev?.state) &&
			input.dependencies !== undefined &&
			input.dependencies !== null &&
			input.dependencies.length > 0 &&
			prev !== null &&
			// Auto-park only when the task CAN still reach hold — a task already
			// in_progress keeps its state; adding a dependency to it is not rewound.
			canTransitionTaskState(prev.state as DomainTask["state"], "hold") &&
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
		if (!prev && input.paused === undefined) next.paused = parentPaused;

		// -- 2. pure invariants ---------------------------------------------------
		const problems: Problem[] = [...taskInvariants(next, prev ? toTask(prev) : null)];

		// @lore: state:"review" can only be reached via sendMessage review card (moveTaskToReview dep);
		// edit_task is blocked for all external callers — the card is the gate.
		if (
			next.state === "review" &&
			(prev === null || (prev.state as string) !== "review") &&
			!ctx.internal
		) {
			problems.push({
				code: "state_review_requires_card",
				message: "Reviewing a task requires sending a review card first.",
				path: "state",
			});
		}

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
		// A task already sitting in "in_progress" (or "accepted") that keeps
		// that state is not a pickup — only an actual transition INTO it is
		// gated. Otherwise an unrelated edit (e.g. adding a dependency) to an
		// already-running task would wrongly trip the unfinished-dependency guard.
		const wasPickup =
			prev !== null && prev.state !== resolvedState && isPickup(resolvedState, prev.state);
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

		// -- 3b. resolve the task's thread -------------------------------------
		let resolvedThreadId = prev?.threadId;
		if (!prev) {
			if (input.threadId) {
				resolvedThreadId = input.threadId;
				// @lore: adjust_thread.members is full replacement (locked) not union — owner appended; other members dropped; read first, skip if already member
				if (next.ownerAgentId) {
					const opened = await deps.openThread(ctx, { id: input.threadId });
					if (!opened.ok) {
						return { ok: false, problems: opened.problems };
					}
					const currentMemberIds = opened.data.members.map((m) => m.id);
					if (!currentMemberIds.includes(next.ownerAgentId)) {
						const addOwner = await deps.adjustThread(ctx, {
							id: input.threadId,
							members: [...currentMemberIds, next.ownerAgentId],
						});
						if (!addOwner.ok) {
							return { ok: false, problems: addOwner.problems };
						}
					}
				}
			} else {
				const created = await deps.adjustThread(ctx, {
					host: { kind: "team", id: next.teamId },
					members: [ctx.actor, ...(next.ownerAgentId ? [next.ownerAgentId] : [])],
				});
				if (!created.ok) {
					return { ok: false, problems: created.problems };
				}
				resolvedThreadId = created.data.thread.id;
			}
		}
		const threadId = resolvedThreadId ?? "";

		// -- 4. inside one transaction --------------------------------------------
		const now = ctx.now;
		let killedTasks: readonly {
			readonly id: string;
			readonly fromState: string;
			readonly row: Change | null;
		}[] = [];
		let mainChangeRow: Change | null = null;
		let dispatch:
			| {
					attemptId: string;
					ownerAgentId: string;
					occasion: "accepted" | "retry" | "owner_handoff";
					bakedRequest: BakedTaskRunRequest;
			  }
			| undefined;
		let predecessorSessionId: string | undefined;
		const pauseMoved = prev !== null && input.paused !== undefined && input.paused !== prev.paused;
		let pausedParts: readonly Change[] = [];

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
				doneWhen: JSON.stringify(next.doneWhen),
				state: resolvedState,
				dependencies: next.dependencies,
				position: next.position,
				reasons: JSON.stringify(next.reasons),
				sourceDocumentId: next.sourceDocumentId,
				tokensActualJson: next.tokensActualJson,
				paused: next.paused,
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
					doneWhen: JSON.stringify(next.doneWhen),
					state: resolvedState,
					dependencies: next.dependencies,
					threadId,
					position:
						next.position ||
						(await taskDb.maxSiblingPosition(tx, next.parentTaskId, next.teamId)) + 1,
					reasons: JSON.stringify(next.reasons),
					sourceDocumentId: next.sourceDocumentId,
					paused: next.paused,
					startedBy: ctx.actor,
					createdAt: now,
					updatedAt: now,
				};
				await taskDb.create(tx, "task", values);
				const { before, after } = diffFields(
					taskId,
					null,
					values as unknown as Record<string, unknown>,
				);
				mainChangeRow = await deps.changes.appendChange(tx, {
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
				mainChangeRow = await deps.changes.appendChange(tx, {
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

			if (resolvedState === "killed" && prev?.state !== "killed") {
				killedTasks = await killSubtreeInTx(tx, taskId, ctx.actor, now, prev?.state ?? "proposed");
			}
			if (pauseMoved && prev) {
				pausedParts = await pauseSubtreeInTx(tx, taskId, next.paused, ctx.actor, now);
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
				// A unique-index conflict leaves `inserted.id` undefined — skip bake and dispatch rather than reading a fabricated id.
				if (inserted.id) {
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
				}
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
				// A swallowed conflict means no row — no bake and no dispatch.
				if (inserted.id) {
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
			}
		});

		// -- 5. after commit --------------------------------------------------------
		if (killedTasks.length > 0) {
			await deps.agentOrchestration.stopRunsForTasks(killedTasks.map((k) => k.id));
		}
		if (predecessorSessionId && dispatch?.occasion === "owner_handoff") {
			await deps.agentOrchestration.endRunForHandoff(predecessorSessionId, now);
		}
		// Every change row this call appended is one object event, post
		// commit — the main row always (a
		// state move or any other field edit alike), each killed
		// descendant's row flagged `cascade: true` so lifecycle propagation
		// and the dependency watcher can tell a deliberate subtree kill from
		// ordinary progress. When this edit dispatches the task to an agent, the
		// main row names that agent as already woken, so its own subscription
		// does not start a second session for the same change.
		if (mainChangeRow) {
			ctx.eventBus.emit(
				objectEvent(mainChangeRow, dispatch ? { woke: [dispatch.ownerAgentId] } : undefined),
			);
		}
		for (const killed of killedTasks) {
			if (killed.id === (prev?.id ?? next.id)) continue;
			if (killed.row) {
				ctx.eventBus.emit(objectEvent(killed.row, { cascade: true }));
			}
		}
		for (const row of pausedParts) ctx.eventBus.emit(objectEvent(row));
		if (prev && pauseMoved && next.paused === "stopped") {
			await deps.agentOrchestration.stopRunsForTasks(await taskDb.listSubtreeIds(ctx.db, prev.id));
		}
		if (prev && pauseMoved && next.paused === null) {
			await resumeSubtree(ctx, prev.id, prev.paused === "stopped");
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
		for (const killed of killedTasks) {
			await handleDependencyKilled(
				{ actor: "system:propagation", db: ctx.db, eventBus: ctx.eventBus, now: ctx.now },
				killed.id,
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
