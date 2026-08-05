/**
 * `@hyperidle/shared/observability` — the bus-adjacent telemetry plumbing.
 *
 * @lore AU26 C2: `layers/core-api/observability` DISSOLVED. It owned no
 * table, issued zero DB queries (all three `@hyperidle/db` imports were
 * `import type`, and `createDbTraceIdResolver` literally did `void db;`), and
 * its four HTTP routes had zero requesters repo-wide. What is left is what it
 * always actually was: a pure `DomainEvent → ObservabilityEvent` translator, a
 * ring buffer, and a console sink — bus-adjacent primitives that belong beside
 * `event-bus.ts`, not behind a Service boundary. Precedent: `summarizeToolArgs`
 * made the same trip to `shared/src/redact.ts` in AU20.
 *
 * NOT relocated here: the config read/write pair (it is a `server_config`
 * section, so it went to `@hyperidle/settings`) and `startObservability` (it is
 * composition — adapter + subscription + disposer — so it went to the
 * application's boot wiring).
 *
 * A separate subpath rather than the main barrel: this is server-side runtime
 * plumbing with a background timer, and the web bundle has no use for it. The
 * `ObservabilityEvent` type itself stays on the main barrel — producers across
 * the repo reference it.
 */
export { createConsoleObservabilityAdapter } from "./console-adapter.js";
export type { DispatcherDeps, DispatcherRingConfig } from "./dispatcher.js";
export { createObservabilityDispatcher, registerObservabilityDispatcher } from "./dispatcher.js";
export type {
	FlushOutcome,
	ObservabilityAdapter,
	ObservabilityChannel,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "./types.js";
