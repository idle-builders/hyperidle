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
import type { HyperIdleDb, Routine } from "@hyperidle/db";
import { assembleSessionDocuments } from "@hyperidle/document";
import { EventBus } from "@hyperidle/event-bus";
import { getTeam } from "@hyperidle/org";
import {
	type FireResult,
	fireGenericRoutine,
	getRoutine,
	type RoutineSchedulerConfig,
	type RoutineSchedulerPorts,
	startRoutineScheduler as startRoutineSchedulerInternal,
} from "@hyperidle/routine";
import { readServerConfig } from "@hyperidle/settings";
import * as work from "@hyperidle/task";
import { findThread } from "@hyperidle/thread";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import type { ActionContext, SearchDocumentsRunFn } from "../actions/action.js";
import { resolveAgentIdentityBody } from "./task-run-resolver-bindings.js";

/**
 * A synthetic `ActionContext` for a scheduler-initiated document read — no
 * request/session actor is in scope this deep in the fire pipeline. The
 * `EventBus` is a fresh, unused instance (`search_documents` never touches
 * `ctx.eventBus`; see `task-run-resolver-bindings.ts`'s own note on the same
 * pattern).
 */
function schedulerReadCtx(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: new Date().toISOString() };
}

/**
 * AU31 §3.2 — builds `RoutineSchedulerPorts` for ONE composition's port.
 * Replaces the former module-level `routineSchedulerPorts` constant: the
 * seam is a per-composition value now, so the ports bag can no longer be
 * built once at import time.
 */
export function buildRoutineSchedulerPorts(
	port: AgentOrchestrationPort,
	searchDocuments: SearchDocumentsRunFn,
): RoutineSchedulerPorts {
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
			// @lore BC3 architecture.md §5: getItemById/createItem/
			// findRetroItemByThreadIds DELETED — all three read/wrote the
			// `items` table, which no longer exists.
		},
		conversation: {
			// BA9c: findThreadById — thread row for thread_* events.
			findThreadById: (db, id) => findThread(db, { id }),
		},
		// @lore BC4 architecture.md §0 A1: the `knowledge` port (getItemById,
		// backing the three unused knowledge_* trigger events) is deleted — see
		// `ports.ts`'s own `@lore` on the interface.
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
		assembleSessionKnowledge: assembleSessionDocuments,
		// @lore BC4 follow-up (architecture.md §8.3): migrated onto the injected
		// `search_documents` runner — `startRoutineScheduler`/`fireRoutine`
		// (below) now take it as an explicit parameter, threaded from
		// `service-bootstrap.ts`'s `registerAgentLayerServices` (its own
		// standalone composition — `service-bootstrap.ts` is wired from
		// `db`/`eventBus` alone, with no task/thread action bags in scope, so it
		// cannot reach the real composed list `actions/compose.ts` builds) and
		// from the direct `fireRoutine` callers (`tools/eval`'s scenarios,
		// `dispatch-test-helpers.ts`). Actor: no request/session actor is in
		// scope this deep in the fire pipeline (§8.3 names no neighbour-specific
		// choice for the scheduler), so both reads use the agent this run is
		// for — `agent_file`/`prompt` are non-ordinary slots visible to the
		// agent they belong to (§5.1), and it is the only actor available here.
		getAgentIdentity: (db: HyperIdleDb, agentId: string) =>
			resolveAgentIdentityBody(schedulerReadCtx(db, agentId), agentId, searchDocuments),
		getRoutinePrompt: async (db: HyperIdleDb, routineId: string) => {
			const routine = await getRoutine(db, routineId);
			if (!routine) return null;
			// @lore knowledge-attachment-slot: no status filter, on purpose — the
			// pre-item read never had one, so a manually archived prompt keeps
			// being read exactly as it is today (pinned by a test).
			const result = await searchDocuments(schedulerReadCtx(db, routine.ownerAgentId), {
				parent: { kind: "routine", id: routineId },
				slot: "prompt",
			});
			return result.ok ? (result.data[0]?.body ?? null) : null;
		},
	};
}

/** Bound wrapper — starts the cron/due-eval scheduler with the real ports. */
export function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	searchDocuments: SearchDocumentsRunFn,
	config: RoutineSchedulerConfig,
): ReturnType<typeof startRoutineSchedulerInternal> {
	return startRoutineSchedulerInternal(
		db,
		eventBus,
		buildRoutineSchedulerPorts(agentOrchestration, searchDocuments),
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
	searchDocuments: SearchDocumentsRunFn,
	routine: Routine,
	opts?: {
		readonly recordSkippedRun?: boolean;
	},
): Promise<FireResult> {
	const ports = buildRoutineSchedulerPorts(agentOrchestration, searchDocuments);
	return fireGenericRoutine(db, eventBus, routine, ports, opts?.recordSkippedRun);
}
