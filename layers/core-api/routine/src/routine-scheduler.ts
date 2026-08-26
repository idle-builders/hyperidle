/**
 * AU21 §9 Increment 4 — the routine scheduler, relocated VERBATIM (behavior-
 * preserving move) from `layers/agent-orchestration/dispatch/src/service.ts`
 * per architecture.md §6 Decision B′/B″ (ruling #4: "routines = pure
 * definition; a firing = an orchestration session... core-api owns the
 * schedule evaluation and the run record") and §9 Increment 4.
 *
 * Same package as `routine-service.ts` — the only module permitted to read
 * or write `routines`/`routine_runs` (AU13) — so the scheduler now calls that
 * storage directly (`insertRoutineRun`/`updateRoutine`/`listRoutineRuns`/
 * `listRoutines`/`getRoutine`), an ordinary intra-package call instead of a
 * `DispatchPorts.routine.*` cross-layer edge.
 *
 * @lore AU21 Increment 4 — Mechanism C: `work`/`conversation`/`knowledge`/
 * `review`/`settings` are ALL cross-Service from this package's point of
 * view, so every call into them is an injected `RoutineSchedulerPorts`
 * method (mirroring `DispatchPorts`'s old shape for these fields), wired at
 * the composition root (`layers/core-api/src/services/
 * routine-scheduler-bindings.ts`) — `composition-boundary-guard` (part of
 * `npm run lint`) hard-fails a Service package (`packages/<layer>/<service>/`)
 * that imports another Service directly, with NO allowlist; this file (and
 * its `package.json`) must depend on nothing but `@hyperidle/db` +
 * framework packages. `session-requests` (agent-orchestration-owned,
 * genuinely against-grain) is a port for the same reason, one level further
 * against the grain. @lore AU21 Increment 14a: `cost` (the factory cost-cap
 * gate this file used to also read through) is DELETED — no replacement.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass — closes the
 * `dispatch::routine` finding for real, not allowlisted): `provisionTeamRoutines`
 * (routine *definition* seeding, invoked from team creation) and the
 * `BUILTIN_SPECS` cron table it depends on relocate HERE from
 * `@hyperidle/dispatch`'s `service.ts` — the Increment 4 note above that kept
 * it in `dispatch` "this increment" was scoped to Increment 4 only, not a
 * permanent ruling; this is the increment that finishes it. It now calls
 * `insertRoutine` (this package's own storage) directly — an ordinary
 * intra-package call, not a `DispatchPorts.routine` cross-layer edge. Both
 * real call sites (`layers/core-api/src/routes/teams-routes.ts`'s `POST
 * /teams` UI flow, and `tool-handlers`'s `create_team` MCP tool via the
 * core-api composition root) now import this function directly instead of
 * `dispatchOps.provisionTeamRoutines` — `dispatch` sheds its last `routine`
 * dependency entirely.
 *

 * @lore AU21 §9 Increment 5 (AC #7): `builtin:practice-meeting` — relocated
 * here (not deleted) by Increment 4 — is now deleted entirely per Increment
 * 0's ruling #5 ("practice-meeting is deleted... build no replacement"): the
 * `BUILTIN_ROUTINE_IDS` entry, `runPracticeMeetingRoutine`, and its
 * `fireBuiltinRoutine` switch case are gone, along with the
 * `RoutineSchedulerPorts.review.createPracticeMeeting` capability it was the
 * sole caller of (`ports.ts`). The other four builtins are unaffected.
 */
import * as crypto from "node:crypto";
import type { HyperIdleDb, Routine } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { AgentSessionSourceKind, RoutineTriggerEvent } from "@hyperidle/domain-model";
import {
	type AgentWorkIntentSourceKind,
	type BetStateChangedEvent,
	type DomainEvent,
	EVENT_TYPES,
	type EventBus,
	type ItemCreatedEvent,
} from "@hyperidle/event-bus";
import type { RoutineSchedulerPorts } from "./ports.js";
import {
	type BakedRoutineRunRequest,
	computeRoutineNextRunAt,
	getRoutine,
	getRoutineRun,
	insertRoutine,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	RoutineRunSourceUnavailableError,
	resolveRoutineRunRequest,
	updateRoutine,
	updateRoutineRun,
} from "./routine-service.js";

const BUILTIN_ROUTINE_IDS = [
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion", // AF9: auto-promote provisional items meeting threshold
] as const;

export type BuiltinRoutineId = (typeof BUILTIN_ROUTINE_IDS)[number];

