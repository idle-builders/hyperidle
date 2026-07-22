import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { SessionContext } from "@hyperidle/run-orchestration";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import type { EventBus } from "@hyperidle/shared";
import { API_ERROR_CODES, TASK_OUTCOME_VERDICTS, TASK_STATES } from "@hyperidle/shared";
import * as work from "@hyperidle/work";
import { transitionTask } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { enumValues } from "../schemas/common.schema.js";
import { handoff } from "../services/policy-bindings.js";

/**
 * Zod schemas for request validation.
 */
const createTaskSchema = z.object({
	betId: z.string(),
	title: z.string().min(1),
	description: z.string().optional(),
	doneCondition: z.string().optional(),
	ownerAgentId: z.string().optional(),
	costCap: z.number().int().optional(),
});

const updateTaskSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	doneCondition: z.string().optional(),
	ownerAgentId: z.string().optional(),
	/** AC1: Optional task outcome verdict. Set during review — not by the state machine. */
	outcomeVerdict: z.enum(enumValues(TASK_OUTCOME_VERDICTS)).optional(),
});

// I2 V1: enum-validate at the boundary so an unknown state surfaces as
// 400 from Zod, not 409 from the state machine.
const transitionTaskSchema = z.object({
	state: z.enum(TASK_STATES),
});

const handoffSchema = z.object({
	sessionId: z.string(),
	toAgent: z.string().optional(),
	toRole: z.string().optional(),
	toHuman: z.boolean().optional(),
	reason: z.string().min(1),
	artifacts: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
});

/**
 * Create Hono routes for task endpoints.
 * Requires db and eventBus injected.
 */
