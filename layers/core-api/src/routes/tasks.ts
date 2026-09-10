import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import {
	API_ERROR_CODES,
	canTransitionTaskState,
	TASK_OUTCOME_VERDICTS,
	TASK_STATES,
} from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { get as getKnowledgeItem } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import type { PolicySessionContext } from "@hyperidle/policy";
import type { Task, TaskKillCascadeDeps, TaskStateMachineDeps } from "@hyperidle/work";
import * as work from "@hyperidle/work";
import {
	assertNoCycle,
	assertValidDependencies,
	CapacityExceededError,
	cascadeTaskKill,
	hasUnfinishedDependency,
	InvalidTransitionError,
	TaskCycleError,
	TaskDependencyNotFoundError,
	transitionTask,
} from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { enumValues } from "../schemas/common.schema.js";
import { buildSeamBackedWorkIntentRecorder } from "../services/agent-orchestration-port-composition.js";
import { buildProductionHandoff } from "../services/policy-bindings.js";
import { taskRunResolverDeps } from "../services/task-run-resolver-bindings.js";

/**
 * BB1: `TeamCapacityReader` adapter — reads `teams.capacity` for the WIP
 * check on `-> in_progress`. Read-only (no setActiveBets write side).
 */
const teamCapacity: TaskStateMachineDeps["teamCapacity"] = {
	getByTeamId: (exec: WriteExecutor, teamId: string) => getTeam(exec, { id: teamId }),
};

/** Build the injected deps bag for `transitionTask` / `cascadeTaskKill`. */
function buildTaskDeps(agentOrchestration: AgentOrchestrationPort): TaskStateMachineDeps {
	return {
		workIntents: buildSeamBackedWorkIntentRecorder(agentOrchestration),
		taskRunResolver: taskRunResolverDeps,
		teamCapacity,
	};
}

