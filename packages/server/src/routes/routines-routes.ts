import { type HyperIdleDb, teams } from "@hyperidle/db";
import {
	type AgentWorkIntentEvent,
	API_ERROR_CODES,
	type CurrencyCode,
	type EventBus,
	ROUTINE_STATES,
	type RoutineBudget,
	type RoutineDetail,
	type RoutineInfo,
	type RoutineRunOutcome,
	type RoutineRunSummary,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { extractBuiltinKind, isBuiltinRoutineId } from "../config/builtin-routines.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { validateBody } from "../middleware/validate.js";
import * as routineService from "../routine-service.js";
import { deriveInitials } from "../services/agent-utils.js";
import { recordAgentWorkIntent } from "../services/agent-work-intents.js";
import { type PostBetRetroArgs, runBuiltinRoutine } from "../services/builtin-routine-handlers.js";
import { getRoutineMonthlySpend, nextCronMatch, parseCron } from "../services/routine-scheduler.js";
import { humanizeSchedule } from "../services/schedule-label.js";
import { getUserById } from "../services/user-store.js";

const ROUTINE_STATE_VALUES = ROUTINE_STATES as readonly [string, ...string[]];

/**
 * AA2: Schema for POST /api/routines (create routine).
 */
const createRoutineSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	teamId: z.string().min(1),
	ownerAgentId: z.string().min(1),
	triggerType: z.literal("calendar"),
	triggerConfig: z.string().min(1),
	costCapPerRunMinor: z.number().int().min(0).nullable().optional(),
	/** AA3: Optional per-month cost ceiling in minor units. */
	costCapMonthlyMinor: z.number().int().min(0).nullable().optional(),
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
	// AA2: cost cap per run
	costCapPerRunMinor: z.number().int().min(0).nullable().optional(),
	// AA3: monthly cost cap
	costCapMonthlyMinor: z.number().int().min(0).nullable().optional(),
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
 * per the AU11 route-cleanup classification; POST /:id/trigger always uses
 * `runBuiltinRoutine` / `recordAgentWorkIntent` (the real, current path).
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
			const [team] = await db.select().from(teams).where(eq(teams.id, body.teamId)).limit(1);
			if (!team) {
				return c.json({ error: "Team not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			// Verify ownerAgentId exists
			const agent = await getUserById(db, body.ownerAgentId);
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

			const routineId = crypto.randomUUID();
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
				costCapPerRunMinor: body.costCapPerRunMinor ?? null,
				// AA3: monthly cost cap
				costCapMonthlyMinor: body.costCapMonthlyMinor ?? null,
				nextRunAt,
			});

			const created = await routineService.getRoutineById(db, routineId);
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

		const existing = await routineService.getRoutineById(db, routineId);
		if (!existing || existing.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();
		await routineService.updateRoutineById(db, routineId, {
			deletedAt: now,
			state: "paused",
			active: false,
		});

		return c.json({ deleted: true, deletedAt: now });
	});

	// GET /:id — RoutineDetail with run history (AC-5)
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const routine = await routineService.getRoutineById(db, routineId);
		if (!routine || routine.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Resolve agent name
		const ownerUser = await getUserById(db, routine.ownerAgentId);
		const agentName = ownerUser?.name ?? routine.ownerAgentId;

		// Resolve team name
		const [teamRow] = await db.select().from(teams).where(eq(teams.id, routine.teamId)).limit(1);
		const teamName = teamRow?.name ?? routine.teamId;

		// Fetch up to 20 runs (newest first). allRuns[0] is the latest run — no
		// separate latestRun query needed.
		const allRuns = await routineService.listRoutineRunsByRoutine(db, routineId, {
			limit: 20,
			order: "desc",
		});

		// AA3: Compute budget stats using aggregate queries over ALL runs (not just the 20 in allRuns).
		// Critique Suggestion 2: use a separate AVG query, not allRuns.filter().
		const now3 = new Date();
		const firstOfMonth3 = new Date(
			Date.UTC(now3.getUTCFullYear(), now3.getUTCMonth(), 1),
		).toISOString();

		// AVG cost per run (from all runs with cost > 0)
		const avgCostMinor = await routineService.avgRoutineRunCost(db, routineId);

		// SUM cost this month
		const costThisMonthMinor = await routineService.sumRoutineRunCostSince(
			db,
			routineId,
			firstOfMonth3,
		);

		// Last completed run cost for per-run utilization (from the 20 most recent runs)
		const lastCompletedRun = allRuns.find(
			(r) =>
				r.costMinor != null &&
				r.costMinor > 0 &&
				(r.outcome === "success" || r.outcome === "budget_exhausted"),
		);
		const lastRunCostMinor = lastCompletedRun?.costMinor ?? null;

		const perRunUtilizationPercent =
			routine.costCapPerRunMinor != null && lastRunCostMinor != null
				? Math.round((lastRunCostMinor / routine.costCapPerRunMinor) * 100)
				: null;

		const monthlyUtilizationPercent =
			routine.costCapMonthlyMinor != null && costThisMonthMinor > 0
				? Math.round((costThisMonthMinor / routine.costCapMonthlyMinor) * 100)
				: null;

		const budget: RoutineBudget = {
			avgCostPerRun:
				avgCostMinor != null ? { minor: avgCostMinor, currency: "USD" as CurrencyCode } : null,
			costThisMonth:
				costThisMonthMinor > 0
					? { minor: costThisMonthMinor, currency: "USD" as CurrencyCode }
					: null,
			costCapPerRun:
				routine.costCapPerRunMinor != null
					? { minor: routine.costCapPerRunMinor, currency: "USD" as CurrencyCode }
					: null,
			costCapMonthly:
				routine.costCapMonthlyMinor != null
					? { minor: routine.costCapMonthlyMinor, currency: "USD" as CurrencyCode }
					: null,
			perRunUtilizationPercent,
			monthlyUtilizationPercent,
		};

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
			costActual:
				routine.costActualMinor != null
					? {
							minor: routine.costActualMinor,
							currency: (routine.costActualCurrency ?? "USD") as CurrencyCode,
						}
					: null,
			createdAt: routine.createdAt ?? null,
			// AA2: new fields
			costCapPerRun:
				routine.costCapPerRunMinor != null
					? {
							minor: routine.costCapPerRunMinor,
							currency: "USD" as CurrencyCode,
						}
					: null,
			// AA3: monthly cost cap
			costCapMonthly:
				routine.costCapMonthlyMinor != null
					? { minor: routine.costCapMonthlyMinor, currency: "USD" as CurrencyCode }
					: null,
			lastRunSummary: routine.lastRunSummary ?? null,
			// AV4: silent flag — defaults false for pre-AV4 routines missing the column
			silent: routine.silent ?? false,
		};

		const detail: RoutineDetail = {
			routine: routineInfo,
			runs: runSummaries,
			// AA3: budget stats
			budget,
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

			const existing = await routineService.getRoutineById(db, routineId);
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
			// AA2: cost cap per run (null removes the cap)
			if ("costCapPerRunMinor" in body)
				updates.costCapPerRunMinor = body.costCapPerRunMinor ?? null;
			// AA3: monthly cost cap (null removes the cap)
			if ("costCapMonthlyMinor" in body)
				updates.costCapMonthlyMinor = body.costCapMonthlyMinor ?? null;

			if (Object.keys(updates).length > 0) {
				await routineService.updateRoutineById(db, routineId, updates);
			}

			const updated = await routineService.getRoutineById(db, routineId);
			return c.json(updated);
		},
	);

	// POST /:id/retire — Retire routine
	router.post("/:id/retire", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const existing = await routineService.getRoutineById(db, routineId);
		if (!existing) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		await routineService.updateRoutineById(db, routineId, { active: false });

		const updated = await routineService.getRoutineById(db, routineId);
		return c.json(updated);
	});

	// POST /:id/trigger — Manually trigger routine
	router.post("/:id/trigger", requireBoundary({ kind: "public-data" }), async (c) => {
		const routineId = c.req.param("id");

		const routine = await routineService.getRoutineById(db, routineId);
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
		if (isBuiltinRoutineId(routineId)) {
			let args: PostBetRetroArgs | undefined;
			// Check if this is a post-bet-retro by kind prefix (not exact id)
			if (extractBuiltinKind(routineId) === "builtin:post-bet-retro") {
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

		const now = new Date().toISOString();

		// AA3: Monthly cap check — skip if monthly spend >= costCapMonthlyMinor.
		// Must run before coalescing so the monthly_budget_exhausted record is always written.
		// Critique Warning 3: return reason "monthly_budget_exhausted" (not the internal scheduler string).
		if (routine.costCapMonthlyMinor != null) {
			const monthlySpend = await getRoutineMonthlySpend(db, routineId);
			if (monthlySpend >= routine.costCapMonthlyMinor) {
				const runId = crypto.randomUUID();
				await routineService.insertRoutineRun(db, {
					id: runId,
					routineId,
					startedAt: now,
					outcome: "monthly_budget_exhausted",
				});
				return c.json({ routineId, fired: false, reason: "monthly_budget_exhausted" }, 200);
			}
		}

		// AU15 §4a (W2): unified run-row coalescing — the SAME signal
		// (`routineService.findRunningRoutineRun`) the poll path's
		// `checkAndFireRoutine` uses, so a poll-created fired-but-unprovisioned
		// run also blocks a concurrent manual trigger (closing the double-run
		// window the old session-keyed `shouldCoalesce` signal missed).
		const runningRun = await routineService.findRunningRoutineRun(db, routineId);
		if (runningRun) {
			// Record a skipped run
			const runId = crypto.randomUUID();
			await routineService.insertRoutineRun(db, {
				id: runId,
				routineId,
				startedAt: now,
				outcome: "skipped",
				errorMessage: "Coalesced: previous run still in progress",
			});
			return c.json({ routineId, fired: false, reason: "coalesced" }, 200);
		}

		const runId = crypto.randomUUID();
		let intent: Awaited<ReturnType<typeof recordAgentWorkIntent>> | undefined;
		await db.transaction(async (tx) => {
			await routineService.insertRoutineRun(tx, {
				id: runId,
				routineId,
				startedAt: now,
				outcome: "running",
			});
			await routineService.updateRoutineById(tx, routineId, { lastRunAt: now });
			intent = await recordAgentWorkIntent(tx as HyperIdleDb, {
				kind: "routine_run",
				sourceKind: "routine_run",
				sourceId: runId,
				requestedBy: routine.ownerAgentId,
				idempotencyKey: `routine:${runId}`,
			});
		});
		if (!intent) throw new Error("Routine intent was not persisted");
		eventBus.emit({
			type: "agent_work_intent_recorded",
			streamId: `routine:${routineId}`,
			intentId: intent.id,
			intentKind: "routine_run",
			sourceKind: "routine",
			sourceId: routineId,
			idempotencyKey: intent.idempotencyKey,
			timestamp: Date.now(),
		} satisfies AgentWorkIntentEvent);
		return c.json({ routineId, fired: true, runId }, 200);
	});

	return router;
}