export function createTaskRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// POST /tasks — create a new task (agent-driven decomposition)
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		validateBody(createTaskSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createTaskSchema>;
			const now = new Date().toISOString();

			// Validate bet exists
			const bet = await work.get(db, "bet", body.betId);
			if (!bet) {
				return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
			}

			const taskId = crypto.randomUUID();
			await work.create(db, "task", {
				id: taskId,
				betId: body.betId,
				teamId: bet.teamId,
				title: body.title,
				description: body.description ?? null,
				doneCondition: body.doneCondition ?? null,
				ownerAgentId: body.ownerAgentId ?? null,
				state: "proposed",
				costCap: body.costCap ?? null,
				createdAt: now,
				updatedAt: now,
			});

			const created = await work.get(db, "task", taskId);
			return c.json(created, 201);
		},
	);

	// GET /tasks — list, filterable by bet_id, state, owner
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const betId = c.req.query("bet_id");
		const state = c.req.query("state");
		const owner = c.req.query("owner");

		const result = await work.list(db, "task", {
			...(betId ? { betId } : {}),
			...(state ? { state } : {}),
			...(owner ? { ownerAgentId: owner } : {}),
		});

		return c.json(result);
	});

	// GET /tasks/:id/sessions — read-only list of a task's sessions (AF12 AC4).
	// Returns the exact `{ sessions: TaskSession[] }` shape the `useTaskSessions`
	// hook expects. `status` is the session `state` (drives the live dot); a
	// cascade-stopped session reports 'stopped' (non-blank label downstream).
	// @lore O2: session cost/harness columns were stripped from the kernel table,
	// so `cost`/`harnessUrl`/`tokens` are null here. AF7 owns dispatch — no writes.
	router.get("/:id/sessions", requireBoundary({ kind: "public-data" }), async (c) => {
		const taskId = c.req.param("id");
		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		const rows = await db
			.select()
			.from(sessions)
			.where(eq(sessions.taskId, taskId))
			.orderBy(sessions.startedAt);
		const out = rows.map((s, i) => ({
			id: s.id,
			title: `Session ${i + 1}`,
			agent: s.agentId,
			cost: null,
			tokens: null,
			// @lore AF12: state-based contract — the frontend keys the live dot off
			// status === 'active'. Use `state` (not `outcome`) so a cascade-stopped
			// session renders 'stopped' via the raw-status fallback, never blank.
			status: s.state,
			harnessUrl: null,
			effectivenessScore:
				s.effectivenessScore != null && !Number.isNaN(Number.parseFloat(s.effectivenessScore))
					? Number.parseFloat(s.effectivenessScore)
					: null,
		}));
		return c.json({ sessions: out });
	});

	// PATCH /tasks/:id — update mutable fields
	router.patch(
		"/:id",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateTaskSchema),
		async (c) => {
			const taskId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof updateTaskSchema>;

			const task = await work.get(db, "task", taskId);
			if (!task) {
				return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
			}

			const now = new Date().toISOString();
			const updates: work.TaskPatch = {
				updatedAt: now,
			};
			if (body.title !== undefined) updates.title = body.title;
			if (body.description !== undefined) updates.description = body.description;
			if (body.doneCondition !== undefined) updates.doneCondition = body.doneCondition;
			if (body.ownerAgentId !== undefined) updates.ownerAgentId = body.ownerAgentId;

			// AC1: Record task outcome verdict with audit trail
			if (body.outcomeVerdict !== undefined) {
				updates.outcomeVerdict = body.outcomeVerdict;
				updates.outcomeRecordedAt = now;
				updates.outcomeRecordedBy = c.get("userId") ?? null;

				// Append to audit trail
				const auditTrail: Array<Record<string, unknown>> = task.auditTrail
					? (JSON.parse(task.auditTrail) as Array<Record<string, unknown>>)
					: [];
				auditTrail.push({
					timestamp: now,
					field: "outcomeVerdict",
					old_value: task.outcomeVerdict ?? null,
					new_value: body.outcomeVerdict,
					actor: c.get("userId") ?? null,
				});
				updates.auditTrail = JSON.stringify(auditTrail);
			}

			await work.update(db, "task", taskId, updates);

			const updated = await work.get(db, "task", taskId);
			return c.json(updated);
		},
	);

	// POST /tasks/:id/transition — state transition
	router.post(
		"/:id/transition",
		requireBoundary({ kind: "public-data" }),
		validateBody(transitionTaskSchema),
		async (c) => {
			const taskId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof transitionTaskSchema>;

			await transitionTask(db, eventBus, taskId, body.state, {
				workIntents: { record: enqueueWorkIntent },
			});

			const updated = await work.get(db, "task", taskId);
			return c.json(updated);
		},
	);

	// POST /tasks/:id/handoff — hand off task to another agent/role/human
	router.post(
		"/:id/handoff",
		requireBoundary({ kind: "public-data" }),
		validateBody(handoffSchema),
		async (c) => {
			const taskId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof handoffSchema>;

			const task = await work.get(db, "task", taskId);
			if (!task) {
				return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const [session] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, body.sessionId))
				.limit(1);
			if (!session) {
				return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			// Build a minimal SessionContext for handoff.
			// @lore I6: sandboxPath must be non-empty or endSession's fs.promises.rm()
			// would attempt to rm(""), which is dangerous. Use a safe sentinel that
			// points to a non-existent path so rm() fails silently (force: true).
			const resolvedWorkspacePath =
				session.sandboxSnapshot?.trim() || `/tmp/.hyperidle-noop-${session.id}`;
			const sessionContext: SessionContext = {
				sessionId: session.id,
				agentId: session.agentId,
				taskId,
				sandboxPath: resolvedWorkspacePath,
				// AK2: was `watcher: { stop() {} }` — renamed to `ingestion: { dispose() {} }`.
				// This is a no-op handle for the handoff path which doesn't need
				// real ingestion teardown (the handoff sets state=done, not completed).
				ingestion: {
					dispose: (): void => {
						/* no-op */
					},
				},
				// @lore O2: traceId stripped from sessions kernel table; use empty string until strategy layer provides it.
				traceId: "",
			};

			const result = await handoff(db, eventBus, {
				sessionContext,
				toAgent: body.toAgent,
				toRole: body.toRole,
				toHuman: body.toHuman,
				metadata: {
					context_id: session.id,
					status: "completed",
					reason: body.reason,
					artifacts: body.artifacts ?? [],
					remaining_work: body.remainingWork ?? [],
				},
			});

			return c.json(result);
		},
	);

	return router;
}