/** Build the deps bag for `cascadeTaskKill`. */
function buildKillDeps(agentOrchestration: AgentOrchestrationPort): TaskKillCascadeDeps {
	return {
		...buildTaskDeps(agentOrchestration),
		runOrchestration: {
			requestRunStopForTasks: (_exec, taskIds) => agentOrchestration.runs.stopForTasks(taskIds),
		},
	};
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * BB1 POST /tasks body.
 * `teamId` may be omitted when `parentTaskId` is given — inherited from parent.
 */
const createTaskSchema = z
	.object({
		parentTaskId: z.string().optional(),
		teamId: z.string().optional(),
		title: z.string().min(1),
		description: z.string().nullish(),
		doneCondition: z.string().nullish(),
		ownerAgentId: z.string().nullish(),
		/**
		 * BA6: a list of task ids this task waits on. Validated on write —
		 * every id must name a task that exists, no self-dependency, no cycle.
		 * A non-empty list with any unfinished dependency parks the new task
		 * in `hold` instead of `proposed`.
		 */
		dependencies: z.array(z.string()).optional(),
		/** When true, finishing this task sends it to `review` rather than `done`. */
		needsReview: z.boolean().optional(),
		/**
		 * AK5 provenance — the knowledge item this task was promoted from.
		 * When present: validated to exist (unknown id -> 400); stored as FK on the row.
		 * When absent: null (hand-typed / assistant-drafted task).
		 *
		 * @lore BB1: carried over from the deleted `POST /bets`. A bet is a root
		 * task now, and "Promote to task" is the same door it always was.
		 */
		sourceKnowledgeItemId: z.string().optional(),
	})
	// @lore BB1: `.strict()` carried over from the deleted POST /bets. Without it
	// Zod silently STRIPS unknown keys, which is how a caller sending a field the
	// schema forgot (sourceKnowledgeItemId) got a 201 and no provenance.
	.strict()
	.refine((b) => b.teamId !== undefined || b.parentTaskId !== undefined, {
		message: "teamId is required when parentTaskId is omitted",
		path: ["teamId"],
	});

/**
 * BB1 PATCH /tasks/:id — the one edit door. No actor gate.
 * `.strict()` rejects unknown keys with a 400.
 *
 * `position` moves the task within its sibling list; siblings are renumbered
 * to a clean 0..n-1 sequence with no gaps inside a single transaction.
 * On reparent (`parentTaskId` change), the task is assigned the last position
 * under its new parent regardless of any explicit `position` value.
 */
const patchTaskSchema = z
	.object({
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		doneCondition: z.string().nullable().optional(),
		ownerAgentId: z.string().nullable().optional(),
		/** BA6: a list of task ids, or `null` to clear. Same validation as create. */
		dependencies: z.array(z.string()).nullable().optional(),
		parentTaskId: z.string().nullable().optional(),
		state: z.enum(enumValues(TASK_STATES)).optional(),
		position: z.number().int().nonnegative().optional(),
		/** Flip whether finishing this task routes to `review` (true) or `done` (false). */
		needsReview: z.boolean().optional(),
	})
	.strict();

/**
 * BB1 POST /tasks/:id/outcome — the surviving learning half of the deleted
 * bet retro. The plugin skill `post-task-retro` is the structured-learning half.
 */
const outcomeSchema = z.object({
	verdict: z.enum(enumValues(TASK_OUTCOME_VERDICTS)),
	summary: z.string().optional(),
});

/** PATCH /tasks/:id/notes — atomic note append (unchanged). */
const appendTaskNoteSchema = z.object({ entry: z.string().min(1) });

/** POST /tasks/:id/handoff — hand off to another agent/role/human (unchanged). */
const handoffSchema = z.object({
	sessionId: z.string(),
	toAgent: z.string().optional(),
	toRole: z.string().optional(),
	toHuman: z.boolean().optional(),
	reason: z.string().min(1),
	artifacts: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
	contextId: z.string().optional(),
	status: z.enum(["completed", "failed", "blocked", "in_progress"]).optional(),
	error: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

type TaskNode = Task & { children: TaskNode[] };

/** Build a recursive tree from a flat list, rooted at the given parentId. */
function buildChildren(all: Task[], parentId: string): TaskNode[] {
	return all
		.filter((t) => t.parentTaskId === parentId)
		.map((t) => ({ ...t, children: buildChildren(all, t.id) }));
}

/**
 * Total tokens used across a subtree — every task's own usage, summed at READ
 * time. Returns null when no task in the subtree has recorded any.
 *
 * @lore BB1: `tokensActualJson` is a serialised `TokenUsage`
 * (`framework/domain-model/src/types/money.ts`), which is NESTED:
 * `{ byTier: { <tier>: { prompt, completion, cachedPrompt? } } }` — the exact
 * shape `work-session-end-reactions.ts` writes. The first version of this
 * function summed only TOP-LEVEL numeric fields, so every real row (whose only
 * top-level key is the `byTier` object) contributed nothing and the rollup was
 * always `null`. Read the shape from the writer, never from the field's name.
 *
 * Returns a scalar, because that is what a subtree total means to a reader and
 * what the client type declares. A per-tier breakdown is a different question
 * and would need its own field.
 */
function sumTokensActual(tasks: Task[]): number | null {
	let total = 0;
	let any = false;
	for (const t of tasks) {
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

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create Hono routes for the task surface (BB1: replaces the deleted bet routes).
 *
 * @lore BB1: Every route in `bets.ts` is DELETED. This file is the single
 * task surface. `PATCH /tasks/:id` is the one edit door for humans and agents
 * alike — no role gate, no draft-only check, no approval interception.
 */
export function createTaskRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();
	const handoff = buildProductionHandoff(agentOrchestration);

	// -------------------------------------------------------------------------
	// GET /tasks
	// Filters: ?ids=a,b,c · ?parent_id=<id>|root · ?team_id= · ?state= · ?owner= · ?q=
	// -------------------------------------------------------------------------
	router.get("/", async (c) => {
		const ids = c.req.query("ids");
		const parentIdParam = c.req.query("parent_id");
		const teamId = c.req.query("team_id");
		const state = c.req.query("state");
		const owner = c.req.query("owner");
		const q = c.req.query("q");

		// `ids` wins over all other filters (work.list short-circuits to inArray).
		if (ids !== undefined) {
			const result = await work.list(db, "task", {
				ids: ids.split(",").filter((id) => id.length > 0),
			});
			return c.json(result);
		}

		// `parent_id=root` means tasks with no parent (NULL parent_task_id).
		const parentTaskId: string | null | undefined =
			parentIdParam === "root" ? null : parentIdParam !== undefined ? parentIdParam : undefined;

		const result = await work.list(db, "task", {
			...(parentTaskId !== undefined ? { parentTaskId } : {}),
			...(teamId ? { teamId } : {}),
			...(state ? { state } : {}),
			...(owner ? { ownerAgentId: owner } : {}),
			...(q ? { text: q } : {}),
		});

		return c.json(result);
	});

	// -------------------------------------------------------------------------
	// GET /tasks/:id — bare row
	// -------------------------------------------------------------------------
	router.get("/:id", async (c) => {
		const taskId = c.req.param("id");
		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		// AK5: enrich with sourceKnowledge:{id,title} when the provenance FK is set.
		// Lookup happens per-task (already on the PK path) — no index needed.
		let sourceKnowledge: { id: string; title: string } | null = null;
		if (task.sourceKnowledgeItemId != null) {
			const srcItem = await getKnowledgeItem(db, task.sourceKnowledgeItemId);
			sourceKnowledge = srcItem ? { id: srcItem.id, title: srcItem.title } : null;
		}
		return c.json({ ...task, sourceKnowledge });
	});

	// -------------------------------------------------------------------------
	// GET /tasks/:id/tree
	// Returns { task, ancestors: Task[], children: TaskNode[], tokensActualRollup }
	// ancestors: root-first for the breadcrumb.
	// children: recursively nested.
	// tokensActualRollup: summed over the whole subtree at read time (no rollup col).
	// -------------------------------------------------------------------------
	router.get("/:id/tree", async (c) => {
		const taskId = c.req.param("id");

		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Ancestors: nearest-first from listAncestorIds, reversed for root-first.
		const ancestorIds = await work.listAncestorIds(db, taskId);
		const ancestorTasks =
			ancestorIds.length > 0 ? await work.list(db, "task", { ids: ancestorIds }) : [];
		// Re-sort root-first: listAncestorIds returns nearest-first (depth 1, 2, …).
		const ancestorById = new Map(ancestorTasks.map((t) => [t.id, t]));
		const ancestors: Task[] = [...ancestorIds].reverse().flatMap((id) => {
			const t = ancestorById.get(id);
			return t ? [t] : [];
		});

		// Subtree: all descendants (inclusive of root).
		const subtreeIds = await work.listSubtreeIds(db, taskId);
		const subtreeTasks =
			subtreeIds.length > 0 ? await work.list(db, "task", { ids: subtreeIds }) : [task];

		// Build nested children structure (excluding root itself).
		const children = buildChildren(subtreeTasks, taskId);

		// Token rollup across the whole subtree.
		const tokensActualRollup = sumTokensActual(subtreeTasks);

		return c.json({ task, ancestors, children, tokensActualRollup });
	});

	// -------------------------------------------------------------------------
	// POST /tasks — create with optional parentTaskId
	// teamId may be omitted when parentTaskId is given (inherited from parent).
	// -------------------------------------------------------------------------
	router.post("/", validateBody(createTaskSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createTaskSchema>;
		const now = new Date().toISOString();

		let resolvedTeamId = body.teamId;

		if (body.parentTaskId !== undefined) {
			// Assert no cycle before creating (creating under self is impossible,
			// but a round-trip to a corrupt subtree should still be guarded).
			const parent = await work.get(db, "task", body.parentTaskId);
			if (!parent) {
				return c.json({ error: "Parent task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}
			// Inherit teamId from parent when not supplied.
			resolvedTeamId ??= parent.teamId;
		}

		if (!resolvedTeamId) {
			return c.json({ error: "teamId is required", code: API_ERROR_CODES.VALIDATION_ERROR }, 400);
		}

		// AK5: validate sourceKnowledgeItemId refers to an existing knowledge item.
		// Guards a dangling provenance FK — the column is ON DELETE RESTRICT.
		if (body.sourceKnowledgeItemId !== undefined) {
			const srcItem = await getKnowledgeItem(db, body.sourceKnowledgeItemId);
			if (!srcItem) {
				return c.json(
					{
						error: `Knowledge item '${body.sourceKnowledgeItemId}' not found`,
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}
		}

		// Assign position as last among current siblings so new tasks append
		// rather than all landing on the schema default 0.
		// @lore BB1: `work.maxSiblingPosition` returns -1 for an empty group so the
		// first child gets 0. This read and insert are NOT in one transaction —
		// two concurrent POSTs can race and both compute the same max. That is
		// acceptable: both will land on the same position value and the tiebreak
		// ordering (createdAt, id) in list() keeps the display order stable.
		// A fully serialised increment would require a transaction per insert,
		// which is overkill given the ultra-low concurrent-create rate in practice.
		const resolvedParentTaskId = body.parentTaskId ?? null;
		const siblingMax = await work.maxSiblingPosition(db, resolvedParentTaskId, resolvedTeamId);

		const taskId = crypto.randomUUID();
		const dependencyIds = body.dependencies ?? [];

		try {
			await db.transaction(async (tx) => {
				// BA6: validate + decide the initial state INSIDE the same
				// transaction as the insert — every id must exist, no
				// self-dependency, no cycle.
				let initialState: TaskState = "proposed";
				if (dependencyIds.length > 0) {
					await assertValidDependencies(tx, taskId, dependencyIds);
					if (await hasUnfinishedDependency(tx, dependencyIds)) {
						initialState = "hold";
					}
				}
				await work.create(tx, "task", {
					id: taskId,
					parentTaskId: resolvedParentTaskId,
					teamId: resolvedTeamId,
					title: body.title,
					description: body.description ?? null,
					doneCondition: body.doneCondition ?? null,
					ownerAgentId: body.ownerAgentId ?? null,
					state: initialState,
					dependencies: dependencyIds.length > 0 ? JSON.stringify(dependencyIds) : null,
					position: siblingMax + 1,
					needsReview: body.needsReview ?? false,
					sourceKnowledgeItemId: body.sourceKnowledgeItemId ?? null,
					createdAt: now,
					updatedAt: now,
				});
			});
		} catch (err) {
			if (err instanceof TaskDependencyNotFoundError) {
				return c.json({ error: err.message, code: API_ERROR_CODES.NOT_FOUND }, 404);
			}
			if (err instanceof TaskCycleError) {
				return c.json({ error: err.message, code: "TASK_CYCLE" }, 409);
			}
			throw err;
		}

		const created = await work.get(db, "task", taskId);
		return c.json(created, 201);
	});

	// -------------------------------------------------------------------------
	// PATCH /tasks/:id — the ONE edit door (BB1).
	//
	// Rules (api-contract.md §PATCH):
	//   1. No actor gate. Human and agent get identical results.
	//   2. `state` routes through transitionTask (never a bare column write).
	//   3. `parentTaskId` calls assertNoCycle INSIDE the same transaction as the write.
	//   4. Everything else is a plain field write + updatedAt.
	//   5. Unknown keys rejected (400) — enforced by .strict() on the schema.
	// -------------------------------------------------------------------------
	/**
	 * Apply a requested `state` to a task through the right machine.
	 *
	 * @lore BB1: killing is a SUBTREE operation, and PATCH is the door the
	 * interface actually uses. It used to call `transitionTask`, which kills
	 * exactly one task — so killing a parent from the UI left its children alive
	 * underneath a killed parent. The cascade existed and was tested, but its only
	 * caller had been the bet overflow menu that BB1 deleted, so it shipped
	 * unreachable. Routing the one edit door through `cascadeTaskKill` is what
	 * makes the two agree, rather than adding a second door that disagrees.
	 *
	 * @lore BB1: `killed` deliberately escapes the same-state no-op guard. For
	 * every other state, asking for the state a task already has is nothing to do.
	 * A kill is not only about this task: re-issuing it on an already-killed
	 * parent is how a half-killed subtree gets finished off, and the guard would
	 * swallow that request whole.
	 */
	async function applyStateChange(
		state: TaskState | undefined,
		/** The task's stored state. Typed as the DB column is — text, not the union. */
		current: string,
		taskId: string,
	): Promise<void> {
		if (state === "killed") {
			await cascadeTaskKill(db, eventBus, taskId, buildKillDeps(agentOrchestration));
			return;
		}
		if (state === undefined || state === current) return;
		await transitionTask(db, eventBus, taskId, state, buildTaskDeps(agentOrchestration));
	}

	router.patch("/:id", validateBody(patchTaskSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof patchTaskSchema>;

		// Separate state, parentTaskId, position and dependencies from the
		// plain-field patch. `dependencies` needs its own validation +
		// JSON encoding, so it is never spread verbatim into `plainFields`.
		const { state, parentTaskId, position, dependencies, ...plainFields } = body;

		// Verify the task exists before any writes.
		const existing = await work.get(db, "task", taskId);
		if (!existing) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();

		/**
		 * BA6: validate `dependencies` INSIDE the same transaction as the write
		 * that carries it — every id must name a task that exists, no
		 * self-dependency, no cycle — and encode the array back to the column's
		 * JSON-text shape. `undefined` means the caller didn't touch the field.
		 */
		async function resolveDependenciesFragment(
			tx: WriteExecutor,
		): Promise<{ dependencies?: string | null }> {
			if (dependencies === undefined) return {};
			if (dependencies === null) return { dependencies: null };
			await assertValidDependencies(tx, taskId, dependencies);
			return { dependencies: JSON.stringify(dependencies) };
		}

		try {
			// -- parentTaskId reparent (must assertNoCycle INSIDE the transaction) --
			if (parentTaskId !== undefined) {
				await db.transaction(async (tx) => {
					if (parentTaskId !== null) {
						await assertNoCycle(tx, taskId, parentTaskId);
					}
					// Assign last position under the new parent so the task appends
					// rather than colliding with an existing sibling's position.
					// @lore BB1: this read is INSIDE the transaction — two concurrent
					// reparents to the same parent cannot both compute the same max.
					const newParentMax = await work.maxSiblingPosition(tx, parentTaskId, existing.teamId);
					const patch: Record<string, unknown> = {
						...plainFields,
						...(await resolveDependenciesFragment(tx)),
						parentTaskId,
						position: newParentMax + 1,
						updatedAt: now,
					};
					await work.update(tx, "task", taskId, patch);
				});
			} else if (position !== undefined) {
				// -- position reorder within current sibling group --
				// Reads all siblings inside a transaction, moves this task to the
				// requested slot, renumbers all to a clean 0..n-1 sequence.
				// @lore BB1: the read + bulk update are atomic inside one transaction
				// so two concurrent moves cannot interleave into a corrupt order.
				await db.transaction(async (tx) => {
					// Apply any other plain-field changes alongside the reorder.
					const dependenciesFragment = await resolveDependenciesFragment(tx);
					if (Object.keys(plainFields).length > 0 || Object.keys(dependenciesFragment).length > 0) {
						await work.update(tx, "task", taskId, {
							...plainFields,
							...dependenciesFragment,
							updatedAt: now,
						});
					}

					// Read all siblings (including this task) ordered by current position.
					//
					// @lore BB1: scoped by `teamId` as well as parent. For a NESTED
					// task the parent already implies the team, so the filter is
					// redundant — but for a ROOT task `parentTaskId` is null, and
					// "siblings" without a team filter means every root task in every
					// team. Reordering one team's roots would renumber and bump
					// `updatedAt` on every other team's roots: a cross-tenant write
					// nobody asked for, invisible in the UI because within-team order
					// still looked right.
					const siblings = await work.list(tx, "task", {
						parentTaskId: existing.parentTaskId,
						teamId: existing.teamId,
					});

					// Build the new order: remove self, insert at clamped slot.
					const others = siblings.filter((s) => s.id !== taskId);
					const clamped = Math.max(0, Math.min(position, others.length));
					const self = siblings.find((s) => s.id === taskId);
					const reordered = [
						...others.slice(0, clamped),
						self ?? { id: taskId },
						...others.slice(clamped),
					];

					// Renumber all siblings to a clean 0..n-1 sequence.
					for (let i = 0; i < reordered.length; i++) {
						const row = reordered[i];
						if (!row) continue;
						await work.update(tx, "task", row.id, { position: i, updatedAt: now });
					}
				});
			} else if (Object.keys(plainFields).length > 0 || dependencies !== undefined) {
				// Plain field writes, possibly including dependencies.
				await db.transaction(async (tx) => {
					await work.update(tx, "task", taskId, {
						...plainFields,
						...(await resolveDependenciesFragment(tx)),
						updatedAt: now,
					});
				});
			}

			// -- state transition (after plain writes so the task is already in its new shape) --
			//
			// @lore BB1: a `state` equal to the one the task already has is a NO-OP,
			// not an error. The edit form submits every field it renders, including
			// the state dropdown, so a user changing only the title sends the
			// current state back unchanged — and `in_progress -> in_progress` is not
			// a member of TASK_STATE_TRANSITIONS, so the whole save died with a 409.
			// Setting a field to the value it already holds is not an invalid
			// transition; only an actual CHANGE of state goes through the machine.
			//
			await applyStateChange(state, existing.state, taskId);

			// BA6: setting dependencies parks the task automatically — but only
			// when the caller didn't ALSO ask for an explicit state change, and
			// only when hold is a legal move from the task's CURRENT state.
			// `TASK_STATE_TRANSITIONS` has no edge into `hold` from `in_progress`
			// or `blocked`, so a task already running is never rewound by a
			// later dependencies write — the same chain that forbids a direct
			// `hold -> in_progress` shortcut also forbids this one.
			if (
				state === undefined &&
				dependencies !== undefined &&
				dependencies !== null &&
				dependencies.length > 0 &&
				canTransitionTaskState(existing.state as TaskState, "hold") &&
				(await hasUnfinishedDependency(db, dependencies))
			) {
				await transitionTask(db, eventBus, taskId, "hold", buildTaskDeps(agentOrchestration));
			}
		} catch (err) {
			if (err instanceof TaskDependencyNotFoundError) {
				return c.json({ error: err.message, code: API_ERROR_CODES.NOT_FOUND }, 404);
			}
			if (err instanceof TaskCycleError) {
				return c.json({ error: err.message, code: "TASK_CYCLE" }, 409);
			}
			if (err instanceof InvalidTransitionError) {
				return c.json({ error: err.message, code: "INVALID_TRANSITION" }, 409);
			}
			if (err instanceof CapacityExceededError) {
				return c.json({ error: err.message, code: "CAPACITY_EXCEEDED" }, 409);
			}
			throw err;
		}

		const updated = await work.get(db, "task", taskId);
		if (!updated) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json(updated);
	});

	// -------------------------------------------------------------------------
	// POST /tasks/:id/outcome — record task outcome (verdict + optional summary).
	// The learning half of the deleted bet retro.
	// -------------------------------------------------------------------------
	router.post("/:id/outcome", validateBody(outcomeSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof outcomeSchema>;

		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();
		const actor = c.get("userId") ?? null;

		await work.update(db, "task", taskId, {
			outcomeVerdict: body.verdict,
			outcomeSummary: body.summary ?? null,
			outcomeRecordedAt: now,
			outcomeRecordedBy: actor,
			updatedAt: now,
		});

		const updated = await work.get(db, "task", taskId);
		if (!updated) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json(updated);
	});

	// -------------------------------------------------------------------------
	// PATCH /tasks/:id/notes — atomic note append (unchanged from pre-BB1).
	// -------------------------------------------------------------------------
	router.patch("/:id/notes", validateBody(appendTaskNoteSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof appendTaskNoteSchema>;

		const result = await work.update(db, "task", taskId, { notes: { appendNote: body.entry } });
		if (!result) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json(result);
	});

	// -------------------------------------------------------------------------
	// POST /tasks/:id/handoff — hand off to another agent/role/human (unchanged).
	// -------------------------------------------------------------------------
	router.post("/:id/handoff", validateBody(handoffSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof handoffSchema>;

		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// @lore AU26 J4: reads the run through the seam's read door, not a direct table read.
		const session = await agentOrchestration.sessions.getById(body.sessionId);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const sessionContext: PolicySessionContext = {
			sessionId: session.id,
			agentId: session.agentId,
			taskId,
		};

		const result = await handoff(db, eventBus, {
			sessionContext,
			toAgent: body.toAgent,
			toRole: body.toRole,
			toHuman: body.toHuman,
			metadata: {
				context_id: body.contextId ?? session.id,
				status: body.status ?? "completed",
				reason: body.reason,
				artifacts: body.artifacts ?? [],
				remaining_work: body.remainingWork ?? [],
				...(body.error !== undefined ? { error: body.error } : {}),
			},
		});

		return c.json(result);
	});

	return router;
}
