import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, routineRuns, routines, sessions, users } from "@hyperidle/db";
import {
	ConcurrencyLimitError,
	type EventBus,
	type ModelTier,
	type SessionLifecycleCorrelation,
	type UserRole,
} from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";
import type { IngestionHandle } from "../app-runtime/contracts.js";
import { releaseSessionDedup } from "../app-runtime/services/cost-cap.js";
import { assembleAgentContext, beginAgentWriteback } from "./agent-context/assemble-context.js";

export interface CreateSessionParams {
	taskId: string;
	agentId: string;
	agentRole: UserRole;
	/** @lore U1: formerly `productId` — now references `teams.id`. */
	productId: string;
	modelTier: ModelTier;
	sandboxBasePath: string;
}

export interface SessionContext {
	sessionId: string;
	agentId: string;
	taskId: string | null;
	sandboxPath: string;
	/**
	 * AU3: was `watcher: FileWatcher`. Renamed to
	 * `ingestion: IngestionHandle` during runtime boundary simplification.
	 * The IngestionHandle.dispose() replaces FileWatcher.stop() at every
	 * teardown site (endSession + crashSession).
	 */
	ingestion: IngestionHandle;
	/** Correlates every observability event for this session (H3). */
	traceId: string;
	readonly requestContext?: SessionLifecycleCorrelation;
	/**
	 * AA2: When set, this session belongs to a routine. Used by endSession/crashSession
	 * to update routine_runs outcome and routines.lastRunSummary on completion.
	 */
	routineId?: string;
}

// @lore O1: resolveCostBaseline and costDelta removed from session_ended
// as part of kernel/strategy separation. Session cost tracking is a
// strategy concern, not kernel. The observability layer no longer receives
// costDelta — intentional gap, cost signals belong in the strategy layer.

/**
 * AA2: Update the routine_runs row and routines last-run fields when a routine
 * session ends (normally or via crash).
 *
 * Finds the routine_run row with outcome="running" for this routine, then
 * updates it with the final outcome, sessionId, endedAt, cost, and summary.
 * Also updates routines.lastRunAt and routines.lastRunSummary.
 *
 * @lore AA2: Match on routineId+outcome="running", NOT sessionId. The
 * routine_runs row is inserted with outcome="running" and sessionId=NULL
 * by the trigger handler before provisionSession is called. The sessionId
 * back-population happens AFTER provisionSession returns — too late for this
 * hook to use it as a filter. Coalescing guarantees at most one "running" row
 * per routine at any time, so routineId+outcome is a safe unique key.
 * sessionId is set here in the UPDATE so the historical record is complete.
 *
 * @lore AA3: outcome widened to include "budget_exhausted" so the per-run cap
 * enforcement path can write the correct outcome in a single write (no
 * write-then-overwrite). Passing the outcome through avoids the failure window
 * where endSession succeeds but the override fails (critique Warning 1).
 */
async function updateRoutineRunOnSessionEnd(
	db: HyperIdleDb,
	routineId: string,
	sessionId: string,
	outcome: "success" | "error" | "budget_exhausted",
	endedAt: string,
	costInCents: number,
	summary?: string,
): Promise<void> {
	// Find the routine_run row that is still "running" for this routine.
	// NOTE: Do NOT filter by sessionId — it may be NULL on the row when this
	// hook fires (see @lore above).
	const [run] = await db
		.select({ id: routineRuns.id })
		.from(routineRuns)
		.where(and(eq(routineRuns.routineId, routineId), eq(routineRuns.outcome, "running")))
		.limit(1);

	if (!run) {
		// No matching running run — pre-AA2 session or already finalized. No-op.
		return;
	}

	await db
		.update(routineRuns)
		.set({
			outcome,
			// Set sessionId here so the historical record is complete even though
			// it was NULL when the row was first inserted.
			sessionId,
			endedAt,
			costMinor: costInCents > 0 ? costInCents : null,
			costCurrency: costInCents > 0 ? "USD" : null,
			...(summary ? { summary } : {}),
		})
		.where(eq(routineRuns.id, run.id));

	// AF10 AC2: increment routines.costActualMinor (cumulative, += per run).
	// costInCents is the per-run session total — a true delta w.r.t. the running
	// cumulative field. Uses atomic SQL coalesce to avoid lost updates under
	// concurrent routine runs (same pattern as recordCostAndCheck cost-cap.ts:247).
	// @lore AF10: currency literal "USD" matches routineRuns.costCurrency write above.
	// Single-currency factory assumption — see architecture.md §2 tech-debt note.
	await db
		.update(routines)
		.set({
			lastRunAt: endedAt,
			...(costInCents > 0
				? {
						costActualMinor: sql`coalesce(${routines.costActualMinor}, 0) + ${costInCents}`,
						costActualCurrency: "USD",
					}
				: {}),
			...(summary ? { lastRunSummary: summary } : {}),
		})
		.where(eq(routines.id, routineId));
}

