/**
 * Observability composition: adapter + bus subscription + disposer.
 *
 * @lore AU26 C2: relocated from `layers/core-api/observability/src/runtime.ts`
 * when that package dissolved. It is not a Service and never was — it owns no
 * table, exposes no domain operation, and does exactly one thing: assemble
 * three pieces the application already has (a config value from
 * `@hyperidle/settings`, a translator + ring from `./observability/dispatcher.js`,
 * and the `EventBus`) into a disposable subscription. That is composition, so
 * it lives in the composition layer.
 *
 * @lore AU29 §2.4: the dispatcher itself relocated here (from
 * `@hyperidle/shared/observability`) — this file is its only wiring site, and
 * `framework/shared` is the event bus host, so a framework package importing
 * its `bus.on("*")` subscription back into itself would be the pipe hearing
 * its own water. The event/adapter TYPES and the console sink stay in
 * `@hyperidle/shared/observability`.
 *
 * @lore AU26 C2: the handle collapsed to `dispose()`. `status()`, `flush()` and
 * `reconfigure()` existed for the four `/api/observability*` routes — which had
 * zero requesters repo-wide and were deleted with the package. Keeping them
 * would leave three unreachable methods behind an interface `knip` cannot see
 * through. When an operator surface is genuinely wanted, it comes back with a
 * caller.
 *
 * @lore AU26 C2: the injected `serverConfig: { read, update }` port is gone.
 * It existed only because `composition-boundary-guard` bans a core-api Service
 * from importing `@hyperidle/settings`; this file is the Layer, not a Service,
 * so it imports settings directly like every other composition module here.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	createConsoleObservabilityAdapter,
	createLogger,
	type ObservabilityAdapter,
} from "@hyperidle/diagnostics";
import type { EventBus } from "@hyperidle/event-bus";
import { type ObservabilityConfig, readObservabilityConfig } from "@hyperidle/settings";
import {
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
} from "./observability/dispatcher.js";

/** Everything the composition root injects into the observability runtime. */
export interface ObservabilityDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * Optional test seam — inject a fake adapter instead of constructing one
	 * from the `config.adapter` enum.
	 */
	readonly adapter?: ObservabilityAdapter;
}

/** Lifecycle handle returned by {@link startObservability}. */
export interface ObservabilityRuntime {
	/** Graceful shutdown: unsubscribe from the bus, then drain to the adapter. */
	dispose(): Promise<void>;
}

function buildAdapterFromConfig(cfg: ObservabilityConfig): ObservabilityAdapter | null {
	switch (cfg.adapter) {
		case "console":
			return createConsoleObservabilityAdapter();
		case "noop":
			return null;
	}
}

/**
 * Read config, select the adapter, construct the ring dispatcher, and subscribe
 * to the bus. Returns a handle the caller disposes at shutdown.
 */
export async function startObservability(deps: ObservabilityDeps): Promise<ObservabilityRuntime> {
	const logger = createLogger({ pkg: "observability.runtime" });
	const cfg = await readObservabilityConfig(deps.db);

	const adapter = cfg.enabled ? (deps.adapter ?? buildAdapterFromConfig(cfg)) : null;
	if (!adapter) {
		logger.debug("observability disabled — no dispatcher wired", {
			enabled: cfg.enabled,
			adapter: cfg.adapter,
		});
		return { dispose: async (): Promise<void> => undefined };
	}

	const dispatcher = createObservabilityDispatcher({
		adapter,
		config: {
			batchSize: cfg.batchSize,
			flushIntervalMs: cfg.flushIntervalMs,
			bufferCap: cfg.bufferCap,
		},
	});
	const unsubscribe = registerObservabilityDispatcher(deps.eventBus, { dispatcher });

	return {
		async dispose(): Promise<void> {
			unsubscribe();
			await dispatcher.dispose();
		},
	};
}