export function extractBuiltinKind(id: string): BuiltinRoutineId | null {
	if ((BUILTIN_ROUTINE_IDS as readonly string[]).includes(id)) {
		return id as BuiltinRoutineId;
	}
	if (id.startsWith("builtin:")) {
		const parts = id.split(":");
		if (parts.length >= 3) {
			const kindCandidate = `builtin:${parts[1]}` as BuiltinRoutineId;
			if ((BUILTIN_ROUTINE_IDS as readonly string[]).includes(kindCandidate)) {
				return kindCandidate;
			}
		}
	}
	return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AU21 §9 Increment 9: team-creation-time builtin-routine definition seeding
// — relocated verbatim (behavior-preserving move) from
// `@hyperidle/dispatch`'s `service.ts`. Definition-seeding, not scheduling —
// runs once per team, at team creation, writing plain `routines` rows via
// this package's own `insertRoutine` (intra-package call).
// ─────────────────────────────────────────────────────────────────────────────

const PORTFOLIO_RETRO_CRON = "0 10 1-7 * MON"; // first Monday of the month
const KNOWLEDGE_DECAY_CRON = "0 2 * * *"; // daily 02:00 UTC
const KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"; // daily 03:00 UTC

interface BuiltinRoutineSpec {
	readonly id: string;
	readonly name: string;
	readonly ownerRole: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Record<string, unknown>;
	readonly humanReview: boolean;
	readonly silent: boolean;
	/**
	 * BA1 D7: `"team"` seeds once per team (unchanged, per-team id);
	 * `"once"` seeds a single global row, derived from what each builtin's
	 * own body reads — post-bet-retro reads the shipping bet's team, the
	 * other three read nothing team-scoped.
	 */
	readonly scope: "team" | "once";
}

const BUILTIN_SPECS: readonly BuiltinRoutineSpec[] = [
	{
		id: "builtin:post-bet-retro",
		name: "Post-bet retro",
		ownerRole: "product_manager",
		triggerType: "event",
		triggerConfig: { eventType: "bet_state_changed" },
		humanReview: true,
		silent: false,
		scope: "team",
	},
	{
		id: "builtin:portfolio-retro",
		name: "Portfolio retro",
		ownerRole: "assistant",
		triggerType: "calendar",
		triggerConfig: { cron: PORTFOLIO_RETRO_CRON },
		humanReview: true,
		silent: false,
		scope: "once",
	},
	{
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_DECAY_CRON },
		humanReview: false,
		silent: true,
		scope: "once",
	},
	{
		id: "builtin:knowledge-promotion",
		name: "Knowledge promotion",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_PROMOTION_CRON },
		humanReview: false,
		silent: false,
		scope: "once",
	},
];

/**
 * Seed the four builtin-routine definitions for a newly-created team.
 * Deterministic, idempotent (`onConflictDoNothing`) — a one-time definition
 * write, not a live agent-run-path read/write.
 *
 * BA1 D7: a `"once"`-scoped spec seeds the bare id (no `:${teamId}` suffix),
 * so the second and every later team's attempt is a no-op under the same
 * `onConflictDoNothing`. `extractBuiltinKind` already accepts both the bare
 * and the suffixed form.
 */
export async function provisionTeamRoutines(
	db: HyperIdleDb,
	opts: {
		readonly teamId: string;
		readonly ownerByRole: Partial<Record<string, string>>;
		readonly leadAgentId: string;
	},
): Promise<void> {
	const { teamId, ownerByRole, leadAgentId } = opts;
	for (const spec of BUILTIN_SPECS) {
		const routineId = spec.scope === "once" ? spec.id : `${spec.id}:${teamId}`;
		const ownerAgentId = ownerByRole[spec.ownerRole] ?? leadAgentId;

		// nextRunAt is computed owner-side by insertRoutine — no caller-side
		// pre-computation needed (AU44 B3: computeRoutineNextRunAt is now the
		// single canonical function; the duplicate inline computation here was dead).
		await insertRoutine(
			db,
			{
				id: routineId,
				name: spec.name,
				state: "active",
				ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: true,
			},
			{ onConflictDoNothing: true },
		);
	}
}

const PORTFOLIO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type RunBuiltinResult =
	| {
			readonly fired: true;
			readonly emitted?: readonly string[];
			readonly extra?: Record<string, unknown>;
	  }
	| { readonly fired: false; readonly reason: string };

export interface PostBetRetroArgs {
	readonly betId: string;
}

export interface FireResult {
	fired: boolean;
	reason?: string;
	runId?: string;
}

function postBetRetroBetIdMarker(betId: string): string {
	return `betId=${betId}`;
}

