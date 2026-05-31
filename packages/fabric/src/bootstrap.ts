import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { registerBuiltinRoutineHandlers } from "./services/builtin-routines.js";
import { registerCostCapDedupReleaser } from "./services/cost-cap.js";
import { registerGitExportHandler } from "./services/git-export.js";
import { createGitRunner } from "./services/git-export-runner.js";
import { registerLifecyclePropagation } from "./services/lifecycle-propagation.js";
import { defaultNotificationAdapterFactory } from "./services/notifications/adapter-factory.js";
import {
	type AlertPreferences,
	registerNotificationDispatcher,
} from "./services/notifications/dispatcher.js";
import { registerPolicyEngine } from "./services/policy-engine.js";
import { registerSessionReviewCreator } from "./services/session-review-creator.js";

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
}): Array<() => void> {
	const { db, eventBus } = ctx;
	const disposers: Array<() => void> = [];

	disposers.push(registerSessionReviewCreator(db, eventBus));
	disposers.push(registerPolicyEngine(db, eventBus));
	disposers.push(registerLifecyclePropagation(db, eventBus));
	disposers.push(registerBuiltinRoutineHandlers(db, eventBus));
	disposers.push(registerCostCapDedupReleaser(eventBus));
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

	return disposers;
}
