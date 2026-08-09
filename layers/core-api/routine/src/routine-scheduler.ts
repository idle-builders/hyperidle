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
 * `@hyperidle/shared`. `session-requests` (agent-orchestration-owned,
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
import {
	type BetStateChangedEvent,
	computeNextRunAt,
	createLogger,
	type EventBus,
	type EventType,
	type ItemCreatedEvent,
	nextCronMatch,
	parseCron,
} from "@hyperidle/shared";
import type { RoutineSchedulerPorts } from "./ports.js";
import {
	type BakedRoutineRunRequest,
	getRoutine,
	insertRoutine,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	RoutineRunSourceUnavailableError,
	resolveRoutineRunRequest,
	updateRoutine,
} from "./routine-service.js";

const BUILTIN_ROUTINE_IDS = [
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion", // AF9: auto-promote provisional items meeting threshold
] as const;

export type BuiltinRoutineId = (typeof BUILTIN_ROUTINE_IDS)[number];

export function isBuiltinRoutineId(id: string): boolean {
	return extractBuiltinKind(id) !== null;
}

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
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: boolean;
	readonly silent: boolean;
}

const BUILTIN_SPECS: readonly BuiltinRoutineSpec[] = [
	{
		id: "builtin:post-bet-retro",
		name: "Post-bet retro",
		ownerRole: "product_manager",
		triggerType: "event",
		triggerConfig: { eventType: "bet_state_changed" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:portfolio-retro",
		name: "Portfolio retro",
		ownerRole: "assistant",
		triggerType: "calendar",
		triggerConfig: { cron: PORTFOLIO_RETRO_CRON },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_DECAY_CRON },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: false,
		silent: true,
	},
	{
		id: "builtin:knowledge-promotion",
		name: "Knowledge promotion",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_PROMOTION_CRON },
		skillId: "knowledge_promotion",
		doneCondition: "Provisional items meeting repetition threshold promoted",
		humanReview: false,
		silent: false,
	},
];

/**
 * Seed the four builtin-routine definitions for a newly-created team.
 * Deterministic, idempotent (`onConflictDoNothing`) — a one-time definition
 * write, not a live agent-run-path read/write.
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
	const now = new Date();
	for (const spec of BUILTIN_SPECS) {
		const routineId = `${spec.id}:${teamId}`;
		let nextRunAt: string | null = null;
		const cron = (spec.triggerConfig as { cron?: string }).cron;
		if (spec.triggerType === "calendar" && cron) {
			nextRunAt = nextCronMatch(parseCron(cron), now).toISOString();
		}
		const ownerAgentId = ownerByRole[spec.ownerRole] ?? leadAgentId;

		await insertRoutine(
			db,
			{
				id: routineId,
				name: spec.name,
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: false,
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: true,
				nextRunAt,
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
	sessionId?: string;
	emitted?: readonly string[];
	extra?: Record<string, unknown>;
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
		return computeNextRunAt(routine, now);
	} catch {
		return routine.nextRunAt ?? null;
	}
}

/**
 * Fire a non-builtin ("generic") routine. Relocated verbatim from
 * `fireGenericRoutineInternal` — the routine_run emit site. AU21 §9
 * Increment 4, Wave B: `resolveRoutineRunRequest` (Decision B step 1) is now
 * folded into the SAME transaction that inserts the `routineRuns` "running"
 * row and enqueues the `routine_run` work intent — the literal
 * "same-package, same-transaction call, not a cross-layer edge left to
 * collapse at all" Decision B″ item 1 describes. A resolver rejection (routine
 * no longer eligible, or the resolved target agent is not runnable) rolls the
 * whole transaction back — no run row, no intent persists — and this
 * function reports `fired: false` instead of throwing. The dead
 * `_runtimeDeps` parameter the original threaded through (never consumed —
 * `fireGenericRoutineInternal`'s own signature already prefixed it `_`) is
 * dropped, not relocated: it carried no behavior.
 */
export async function fireGenericRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	ports: RoutineSchedulerPorts,
	recordSkippedRun = false,
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
	let intent:
		| Awaited<ReturnType<RoutineSchedulerPorts["workIntents"]["enqueueWorkIntent"]>>
		| undefined;
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
			});
			intent = await ports.workIntents.enqueueWorkIntent(tx, {
				kind: "routine_run",
				sourceKind: "routine_run",
				sourceId: runId,
				requestedBy: bakedRequest.defaultAgentId,
				idempotencyKey: `routine:${runId}`,
				bakedRequest,
			});
		});
	} catch (error) {
		// Only a resolver-originated rejection (routine no longer eligible, or
		// the resolved target agent is not runnable) is an expected outcome to
		// report as `fired:false` — a genuine downstream infra failure on the
		// SAME transaction's writes (`insertRoutineRun`/`enqueueWorkIntent`)
		// must propagate, exactly like every other failure in this transaction
		// always has (`agent-work-intent-production.integration.test.ts`'s
		// "rolls back its run when the intent write fails" pair depends on
		// this).
		if (error instanceof RoutineRunSourceUnavailableError) {
			return { fired: false, reason: error.message };
		}
		throw error;
	}
	if (!(intent && bakedRequest)) throw new Error("Routine work intent was not persisted");
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

interface TriggerConfig {
	intervalSeconds?: number;
	cron?: string;
	eventType?: string;
	taskId?: string;
}

/**
 * Registers event-triggered GENERIC (non-builtin) routines — relocated
 * verbatim from `registerEventTriggersInternal`.
 */
async function registerEventTriggers(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: RoutineSchedulerPorts,
): Promise<() => void> {
	const eventRoutines = await listRoutines(db, { active: true, triggerType: "event" });

	const unsubscribers: Array<() => void> = [];
	const unwind = (): void => {
		for (const unsubscribe of unsubscribers.reverse()) {
			try {
				unsubscribe();
			} catch {
				// Continue removing every subscription after a faulty disposer.
			}
		}
	};

	try {
		for (const routine of eventRoutines) {
			const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;
			if (!config.eventType) continue;

			const eventType = config.eventType as EventType;
			const unsub = eventBus.on(eventType, () => {
				void (async () => {
					const current = await getRoutine(db, routine.id);
					if (current?.active) {
						fireGenericRoutine(db, eventBus, current, ports).catch(() => {
							/* fire-and-forget: generic firing is resilient internally */
						});
					}
				})();
			});
			unsubscribers.push(unsub);
		}
	} catch (error) {
		unwind();
		throw error;
	}

	return unwind;
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
		const nextRunAt = computeNextRunAt(routine, now);
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
	const unsubEvents = await registerEventTriggers(db, eventBus, ports);

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
						if (isBuiltinRoutineId(routine.id)) {
							const kind = extractBuiltinKind(routine.id);
							if (kind === "builtin:post-bet-retro") continue;
							const nextRunAt = computeNextRunAt(routine, new Date());
							await updateRoutine(db, routine.id, { nextRunAt });
							void fireBuiltinRoutine(db, eventBus, ports, routine.id).catch(() => {
								/* builtin firing writes its own terminal run row (§3a) */
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