async function runPostBetRetro(
	ports: RoutineSchedulerPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	args: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const bet = await ports.work.getBetById(db, args.betId);
	if (!bet) {
		return { fired: false, reason: `bet ${args.betId} not found` };
	}
	const marker = postBetRetroBetIdMarker(args.betId);
	const betThreadIds = await ports.conversation.getThreadIdsByHost(db, "bet", args.betId);
	const existing = await ports.work.findRetroItemByThreadIds(db, betThreadIds, marker);
	if (existing) {
		return { fired: false, reason: "already-retroed" };
	}
	const hypothesis = bet.hypothesis ?? "(no hypothesis recorded)";
	const realityLines: string[] = [];
	if (bet.completedAt) {
		realityLines.push(`Completed at: ${bet.completedAt}`);
	}
	if (bet.revisionLog) {
		realityLines.push(`Revision log: ${bet.revisionLog}`);
	}
	if (realityLines.length === 0) {
		realityLines.push("No post-ship reality signal recorded.");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date().toISOString();

	await db.transaction(async (tx) => {
		await ports.conversation.insertThread(tx as HyperIdleDb, {
			id: threadId,
			hostKind: "bet",
			hostId: args.betId,
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await ports.work.createItem(tx, {
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			title: `Post-bet retro: ${bet.description}`,
			body: [marker, `Hypothesis: ${hypothesis}`, "", "Reality:", ...realityLines].join("\n"),
			threadId,
			riskTier: "medium",
			createdAt: isoNow,
		});
	});
	if (!routine.silent) {
		const evt: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(evt);
	}

	return { fired: true, extra: { itemId, threadId } };
}

async function runPortfolioRetro(
	ports: RoutineSchedulerPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const nowMs = Date.now();
	const cutoffIso = new Date(nowMs - PORTFOLIO_WINDOW_MS).toISOString();
	const recentRows = await ports.knowledge.listRecentByLayers(db, ["L3", "L4"], cutoffIso);

	const bodyLines = [
		`Portfolio retro — window: last 30 days (since ${cutoffIso})`,
		`Recent L3/L4 items: ${recentRows.length}`,
		"",
	];
	for (const row of recentRows) {
		bodyLines.push(`- [${row.layer ?? "?"}] ${row.title} (updated ${row.updatedAt})`);
	}
	if (recentRows.length === 0) {
		bodyLines.push("(no cross-product patterns updated in the window)");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date(nowMs).toISOString();

	await db.transaction(async (tx) => {
		await ports.conversation.insertThread(tx as HyperIdleDb, {
			id: threadId,
			hostKind: "factory",
			hostId: "portfolio",
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await ports.work.createItem(tx, {
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			title: `Monthly portfolio retro — ${isoNow.slice(0, 10)}`,
			body: bodyLines.join("\n"),
			threadId,
			riskTier: "low",
			createdAt: isoNow,
		});
	});

	if (!routine.silent) {
		const evt: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: nowMs,
		};
		eventBus.emit(evt);
	}

	return { fired: true, extra: { itemId, threadId, count: recentRows.length } };
}

const promotionLog = createLogger({ pkg: "server.knowledge-promotion" });

async function runKnowledgePromotion(
	ports: RoutineSchedulerPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<RunBuiltinResult> {
	const sweep = await ports.knowledge.runAutoPromotionSweep(db, eventBus);
	if (sweep.scanned > 0) {
		const candidateIds: readonly string[] = [
			...sweep.promotedIds,
			...sweep.flaggedForReviewIds,
			...sweep.skippedIds,
		];

		if (candidateIds.length > 0) {
			const attentionResult = await ports.knowledge.recomputeAttentionForCandidates(
				db,
				eventBus,
				candidateIds,
			);
			if (!attentionResult.ok) {
				promotionLog.error("attention recompute failed on promotion sweep", {
					code: attentionResult.error.code,
					message: attentionResult.error.message,
				});
			}
		}
	}

	return {
		fired: true,
		extra: {
			promotedCount: sweep.promotedIds.length,
			flaggedCount: sweep.flaggedForReviewIds.length,
			skippedCount: sweep.skippedIds.length,
			scanned: sweep.scanned,
		},
	};
}

async function runKnowledgeDecay(
	ports: RoutineSchedulerPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const nowMs = Date.now();
	const silent = !!routine.silent;
	const sweep = await ports.knowledge.runStaleSweep(db, eventBus, nowMs, undefined, { silent });
	return { fired: true, extra: { markedCount: sweep.markedIds.length } };
}

/**
 * Fire a builtin routine by id. Relocated verbatim from
 * `fireBuiltinRoutineInternal` — dispatches to one of the five core-
 * maintenance bodies above, then writes the terminal `routine_runs` row
 * itself (same package as the table's owner now, so this is an ordinary
 * intra-package write, not a cross-layer one).
 */
export async function fireBuiltinRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: RoutineSchedulerPorts,
	routineId: string,
	args?: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const routine = await getRoutine(db, routineId);
	if (!routine) {
		return { fired: false, reason: `routine ${routineId} not found` };
	}
	if (!routine.active) {
		return { fired: false, reason: `routine ${routineId} is disabled (active=false)` };
	}
	const kind = extractBuiltinKind(routineId);
	if (!kind) {
		return { fired: false, reason: `${routineId} is not a builtin routine` };
	}
	const startedAt = new Date();

	let result: RunBuiltinResult;
	switch (kind) {
		case "builtin:post-bet-retro":
			if (!args) {
				return { fired: false, reason: "post-bet-retro requires { betId } args" };
			}
			result = await runPostBetRetro(ports, db, eventBus, routine, args);
			break;
		case "builtin:portfolio-retro":
			result = await runPortfolioRetro(ports, db, eventBus, routine);
			break;
		case "builtin:knowledge-decay":
			result = await runKnowledgeDecay(ports, db, eventBus, routine);
			break;
		case "builtin:knowledge-promotion":
			result = await runKnowledgePromotion(ports, db, eventBus);
			break;
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unknown builtin routine kind: ${exhaustive as string}`);
		}
	}

	const endedAt = new Date();
	await insertRoutineRun(db, {
		id: crypto.randomUUID(),
		routineId,
		startedAt: startedAt.toISOString(),
		endedAt: endedAt.toISOString(),
		outcome: result.fired ? "success" : "skipped",
	});

	if (result.fired) {
		await updateRoutine(db, routineId, { lastRunAt: endedAt.toISOString() });
	}

	return result;
}

/**
 * Registers the ONE event-driven builtin reaction — `bet_state_changed`
 * (`toState==="completed"`) → post-bet-retro — relocated verbatim from
 * `registerBuiltinRoutineHandlersInternal`. Returns an unsubscribe function.
 */
export function registerBuiltinRoutineHandlers(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: RoutineSchedulerPorts,
): () => void {
	const unsubs: Array<() => void> = [];

	const betCompletedHandler = (event: BetStateChangedEvent): void => {
		if (event.toState !== "completed") return;
		void (async () => {
			const betId = event.betId;
			const betRow = await ports.work.getBetById(db, betId);
			const betTeamId = betRow?.teamId;
			let routineRow: Routine | undefined;
			if (betTeamId) {
				const perTeamId = `builtin:post-bet-retro:${betTeamId}`;
				routineRow = await getRoutine(db, perTeamId);
			}
			if (!routineRow) {
				routineRow = await getRoutine(db, "builtin:post-bet-retro");
			}
			if (!routineRow?.active) return;
			await fireBuiltinRoutine(db, eventBus, ports, routineRow.id, { betId });
		})();
	};
	unsubs.push(eventBus.on("bet_state_changed", betCompletedHandler));

	return () => {
		for (const u of unsubs) u();
	};
}

function safeNextRunAt(routine: Routine, now: Date): string | null {
	try {
		return computeRoutineNextRunAt(routine.triggerType, routine.triggerConfig, now);
	} catch {
		return routine.nextRunAt ?? null;
	}
}

/**
 * Fire a non-builtin ("generic") routine. Relocated verbatim from
 * `fireGenericRoutineInternal` — the routine_run emit site. AU21 §9
 * Increment 4, Wave B: `resolveRoutineRunRequest` (Decision B step 1) is now
 * folded into the SAME transaction that inserts the `routineRuns` "running"
 * row — the literal "same-package, same-transaction call, not a cross-layer
 * edge left to collapse at all" Decision B″ item 1 describes. A resolver
 * rejection (routine no longer eligible, or the resolved target agent is not
 * runnable) rolls the whole transaction back — no run row persists — and
 * this function reports `fired: false` instead of throwing. The dead
 * `_runtimeDeps` parameter the original threaded through (never consumed —
 * `fireGenericRoutineInternal`'s own signature already prefixed it `_`) is
 * dropped, not relocated: it carried no behavior.
 *
 * @lore AU31 §3.1 site 8 — the `routine_run` work-intent submit is NO LONGER
 * inside this transaction. Cross-layer atomicity with `agent-orchestration`
 * is relinquished (founder ruling, architecture.md §3.1/§13 item 9): the
 * transaction commits `routineRuns` alone, THEN the seam call runs. Unlike
 * the other eight relinquished sites, a bare miss here would wedge the
 * routine forever — `fireGenericRoutine`'s own coalescing guard above reads
 * exactly this row and reports "previous run still in progress" for as long
 * as it stays `outcome:"running"`, and the stale-session reaper never
 * touches it (it keys on an `active` session, which never existed for a
 * submit that failed before a session could be admitted). So a failed submit
 * is caught here and the run is marked `error` (guarded `onlyIfRunning`,
 * same one-row write `agent-run-admission-reactions.ts` already performs for
 * an admission rejection) before the failure is rethrown — ordinary error
 * handling, not a durable mechanism: no outbox, no saga, no sweeper, no
 * retry loop. With the row no longer `running`, the coalescing guard clears
 * and the routine fires again on the next scheduler tick like any other
 * routine whose last run failed.
 */
export async function fireGenericRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	ports: RoutineSchedulerPorts,
	recordSkippedRun = false,
	/**
	 * BA9c: The event that caused this routine to fire, pre-assembled by
	 * `registerRoutineEventMatcher`. Absent for clock-fired (heartbeat/calendar)
	 * routines — the default `undefined` is semantically correct there,
	 * not a feature flag (clock-fired routines genuinely have no trigger event).
	 */
	triggerEvent?: RoutineTriggerEvent,
): Promise<FireResult> {
	const now = new Date();
	const [runningRow] = await listRoutineRuns(db, {
		routineId: routine.id,
		running: true,
		limit: 1,
	});
	if (runningRow) {
		if (recordSkippedRun) {
			await insertRoutineRun(db, {
				id: crypto.randomUUID(),
				routineId: routine.id,
				startedAt: now.toISOString(),
				outcome: "skipped",
				errorMessage: "Coalesced: previous run still in progress",
			});
		}
		const nextRunAt = safeNextRunAt(routine, now);
		await updateRoutine(db, routine.id, { nextRunAt });
		return { fired: false, reason: "previous run still in progress" };
	}
	const runId = crypto.randomUUID();
	let bakedRequest: BakedRoutineRunRequest | undefined;
	try {
		await db.transaction(async (tx) => {
			await insertRoutineRun(tx, {
				id: runId,
				routineId: routine.id,
				startedAt: now.toISOString(),
				outcome: "running",
			});
			bakedRequest = await resolveRoutineRunRequest(tx as HyperIdleDb, runId, {
				requireRunnableAgent: ports.requireRunnableAgent,
				// AU21 §9 Increment 12 (Decision H3): forward the optional
				// contextBundle deps (present once the composition root wires
				// them — `routine-scheduler-bindings.ts`).
				getTeamById: ports.getTeamById,
				assembleSessionKnowledge: ports.assembleSessionKnowledge,
				// AU21 §9 Increment 12 (Decision H3), Wave E: forward the SAME
				// `settings.readServerConfig` for the `harnessDisabled` bake — no
				// second `settings` read.
				readServerConfig: (db) => ports.settings.readServerConfig(db),
				// BA9c: forward the pre-assembled trigger event (absent for clock-fired runs).
				...(triggerEvent !== undefined ? { triggerEvent } : {}),
			});
		});
	} catch (error) {
		// Only a resolver-originated rejection (routine no longer eligible, or
		// the resolved target agent is not runnable) is an expected outcome to
		// report as `fired:false` — a genuine downstream infra failure on the
		// SAME transaction's write (`insertRoutineRun`) must propagate, exactly
		// like every other failure in this transaction always has.
		if (error instanceof RoutineRunSourceUnavailableError) {
			// BA1 D9: a paused/deleted/deactivated routine (`not_eligible`) is
			// today's behaviour, unchanged — nothing is wrong, someone paused
			// it. An unrunnable owner (`agent_not_runnable`) is the AC4 case:
			// the transaction above rolled back and persisted nothing, so this
			// records a terminal run OUTSIDE any transaction, then errors the
			// routine so it stops re-attempting — under D2 that matters more,
			// not less, since a broken routine on a busy event would otherwise
			// fail once per emission.
			if (error.reason === "agent_not_runnable") {
				const failedAt = new Date().toISOString();
				await insertRoutineRun(db, {
					id: crypto.randomUUID(),
					routineId: routine.id,
					startedAt: failedAt,
					endedAt: failedAt,
					outcome: "error",
					errorMessage: error.message,
				});
				await updateRoutine(db, routine.id, { state: "error", active: false });
			}
			return { fired: false, reason: error.message };
		}
		throw error;
	}
	if (!bakedRequest) throw new Error("Routine run was not resolved");
	let intent: Awaited<ReturnType<RoutineSchedulerPorts["workIntents"]["enqueueWorkIntent"]>>;
	try {
		intent = await ports.workIntents.enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: bakedRequest.defaultAgentId,
			idempotencyKey: `routine:${runId}`,
			bakedRequest,
		});
	} catch (error) {
		await updateRoutineRun(
			db,
			runId,
			{
				outcome: "error",
				endedAt: new Date().toISOString(),
				errorMessage: error instanceof Error ? error.message : String(error),
			},
			{ onlyIfRunning: true },
		);
		throw error;
	}
	eventBus.emit({
		type: "agent_work_intent_recorded",
		streamId: `routine:${routine.id}`,
		intentId: intent.id,
		intentKind: "routine_run",
		sourceKind: "routine",
		sourceId: runId,
		idempotencyKey: intent.idempotencyKey,
		timestamp: Date.now(),
	});
	const lastRunAt = now.toISOString();
	const nextRunAt = safeNextRunAt(routine, now);

	await updateRoutine(db, routine.id, {
		lastRunAt,
		nextRunAt: nextRunAt || null,
	});
	eventBus.emit({
		type: "routine_fired",
		streamId: `routine:${routine.id}`,
		routineId: routine.id,
		agentId: bakedRequest.defaultAgentId,
		timestamp: Date.now(),
	});

	return { fired: true, runId };
}

/**
 * BA1 §3.1.1 — the two routine source-kind spellings, pinned. The bus
 * carries two source-kind vocabularies and a routine is spelled differently
 * in each: `AgentSessionSourceKind` (resolved sessions) says `"routine"`;
 * `AgentWorkIntentSourceKind` (the pre-resolution intent vocabulary
 * `agent_run_admission_failed` carries verbatim) says `"routine_run"`. A
 * rename in either union fails `npm run check` here rather than silently
 * reopening the hole a bare string comparison would.
 */
const SESSION_SPELLING: AgentSessionSourceKind = "routine";
const INTENT_SPELLING: AgentWorkIntentSourceKind = "routine_run";

function isRoutineSourceKind(k: string | undefined): boolean {
	return k === SESSION_SPELLING || k === INTENT_SPELLING;
}

/**
 * BA1 §3.1.1 — resolve the routine whose run produced `event`, in three
 * steps, giving up (`null`) rather than guessing. This is coverage, not
 * completeness: an event an agent's own actions caused (e.g. a routine's
 * agent edits a bet, emitting `bet_state_changed`) carries no trace of the
 * routine at all, and this function correctly returns `null` for it — the
 * founder's loop ruling (§3.1) accepts that case rather than plumbing new
 * origin-tracking through every event contract.
 */
async function originRoutineId(db: HyperIdleDb, event: DomainEvent): Promise<string | null> {
	if (event.type === "routine_fired") return event.routineId;

	const sourceKind = "sourceKind" in event ? event.sourceKind : undefined;
	if (!isRoutineSourceKind(sourceKind)) return null;

	if ("sourceCorrelation" in event && event.sourceCorrelation) {
		const correlation = event.sourceCorrelation;
		if ("routineId" in correlation && typeof correlation.routineId === "string") {
			return correlation.routineId;
		}
	}

	if ("sourceId" in event && event.sourceId) {
		const run = await getRoutineRun(db, event.sourceId);
		if (run) return run.routineId;
	}

	return null;
}

/**
 * BA9c — assemble a RoutineTriggerEvent from a domain event and the DB.
 *
 * For events with a `taskId`: load the task and its bet (via the task's
 * `betId`). For events with only a `betId`: load the bet directly. For all
 * events: include `type` and `timestamp`. For state-transition events: include
 * `transition`. Events with no recognizable entity (e.g. thread events without
 * a task/bet link) carry only type+timestamp — the `subject` is omitted, not
 * `null`, so callers can distinguish "absent" from "loaded and empty".
 *
 * @lore BA9c: assembly happens here (in the scheduler, which has the event and
 * the ports) not in the resolver — the resolver just threads whatever
 * RoutineTriggerEvent it receives. This keeps the subject DB-fresh at fire time.
 */
async function assembleTriggerEvent(
	db: HyperIdleDb,
	event: DomainEvent,
	ports: RoutineSchedulerPorts,
): Promise<RoutineTriggerEvent> {
	// Cast to Record<string, unknown> for safe structural probing across the DomainEvent union.
	// Uses 'unknown' intermediate to satisfy strict cast overlap check.
	const rec = event as unknown as Record<string, unknown>;

	// Some events carry `at` (ISO-8601 string) rather than `timestamp` (number).
	// work_selection_requested, team_created, agent_added, user_created use `at`.
	const rawTimestamp =
		typeof rec.timestamp === "number"
			? rec.timestamp
			: typeof rec.at === "string"
				? new Date(rec.at).getTime()
				: Date.now();

	const base: RoutineTriggerEvent = {
		type: event.type,
		timestamp: rawTimestamp,
	};

	// Extract transition (fromState/toState) from events that carry one.
	const transition =
		typeof rec.fromState === "string" && typeof rec.toState === "string"
			? { from: rec.fromState, to: rec.toState }
			: undefined;

	const withTransition = <T extends RoutineTriggerEvent>(t: T): T =>
		transition ? { ...t, transition } : t;

	// actor = the agent or user who performed the action (senderId, accessorId).
	// Declared here so the early artifact check below can use it.
	const actorId =
		(typeof rec.senderId === "string" ? rec.senderId : undefined) ??
		(typeof rec.accessorId === "string" ? rec.accessorId : undefined);

	const genericSubject = (
		entityKind: string,
		entityId: string,
		overrideActorId?: string,
	): RoutineTriggerEvent["subject"] => {
		const actor = overrideActorId ?? actorId;
		return {
			kind: "generic",
			entityKind,
			entityId,
			...(actor !== undefined ? { actorId: actor } : {}),
		};
	};

	// ── Artifact check before task: artifact_created carries taskId (producing task) as a secondary
	// FK reference, not the primary entity. Check artifactId first so artifact_created events
	// produce kind:"artifact" rather than kind:"task". (Only artifact_created carries artifactId.)
	if (typeof rec.artifactId === "string") {
		const artifact = await ports.work.getArtifactById(db, rec.artifactId);
		if (artifact) {
			return withTransition({
				...base,
				subject: {
					kind: "artifact",
					artifact: {
						id: artifact.id,
						kind: artifact.kind,
						label: artifact.label,
						producingTaskId: artifact.producingTaskId,
					},
					...(actorId !== undefined ? { actorId } : {}),
				},
			});
		}
		return withTransition({ ...base, subject: genericSubject("artifact", rec.artifactId) });
	}

	// ── Task subject: full DB-loaded shape (task_state_changed, dependency_met) ──
	const taskId = typeof rec.taskId === "string" ? rec.taskId : null;
	if (taskId) {
		const task = await ports.work.getTaskById(db, taskId);
		if (task) {
			const bet = task.betId ? await ports.work.getBetById(db, task.betId) : null;
			return withTransition({
				...base,
				subject: {
					kind: "task",
					task: {
						id: task.id,
						title: task.title,
						description: task.description,
						state: task.state,
					},
					bet: bet
						? {
								id: bet.id,
								description: bet.description,
								appetite: bet.appetite ?? "",
								doneCondition: bet.doneCondition,
							}
						: { id: task.betId ?? "unknown", description: "", appetite: "", doneCondition: null },
				},
			});
		}
	}

	// ── Bet subject: full DB-loaded shape (bet_state_changed, bet_revised) ──
	const betId = typeof rec.betId === "string" ? rec.betId : null;
	if (betId) {
		const bet = await ports.work.getBetById(db, betId);
		if (bet) {
			return withTransition({
				...base,
				subject: {
					kind: "bet",
					bet: {
						id: bet.id,
						description: bet.description,
						appetite: bet.appetite ?? "",
						doneCondition: bet.doneCondition,
					},
				},
			});
		}
	}

	// ── Rich entity subjects: DB-loaded shapes for core entities ──
	// Priority order (new, BA9c): threadId → itemId → sessionId → agentId → teamId → routineId → userId
	// agentId before teamId so agent_added → kind:"agent" (not kind:"team").
	// actorId and genericSubject are declared before the artifact check above.

	// Thread events: thread_created, thread_message_appended, thread_resolved,
	//               thread_reopened, thread_archived
	if (typeof rec.threadId === "string") {
		const thread = await ports.conversation.findThreadById(db, rec.threadId);
		if (thread) {
			return withTransition({
				...base,
				subject: {
					kind: "thread",
					thread: {
						id: thread.id,
						hostKind: thread.hostKind,
						hostId: thread.hostId,
						resolvedAt: thread.resolvedAt,
					},
					...(actorId !== undefined ? { actorId } : {}),
				},
			});
		}
		// Orphaned thread: fall back to generic with the id from the event.
		return withTransition({ ...base, subject: genericSubject("thread", rec.threadId) });
	}

	// Knowledge/item events: distinguish by event type.
	// item_created → items table (kind:"item"); all others → knowledge_items (kind:"knowledge-item").
	if (typeof rec.itemId === "string") {
		if (event.type === "item_created") {
			const item = await ports.work.getItemById(db, rec.itemId);
			if (item) {
				return withTransition({
					...base,
					subject: {
						kind: "item",
						item: {
							id: item.id,
							title: item.title,
							kind: item.kind,
							body: item.body,
						},
						...(actorId !== undefined ? { actorId } : {}),
					},
				});
			}
		} else {
			const ki = await ports.knowledge.getItemById(db, rec.itemId);
			if (ki) {
				return withTransition({
					...base,
					subject: {
						kind: "knowledge-item",
						item: {
							id: ki.id,
							title: ki.title,
							body: ki.body,
							format: ki.format,
							version: ki.version,
						},
						...(actorId !== undefined ? { actorId } : {}),
					},
				});
			}
		}
		// Orphaned entity: fall back to generic.
		return withTransition({
			...base,
			subject: genericSubject(
				event.type === "item_created" ? "item" : "knowledge-item",
				rec.itemId,
			),
		});
	}

	// Session events: session_started, session_ended, session_handoff_completed,
	//                session_not_returned, sandbox_writeback_changes_detected, tool_call_recorded
	if (typeof rec.sessionId === "string") {
		// For session events, the agentId (not senderId/accessorId) is the actor.
		const sessionActor = typeof rec.agentId === "string" ? rec.agentId : actorId;
		if (ports.getSessionById) {
			const session = await ports.getSessionById(db, rec.sessionId);
			if (session) {
				return withTransition({
					...base,
					subject: {
						kind: "session",
						session: {
							id: session.id,
							state: session.state,
							agentId: session.agentId,
							outcome: session.outcome,
						},
						...(sessionActor !== undefined ? { actorId: sessionActor } : {}),
					},
				});
			}
		}
		return withTransition({
			...base,
			subject: {
				kind: "generic",
				entityKind: "session",
				entityId: rec.sessionId,
				...(sessionActor !== undefined ? { actorId: sessionActor } : {}),
			},
		});
	}

	// Agent events: agentId now has priority over teamId (fixes agent_added → kind:"agent").
	// agent_added carries BOTH agentId and teamId; agentId check first ensures kind:"agent".
	if (typeof rec.agentId === "string") {
		if (ports.getAgentById) {
			const agent = await ports.getAgentById(db, rec.agentId);
			if (agent) {
				return withTransition({
					...base,
					subject: {
						kind: "agent",
						agent: {
							id: agent.id,
							name: agent.name,
							role: agent.role,
						},
						...(actorId !== undefined ? { actorId } : {}),
					},
				});
			}
		}
		return withTransition({ ...base, subject: genericSubject("agent", rec.agentId) });
	}

	// Team/org events: team_created, work_selection_requested
	// (agent_added already handled above via agentId)
	if (typeof rec.teamId === "string") {
		if (ports.getTeamById) {
			const team = await ports.getTeamById(db, rec.teamId);
			if (team) {
				return withTransition({
					...base,
					subject: {
						kind: "team",
						team: {
							id: team.id,
							name: team.name,
						},
						...(actorId !== undefined ? { actorId } : {}),
					},
				});
			}
		}
		return withTransition({ ...base, subject: genericSubject("team", rec.teamId) });
	}

	// Routine events: routine_fired
	if (typeof rec.routineId === "string") {
		const routineActor = typeof rec.agentId === "string" ? rec.agentId : actorId;
		return withTransition({
			...base,
			subject: {
				kind: "generic",
				entityKind: "routine",
				entityId: rec.routineId,
				...(routineActor !== undefined ? { actorId: routineActor } : {}),
			},
		});
	}

	// User events: user_created
	if (typeof rec.userId === "string") {
		return withTransition({ ...base, subject: genericSubject("user", rec.userId) });
	}

	// Genuinely no identifying entity in this event.
	return withTransition({ ...base });
}

/**
 * BA1 D2 — replaces `registerEventTriggers`. One `eventBus.on` per member of
 * `EVENT_TYPES` (a compile-time constant — D8), not one per routine read
 * once at boot: the subscription set cannot go stale because it is not
 * derived from anything mutable. On delivery: bail immediately when the
 * process cannot provision agent runs (`canProvision`, matching the clock
 * path's own gate); otherwise query the routines that name this event,
 * drop any id `extractBuiltinKind` recognizes (a builtin's event condition
 * is code, not configuration — §2.5), drop cut 3's suppressed origin from
 * the match set (never the subscription set — §3.1's ruling accepts every
 * other loop shape), then fire the rest. Order matters for cost: the match
 * set is resolved FIRST, and the origin is computed only when that set is
 * non-empty.
 */
function registerRoutineEventMatcher(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: RoutineSchedulerPorts,
	config: { readonly canProvision: boolean },
): () => void {
	const unsubscribers: Array<() => void> = [];
	for (const eventType of EVENT_TYPES) {
		const unsub = eventBus.on(eventType, (event) => {
			if (!config.canProvision) return;
			void (async () => {
				const matches = await listRoutines(db, {
					triggerType: "event",
					eventType,
					active: true,
				});
				const candidates = matches.filter((routine) => extractBuiltinKind(routine.id) === null);
				if (candidates.length === 0) return;
				const origin = await originRoutineId(db, event);
				const toFire = origin ? candidates.filter((routine) => routine.id !== origin) : candidates;
				// BA9c: assemble the trigger event once, shared across all matching routines.
				const triggerEvent = await assembleTriggerEvent(db, event, ports);
				for (const routine of toFire) {
					fireGenericRoutine(db, eventBus, routine, ports, false, triggerEvent).catch(() => {
						/* fire-and-forget: generic firing is resilient internally */
					});
				}
			})();
		});
		unsubscribers.push(unsub);
	}
	return (): void => {
		// @lore BA1 review N9: `[...unsubscribers].reverse()`, not
		// `unsubscribers.reverse()` — `Array.prototype.reverse` mutates in
		// place, which is harmless today (the array is local and this closure
		// is only ever called once) but is a footgun for a future reader who
		// reads it again after calling this. Each `unsubscribe()` is
		// try/caught so one throwing disposer cannot strand the remaining
		// 33 — every `eventType`'s subscription must come down on shutdown.
		for (const unsubscribe of [...unsubscribers].reverse()) {
			try {
				unsubscribe();
			} catch {
				// A single event type's disposer throwing must not stop the rest
				// from unsubscribing.
			}
		}
	};
}

/**
 * Backfills a missing `nextRunAt` on scheduled routines — relocated verbatim
 * from `backfillMissingNextRunAtInternal`.
 */
async function backfillMissingNextRunAt(db: HyperIdleDb): Promise<number> {
	const now = new Date();
	const candidates = await listRoutines(db, { active: true, missingNextRunAt: true });

	let count = 0;
	for (const routine of candidates) {
		const nextRunAt = computeRoutineNextRunAt(routine.triggerType, routine.triggerConfig, now);
		if (!nextRunAt) continue;
		await updateRoutine(db, routine.id, { nextRunAt });
		count += 1;
	}
	return count;
}

const schedulerLog = createLogger({ pkg: "server.routine-scheduler" });

type ReapStaleSessions = () => Promise<number>;

export interface RoutineSchedulerConfig {
	pollIntervalMs: number;
	canProvision?: boolean;
	reap?: ReapStaleSessions;
	reaperCadenceMs?: number;
}

export interface RoutineScheduler {
	stop: () => void;
}

const ROUTINE_REAPER_CADENCE_MS = 5 * 60 * 1000;

/**
 * The cron/due-eval tick loop — relocated verbatim from
 * `startRoutineTriggerInternal`. Dispatches due routines to
 * `fireBuiltinRoutine` (builtins, except event-only `post-bet-retro`) or
 * `fireGenericRoutine` (everything else, gated by `config.canProvision`).
 */
export async function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: RoutineSchedulerPorts,
	config: RoutineSchedulerConfig,
): Promise<RoutineScheduler> {
	const canProvision = config.canProvision ?? false;
	const reaperCadenceMs = config.reaperCadenceMs ?? ROUTINE_REAPER_CADENCE_MS;
	let lastReapedAt = 0;
	let tickRunning = false;
	await backfillMissingNextRunAt(db);
	// BA1 D2: registration is synchronous now — there is no boot-time read to
	// await. The disposer shape (`unwind`, returned into `stop()`) is
	// unchanged.
	const unsubEvents = registerRoutineEventMatcher(db, eventBus, ports, { canProvision });

	let intervalId: ReturnType<typeof setInterval>;
	try {
		intervalId = setInterval(() => {
			if (tickRunning) return;
			tickRunning = true;
			const now = new Date().toISOString();
			void (async () => {
				try {
					if (config.reap && Date.now() - lastReapedAt >= reaperCadenceMs) {
						lastReapedAt = Date.now();
						config.reap().catch(() => {
							/* fire-and-forget: reaper errors must not block routine dispatch */
						});
					}

					const allRoutines = await listRoutines(db, { active: true });
					const dueRoutines = allRoutines.filter((r) => {
						if (r.triggerType === "event") return false;
						if (!r.nextRunAt) return false;
						return r.nextRunAt <= now;
					});

					for (const routine of dueRoutines) {
						const builtinKind = extractBuiltinKind(routine.id);
						if (builtinKind) {
							// Builtins run in-process — no agent provisioning required.
							fireBuiltinRoutine(db, eventBus, ports, routine.id).catch(() => {
								/* fire-and-forget: errors do not block subsequent routines */
							});
						} else {
							if (!canProvision) continue;
							fireGenericRoutine(db, eventBus, routine, ports).catch(() => {
								/* fire-and-forget: errors do not block subsequent routines */
							});
						}
					}
				} finally {
					tickRunning = false;
				}
			})();
		}, config.pollIntervalMs);
	} catch (error) {
		unsubEvents();
		throw error;
	}

	schedulerLog.info("routine scheduler started", {
		pollIntervalMs: config.pollIntervalMs,
		canProvision,
		reaperEnabled: !!config.reap,
	});

	return {
		stop: () => {
			clearInterval(intervalId);
			unsubEvents();
		},
	};
}
