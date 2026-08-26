/**
 * AU13: Routine service — the only module permitted to read or write
 * `routines`, `routine_runs`. Every write call site enumerated in
 * `.pipeline/plans/AU13.md` §4d-§4e, and every read call site enumerated in
 * the read-ownership addendum §A3, routes through one of these functions
 * instead of a direct `insert`/`update`/`delete`/`select` against the table
 * objects.
 *
 * Mirrors `work-service.ts`'s style / `WriteExecutor` executor-first param
 * (reused for reads too — addendum §A3, no separate `ReadExecutor`).
 * Event emission stays at call sites (out of scope — see plan §3). The two
 * `tx.insert(threads)` writes inside `builtin-routine-handlers.ts` are
 * deferred to AU12's Conversation service (plan §6) — `threads` is not one
 * of this service's tables.
 *
 * @lore AU13 addendum §A2/A9: this file imports ZERO foreign tables for
 * reads (unlike `work-service.ts`, which owns the two sanctioned
 * foreign-import functions). Keep it that way — a routine read that appears
 * to need a foreign join should route the foreign lookup through the
 * caller instead (see `work-service.ts`'s `searchBetsByText` for the
 * pattern), not import a table here.
 *
 * @lore AU20 Am2: collapsed 24 exports → 15. Five predicate-specific list
 * fns → `listRoutines(filter)`, two updateRun variants → `updateRoutineRun(opts?)`,
 * and get-by-id renames (`getRoutine`/`getRoutineRun`). The AU20-era
 * cost-aggregation trio → `sumRunCost({kind})` collapse is now moot: AU21
 * Increment 14a deleted `sumRunCost`/`incrementRoutineCost` entirely along
 * with the rest of the cost feature, no replacement. The `| SQL` widening on
 * patch types is intentionally kept — `updateRoutine` is still the general
 * setter and the widening does no harm (harmless type flexibility, not tied
 * to any specific caller need anymore).
 *
 * @lore AU44 B3: `insertRoutine` now computes `nextRunAt` owner-side from
 * `triggerType`/`triggerConfig`, using the cron utilities private to this
 * package. Non-owner callers (routines-routes.ts, create_routine tool) drop
 * their cron imports entirely — a bad cron expression throws here and is
 * caught by the caller as a 400 / INVALID_INPUT.
 */
import {
	type HyperIdleDb,
	type NewRoutine,
	type NewRoutineRun,
	routineRuns,
	routines,
	type Team,
	type User,
	type WriteExecutor,
} from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedContextBundle,
	SessionKnowledgeItemLike,
} from "@hyperidle/domain-model";
import { bakeAgentRunnableConfig, toBakedContextKnowledgeItems } from "@hyperidle/domain-model";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { nextCronMatch, parseCron } from "./cron.js";

export type Routine = typeof routines.$inferSelect;
export type RoutineRun = typeof routineRuns.$inferSelect;

/** Patch type for `updateRoutine`. */
export type RoutinePatch = Partial<NewRoutine>;
/** Patch type for `updateRoutineRun`. */
export type RoutineRunPatch = Partial<NewRoutineRun>;

// ---------------------------------------------------------------------------
// routines — writes
// ---------------------------------------------------------------------------

/**
 * Compute nextRunAt from triggerType/triggerConfig — the owner-side
 * calculation. Calendar routines parse the cron expression (throws on
 * invalid input); heartbeat/continuous use intervalSeconds; event/unknown
 * return null.
 *
 * @throws if triggerType is "calendar" and the cron expression is invalid
 */
export function computeRoutineNextRunAt(
	triggerType: string,
	triggerConfig: string | null,
	now: Date,
): string | null {
	let config: { intervalSeconds?: number; cron?: string } = {};
	try {
		config = JSON.parse(triggerConfig ?? "{}") as {
			intervalSeconds?: number;
			cron?: string;
		};
	} catch {
		// malformed JSON — treat as no config
	}
	if (triggerType === "heartbeat" || triggerType === "continuous") {
		const intervalMs = (config.intervalSeconds ?? 60) * 1000;
		return new Date(now.getTime() + intervalMs).toISOString();
	}
	if (triggerType === "calendar" && config.cron) {
		return nextCronMatch(parseCron(config.cron), now).toISOString();
	}
	return null;
}

