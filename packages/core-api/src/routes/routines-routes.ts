import type { HyperIdleDb } from "@hyperidle/db";
import { getTeam } from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import { humanizeSchedule } from "@hyperidle/routine";
import {
	API_ERROR_CODES,
	deriveInitials,
	type EventBus,
	nextCronMatch,
	parseCron,
	ROUTINE_STATES,
	type RoutineDetail,
	type RoutineInfo,
	type RoutineRunOutcome,
	type RoutineRunSummary,
} from "@hyperidle/shared";
import { requireBoundary, validateBody } from "@hyperidle/shared/http";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { fireRoutine } from "../services/routine-scheduler-bindings.js";

const ROUTINE_STATE_VALUES = ROUTINE_STATES as readonly [string, ...string[]];
const BUILTIN_ROUTINE_KINDS = new Set([
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion",
]);

function builtinKind(id: string): string | null {
	const parts = id.split(":");
	const kind = parts.length >= 2 ? `builtin:${parts[1]}` : id;
	return BUILTIN_ROUTINE_KINDS.has(kind) ? kind : null;
}

/**
 * AA2: Schema for POST /api/routines (create routine).
 *
 * @lore AU21 §9 Increment 2: `id` is an optional client-supplied override —
 * the `CoreApiPort.routine.insertRoutine` seam method's real caller
 * (`create_routine`'s tool handler) pre-computes a routine id itself (needed
 * to report `routineId` back in its own response before the seam call
 * returns) and must round-trip the SAME id through the route. The real UI
 * caller (`RoutineCreateDialog.tsx`) never supplies one, so the default
 * server-generated-id behavior is unchanged for that path.
 */
const createRoutineSchema = z.object({
	id: z.string().min(1).optional(),
	name: z.string().min(1).max(200),
	description: z.string().max(2000).nullish(),
	teamId: z.string().min(1),
	ownerAgentId: z.string().min(1),
	triggerType: z.literal("calendar"),
	triggerConfig: z.string().min(1),
});

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
 * Map routine state string to `active` boolean for backward compat.
 * active → true, paused/error → false.
 */
function stateToActive(state: string): boolean {
	return state === "active";
}

/**
 * Create Hono routes for routine endpoints (E6).
 *
 * @lore AU11 AC-2: this factory used to accept an optional `RoutineProvisionDeps`
 * (AdapterPool/SandboxAdapter-typed) parameter documented as gating a
 * "full 11-phase provisioning" path on POST /:id/trigger. It was never
 * consumed (`_provisionDeps` was unread) and no production call site
 * populated it — dead threading left over from a pre-AU9 design. Removed
 * per the AU11 route-cleanup classification; POST /:id/trigger now delegates
 * to the cohesive `fireRoutine` path.
 *
 * @lore AU21 §9 Increment 4: `dispatchOps.fireRoutine` relocated to
 * `routine-scheduler-bindings.ts`'s `fireRoutine` — dispatch itself no
 * longer knows about routines.
 */
