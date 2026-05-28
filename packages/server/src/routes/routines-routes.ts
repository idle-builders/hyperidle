import { type HyperIdleDb, routines, sessions, tasks } from "@hyperidle/db";
import { isBuiltinRoutineId, type PostBetRetroArgs, runBuiltinRoutine } from "@hyperidle/fabric";
import { API_ERROR_CODES, type EventBus, type SessionStartedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
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
	router.get("/", async (c) => {
		const allRoutines = await db.select().from(routines);
		return c.json(allRoutines);
	});

	// PATCH /:id — Update routine
	router.patch("/:id", validateBody(updateRoutineSchema), async (c) => {
		const routineId = c.req.param("id");
		// @lore G4 Hono zValidator typing: `c.req.valid("json")` returns
		// `never` when the route builder cannot infer the validator target
		// chain — specifically when the `validateBody` helper wraps
		// `zValidator` and the resulting middleware is passed through
		// Hono's handler positional overloads. The `"json" as never` +
		// `as z.infer<…>` double cast is load-bearing: dropping either
		// half resurrects the TS error. This matches the pattern used
		// across `bets.ts`, `tasks.ts`, `knowledge.ts`, `sessions-routes.ts`,
		// and `agents.ts`; `git-export-routes.ts` gets away without the
		// cast because it does not re-export the route factory. Fixing
		// this properly requires either rewriting `validateBody` to
		// preserve the generic parameter chain or inlining `zValidator`
		// at every call site — out of scope for the G4 fix-pack.
		const body = c.req.valid("json" as never) as z.infer<typeof updateRoutineSchema>;

		const [existing] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		if (!existing) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const updates: Record<string, unknown> = {};
		if (body.active !== undefined) updates.active = body.active;
		if (body.triggerConfig !== undefined) updates.triggerConfig = body.triggerConfig;
		if (body.autonomyLevel !== undefined) updates.autonomyLevel = body.autonomyLevel;
		if (body.silent !== undefined) updates.silent = body.silent;

		if (Object.keys(updates).length > 0) {
			await db.update(routines).set(updates).where(eq(routines.id, routineId));
		}

		const [updated] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		return c.json(updated);
	});

	// POST /:id/retire — Retire routine
	router.post("/:id/retire", async (c) => {
		const routineId = c.req.param("id");

		const [existing] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		if (!existing) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		await db.update(routines).set({ active: false }).where(eq(routines.id, routineId));

		const [updated] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		return c.json(updated);
	});

	// POST /:id/trigger — Manually trigger routine
	router.post("/:id/trigger", async (c) => {
		const routineId = c.req.param("id");

		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		if (!routine) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// G4 AC8: a disabled routine must not fire, even via manual trigger.
		if (routine.active === false) {
			return c.json(
				{ error: "Routine is disabled (active=0)", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		// G4 AC7: dispatch to the builtin handler when the routine id is a
		// builtin. The builtin handlers do not create sessions.
		if (isBuiltinRoutineId(routineId)) {
			let args: PostBetRetroArgs | undefined;
			if (routineId === "builtin:post-bet-retro") {
				const body = (await c.req.json().catch(() => ({}))) as Partial<PostBetRetroArgs>;
				if (!body.betId || typeof body.betId !== "string") {
					return c.json(
						{
							error: "builtin:post-bet-retro requires { betId } in the request body",
							code: API_ERROR_CODES.VALIDATION_ERROR,
						},
						400,
					);
				}
				args = { betId: body.betId };
			}
			const result = await runBuiltinRoutine(db, eventBus, routineId, args);
			if (!result.fired) {
				return c.json({ routineId, fired: false, reason: result.reason }, 200);
			}
			return c.json({ routineId, fired: true, ...(result.extra ?? {}) }, 200);
		}

		const sessionId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Create a stub task for the routine trigger (D5 stub — no real orchestration)
		// Find the routine owner's team to satisfy FK constraints
		const ownerTasks = await db
			.select()
			.from(tasks)
			.where(eq(tasks.ownerAgentId, routine.ownerAgentId));
		let referenceTaskId: string;

		if (ownerTasks.length > 0) {
			// Use an existing task owned by the agent
			referenceTaskId = ownerTasks[0].id;
		} else {
			// Find any task to get required FK fields, or create a minimal stub
			const anyTask = await db.select().from(tasks);
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
		await db.insert(sessions).values({
			id: sessionId,
			taskId: referenceTaskId,
			agentId: routine.ownerAgentId,
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		// Update routine lastRunAt
		await db.update(routines).set({ lastRunAt: now }).where(eq(routines.id, routineId));

		eventBus.emit<"session_started">({
			type: "session_started",
			streamId: sessionId,
			sessionId,
			agentId: routine.ownerAgentId,
			taskId: referenceTaskId,
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);

		const [created] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		return c.json(created, 201);
	});

	return router;
}