export async function insertRoutine(
	exec: WriteExecutor,
	values: NewRoutine,
	opts?: { readonly onConflictDoNothing?: boolean },
): Promise<string | null> {
	// Owner-side nextRunAt computation: override whatever the caller passed.
	const nextRunAt = computeRoutineNextRunAt(
		values.triggerType,
		values.triggerConfig ?? null,
		new Date(),
	);
	const row = { ...values, nextRunAt };
	if (opts?.onConflictDoNothing) {
		await exec.insert(routines).values(row).onConflictDoNothing();
	} else {
		await exec.insert(routines).values(row);
	}
	return nextRunAt;
}

/** Rename for old callers: keep identical semantics. */
export async function updateRoutine(
	exec: WriteExecutor,
	id: string,
	patch: RoutinePatch,
): Promise<void> {
	await exec.update(routines).set(patch).where(eq(routines.id, id));
}

// ---------------------------------------------------------------------------
// routines — reads
// ---------------------------------------------------------------------------

/** Full-row get-by-id. */
export async function getRoutine(exec: WriteExecutor, id: string): Promise<Routine | undefined> {
	const [row] = await exec.select().from(routines).where(eq(routines.id, id)).limit(1);
	return row;
}

/**
 * Parameterized list — every routine read is a WHERE predicate on this table.
 * `filter.ownerAgentIds` scopes to the routines owned by any of the given
 * agents (BA1 D5 — scope comes from the owner agent, not a `routines.team_id`
 * column, which no longer exists); `filter.active` filters by the `active`
 * flag; `filter.triggerType` filters by trigger type; `filter.eventType`
 * scopes an event routine to the event it names (BA1 D2 — the matcher's
 * per-event lookup, served by `routines_event_type_idx`); `filter.missingNextRunAt`
 * further requires the active + schedulable predicate (`calendar`/`heartbeat`/
 * `continuous` + `nextRunAt IS NULL`); `filter.includeDeleted` lifts the
 * default soft-delete exclusion. Ordered by `id` ASC for determinism.
 *
 * @lore AU20 Am2: replaces `listRoutines` (old `{includeDeleted?}` opts),
 * `listRoutinesByTeam`, `listActiveRoutines`, `listScheduledRoutinesMissingNextRunAt`,
 * `countRoutinesByTeam` (count via `.length`). One filter builder absorbs new
 * predicates as new `if (filter.x)` branches — the export count stays flat.
 */
export async function listRoutines(
	exec: WriteExecutor,
	filter?: {
		ownerAgentIds?: readonly string[];
		active?: boolean;
		triggerType?: string;
		eventType?: string;
		missingNextRunAt?: boolean;
		includeDeleted?: boolean;
	},
): Promise<Routine[]> {
	if (filter?.ownerAgentIds !== undefined && filter.ownerAgentIds.length === 0) return [];
	return exec
		.select()
		.from(routines)
		.where(
			and(
				filter?.includeDeleted ? undefined : isNull(routines.deletedAt),
				filter?.ownerAgentIds !== undefined
					? inArray(routines.ownerAgentId, filter.ownerAgentIds as string[])
					: undefined,
				filter?.active !== undefined ? eq(routines.active, filter.active) : undefined,
				filter?.triggerType !== undefined
					? eq(routines.triggerType, filter.triggerType)
					: undefined,
				filter?.eventType !== undefined ? eq(routines.eventType, filter.eventType) : undefined,
				filter?.missingNextRunAt
					? and(
							inArray(routines.triggerType, ["calendar", "heartbeat", "continuous"]),
							isNull(routines.nextRunAt),
						)
					: undefined,
			),
		)
		.orderBy(asc(routines.id));
}

// ---------------------------------------------------------------------------
// routine_runs — writes
// ---------------------------------------------------------------------------

export async function insertRoutineRun(exec: WriteExecutor, values: NewRoutineRun): Promise<void> {
	await exec.insert(routineRuns).values(values);
}

/**
 * By-id field-set. When `opts.onlyIfRunning` is true the update only fires
 * when `outcome = 'running'` (silent no-op otherwise) — the race-guard flag
 * that `updateRoutineRunIfRunning` was previously a separate function for.
 *
 * @lore AU20 Am2: collapses `updateRoutineRunById` (plain set) +
 * `updateRoutineRunIfRunning` (race-guard predicate) into one method with an
 * `opts.onlyIfRunning` flag. The guard is one extra `eq(outcome,"running")`
 * leg — not a second export.
 */
