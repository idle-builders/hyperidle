/**
 * `@hyperidle/shared/observability` — the bus-adjacent telemetry TYPES + the
 * console sink.
 *
 * @lore AU29 §2.4: the dispatcher (`createObservabilityDispatcher` +
 * `registerObservabilityDispatcher` — the `bus.on("*")` subscription) moved to
 * `layers/core-api/src/observability/dispatcher.ts`, its only wiring site
 * (`observability-runtime.ts`). `framework/shared` is the event bus HOST —
 * a framework package that also subscribes to it is both the pipe and the
 * water. What stays here is genuinely bus-adjacent but not bus-touching: the
 * event/adapter/status TYPES (referenced across the repo) and the console
 * adapter (a plain sink, no bus dependency).
 *
 * @lore AU26 C2 (superseded by AU29 for the dispatcher half, kept for
 * context): `layers/core-api/observability` DISSOLVED here first. It owned no
 * table, issued zero DB queries, and its four HTTP routes had zero requesters
 * repo-wide. NOT relocated back with the dispatcher: the config read/write
 * pair (`@hyperidle/settings`, a `server_config` section) and
 * `startObservability` (composition — stays in the application's boot wiring).
 */
export { createConsoleObservabilityAdapter } from "./console-adapter.js";
export type {
	FlushOutcome,
	ObservabilityAdapter,
	ObservabilityChannel,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "./types.js";
