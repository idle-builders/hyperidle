import { type HyperIdleDb, tasks } from "@hyperidle/db";
import type { EventBus, TaskState } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { transitionTask } from "../services/task-state-machine.js";

/**
 * Zod schemas for request validation.
 */
const updateTaskSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	doneCondition: z.string().optional(),
	ownerAgentId: z.string().optional(),
});

const transitionTaskSchema = z.object({
	state: z.string(),
});

/**
 * Create Hono routes for task endpoints.
 * Requires db and eventBus injected.
 */
export function createTaskRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

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

		transitionTask(db, eventBus, taskId, body.state as TaskState);

		const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		return c.json(updated);
	});

	return router;
}
