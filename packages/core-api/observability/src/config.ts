import type { HyperIdleDb } from "@hyperidle/db";
import type { ObservabilityConfigDeps } from "./ports.js";
import type { ObservabilityChannel } from "./types.js";

export interface ObservabilityConfig {
	readonly enabled: boolean;
	readonly adapter: ObservabilityChannel;
	readonly batchSize: number;
	readonly flushIntervalMs: number;
	readonly bufferCap: number;
}

/**
 * @lore P1: SafeObservabilityConfig is retained as a distinct type name for
 * API-response semantics even though it is currently identical to
 * ObservabilityConfig. When an OpenTelemetry adapter lands it may re-introduce
 * fields that need redaction (e.g. bearer tokens), at which point this type
 * will diverge again. Inlining it now would cost a migration then.
 */
export type SafeObservabilityConfig = ObservabilityConfig;

/**
 * Always returns a config (even when disabled) so GET /config can
 * surface values. Callers that want a null short-circuit when
 * observability is disabled inline the `cfg.enabled` check.
 *
 * @lore AU18: re-backed onto `server_config.observability` (was
 * `factorySettings.observability.*` KV keys). `enabled` keeps its
 * default-on-unless-explicitly-false semantics (AF16 T14) — the Zod schema
 * default is `true`, so an absent row already resolves to enabled.
 *
 * @lore AU19 Increment 2d: `readServerConfig`/`updateServerConfig`
 * (`@hyperidle/settings`) used to be imported directly —
 * `composition-boundary-guard` bans that once this file lives in
 * `packages/core-api/observability/`. Converted to the injected
 * `ObservabilityConfigDeps` (Mechanism C) — `deps.serverConfig` — wired by
 * the caller (`packages/server`, unguarded) to the real functions, zero
 * behavior change.
 */
export async function readObservabilityConfig(
	db: HyperIdleDb,
	deps: ObservabilityConfigDeps,
): Promise<ObservabilityConfig> {
	const { observability } = await deps.serverConfig.read(db);
	return observability;
}

/**
 * @lore P1: redactObservabilityConfig is kept as a named function (rather than
 * inlined as `{ ...cfg }`) because the API route calls it and a future OTEL
 * adapter may re-introduce fields that need per-field redaction (e.g. bearer
 * tokens). Cost of keeping: one trivial passthrough. Cost of removing: a
 * migration when OTEL lands.
 */
export function redactObservabilityConfig(cfg: ObservabilityConfig): SafeObservabilityConfig {
	return { ...cfg };
}

export interface ObservabilityConfigPatch {
	enabled?: boolean;
	adapter?: ObservabilityChannel;
	batchSize?: number;
	flushIntervalMs?: number;
	bufferCap?: number;
}

export async function updateObservabilityConfig(
	db: HyperIdleDb,
	patch: ObservabilityConfigPatch,
	deps: ObservabilityConfigDeps,
): Promise<ObservabilityConfig> {
	await deps.serverConfig.update(db, { observability: patch });
	return readObservabilityConfig(db, deps);
}
