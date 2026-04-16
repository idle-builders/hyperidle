import { type HyperIdleDb, routines, sessions, tasks } from "@hyperidle/db";
import { API_ERROR_CODES, type EventBus, type SessionStartedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";

const updateRoutineSchema = z.object({
	active: z.boolean().optional(),
	triggerConfig: z.string().optional(),
	autonomyLevel: z.number().int().min(1).max(4).optional(),
	silent: z.boolean().optional(),
});

/**
 * Create Hono routes for routine endpoints (E6).
 */
export function createRoutineRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — List all routines
	router.get("/", (c) => {
		const allRoutines = db.select().from(routines).all();
		return c.json(allRoutines);
	});

	// PATCH /:id — Update routine
	router.patch("/:id", validateBody(updateRoutineSchema), (c) => {
		const routineId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateRoutineSchema>;

		const existing = db.select().from(routines).where(eq(routines.id, routineId)).get();
		if (!existing) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const updates: Record<string, unknown> = {};
		if (body.active !== undefined) updates.active = body.active ? 1 : 0;
		if (body.triggerConfig !== undefined) updates.triggerConfig = body.triggerConfig;
		if (body.autonomyLevel !== undefined) updates.autonomyLevel = body.autonomyLevel;
		if (body.silent !== undefined) updates.silent = body.silent ? 1 : 0;

		if (Object.keys(updates).length > 0) {
			db.update(routines).set(updates).where(eq(routines.id, routineId)).run();
		}

		const updated = db.select().from(routines).where(eq(routines.id, routineId)).get();
		return c.json(updated);
	});

	// POST /:id/retire — Retire routine
	router.post("/:id/retire", (c) => {
		const routineId = c.req.param("id");

		const existing = db.select().from(routines).where(eq(routines.id, routineId)).get();
		if (!existing) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		db.update(routines).set({ active: 0 }).where(eq(routines.id, routineId)).run();

		const updated = db.select().from(routines).where(eq(routines.id, routineId)).get();
		return c.json(updated);
	});

	// POST /:id/trigger — Manually trigger routine
	router.post("/:id/trigger", (c) => {
		const routineId = c.req.param("id");

		const routine = db.select().from(routines).where(eq(routines.id, routineId)).get();
		if (!routine) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const sessionId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Create a stub task for the routine trigger (D5 stub — no real orchestration)
		// Find the routine owner's team to satisfy FK constraints
		const ownerTasks = db
			.select()
			.from(tasks)
			.where(eq(tasks.ownerAgentId, routine.ownerAgentId))
			.all();
		let referenceTaskId: string;

		if (ownerTasks.length > 0) {
			// Use an existing task owned by the agent
			referenceTaskId = ownerTasks[0].id;
		} else {
			// Find any task to get required FK fields, or create a minimal stub
			const anyTask = db.select().from(tasks).all();
			if (anyTask.length > 0) {
				referenceTaskId = anyTask[0].id;
			} else {
				// No tasks exist — cannot create session without valid task FK
				return c.json(
					{ error: "No tasks available for session creation", code: API_ERROR_CODES.CONFLICT },
					409,
				);
			}
		}

		// Create a session for the routine's agent
		db.insert(sessions)
			.values({
				id: sessionId,
				taskId: referenceTaskId,
				agentId: routine.ownerAgentId,
				modelTier: "workhorse",
				startedAt: now,
				state: "active",
			})
			.run();

		// Update routine lastRunAt
		db.update(routines).set({ lastRunAt: now }).where(eq(routines.id, routineId)).run();

		eventBus.emit<"session_started">({
			type: "session_started",
			streamId: sessionId,
			sessionId,
			agentId: routine.ownerAgentId,
			taskId: referenceTaskId,
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);

		const created = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		return c.json(created, 201);
	});

	return router;
}
