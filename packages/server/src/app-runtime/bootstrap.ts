import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import { setupFts } from "./fts.js";
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
import { startNotificationDrain } from "./services/notifications/drain.js";
import { defaultMutePreferenceReader } from "./services/notifications/mute.js";
import { registerNotificationListener } from "./services/notifications/notification-listener.js";
import { registerPolicyEngine } from "./services/policy-engine.js";
import { registerRelevanceListener } from "./services/relevance-listener.js";
import { startRetentionReaper } from "./services/retention-reaper.js";
import { startRoutineScheduler } from "./services/routine-scheduler.js";
import { reapStaleRoutineSessions } from "./services/routine-session-reaper.js";
import { startSandboxReaper } from "./services/sandbox-reaper.js";
import { registerSessionReviewCreator } from "./services/session-review-creator.js";
import { registerTaskDispatcher, type TaskDispatcherDeps } from "./services/task-dispatcher.js";

const bootstrapLog = createLogger({ pkg: "server.app-runtime" });

/** Production default poll cadence for the routine scheduler. */
const DEFAULT_ROUTINE_POLL_INTERVAL_MS = 30_000;
/** Default staleness bound for the routine-session reaper (1h). */
const DEFAULT_REAPER_STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Wire all app-runtime event-bus handlers and return their disposers.
 *
 * Called by the production entry point via
 * `createApp({ appBootstrap: bootstrapAppRuntime })`.
 * App-lite tests pass `appBootstrap: undefined` to skip app-runtime
 * wiring entirely.
 *
 * @lore O3: The notification adapter factory and git runner factory are
 * internalized here with defaults (read from factory_settings at runtime).
 * Tests that need custom adapters construct their own appBootstrap
 * function that calls individual register* functions with custom factories.
 *
 * @lore R8: readAlertPreferences is injected from the server layer via the
 * bootstrap context so app-runtime services do not read server config directly. Server-factory.ts
 * provides the implementation backed by readServerConfig(db). Fail-open: if
 * not provided, the dispatcher defaults to all-alerts-ON.
 */
export function bootstrapAppRuntime(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly readAlertPreferences?: () => Promise<AlertPreferences>;
	/**
	 * AD2: provisioning deps for the task dispatcher. When absent (kernel-only
	 * tests, no adapter pool), the dispatcher is not registered.
	 *
	 * Contains the adapter pool, workspace adapter, workspace base path, and
	 * optional resolveModel callback. These are omitted from the context type
	 * here (passed as-is) to avoid app-runtime depending on server harness types.
	 */
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	/**
	 * AF6 §1: routine scheduler poll cadence (ms). Optional; defaults to 30s.
	 * Tests pass a small value. Does NOT widen the appBootstrap type —
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

	// AF9 Task 3b: fire-and-forget FTS setup at every boot so the fts_vector
	// column exists even when production createServer skips the drizzle migrator.
	// setupFts is idempotent (IF NOT EXISTS), so double-apply via the migration
	// path is a no-op.
	setupFts(db).catch((err) => {
		bootstrapLog.error("FTS setup failed at boot", { err });
	});

	// AF9 Task 1: wire the access→relevance subscriber.
	// @lore AF9: viewing a knowledge item now materialises a projection row as a
	// side effect of the GET — this is the first time recomputeScores runs on
	// the live read path (not just in tests). The subscriber is async
	// fire-and-forget; the synchronous event bus invokes the handler wrapper
	// but does not await the async recompute.
	disposers.push(registerRelevanceListener(db, eventBus));

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

	// AF8: notification listener (event→typed row) + drain loop (automatic delivery)
	// The listener subscribes to "notification" and enriches policy-engine push events
	// into typed, source-linked notification_queue rows. The drain makes lease recovery automatic.
	const muteReader = defaultMutePreferenceReader(db);
	disposers.push(registerNotificationListener(db, eventBus, { mute: muteReader }));
	disposers.push(startNotificationDrain(db, defaultNotificationAdapterFactory, {}));

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

		// AF7 §6 (Z8-039): TTL workspace reaper. Reclaims terminal/orphan workspace
		// dirs older than the TTL, preserving active dirs and the crash post-mortem
		// window. sandboxBasePath comes from dispatcherDeps (already in scope at
		// the boot path) — app-runtime takes it as data, not a server fs import.
		disposers.push(startSandboxReaper(db, { sandboxBasePath: ctx.dispatcherDeps.sandboxBasePath }));
	}

	// AF16 T17 (Z8-097): start the retention TTL reaper (6-hour interval).
	// @lore AF16 T17: in-process setInterval scheduler — NOT BullMQ. Runs
	// unconditionally (no dispatcherDeps gate). startRetentionReaper returns a
	// disposer; the sweeper fires immediately on next tick then every 6h.
	disposers.push(startRetentionReaper(db));

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
		canProvision: ctx.canProvision ?? Boolean(ctx.dispatcherDeps),
		...(ctx.dispatcherDeps ? { runtimeDeps: ctx.dispatcherDeps } : {}),
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