export function createRoutineRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// POST / — Create routine (AA2 AC-1)
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		validateBody(createRoutineSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createRoutineSchema>;

			// Verify teamId exists
			const team = await getTeam(db, { id: body.teamId });
			if (!team) {
				return c.json({ error: "Team not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			// Verify ownerAgentId exists
			const agent = await findUser(db, { id: body.ownerAgentId });
			if (!agent) {
				return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			// Validate cron expression
			let triggerConfigParsed: { cron?: string };
			try {
				triggerConfigParsed = JSON.parse(body.triggerConfig) as { cron?: string };
			} catch {
				return c.json(
					{
						error: "Invalid triggerConfig: must be valid JSON",
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}

			if (!triggerConfigParsed.cron) {
				return c.json(
					{
						error: "Invalid triggerConfig: cron field required",
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}

			try {
				parseCron(triggerConfigParsed.cron);
			} catch {
				return c.json(
					{ error: "Invalid cron expression", code: API_ERROR_CODES.VALIDATION_ERROR },
					400,
				);
			}

			const routineId = body.id ?? crypto.randomUUID();
			const now = new Date().toISOString();

			// Compute nextRunAt from the cron expression
			let nextRunAt: string | null = null;
			try {
				const cron = parseCron(triggerConfigParsed.cron);
				nextRunAt = nextCronMatch(cron, new Date()).toISOString();
			} catch {
				// Should not reach here — already validated above
			}

			await routineService.insertRoutine(db, {
				id: routineId,
				name: body.name,
				description: body.description ?? null,
				teamId: body.teamId,
				ownerAgentId: body.ownerAgentId,
				triggerType: body.triggerType,
				triggerConfig: body.triggerConfig,
				state: "active",
				active: true,
				createdAt: now,
				nextRunAt,
			});

			const created = await routineService.getRoutine(db, routineId);
			return c.json(created, 201);
		},
	);

	// GET / — List all non-deleted routines (AA2: filter soft-deleted)
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const allRoutines = await routineService.listRoutines(db);
		return c.json(allRoutines);
	});

	// DELETE /:id — Soft delete routine (AA2 AC-2)
	router.delete("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const existing = await routineService.getRoutine(db, routineId);
		if (!existing || existing.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();
		await routineService.updateRoutine(db, routineId, {
			deletedAt: now,
			state: "paused",
			active: false,
		});

		return c.json({ deleted: true, deletedAt: now });
	});

	// GET /:id — RoutineDetail with run history (AC-5)
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const routine = await routineService.getRoutine(db, routineId);
		if (!routine || routine.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Resolve agent name
		const ownerUser = await findUser(db, { id: routine.ownerAgentId });
		const agentName = ownerUser?.name ?? routine.ownerAgentId;

		// Resolve team name
		const teamRow = await getTeam(db, { id: routine.teamId });
		const teamName = teamRow?.name ?? routine.teamId;

		// Fetch up to 20 runs (newest first). allRuns[0] is the latest run — no
		// separate latestRun query needed.
		const allRuns = await routineService.listRoutineRuns(db, {
			routineId,
			limit: 20,
			order: "desc",
		});

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
				errorMessage: run.errorMessage ?? null,
				// AA2: per-run summary
				summary: run.summary ?? null,
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
			lastRunOutcome: (allRuns[0]?.outcome ?? null) as RoutineRunOutcome | null,
			nextRunAt: routine.nextRunAt ?? null,
			createdAt: routine.createdAt ?? null,
			lastRunSummary: routine.lastRunSummary ?? null,
			// AV4: silent flag — defaults false for pre-AV4 routines missing the column
			silent: routine.silent ?? false,
		};

		const detail: RoutineDetail = {
			routine: routineInfo,
			runs: runSummaries,
		};

		return c.json(detail);
	});

	// PATCH /:id — Update routine
	router.patch(
		"/:id",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateRoutineSchema),
		async (c) => {
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

			const existing = await routineService.getRoutine(db, routineId);
			// AA2: treat soft-deleted routines as not found for PATCH
			if (!existing || existing.deletedAt) {
				return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const updates: routineService.RoutinePatch = {};
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
				await routineService.updateRoutine(db, routineId, updates);
			}

			const updated = await routineService.getRoutine(db, routineId);
			return c.json(updated);
		},
	);

	// POST /:id/retire — Retire routine
	router.post("/:id/retire", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const existing = await routineService.getRoutine(db, routineId);
		if (!existing) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		await routineService.updateRoutine(db, routineId, { active: false });

		const updated = await routineService.getRoutine(db, routineId);
		return c.json(updated);
	});

	// POST /:id/trigger — Manually trigger routine
	router.post("/:id/trigger", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const routine = await routineService.getRoutine(db, routineId);
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
		// @lore AF17: isBuiltinRoutineId now checks the kind prefix so per-team
		// ids (`builtin:post-bet-retro:<teamId>`) are correctly recognised.
		const kind = builtinKind(routineId);
		if (kind) {
			let args: { readonly betId: string } | undefined;
			// Check if this is a post-bet-retro by kind prefix (not exact id)
			if (kind === "builtin:post-bet-retro") {
				const body = (await c.req.json().catch(() => ({}))) as { betId?: string };
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
			const result = await fireRoutine(db, eventBus, routine, { args });
			if (!result.fired) {
				return c.json({ routineId, fired: false, reason: result.reason }, 200);
			}
			return c.json({ routineId, fired: true, ...(result.extra ?? {}) }, 200);
		}

		const result = await fireRoutine(db, eventBus, routine, {
			recordSkippedRun: true,
		});
		const reason = result.reason === "previous run still in progress" ? "coalesced" : result.reason;
		return c.json(
			{
				routineId,
				fired: result.fired,
				...(result.runId ? { runId: result.runId } : {}),
				...(reason ? { reason } : {}),
			},
			200,
		);
	});

	return router;
}