/**
 * Create a new agent session: check concurrency, set up workspace,
 * assemble context, start ingestion, emit event.
 *
 * @lore AU3: This legacy provisioning helper now uses app-owned agent context
 * services for context assembly and writeback.
 *
 * createSession has no production caller (sessions-routes.ts uses the unrelated
 * createSessionRoutes). It is exercised only by integration tests
 * (session-lifecycle.integration.test.ts, routines-aa2.integration.test.ts,
 * AA3-routine-cost.integration.test.ts). It is migrated — not deleted — because
 * the integration tests still exercise it as a Kernel-isolation path and it is
 * subject to the AU3 ESLint static guard.
 */
export async function createSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CreateSessionParams,
): Promise<SessionContext> {
	// 1. Check concurrency limit
	const [agent] = await db.select().from(users).where(eq(users.id, params.agentId)).limit(1);

	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	const [activeCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, params.agentId), eq(sessions.state, "active")))
		.limit(1);

	if ((activeCount?.count ?? 0) >= agent.maxConcurrentSessions) {
		throw new ConcurrencyLimitError(params.agentId, agent.maxConcurrentSessions);
	}

	// 2. Generate session ID and sandbox path
	const sessionId = crypto.randomUUID();
	const traceId = crypto.randomUUID();
	const sandboxPath = path.join(params.sandboxBasePath, sessionId);
	fs.mkdirSync(sandboxPath, { recursive: true });

	// 3. Insert session row
	// @lore O2: cost, costMinor, costCurrency, traceId columns stripped from
	// sessions table. traceId is kept in-memory on SessionContext only.
	const now = new Date().toISOString();
	await db.insert(sessions).values({
		id: sessionId,
		taskId: params.taskId,
		agentId: params.agentId,
		modelTier: params.modelTier,
		startedAt: now,
		state: "active",
		sandboxSnapshot: sandboxPath,
	});

	// 4. Assemble context into sandbox through the app-owned agent context service.
	await assembleAgentContext({
		db,
		sandboxPath,
		sessionId,
		taskId: params.taskId,
		agentId: params.agentId,
		agentRole: params.agentRole,
		teamId: params.productId,
		isRoutine: false,
		sourceKind: null,
		sourceId: null,
		sourceCorrelation: null,
	});

	// 5. Begin writeback ingestion through the app-owned agent context service.
	const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
	const ingestion = beginAgentWriteback({
		db,
		sandboxPath,
		sessionId,
		manifestPath,
	});

	// 6. Emit session_started event
	eventBus.emit({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		timestamp: Date.now(),
	});

	// 7. Return SessionContext
	return {
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		sandboxPath,
		ingestion,
		traceId,
	};
}

/**
 * End a session gracefully: flush ingestion, update DB, emit event, clean up workspace.
 *
 * @param routineRunOutcome - AA3: Optional override for the routine_run outcome.
 *   When "budget_exhausted", the routine_run is recorded with that outcome directly
 *   (avoids write-then-overwrite race window; critique Warning 1).
 * @param terminalOutcome - AL6 v2 WARNING-A: Optional terminal session outcome override.
 *   When provided, overrides the hardcoded "completed" outcome in BOTH the persisted
 *   sessions row AND the session_ended bus event. Used to persist "not_returned" outcome
 *   so the DB row and bus event are consistent with ProvisionSessionResult.outcome.
 *   Defaults to "completed" for backwards compat (all existing call sites are unaffected).
 *
 * @lore AL6 v2: The previous signature had routineRunOutcome typed as "budget_exhausted"
 * and only touched the routine_run row — not the sessions row or session_ended event.
 * Adding terminalOutcome as a separate parameter keeps existing callers unchanged and
 * lets the not_returned path thread the outcome through all three write sites.
 */
