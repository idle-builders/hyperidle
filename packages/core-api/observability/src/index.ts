/**
 * Barrel for @hyperidle/observability (core-api Layer, non-SQL orchestration
 * Service).
 *
 * AU20 Ab3 collapse: 23 exports → 9.
 *
 * The prior "parts kit" (6 composition primitives + duplicate config type
 * families + cross-service `summarizeToolArgs`) is gone. The public surface
 * is now ONE factory + ONE handle + a thin config read/write pair:
 *
 *   startObservability(deps)           → Promise<ObservabilityRuntime>
 *   readObservabilityConfig(db, deps)  → Promise<ObservabilityConfig>
 *   updateObservabilityConfig(db, p, deps) → Promise<ObservabilityConfig>
 *
 * Type exports:
 *   ObservabilityDeps      — single injected DI shape
 *   ObservabilityRuntime   — operator lifecycle handle
 *   ObservabilityStatus    — /status response shape
 *   ObservabilityConfig    — config value
 *   ObservabilityConfigPatch — update input
 *   FlushOutcome           — flush() return (named type for route + tests)
 *
 * Internalized (no longer exported):
 *   createConsoleObservabilityAdapter, createDbTraceIdResolver,
 *   createObservabilityDispatcher, registerObservabilityDispatcher,
 *   DispatcherDeps, RegisterObservabilityDispatcherDeps, TraceIdResolver,
 *   ObservabilityAdapter, ObservabilityChannel, ObservabilityDispatcher,
 *   ObservabilityDispatcherStatus, SafeObservabilityConfig,
 *   redactObservabilityConfig, ObservabilityConfigDeps,
 *   ObservabilityConfigSection, ObservabilityConfigSectionPatch,
 *   ObservabilityServerConfigPort.
 *
 * Relocated: `summarizeToolArgs` → `@hyperidle/shared` (beside `scrubInlineTokens`).
 *
 * @lore AU19 Increment 2d: original move from `packages/server/src/services/observability/`.
 * @lore AU20 Ab3: surface collapsed from parts-kit to lifecycle handle.
 */

export type { ObservabilityConfig, ObservabilityConfigPatch } from "./config.js";
export { readObservabilityConfig, updateObservabilityConfig } from "./config.js";

// -- types --
export type {
	ObservabilityDeps,
	ObservabilityRuntime,
	ObservabilityStatus,
} from "./runtime.js";
// -- factory + config control surface --
export { startObservability } from "./runtime.js";
export type { FlushOutcome } from "./types.js";
