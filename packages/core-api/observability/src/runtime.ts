/**
 * AU20 Ab3 — Observability runtime: single entry point + lifecycle handle.
 *
 * `startObservability` is the only composition entry point. It reads config,
 * selects the adapter, builds the trace-id resolver, constructs the ring
 * dispatcher, and subscribes to the bus — all INSIDE. The composition root
 * gets back an `ObservabilityRuntime` handle with status / flush / reconfigure
 * / dispose. The prior 6-primitive "parts kit" (createConsoleAdapter +
 * createDbTraceIdResolver + createObservabilityDispatcher +
 * registerObservabilityDispatcher + DispatcherDeps + RegisterDeps) is now
 * private behind this factory.
 *
 * @lore AU20 Ab3: `ObservabilityDeps` bundles what were `ObservabilityConfigDeps`
 * + `ObservabilityServerConfigPort` + `ObservabilityConfigSection*` (structural
 * mirror duplicates) into ONE contract wired at the composition root. The
 * `adapter?` field is the test seam that replaces `AppOptions.observabilityAdapter`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import type { ObservabilityConfig, ObservabilityConfigPatch } from "./config.js";
import { readObservabilityConfig } from "./config.js";
import { createConsoleObservabilityAdapter } from "./console-adapter.js";
import {
	createDbTraceIdResolver,
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
} from "./dispatcher.js";
import type {
	FlushOutcome,
	ObservabilityAdapter,
	ObservabilityChannel,
	ObservabilityDispatcher,
} from "./types.js";

// ---------------------------------------------------------------------------
// Local server-config port type — structural mirror of @hyperidle/settings'
// own ServerConfig.observability section.  Not exported; lives inside
// ObservabilityDeps so callers wire it at the composition root.
// ---------------------------------------------------------------------------

interface ObservabilityServerConfigPort {
	read(db: HyperIdleDb): Promise<{ observability: ObservabilityConfig }>;
	update(db: HyperIdleDb, patch: { observability?: ObservabilityConfigPatch }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * All deps the composition root injects into the observability runtime.
 * Subsumes the former `ObservabilityConfigDeps`, `ObservabilityServerConfigPort`,
 * `ObservabilityConfigSection`, and `ObservabilityConfigSectionPatch` from
 * `ports.ts` — those were structural duplicates; one contract now.
 */
export interface ObservabilityDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly serverConfig: ObservabilityServerConfigPort;
	/**
	 * Optional test seam — inject a fake adapter instead of constructing
	 * one from `config.adapter` enum. When provided, this adapter is used
	 * across all reconfigure cycles (the injected adapter wins over the
	 * config-driven console/noop selection).
	 */
	readonly adapter?: ObservabilityAdapter;
}

/**
 * Operator-visible snapshot for GET /api/observability/status.
 * Renamed from `ObservabilityDispatcherStatus`; now includes `enabled`
 * so the route can serialize it directly without a separate config read.
 */
export interface ObservabilityStatus {
	readonly enabled: boolean;
	readonly bufferDepth: number;
	readonly lastFlushAt: string | null;
	readonly lastErrorAt: string | null;
	readonly lastError: string | null;
	readonly dropped: number;
	readonly delivered: number;
	readonly adapter: ObservabilityChannel;
}

/**
 * Lifecycle handle returned by `startObservability`.
 *
 * - `status()` — current snapshot (synchronous).
 * - `flush()` — drain buffer → adapter; returns partial-drain report.
 * - `reconfigure(cfg)` — apply a new config: tear down old bus subscription
 *   + dispatcher, build new ones. Used by the PATCH /config route.
 * - `dispose()` — graceful shutdown: unsubscribe + drain + stop timer.
 */