export async function updateRoutineRun(
	exec: WriteExecutor,
	id: string,
	patch: RoutineRunPatch,
	opts?: { readonly onlyIfRunning?: boolean },
): Promise<void> {
	if (opts?.onlyIfRunning) {
		await exec
			.update(routineRuns)
			.set(patch)
			.where(and(eq(routineRuns.id, id), eq(routineRuns.outcome, "running")));
	} else {
		await exec.update(routineRuns).set(patch).where(eq(routineRuns.id, id));
	}
}

// ---------------------------------------------------------------------------
// routine_runs — reads
// ---------------------------------------------------------------------------

/** Full-row get-by-id. */
export async function getRoutineRun(
	exec: WriteExecutor,
	id: string,
): Promise<RoutineRun | undefined> {
	const [row] = await exec.select().from(routineRuns).where(eq(routineRuns.id, id)).limit(1);
	return row;
}

/**
 * Parameterized list. `filter.routineId` scopes to a routine; `filter.running`
 * true filters for `outcome = 'running'`; `filter.limit` caps result count;
 * Always orders by `startedAt` descending.
 *
 * The "find the running run" pattern is `listRoutineRuns({routineId, running:true, limit:1})[0]`.
 *
 * @lore AU20 Am2: replaces `listRoutineRunsByRoutine` +
 * `findRunningRoutineRun`. The latter is just `{running:true,limit:1}[0]`.
 */
export async function listRoutineRuns(
	exec: WriteExecutor,
	filter?: {
		routineId?: string;
		running?: boolean;
		limit?: number;
	},
): Promise<RoutineRun[]> {
	const orderExpr = desc(routineRuns.startedAt);

	const q = exec
		.select()
		.from(routineRuns)
		.where(
			and(
				filter?.routineId !== undefined ? eq(routineRuns.routineId, filter.routineId) : undefined,
				filter?.running === true ? eq(routineRuns.outcome, "running") : undefined,
			),
		)
		.orderBy(orderExpr);

	if (filter?.limit !== undefined) {
		return q.limit(filter.limit);
	}
	return q;
}

// ---------------------------------------------------------------------------
// resolveRoutineRunRequest — AU21 §6 Decision B / §9 Increment 4, Wave B —
// the routine_run emit-time resolver
// ---------------------------------------------------------------------------

/**
 * BA1 D9: the cause of a `RoutineRunSourceUnavailableError`.
 *
 * - `"not_eligible"` — the run row was missing/not-running, or the routine
 *   was soft-deleted / inactive / not `state:"active"` between the match and
 *   this transaction. Someone paused or deleted it; nothing is wrong.
 * - `"agent_not_runnable"` — `requireRunnableAgent` rejected the owner. This
 *   is the case AC4 is about: the routine says so on its own page.
 */
export type RoutineRunUnavailableReason = "not_eligible" | "agent_not_runnable";

/** Thrown when the routine run or its owning routine is not eligible to fire.
 * @lore AU44 B3: unexported from package index (private to routine package).
 * @lore BA1 D9: `reason` discriminates "someone paused it" (`not_eligible`,
 * today's behaviour, unchanged) from "the owner agent cannot run"
 * (`agent_not_runnable`, `fireGenericRoutine`'s catch records a terminal run
 * + errors the routine). A discriminator field, not a subclass — this
 * class's own normalization to ONE recognizable type is deliberate (see the
 * `requireRunnableAgent` catch below); a subclass would fight that.
 */
export class RoutineRunSourceUnavailableError extends Error {
	constructor(
		message: string,
		readonly reason: RoutineRunUnavailableReason,
	) {
		super(message);
	}
}

/**
 * The baked `routine_run` request shape, matching `resolveIntentInputInternal`'s
 * (session-requests/src/service.ts) current "routine_run" return, minus the
 * fields (`eventType`, `idempotencyKey`) trivially re-derivable from the
 * intent row at drain time.
 */
