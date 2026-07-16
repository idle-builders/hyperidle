/**
 * Barrel for @hyperidle/observability (core-api Layer, non-SQL orchestration
 * Service).
 *
 * Typed functions only. `observability` owns ZERO tables — its config lives
 * in `server_config.observability`, owned by `settings` and reached through
 * an injected `ObservabilityServerConfigPort` (`ports.ts`). No `TABLE_OWNER`
 * row is added for `observability` — there is nothing to own (same shape as
 * `policy`'s Increment 2a / `git-export`'s Increment 2c finding).
 *
 * @lore AU19 Increment 2d: this is the real cut-over — `types.ts` (the
 * `ObservabilityAdapter`/`ObservabilityDispatcher` contracts), `console-
 * adapter.ts` (the structured-log sink), `config.ts` (the
 * `server_config.observability` read/write surface), and `dispatcher.ts`
 * (the buffered ring-dispatcher + `registerObservabilityDispatcher` bus
 * subscriber + `summarizeToolArgs`) moved here from
 * `packages/server/src/services/observability/` (behavior-preserving move —
 * the one real outbound edge, `observability → settings`, became an
 * injected `ObservabilityServerConfigPort` DI port, `ports.ts`). Every real
 * consumer (`routes/observability-routes.ts`, `app.ts`,
 * `services/session-provisioning.ts`'s `summarizeToolArgs` call) now imports
 * from `@hyperidle/observability` instead of the deleted
 * `packages/server/src/services/observability/*` — same closing idiom as
 * `git-export`'s Increment 2c.
 */

// -- config (server_config.observability read/write) --
export type {
	ObservabilityConfig,
	ObservabilityConfigPatch,
	SafeObservabilityConfig,
} from "./config.js";
export {
	readObservabilityConfig,
	redactObservabilityConfig,
	updateObservabilityConfig,
} from "./config.js";
// -- console adapter (structured-log sink) --
export { createConsoleObservabilityAdapter } from "./console-adapter.js";
// -- dispatcher (ring buffer + bus subscriber + tool-arg scrubbing) --
export type {
	DispatcherDeps,
	RegisterObservabilityDispatcherDeps,
	TraceIdResolver,
} from "./dispatcher.js";
export {
	createDbTraceIdResolver,
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
	summarizeToolArgs,
} from "./dispatcher.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	ObservabilityConfigDeps,
	ObservabilityConfigSection,
	ObservabilityConfigSectionPatch,
	ObservabilityServerConfigPort,
} from "./ports.js";
// -- types (adapter / dispatcher contracts) --
export type {
	FlushOutcome,
	ObservabilityAdapter,
	ObservabilityChannel,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "./types.js";