export interface ObservabilityRuntime {
	status(): ObservabilityStatus;
	flush(): Promise<FlushOutcome>;
	reconfigure(cfg: ObservabilityConfig): void;
	dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function buildAdapterFromConfig(cfg: ObservabilityConfig): ObservabilityAdapter | null {
	switch (cfg.adapter) {
		case "console":
			return createConsoleObservabilityAdapter();
		case "noop":
			return null;
	}
}

/**
 * Single composition entry point for the observability platform runtime.
 *
 * Reads config via the injected `serverConfig` port, selects the adapter
 * from the `adapter` enum (`console`/`noop`) or the injected test seam,
 * builds the trace-id resolver, constructs the ring dispatcher, and
 * subscribes to the bus. Returns a lifecycle handle.
 *
 * @lore AU20 Ab3: `app.ts`'s ~50-line hand-assembly (buildObservabilityAdapter
 * + buildDispatcher + wireObservability + resolver + unsubscribe bookkeeping)
 * collapses into this function + `runtime.reconfigure()` on config change.
 */
export async function startObservability(deps: ObservabilityDeps): Promise<ObservabilityRuntime> {
	const logger = createLogger({ pkg: "observability.runtime" });

	// The trace-id resolver is created ONCE and reused across reconfigure
	// cycles so the session→trace cache survives adapter/config rotation.
	const resolver = createDbTraceIdResolver(deps.db);

	let currentCfg = await readObservabilityConfig(deps.db, {
		serverConfig: deps.serverConfig,
	});
	let currentDispatcher: ObservabilityDispatcher | null = null;
	let currentUnsub: (() => void) | null = null;

	function wire(cfg: ObservabilityConfig): void {
		// Tear down previous subscription first — never run two subscribers.
		if (currentUnsub) {
			currentUnsub();
			currentUnsub = null;
		}
		const previous = currentDispatcher;
		currentCfg = cfg;

		// Build new adapter and dispatcher.
		const adapter = cfg.enabled ? (deps.adapter ?? buildAdapterFromConfig(cfg)) : null;
		currentDispatcher =
			cfg.enabled && adapter
				? createObservabilityDispatcher({
						adapter,
						config: {
							batchSize: cfg.batchSize,
							flushIntervalMs: cfg.flushIntervalMs,
							bufferCap: cfg.bufferCap,
						},
					})
				: null;

		if (currentDispatcher) {
			const dispatcher = currentDispatcher;
			currentUnsub = registerObservabilityDispatcher(deps.eventBus, {
				dispatcher,
				resolver,
			});
		}

		// Dispose the previous dispatcher fire-and-forget — must not block the
		// PATCH route on an outbound adapter flush (same pattern as app.ts had).
		if (previous) {
			void previous.dispose().catch((err: unknown) => {
				logger.warn("observability: previous dispatcher dispose failed", {
					error: err instanceof Error ? err.message : String(err),
				});
			});
		}
	}

	// Initial wiring from config.
	wire(currentCfg);

	return {
		status(): ObservabilityStatus {
			if (currentDispatcher) {
				const snap = currentDispatcher.status();
				return {
					enabled: true,
					bufferDepth: snap.bufferDepth,
					lastFlushAt: snap.lastFlushAt,
					lastErrorAt: snap.lastErrorAt,
					lastError: snap.lastError,
					dropped: snap.dropped,
					delivered: snap.delivered,
					adapter: snap.adapter,
				};
			}
			// Disabled or noop — return config-backed fallback so the route
			// can reflect the persisted state (e.g. enabled=true, adapter=noop).
			return {
				enabled: currentCfg.enabled,
				adapter: currentCfg.adapter,
				bufferDepth: 0,
				lastFlushAt: null,
				lastErrorAt: null,
				lastError: null,
				dropped: 0,
				delivered: 0,
			};
		},

		async flush(): Promise<FlushOutcome> {
			if (!currentDispatcher) return { flushed: 0, dropped: 0, errors: 0 };
			return currentDispatcher.flush();
		},

		reconfigure(cfg: ObservabilityConfig): void {
			wire(cfg);
		},

		async dispose(): Promise<void> {
			if (currentUnsub) {
				currentUnsub();
				currentUnsub = null;
			}
			if (currentDispatcher) {
				await currentDispatcher.dispose();
				currentDispatcher = null;
			}
		},
	};
}
