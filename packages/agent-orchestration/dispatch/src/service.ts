/**
 * `dispatch` Service — the bound-ops factory.
 *
 * @lore AU19 Increment 3h: every impure entry point across this Service's 5
 * source files now takes an explicit `DispatchPorts` parameter (Mechanism C
 * DI). But this Service's real downstream consumers (`app.ts`,
 * `server-factory.ts`, `routines.ts`, `tools/create-routine.ts`,
 * `tools/create-team.ts`, `routes/routines-routes.ts`,
 * `routes/dispatch-queue-routes.ts`, `routes/teams-routes.ts`) expect the
 * ORIGINAL, deps-free call signatures, unchanged — same idiom as `cost`'s
 * `createCostOps`/`agent-selection`'s `createAgentSelectionOps`:
 * `createDispatchOps` closes over `DispatchPorts` ONCE, at the composition
 * root (`packages/server/src/services/dispatch-bindings.ts`), and returns
 * bound functions whose signatures exactly match what every downstream
 * caller already expects — a mechanical wiring swap, zero behavior change.
 *
 * Pure functions (`mapErrorToNotice`, `isAssistantThread`, `parseCron`,
 * `nextCronMatch`, `computeNextRunAt`, `getDispatchQueueSnapshot`) need no
 * binding — they are re-exported directly from `index.ts`.
 */

import type { AgentSessionRequest, HyperIdleDb, Routine } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { AssistantTurnDeps } from "./agent-work-assistant.js";
import {
	executeAssistantRequestInternal,
	persistTurnFailureInternal,
} from "./agent-work-assistant.js";
import { registerAssistantDispatcherInternal } from "./assistant-dispatcher.js";
import type { PostBetRetroArgs, RunBuiltinResult } from "./builtin-routine-handlers.js";
import {
	provisionTeamRoutinesInternal,
	registerBuiltinRoutineHandlersInternal,
	runBuiltinRoutineInternal,
} from "./builtin-routine-handlers.js";
import type { DispatchPorts } from "./ports.js";
import type { FireResult, RoutineScheduler, RoutineSchedulerConfig } from "./routine-scheduler.js";
import {
	checkAndFireRoutineInternal,
	getRoutineMonthlySpendInternal,
	startRoutineSchedulerInternal,
} from "./routine-scheduler.js";
import type { TaskDispatcherDeps } from "./task-dispatcher.js";
import { registerTaskDispatcherInternal } from "./task-dispatcher.js";

/** The deps-free surface this Service's downstream callers expect. */
export interface DispatchOps {
	registerTaskDispatcher(deps: TaskDispatcherDeps): () => void;
	registerAssistantDispatcher(eventBus: EventBus, db: HyperIdleDb): () => void;
	startRoutineScheduler(
		db: HyperIdleDb,
		eventBus: EventBus,
		config: RoutineSchedulerConfig,
	): Promise<RoutineScheduler>;
	registerBuiltinRoutineHandlers(db: HyperIdleDb, eventBus: EventBus): () => void;
	executeAssistantRequest(deps: AssistantTurnDeps, request: AgentSessionRequest): Promise<void>;
	persistTurnFailure(
		db: HyperIdleDb,
		eventBus: EventBus,
		userId: string,
		threadId: string,
		err: unknown,
	): Promise<void>;
	runBuiltinRoutine(
		db: HyperIdleDb,
		eventBus: EventBus,
		routineId: string,
		args?: PostBetRetroArgs,
	): Promise<RunBuiltinResult>;
	provisionTeamRoutines(
		db: HyperIdleDb,
		opts: {
			teamId: string;
			ownerByRole: Partial<Record<string, string>>;
			leadAgentId: string;
		},
	): Promise<void>;
	checkAndFireRoutine(
		db: HyperIdleDb,
		eventBus: EventBus,
		routine: Routine,
		runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
	): Promise<FireResult>;
	getRoutineMonthlySpend(db: HyperIdleDb, routineId: string): Promise<number>;
}

/** Bind this Service's DB-touching functions to a single `DispatchPorts` instance. */
export function createDispatchOps(ports: DispatchPorts): DispatchOps {
	return {
		registerTaskDispatcher: (deps) => registerTaskDispatcherInternal(ports, deps),
		registerAssistantDispatcher: (eventBus, db) =>
			registerAssistantDispatcherInternal(ports, eventBus, db),
		startRoutineScheduler: (db, eventBus, config) =>
			startRoutineSchedulerInternal(ports, db, eventBus, config),
		registerBuiltinRoutineHandlers: (db, eventBus) =>
			registerBuiltinRoutineHandlersInternal(ports, db, eventBus),
		executeAssistantRequest: (deps, request) =>
			executeAssistantRequestInternal(ports, deps, request),
		persistTurnFailure: (db, eventBus, userId, threadId, err) =>
			persistTurnFailureInternal(ports, db, eventBus, userId, threadId, err),
		runBuiltinRoutine: (db, eventBus, routineId, args) =>
			runBuiltinRoutineInternal(ports, db, eventBus, routineId, args),
		provisionTeamRoutines: (db, opts) => provisionTeamRoutinesInternal(ports, db, opts),
		checkAndFireRoutine: (db, eventBus, routine, runtimeDeps) =>
			checkAndFireRoutineInternal(ports, db, eventBus, routine, runtimeDeps),
		getRoutineMonthlySpend: (db, routineId) => getRoutineMonthlySpendInternal(ports, db, routineId),
	};
}
