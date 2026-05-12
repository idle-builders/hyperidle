import { bets, type HyperIdleDb, sessions, tasks } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { API_ERROR_CODES, TASK_STATES } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { validateBody } from "../middleware/validate.js";
import { handoff } from "../services/handoff-protocol.js";
import type { SessionContext } from "../services/session-lifecycle.js";
import { transitionTask } from "../services/task-state-machine.js";

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
export function createTaskRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// POST /tasks — create a new task (agent-driven decomposition)
	router.post("/", validateBody(createTaskSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createTaskSchema>;
		const now = new Date().toISOString();

		// Validate bet exists
		const bet = db.select().from(bets).where(eq(bets.id, body.betId)).get();
		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		const taskId = crypto.randomUUID();
		db.insert(tasks)
			.values({
				id: taskId,
				betId: body.betId,
				productId: bet.productId,
				teamId: bet.teamId,
				title: body.title,
				description: body.description ?? null,
				doneCondition: body.doneCondition ?? null,
				ownerAgentId: body.ownerAgentId ?? null,
				state: "proposed",
				costCap: body.costCap ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.run();

		const created = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(created, 201);
	});

	// GET /tasks — list, filterable by bet_id, state, owner
	router.get("/", (c) => {
		const betId = c.req.query("bet_id");
		const state = c.req.query("state");
		const owner = c.req.query("owner");

		const conditions = [];
		if (betId) conditions.push(eq(tasks.betId, betId));
		if (state) conditions.push(eq(tasks.state, state));
		if (owner) conditions.push(eq(tasks.ownerAgentId, owner));

		const result =
			conditions.length > 0
				? db
						.select()
						.from(tasks)
						.where(and(...conditions))
						.all()
				: db.select().from(tasks).all();

		return c.json(result);
	});

	// PATCH /tasks/:id — update mutable fields
	router.patch("/:id", validateBody(updateTaskSchema), (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateTaskSchema>;

		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
		}

		const updates: Record<string, string> = {
			updatedAt: new Date().toISOString(),
		};
		if (body.title !== undefined) updates.title = body.title;
		if (body.description !== undefined) updates.description = body.description;
		if (body.doneCondition !== undefined) updates.doneCondition = body.doneCondition;
		if (body.ownerAgentId !== undefined) updates.ownerAgentId = body.ownerAgentId;

		db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();

		const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(updated);
	});

	// POST /tasks/:id/transition — state transition
	router.post("/:id/transition", validateBody(transitionTaskSchema), (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof transitionTaskSchema>;

		transitionTask(db, eventBus, taskId, body.state);

		const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(updated);
	});

	// POST /tasks/:id/handoff — hand off task to another agent/role/human
	router.post("/:id/handoff", validateBody(handoffSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof handoffSchema>;

		const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const session = db.select().from(sessions).where(eq(sessions.id, body.sessionId)).get();
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Build a minimal SessionContext for handoff.
		// @lore I6: workspacePath must be non-empty or endSession's fs.promises.rm()
		// would attempt to rm(""), which is dangerous. Use a safe sentinel that
		// points to a non-existent path so rm() fails silently (force: true).
		const resolvedWorkspacePath =
			session.workspaceSnapshot?.trim() || `/tmp/.hyperidle-noop-${session.id}`;
		const sessionContext: SessionContext = {
			sessionId: session.id,
			agentId: session.agentId,
			taskId,
			workspacePath: resolvedWorkspacePath,
			watcher: {
				stop: (): void => {
					/* no-op */
				},
			},
			traceId: session.traceId ?? "",
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
	});

	return router;
}