export interface BakedRoutineRunRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "routine";
	readonly sourceId: string;
	readonly streamId: string;
	/** BA1 D5: scope comes from the owner agent, which may belong to no team. */
	readonly teamId?: string;
	/** BA1 D5: records whose routine ran; no consumer branches on it today. */
	readonly userId?: string;
	readonly taskId: null;
	readonly sourceCorrelation: {
		readonly routineId: string;
		readonly routineRunId: string;
		readonly teamId?: string;
	};
	/**
	 * AU21 §9 Increment 12 (Decision H3) — the routine/agent/team content +
	 * ranked knowledge a `routine_run` session's sandbox needs, baked at emit
	 * time from the SAME `routine` this resolver already loaded to validate.
	 * Present only when `deps.getTeamById`/`deps.assembleSessionKnowledge` were
	 * supplied (see `RoutineRunResolverDeps` `@lore` below) — a genuine
	 * capability ADD (routine sessions get zero ranked knowledge today, see
	 * this file's Wave B test `@lore`), not a preserve-behavior migration.
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E: the target agent's
	 * runnable-config snapshot, baked from the SAME already-requireRunnableAgent-
	 * validated `agent: User` row.
	 */
	readonly agentConfig: BakedAgentRunnableConfig;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E: the server's
	 * disabled-harness-types list, baked from the SAME `ports.settings
	 * .readServerConfig` `routine-scheduler.ts` already reads.
	 */
	readonly harnessDisabled?: readonly string[];
}

/**
 * Injected deps — Mechanism C. The shared ast-`<userId>` runnability invariant
 * (`requireRunnableAgent`, `@hyperidle/users`) is cross-Service from this
 * package's point of view, so this Service cannot import it directly; the real
 * implementation is wired at the composition root
 * (`layers/core-api/src/services/routine-scheduler-bindings.ts`), mirroring
 * every sibling family resolver's `*ResolverDeps` shape (e.g.
 * `task-run-resolver.ts`'s `TaskRunResolverDeps`).
 */
