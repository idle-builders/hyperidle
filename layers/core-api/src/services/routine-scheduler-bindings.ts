/**
 * @lore Composition root for the routine scheduler (`@hyperidle/routine`'s
 * `routine-scheduler.ts`). `@hyperidle/routine` is a Service, so per
 * Mechanism C (`composition-boundary-guard`, mechanically enforced) it
 * cannot import `work`/`conversation`/`knowledge`/`settings` directly —
 * every one of those, plus the one genuinely against-grain (`core-api →
 * agent-orchestration`) dependency, is wired here. `fireRoutine`, the
 * builtin-routine-handler registration, and the scheduler startup all live
 * in this module; every call site (`service-bootstrap.ts`,
 * `routes/routines-routes.ts`) reaches them through
 * `fireRoutine`/`startRoutineScheduler`/`registerBuiltinRoutineReactions`.
 *
 * There is no `review` field on this module's ports — no builtin routine
 * wired here needs `createPracticeMeeting`.
 *
 * @lore AU31 §3.1/§3.2: the against-grain edge is now the seam
 * (`AgentOrchestrationPort`), not a direct `@hyperidle/session-requests`/
 * `@hyperidle/run-orchestration` import — and the port is a per-composition
 * VALUE, not an ambient global, so `routineSchedulerPorts` can no longer be a
 * module-level constant built at import time. `buildRoutineSchedulerPorts(port)`
 * is the factory; every export below takes the port (or the built ports bag)
 * as an explicit parameter instead of closing over a module singleton.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { findThread, insertThread, listThreads } from "@hyperidle/thread";
import type { HyperIdleDb, Routine } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import {
	assembleSessionKnowledge,
	getAgentIdentity,
	get as getKnowledgeItem,
	getRoutinePrompt,
	sweep,
} from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import {
	type FireResult,
	fireGenericRoutine,
	type RoutineSchedulerConfig,
	type RoutineSchedulerPorts,
	startRoutineScheduler as startRoutineSchedulerInternal,
} from "@hyperidle/routine";
import { readServerConfig } from "@hyperidle/settings";
import * as work from "@hyperidle/task";
import { findUser, requireRunnableAgent } from "@hyperidle/users";

/**
 * AU31 §3.2 — builds `RoutineSchedulerPorts` for ONE composition's port.
 * Replaces the former module-level `routineSchedulerPorts` constant: the
 * seam is a per-composition value now, so the ports bag can no longer be
 * built once at import time.
 */
export function buildRoutineSchedulerPorts(port: AgentOrchestrationPort): RoutineSchedulerPorts {
	return {
		work: {
			// BA9c: getTaskById for trigger event subject assembly.
			getTaskById: async (db, id) => {
				const row = await work.get(db, "task", id);
				if (!row) return undefined;
				return {
					id: row.id,
					title: row.title,
					description: row.description,
					state: row.state,
					parentTaskId: row.parentTaskId,
				};
			},
			// BA9c: getItemById — work item (items table) for item_created events.
			getItemById: (db, id) => work.get(db, "item", id),
			createItem: (exec, values) => work.create(exec, "item", values),
			findRetroItemByThreadIds: async (db, threadIds, marker) => {
				const rows = await work.list(db, "item", { threadIds, bodyMarker: marker });
				return rows[0] ? { id: rows[0].id } : undefined;
			},
		},
		conversation: {
			getThreadIdsByHost: (db, hostKind, hostId) =>
				listThreads(db, { host: { kind: hostKind, id: hostId } }).then((ts) => ts.map((t) => t.id)),
			insertThread,
			// BA9c: findThreadById — thread row for thread_* events.
			findThreadById: (db, id) => findThread(db, { id }),
		},
		knowledge: {
			runAutoPromotionSweep: (db, eventBus) => sweep(db, eventBus, "autoPromotion"),
			runStaleSweep: (db, eventBus, nowMs, thresholdMs, options) =>
				sweep(db, eventBus, "stale", { nowMs, thresholdMs, ...options }),
			// BA9c: getItemById — knowledge item for knowledge_* events.
			getItemById: async (db, id) => {
				const item = await getKnowledgeItem(db, id);
				return item ?? undefined;
			},
		},
		settings: {
			readServerConfig: async (db) => {
				const cfg = await readServerConfig(db);
				return {
					harnessDisabled: cfg.harnessDisabled,
				};
			},
		},
		// AU31 §3.1 site 8 / §3.2: seam-backed — `exec` is ignored (see
		// `AgentOrchestrationPort`'s builder), and this is called AFTER
		// `fireGenericRoutine`'s emit transaction commits, never inside it.
		workIntents: { enqueueWorkIntent: (_exec, input) => port.intents.submit(input) },
		requireRunnableAgent,
		// AU21 §9 Increment 12 (Decision H3): wire the contextBundle bake deps
		// `resolveRoutineRunRequest` needs — a routine_run session's sandbox now
		// gets its ranked knowledge + routine/agent/team content baked at emit
		// time instead of `run-orchestration` reading it back at launch.
		getTeamById: (db: HyperIdleDb, id: string) => getTeam(db, { id }),
		// BA9c: getSessionById — session row for session_* events.
		// Uses the AgentOrchestrationPort seam (sessions table owned by run-orchestration).
		getSessionById: async (_db: HyperIdleDb, id: string) => {
			const row = await port.sessions.getById(id);
			return row ?? undefined;
		},
		// BA9c: getAgentById — agent row for agent_added events.
		// agentId takes priority over teamId in assembleTriggerEvent (fixes agent_added → kind:"agent").
		getAgentById: (db: HyperIdleDb, id: string) =>
			findUser(db, { id }).then((u) => (u ? { id: u.id, name: u.name, role: u.role } : undefined)),
		// BA9c: getUserById — human user row for user_created events.
		// Same table as getAgentById (users) but the kind:"user" discriminant in the
		// trigger event tells routines "a person joined", not "a bot was added to a team".
		getUserById: (db: HyperIdleDb, id: string) =>
			findUser(db, { id }).then((u) => (u ? { id: u.id, name: u.name, role: u.role } : undefined)),
		assembleSessionKnowledge,
		getAgentIdentity,
		// @lore knowledge-attachment-slot: was its own inline getParentedItem call
		// (a spelling-twin of routines-routes.ts's own copy); both now share
		// `getRoutinePrompt` from @hyperidle/knowledge, `getAgentIdentity`'s twin.
		getRoutinePrompt,
	};
}

/** Bound wrapper — starts the cron/due-eval scheduler with the real ports. */
export function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	config: RoutineSchedulerConfig,
): ReturnType<typeof startRoutineSchedulerInternal> {
	return startRoutineSchedulerInternal(
		db,
		eventBus,
		buildRoutineSchedulerPorts(agentOrchestration),
		config,
	);
}

/**
 * Bound routine-firing dispatcher. All routines are now generic — dispatched
 * via `fireGenericRoutine` which enqueues a work intent for agent dispatch.
 * @lore BA9d: builtin-vs-generic branch removed. extractBuiltinKind and
 * fireBuiltinRoutine are gone. registerBuiltinRoutineReactions is gone.
 */
export function fireRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	routine: Routine,
	opts?: {
		readonly recordSkippedRun?: boolean;
	},
): Promise<FireResult> {
	const ports = buildRoutineSchedulerPorts(agentOrchestration);
	return fireGenericRoutine(db, eventBus, routine, ports, opts?.recordSkippedRun);
}
