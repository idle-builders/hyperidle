import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import { registerBuiltinRoutineHandlers } from "./services/builtin-routines.js";
import { registerCostCapDedupReleaser } from "./services/cost-cap.js";
// @lore AD8c: cost sentinel extracted from routine row to application code.
// startCostSentinel returns a cleanup disposer consistent with the existing pattern.
import { startCostSentinel } from "./services/cost-sentinel.js";
import { registerGitExportHandler } from "./services/git-export.js";
import { createGitRunner } from "./services/git-export-runner.js";
import { registerLifecyclePropagation } from "./services/lifecycle-propagation.js";
import { defaultNotificationAdapterFactory } from "./services/notifications/adapter-factory.js";
import {
	type AlertPreferences,
	registerNotificationDispatcher,
} from "./services/notifications/dispatcher.js";
import { registerPolicyEngine } from "./services/policy-engine.js";
import { startRoutineScheduler } from "./services/routine-scheduler.js";
import { reapStaleRoutineSessions } from "./services/routine-session-reaper.js";
import { registerSessionReviewCreator } from "./services/session-review-creator.js";
import { registerTaskDispatcher, type TaskDispatcherDeps } from "./services/task-dispatcher.js";

const bootstrapLog = createLogger({ pkg: "fabric" });

/** Production default poll cadence for the routine scheduler. */
const DEFAULT_ROUTINE_POLL_INTERVAL_MS = 30_000;
/** Default staleness bound for the routine-session reaper (1h). */
const DEFAULT_REAPER_STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Wire all strategy-layer event-bus handlers and return their disposers.
 *
 * Called by the production entry point via
 * `createApp({ strategyBootstrap: bootstrapFabric })`.
 * Kernel-only tests pass `strategyBootstrap: undefined` to skip strategy
 * wiring entirely.
 *
 * @lore O3: The notification adapter factory and git runner factory are
 * internalized here with defaults (read from factory_settings at runtime).
 * Tests that need custom adapters construct their own strategyBootstrap
 * function that calls individual register* functions with custom factories.
 *
 * @lore R8: readAlertPreferences is injected from the server layer via the
 * bootstrap context so fabric does not depend on server. Server-factory.ts
 * provides the implementation backed by readServerConfig(db). Fail-open: if
 * not provided, the dispatcher defaults to all-alerts-ON.
 */
export function bootstrapFabric(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly readAlertPreferences?: () => Promise<AlertPreferences>;
	/**
	 * AD2: provisioning deps for the task dispatcher. When absent (kernel-only
	 * tests, no adapter pool), the dispatcher is not registered.
	 *
	 * Contains the adapter pool, workspace adapter, workspace base path, and
	 * optional resolveModel callback. These are omitted from the context type
	 * here (passed as-is) to avoid fabric depending on server types.
	 */
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	/**
	 * AF6 §1: routine scheduler poll cadence (ms). Optional; defaults to 30s.
	 * Tests pass a small value. Does NOT widen the strategyBootstrap type —
	 * server-factory constructs the ctx inline.
	 */
	readonly routinePollIntervalMs?: number;
	/**
	 * AF6 scope (iii): when true, the scheduler auto-fires generic (taskId)
	 * routines through checkAndFireRoutine. Production default false (no
	 * dispatcher → would create zombie sessions). Built-ins always fire.
	 */
	readonly canProvision?: boolean;
	/** AF6 §4: routine-session reaper staleness bound (ms). Default 1h. */
	readonly reaperStaleAfterMs?: number;
	/** AF6 §4: in-process periodic reaper cadence (ms). 0 = every poll (tests). */
	readonly reaperCadenceMs?: number;
}): Array<() => void> {
	const { db, eventBus } = ctx;
	const disposers: Array<() => void> = [];

	disposers.push(registerSessionReviewCreator(db, eventBus));
	disposers.push(registerPolicyEngine(db, eventBus));
	disposers.push(registerLifecyclePropagation(db, eventBus));
	disposers.push(registerBuiltinRoutineHandlers(db, eventBus));
	disposers.push(registerCostCapDedupReleaser(eventBus));
	// @lore AD8c: cost sentinel registered as a 15-minute scheduled job.
	// Runs unconditionally — cannot be disabled via a routine row's `active` flag.
	disposers.push(startCostSentinel(db, eventBus));
	disposers.push(
		registerGitExportHandler(db, eventBus, {
			runnerFactory: (repoPath) => createGitRunner(repoPath),
		}),
	);
	disposers.push(
		registerNotificationDispatcher(db, eventBus, {
			adapterFactory: defaultNotificationAdapterFactory,
			readAlertPreferences: ctx.readAlertPreferences,
		}),
	);

	// AD2: Register task dispatcher when provisioning deps are provided.
	// When absent (kernel-only tests without an adapter pool), dispatcher is skipped.
	if (ctx.dispatcherDeps) {
		disposers.push(
			registerTaskDispatcher({
				db,
				eventBus,
				...ctx.dispatcherDeps,
			}),
		);
	}

	// AF6 §4: boot one-shot reaper — clear zombie routine sessions left by a
	// previous process (process death mid-run). Fire-and-forget; never blocks boot.
	const reaperStaleAfterMs = ctx.reaperStaleAfterMs ?? DEFAULT_REAPER_STALE_AFTER_MS;
	reapStaleRoutineSessions(db, eventBus, { staleAfterMs: reaperStaleAfterMs }).catch((err) => {
		bootstrapLog.error("boot routine-session reaper failed", { err });
	});

	// AF6 §1 (Option A): start the routine scheduler async, push a deferred
	// disposer that drains the start promise then stops. Built-in routines
	// auto-fire (no session); generic routines are gated by canProvision.
	const pollIntervalMs = ctx.routinePollIntervalMs ?? DEFAULT_ROUTINE_POLL_INTERVAL_MS;
	const schedulerPromise = startRoutineScheduler(db, eventBus, {
		pollIntervalMs,
		canProvision: ctx.canProvision ?? false,
		// Non-optional periodic reaper sweep (WARNING 2): catches in-process hangs.
		reap: () => reapStaleRoutineSessions(db, eventBus, { staleAfterMs: reaperStaleAfterMs }),
		reaperCadenceMs: ctx.reaperCadenceMs,
	});
	schedulerPromise.catch((err) => {
		bootstrapLog.error("routine scheduler failed to start", { err });
	});
	disposers.push(() => {
		void schedulerPromise.then((s) => s.stop()).catch(() => {});
	});

	return disposers;
}
