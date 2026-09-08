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
	type DomainEvent,
	EVENT_TYPES,
	type EventBus,
} from "@hyperidle/event-bus";
import type { RoutineSchedulerPorts } from "./ports.js";
import {
	type BakedRoutineRunRequest,
	computeRoutineNextRunAt,
	getRoutineRun,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	parseTransitionTo,
	RoutineRunSourceUnavailableError,
	resolveRoutineRunRequest,
	updateRoutine,
	updateRoutineRun,
} from "./routine-service.js";

export interface FireResult {
	fired: boolean;
	reason?: string;
	runId?: string;
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
				getAgentIdentity: ports.getAgentIdentity,
				// AU21 §9 Increment 12 (Decision H3): forward the optional
				// contextBundle deps (present once the composition root wires
				// them — `routine-scheduler-bindings.ts`).
				getTeamById: ports.getTeamById,
				assembleSessionKnowledge: ports.assembleSessionKnowledge,
				// The routine's instruction lives in the knowledge document parented to it.
				getRoutinePrompt: ports.getRoutinePrompt,
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
 * agent edits a task, emitting `task_state_changed`) carries no trace of the
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
 * For events with a `taskId`: load the task and its ancestors. For all
 * events: include `type` and `timestamp`. For state-transition events: include
 * `transition`. Events with no recognizable entity (e.g. thread events without
 * a task link) carry only type+timestamp — the `subject` is omitted, not
 * `null`, so callers can distinguish "absent" from "loaded and empty".
 *
 * @lore BB1: the separate bet subject (`kind: "bet"`) is DELETED. A bet is now
 * a root task; `bet_state_changed`/`bet_revised` events are gone. Task subjects
 * now carry `ancestors` (the root-first ancestor chain) instead of a single bet.
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

	// ── STEP 1: Event-type-first dispatch ──────────────────────────────────────
	// Some events carry secondary FK references that would mis-fire under pure
	// field-priority scanning. Dispatch on event type FIRST for those events,
	// then fall through to field-priority scanning for everything else.

	// Session events: session_started / session_ended / session_not_returned /
	//   session_handoff_completed all carry taskId (the task the session runs for),
	//   but taskId is context — not the primary entity. Dispatch by event.type so
	//   taskId never wins over sessionId for these events.
	if (
		(event.type === "session_started" ||
			event.type === "session_ended" ||
			event.type === "session_not_returned" ||
			event.type === "session_handoff_completed") &&
		typeof rec.sessionId === "string"
	) {
		// For session events the agentId is the actor, not the subject.
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

	// routine_fired carries both routineId and agentId. The primary entity is the
	// routine (what fired), not the agent (who owns it). Dispatch by event type to
	// prevent agentId winning in the field-priority scan below.
	// @lore BA9c: routineId stays generic — a routine waking about another routine
	//   is thin by nature; no shape richer than {entityKind, entityId} is warranted.
	//   Do not promote to a kind:"routine" subject.
	if (event.type === "routine_fired" && typeof rec.routineId === "string") {
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

	// ── STEP 2: Field-priority scan for remaining events ─────────────────────────
	// Session and routine_fired events are already dispatched above.
	// Safe to check taskId now — no session event reaches here.
	// @lore BB1: betId removed from priority chain — bet is now a root task.
	// Priority: taskId → threadId → itemId → sessionId → agentId → teamId → userId

	// Task subject: task_state_changed, dependency_met
	const taskId = typeof rec.taskId === "string" ? rec.taskId : null;
	if (taskId) {
		const task = await ports.work.getTaskById(db, taskId);
		if (task) {
			// @lore BB1: `bet` replaced by `ancestors` (root-first parent chain).
			// We have the immediate parent's id but not a preloaded chain here;
			// the ancestors array starts empty and will be populated by the
			// routine-scheduler-bindings when it upgrades getTaskById to load
			// the ancestor chain. For now, emit with an empty ancestors list so
			// the shape is correct — root tasks (parentTaskId IS NULL) have no
			// ancestors anyway, and non-root task ancestor loading is a follow-up.
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
					ancestors: [],
				},
			});
		}
	}

	// @lore BB1: bet subject block DELETED — bet is now a root task; the
	// bet_state_changed and bet_revised event types are gone. Root tasks fire
	// task_state_changed; the task subject above handles them.

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
		return withTransition({
			...base,
			subject: genericSubject(
				event.type === "item_created" ? "item" : "knowledge-item",
				rec.itemId,
			),
		});
	}

	// Session fallback: sessionId-carrying non-session events (tool_call_recorded,
	// sandbox_writeback_changes_detected). The session-event types were handled in
	// step 1 above; these events don't carry taskId so field-priority is safe here.
	if (typeof rec.sessionId === "string") {
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

	// Agent events: agent_added carries both agentId and teamId.
	// agentId wins (already ordered here) so agent_added → kind:"agent", not kind:"team".
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

	// Team events: team_created, work_selection_requested
	// (agent_added handled above via agentId; team_created has agentIds[] not agentId)
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

	// User events: user_created — a human joining the workspace.
	// kind:"user" distinguishes a person joining from kind:"agent" (bot added to team).
	if (typeof rec.userId === "string") {
		if (ports.getUserById) {
			const user = await ports.getUserById(db, rec.userId);
			if (user) {
				return withTransition({
					...base,
					subject: { kind: "user", user, actorId: actorId ?? undefined },
				});
			}
		}
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
 * drop cut 3's suppressed origin from the match set (never the subscription
 * set — §3.1's ruling accepts every other loop shape), then fire the rest.
 * Order matters for cost: the match set is resolved FIRST, and the origin
 * is computed only when that set is non-empty.
 * @lore BA9d: extractBuiltinKind filter removed — there are no builtin routines.
 * All event-matched routines are generic (plugin-provided or user-created).
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
				if (matches.length === 0) return;
				const origin = await originRoutineId(db, event);
				const noSelfTrigger = origin ? matches.filter((routine) => routine.id !== origin) : matches;
				// BA9c: assemble the trigger event once, shared across all matching routines.
				const triggerEvent = await assembleTriggerEvent(db, event, ports);
				// BA9d D11: apply transition constraint — fire only when the event's
				// `transition.to` state matches the routine's declared constraint.
				// A routine with no constraint (parseTransitionTo returns null) fires on
				// every occurrence. A routine with a constraint but an event that carries
				// no transition does not fire — the condition cannot be satisfied.
				const toFire = noSelfTrigger.filter((routine) => {
					const transitionTo = parseTransitionTo(routine.triggerConfig);
					if (transitionTo === null) return true;
					if (!triggerEvent.transition) return false;
					return triggerEvent.transition.to === transitionTo;
				});
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
 * The cron/due-eval tick loop. Dispatches due routines to `fireGenericRoutine`,
 * gated by `config.canProvision`.
 * @lore BA9d: builtin routine branch removed — all routines are now generic
 * (plugin-provided or user-created). `config.canProvision` gates all firing.
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

					if (!canProvision) return;
					for (const routine of dueRoutines) {
						fireGenericRoutine(db, eventBus, routine, ports).catch(() => {
							/* fire-and-forget: errors do not block subsequent routines */
						});
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