export async function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	baselineCost?: number,
	routineRunOutcome?: "budget_exhausted",
	terminalOutcome: "completed" | "not_returned" = "completed",
): Promise<void> {
	// 1. Dispose ingestion handle (final flush).
	// @lore AK2 §5b: was `context.watcher.stop()`. Renamed to `context.ingestion.dispose()`
	// dispose() must not throw during teardown.
	context.ingestion.dispose();

	// 2. Update session row.
	// @lore O2: cost, costMinor, costCurrency columns stripped from sessions table.
	// costInCents parameter retained for API compatibility but no longer written to DB.
	// Cost tracking is now a strategy concern handled at the fabric layer.
	void baselineCost;
	void costInCents;
	const now = new Date().toISOString();
	// AF7 §4.3 (Z8-094/095): CAS terminal write. SET only WHERE state='active', so
	// a duplicate teardown — or a teardown for a session a different writer already
	// finalized (e.g. a handoff that set state='done') — affects ZERO rows and is a
	// no-op. The runtime is the SOLE terminal-state writer for a session it runs.
	//
	// AL6 v2 WARNING-A: `terminalOutcome` overrides the previously hardcoded "completed"
	// in BOTH the row write and the event emit. This ensures a not_returned turn is
	// persisted correctly in the DB and carried on the bus — not just in the in-memory
	// ProvisionSessionResult. Passing "not_returned" here is what gives AC1/AC3 real
	// teeth at the persistence layer.
	const updated = await db
		.update(sessions)
		.set({
			state: "done",
			outcome: terminalOutcome,
			endedAt: now,
		})
		.where(and(eq(sessions.id, context.sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });

	// 3. Emit session_ended IFF the CAS UPDATE actually transitioned a row.
	// HARD INVARIANT (AF7 §4.3): gate the emit on rowCount, NOT merely on "the
	// UPDATE ran". A handoff-ended session (already 'done') whose detached
	// runSession tail later calls endSession would otherwise emit a spurious
	// session_ended that handoff is forbidden to emit (handoff-protocol.ts).
	if (updated.length > 0) {
		eventBus.emit({
			type: "session_ended",
			streamId: context.sessionId,
			sessionId: context.sessionId,
			agentId: context.agentId,
			taskId: context.taskId,
			...(context.requestContext
				? {
						requestId: context.requestContext.requestId,
						sourceKind: context.requestContext.sourceKind,
						sourceId: context.requestContext.sourceId,
						sourceCorrelation: context.requestContext.sourceCorrelation,
					}
				: {}),
			timestamp: Date.now(),
			// AL6 v2: use terminalOutcome (not hardcoded "completed") so not_returned
			// turns surface correctly on the bus.
			outcome: terminalOutcome,
		});
	}

	// 4. AA2: If this is a routine session, update the routine_run row.
	// AA3: routineRunOutcome defaults to "success"; "budget_exhausted" is passed through
	// from the per-run cap enforcement path to avoid write-then-overwrite (critique Warning 1).
	// Only run routine-run finalization when WE performed the terminal transition.
	if (updated.length > 0 && context.routineId) {
		await updateRoutineRunOnSessionEnd(
			db,
			context.routineId,
			context.sessionId,
			routineRunOutcome ?? "success",
			now,
			costInCents,
		);
	}

	// 5. Drop the cost-cap dedup state so the per-session map doesn't grow
	//    unboundedly across the factory's lifetime (I3 / TRACK-I.md L156-159).
	releaseSessionDedup(context.sessionId);

	// 6. Delete workspace directory
	// @lore I6: use async fs.promises.rm() instead of sync fs.rmSync() to avoid
	// blocking the event loop during large workspace cleanup.
	try {
		await fs.promises.rm(context.sandboxPath, { recursive: true, force: true });
	} catch {
		// Directory may already be gone — safe to ignore.
	}
}

/**
 * Crash a session: same as end but state=crashed, outcome=crashed,
 * with try-catch around ingestion.dispose().
 */
export async function crashSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	baselineCost?: number,
): Promise<void> {
	// 1. Try to dispose ingestion handle (may be in a bad state during crash).
	// @lore AK2 §5b: was `context.watcher.stop()`. Renamed to
	// `context.ingestion.dispose()`. The port contract guarantees dispose() does
	// not throw, but the try/catch is belt-and-suspenders — crash-path teardown
	// is defensive (behaviour-identical to the old try { watcher.stop() } catch {}).
	try {
		context.ingestion.dispose();
	} catch {
		// Ingestion handle may already be in a bad state during crash — swallow.
	}

	// 2. Update session row.
	// @lore O2: cost, costMinor, costCurrency columns stripped from sessions table.
	void baselineCost;
	void costInCents;
	const now = new Date().toISOString();
	// AF7 §4.3: CAS terminal write — see endSession. Crashing an already-terminal
	// session affects zero rows and emits nothing.
	const updated = await db
		.update(sessions)
		.set({
			state: "crashed",
			outcome: "crashed",
			endedAt: now,
		})
		.where(and(eq(sessions.id, context.sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });

	// 3. Emit session_ended IFF the CAS UPDATE transitioned a row (AF7 §4.3 invariant).
	if (updated.length > 0) {
		eventBus.emit({
			type: "session_ended",
			streamId: context.sessionId,
			sessionId: context.sessionId,
			agentId: context.agentId,
			taskId: context.taskId,
			...(context.requestContext
				? {
						requestId: context.requestContext.requestId,
						sourceKind: context.requestContext.sourceKind,
						sourceId: context.requestContext.sourceId,
						sourceCorrelation: context.requestContext.sourceCorrelation,
					}
				: {}),
			timestamp: Date.now(),
			outcome: "crashed",
		});
	}

	// 4. AA2: If this is a routine session, update the routine_run row with error outcome.
	if (updated.length > 0 && context.routineId) {
		await updateRoutineRunOnSessionEnd(
			db,
			context.routineId,
			context.sessionId,
			"error",
			now,
			costInCents,
		);
	}

	// 5. Release cost-cap dedup state (mirror endSession). Crashes still need
	//    to reclaim the per-session entry — see I3 / TRACK-I.md L156-159.
	releaseSessionDedup(context.sessionId);

	// Note: Do NOT delete workspace on crash -- knowledge is preserved in DB
	// and workspace may be needed for debugging
}