export interface RoutineRunResolverDeps {
	/**
	 * Widened `Promise<unknown>` → `Promise<User>` in Increment 12 Wave B (H2
	 * precedent) — the contextBundle bake reuses `agent.name`/`agent.role`
	 * from this SAME already-validated row, no second read.
	 */
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/org`'s
	 * `getTeam`, injected (Mechanism C — `@hyperidle/routine`'s `package.json`
	 * depends only on `@hyperidle/db` + framework packages, never
	 * `@hyperidle/org`). Absent at a call site not yet wired to bake context
	 * (composition-root wiring is a later wave) — the resolver falls back to
	 * baking no `contextBundle`, matching every existing caller's current
	 * (context-free) behavior unchanged.
	 */
	getTeamById?(db: HyperIdleDb, id: string): Promise<Team | undefined>;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/knowledge`'s
	 * `assembleSessionKnowledge` (Wave A), injected for the same Mechanism C
	 * reason as `getTeamById` above.
	 */
	assembleSessionKnowledge?(
		db: HyperIdleDb,
		input: {
			readonly teamId: string;
			readonly agentRole: string;
			readonly taskDescription: string;
			readonly agentId: string;
		},
	): Promise<readonly SessionKnowledgeItemLike[]>;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — optional:
	 * `@hyperidle/settings`'s `readServerConfig`, injected (Mechanism C —
	 * `@hyperidle/routine` cannot import `@hyperidle/settings` directly) for
	 * the `harnessDisabled` bake. Same shape as `RoutineSchedulerPorts.settings
	 * .readServerConfig` (`ports.ts`) `routine-scheduler.ts` already reads
	 * — forwarded here by `fireGenericRoutine`, not a second wiring. Absent at
	 * a call site not yet wired — the resolver bakes no `harnessDisabled`
	 * (matches `admitSession`'s "absent = nothing disabled" degrade).
	 */
	readServerConfig?(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
}

/**
 * Resolve + validate a `routine_run` run at emit time: load the run
 * (rejecting if missing / not `"running"`), load its routine (rejecting if
 * soft-deleted / inactive / not in `state:"active"`), resolve the target
 * agent (the routine's owner), validate the resolved target's runnability,
 * and bake the full request. Does exactly what
 * `resolveIntentInputInternal`'s "routine_run" case did at drain time
 * (`session-requests/src/service.ts`, deleted by this same wave) — now at
 * emit time, in the same package that owns `routines`/`routine_runs`.
 */
export async function resolveRoutineRunRequest(
	db: HyperIdleDb,
	runId: string,
	deps: RoutineRunResolverDeps,
): Promise<BakedRoutineRunRequest> {
	const run = await getRoutineRun(db, runId);
	if (run?.outcome !== "running") {
		throw new RoutineRunSourceUnavailableError("Routine run is unavailable", "not_eligible");
	}
	const routine = await getRoutine(db, run.routineId);
	if (!routine || routine.deletedAt || !routine.active || routine.state !== "active") {
		throw new RoutineRunSourceUnavailableError("Routine is not eligible to run", "not_eligible");
	}
	const selectedAgentId = routine.ownerAgentId;
	let agent: User;
	try {
		agent = await deps.requireRunnableAgent(db, selectedAgentId);
	} catch (error) {
		// @lore normalize to ONE recognizable class: the real `requireRunnableAgent`
		// (`@hyperidle/users`) throws its own `AgentNotRunnableError`, which this
		// package cannot name directly (Mechanism C — no `@hyperidle/users`
		// import). `fireGenericRoutine` needs to distinguish "this resolution is
		// not legitimate" (swallow, report `fired:false`) from a genuine
		// downstream infra failure on the SAME transaction's writes (must
		// propagate) — see `agent-work-intent-production.integration.test.ts`'s
		// "rolls back its run when the intent write fails" pair, which requires
		// exactly that distinction. BA1 D9: this is the ONE cause AC4 is about,
		// so it gets the discriminator's other value.
		//
		// @lore BA1 review N4: only the genuine "resolved agent is not
		// runnable" case gets normalized, checked by `.name` (set explicitly
		// on `AgentNotRunnableError` for exactly this cross-boundary check —
		// see its own `@lore`). `requireRunnableAgent` starts with a database
		// read; before this narrowing, ANY failure there — including a
		// transient connection error — was normalized the same way, and
		// `fireGenericRoutine`'s catch permanently sets the routine to
		// `state:"error", active:false` for it. A connection blip is not a
		// verdict on the agent; it must propagate and let the next tick retry,
		// same as every other unexpected failure in this resolver.
		if (error instanceof Error && error.name === "AgentNotRunnableError") {
			throw new RoutineRunSourceUnavailableError(error.message, "agent_not_runnable");
		}
		throw error;
	}

	// BA1 D5: scope comes from the owner agent, read off the row already
	// loaded and validated above — no second read, no new port.
	const teamId = agent.teamId ?? undefined;
	const userId = agent.ownerUserId ?? undefined;

	// BA1 D4: the bundle is always baked when `assembleSessionKnowledge` is
	// available — a team-less owner still gets its prompt delivered, just
	// with `team: null` and `knowledge: []` (assembling knowledge needs a
	// team; this resolver does not invent a global query). `getTeamById`
	// stays optional Mechanism-C plumbing, now driven by the AGENT's team
	// rather than a `routines.team_id` column that no longer exists.
	let contextBundle: BakedContextBundle | undefined;
	const { getTeamById, assembleSessionKnowledge } = deps;
	if (assembleSessionKnowledge) {
		let team: { readonly id: string; readonly name: string } | null = null;
		if (teamId && getTeamById) {
			const teamRow = await getTeamById(db, teamId);
			if (teamRow) team = { id: teamRow.id, name: teamRow.name };
		}
		const knowledge = team
			? await assembleSessionKnowledge(db, {
					teamId: team.id,
					agentRole: agent.role,
					// BA1 D3: the scorer ranks knowledge against the instruction
					// the run will actually execute, not a description of the
					// routine.
					taskDescription: routine.prompt ?? routine.name,
					agentId: agent.id,
				})
			: [];
		contextBundle = {
			kind: "routine",
			routine: {
				id: routine.id,
				name: routine.name,
				prompt: routine.prompt,
				lastRunSummary: routine.lastRunSummary,
			},
			agent: { id: agent.id, name: agent.name, role: agent.role },
			team,
			knowledge: toBakedContextKnowledgeItems(knowledge),
		};
	}
	const { readServerConfig } = deps;
	const harnessDisabled = readServerConfig
		? (await readServerConfig(db)).harnessDisabled
		: undefined;

	return {
		defaultAgentId: selectedAgentId,
		sourceKind: "routine",
		sourceId: runId,
		streamId: `routine:${routine.id}`,
		...(teamId !== undefined ? { teamId } : {}),
		...(userId !== undefined ? { userId } : {}),
		taskId: null,
		sourceCorrelation: {
			routineId: routine.id,
			routineRunId: runId,
			...(teamId !== undefined ? { teamId } : {}),
		},
		...(contextBundle ? { contextBundle } : {}),
		agentConfig: bakeAgentRunnableConfig(agent),
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
	};
}
