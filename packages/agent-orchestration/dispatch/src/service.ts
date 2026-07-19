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
 *
 * @lore AU20 Ag1b: 10-method `DispatchOps` collapsed to 4. `start` absorbs
 * the four individual `register*`/`startRoutineScheduler` lifecycle calls;
 * `fireRoutine` unifies `runBuiltinRoutine` + `checkAndFireRoutine` via
 * `isBuiltinRoutineId` dispatch; `runAssistantTurn` renames
 * `executeAssistantRequest`; `provisionTeamRoutines` is unchanged.
 * `persistTurnFailure` and `getRoutineMonthlySpend` are removed from the
 * interface — they were never true "ops" (one is an internal error handler,
 * the other a scalar read). Callers are migrated to `startDispatch` (the
 * composition root adapter) or inline the spend query.
 */

import type { AgentSessionRequest, HyperIdleDb, Routine } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { AssistantTurnDeps } from "./agent-work-assistant.js";
import { executeAssistantRequestInternal } from "./agent-work-assistant.js";
import { registerAssistantDispatcherInternal } from "./assistant-dispatcher.js";
import type { PostBetRetroArgs } from "./builtin-routine-handlers.js";
import {
	provisionTeamRoutinesInternal,
	registerBuiltinRoutineHandlersInternal,
	runBuiltinRoutineInternal,
} from "./builtin-routine-handlers.js";
import { isBuiltinRoutineId } from "./builtin-routines-config.js";
import type { DispatchPorts } from "./ports.js";
import type { FireResult, RoutineSchedulerConfig } from "./routine-scheduler.js";
import { checkAndFireRoutineInternal, startRoutineSchedulerInternal } from "./routine-scheduler.js";
import type { TaskDispatcherDeps } from "./task-dispatcher.js";
import { registerTaskDispatcherInternal } from "./task-dispatcher.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Tears down everything started by `DispatchOps.start`. */
export type Disposer = () => void;

/**
 * Configuration for `DispatchOps.start` — one call bootstraps all dispatch
 * lifecycle registrations previously wired as four individual calls.
 */
export interface DispatchConfig {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** When provided, the routine scheduler is started with this config. */
	readonly scheduler?: RoutineSchedulerConfig;
	/** When provided, the task dispatcher is registered with these deps (merged with db/eventBus). */
	readonly task?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}

// ---------------------------------------------------------------------------
// DispatchOps interface — 4 methods
// ---------------------------------------------------------------------------

/** The deps-free surface this Service's downstream callers expect. */
export interface DispatchOps {
	/**
	 * Bootstrap all dispatch lifecycle subscriptions (builtin handlers,
	 * assistant dispatcher, optional task dispatcher, optional scheduler).
	 * Returns a single `Disposer` that tears everything down.
	 */
	start(config: DispatchConfig): Promise<Disposer>;

	/** Execute one conversational assistant turn (renamed from `executeAssistantRequest`). */
	runAssistantTurn(deps: AssistantTurnDeps, request: AgentSessionRequest): Promise<void>;

	/**
	 * Fire a routine by its DB row.
	 *
	 * Dispatches by `isBuiltinRoutineId(routine.id)`: builtins call the
	 * in-process handler; generic routines go through the scheduler's
	 * `checkAndFire` path (session-provisioning gated by `canProvision`).
	 */
	fireRoutine(
		db: HyperIdleDb,
		eventBus: EventBus,
		routine: Routine,
		opts?: {
			readonly args?: PostBetRetroArgs;
			readonly runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
		},
	): Promise<FireResult>;

	/** Provision the standard set of built-in routines for a newly created team. */
	provisionTeamRoutines(
		db: HyperIdleDb,
		opts: {
			teamId: string;
			ownerByRole: Partial<Record<string, string>>;
			leadAgentId: string;
		},
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Bind this Service's DB-touching functions to a single `DispatchPorts` instance. */
export function createDispatchOps(ports: DispatchPorts): DispatchOps {
	return {
		async start(config): Promise<Disposer> {
			const disposers: Disposer[] = [];
			disposers.push(registerBuiltinRoutineHandlersInternal(ports, config.db, config.eventBus));
			disposers.push(registerAssistantDispatcherInternal(ports, config.eventBus, config.db));
			if (config.task) {
				disposers.push(
					registerTaskDispatcherInternal(ports, {
						db: config.db,
						eventBus: config.eventBus,
						...config.task,
					}),
				);
			}
			if (config.scheduler) {
				const scheduler = await startRoutineSchedulerInternal(
					ports,
					config.db,
					config.eventBus,
					config.scheduler,
				);
				disposers.push(() => scheduler.stop());
			}
			return () => {
				for (const d of disposers) d();
			};
		},

		runAssistantTurn: (deps, request) => executeAssistantRequestInternal(ports, deps, request),

		fireRoutine: (db, eventBus, routine, opts): Promise<FireResult> => {
			if (isBuiltinRoutineId(routine.id)) {
				// RunBuiltinResult and FireResult are structurally identical after AU20 Ag1b
				// extension — no behavior change, only a type-level unification.
				return runBuiltinRoutineInternal(
					ports,
					db,
					eventBus,
					routine.id,
					opts?.args,
				) as Promise<FireResult>;
			}
			return checkAndFireRoutineInternal(ports, db, eventBus, routine, opts?.runtimeDeps);
		},

		provisionTeamRoutines: (db, opts) => provisionTeamRoutinesInternal(ports, db, opts),
	};
}
