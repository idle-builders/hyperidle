import {
	type HyperIdleDb,
	routineRuns,
	routines,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { isBuiltinRoutineId, type PostBetRetroArgs, runBuiltinRoutine } from "@hyperidle/fabric";
import {
	API_ERROR_CODES,
	type CurrencyCode,
	type EventBus,
	ROUTINE_STATES,
	type RoutineDetail,
	type RoutineInfo,
	type RoutineRunOutcome,
	type RoutineRunSummary,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { validateBody } from "../middleware/validate.js";
import { humanizeSchedule } from "../services/schedule-label.js";

const ROUTINE_STATE_VALUES = ROUTINE_STATES as readonly [string, ...string[]];

const updateRoutineSchema = z.object({
	active: z.boolean().optional(),
	triggerConfig: z.string().optional(),
	autonomyLevel: z.number().int().min(1).max(4).optional(),
	silent: z.boolean().optional(),
	// AA1: new fields
	state: z.enum(ROUTINE_STATE_VALUES as [string, ...string[]]).optional(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
});

/**
 * Derive agent initials from a name string.
 */
function deriveInitials(name: string): string {
	const words = name.trim().split(/\s+/);
	if (words.length >= 2) {
		return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

/**
 * Map routine state string to `active` boolean for backward compat.
 * active → true, paused/error → false.
 */
function stateToActive(state: string): boolean {
	return state === "active";
}

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

	// GET /:id — RoutineDetail with run history (AC-5)
	router.get("/:id", async (c) => {
		const routineId = c.req.param("id");

		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		if (!routine) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Resolve agent name
		const [ownerUser] = await db
			.select()
			.from(users)
			.where(eq(users.id, routine.ownerAgentId))
			.limit(1);
		const agentName = ownerUser?.name ?? routine.ownerAgentId;

		// Resolve team name
		const [teamRow] = await db.select().from(teams).where(eq(teams.id, routine.teamId)).limit(1);
		const teamName = teamRow?.name ?? routine.teamId;

		// Fetch latest routine run for lastRunOutcome
		const [latestRun] = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, routineId))
			.orderBy(desc(routineRuns.startedAt))
			.limit(1);

		// Fetch all runs (newest first)
		const allRuns = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, routineId))
			.orderBy(desc(routineRuns.startedAt));

		const runSummaries: RoutineRunSummary[] = allRuns.map((run) => {
			let durationSeconds: number | null = null;
			if (run.startedAt && run.endedAt) {
				const startMs = new Date(run.startedAt).getTime();
				const endMs = new Date(run.endedAt).getTime();
				if (!(Number.isNaN(startMs) || Number.isNaN(endMs))) {
					durationSeconds = Math.round((endMs - startMs) / 1000);
				}
			}
			return {
				id: run.id,
				startedAt: run.startedAt,
				endedAt: run.endedAt ?? null,
				durationSeconds,
				outcome: run.outcome as RoutineRunOutcome,
				cost:
					run.costMinor != null
						? { minor: run.costMinor, currency: (run.costCurrency ?? "USD") as CurrencyCode }
						: null,
				errorMessage: run.errorMessage ?? null,
			};
		});

		const routineInfo: RoutineInfo = {
			id: routine.id,
			name: routine.name,
			description: routine.description ?? null,
			state: (routine.state ?? "active") as RoutineInfo["state"],
			triggerType: routine.triggerType,
			triggerConfig: routine.triggerConfig ?? null,
			scheduleLabel: humanizeSchedule(routine.triggerType, routine.triggerConfig ?? null),
			ownerAgentId: routine.ownerAgentId,
			agentName,
			agentInitials: deriveInitials(agentName),
			teamId: routine.teamId,
			teamName,
			autonomyLevel: routine.autonomyLevel ?? null,
			humanReview: routine.humanReview ?? false,
			delegationAllowed: routine.delegationAllowed ?? false,
			lastRunAt: routine.lastRunAt ?? null,
			lastRunOutcome: (latestRun?.outcome ?? null) as RoutineRunOutcome | null,
			nextRunAt: routine.nextRunAt ?? null,
			costActual:
				routine.costActualMinor != null
					? {
							minor: routine.costActualMinor,
							currency: (routine.costActualCurrency ?? "USD") as CurrencyCode,
						}
					: null,
			createdAt: null,
		};

		const detail: RoutineDetail = {
			routine: routineInfo,
			runs: runSummaries,
		};

		return c.json(detail);
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
		// AA1: extended fields
		if (body.name !== undefined) updates.name = body.name;
		if (body.description !== undefined) updates.description = body.description;
		if (body.state !== undefined) {
			updates.state = body.state;
			// Sync active boolean with state for backward compat
			updates.active = stateToActive(body.state);
		}

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
			routineId: routineId,
		});

		// AA1: Insert a routine_run row to track this manual trigger
		const runId = crypto.randomUUID();
		await db.insert(routineRuns).values({
			id: runId,
			routineId: routineId,
			startedAt: now,
			outcome: "success",
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
