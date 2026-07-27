import type { HyperIdleDb } from "@hyperidle/db";
import type { ObservabilityChannel } from "./types.js";

export interface ObservabilityConfig {
	readonly enabled: boolean;
	readonly adapter: ObservabilityChannel;
	readonly batchSize: number;
	readonly flushIntervalMs: number;
	readonly bufferCap: number;
}

export interface ObservabilityConfigPatch {
	enabled?: boolean;
	adapter?: ObservabilityChannel;
	batchSize?: number;
	flushIntervalMs?: number;
	bufferCap?: number;
}

/**
 * Local DI port type for the server-config read/write surface.
 * Not exported — bundled into `ObservabilityDeps` in `runtime.ts`.
 *
 * @lore AU20 Ab3: `ObservabilityConfigDeps` / `ObservabilityServerConfigPort`
 * from `ports.ts` folded here as a local, non-exported type. The structural
 * mirror (`ObservabilityConfigSection` / `ObservabilityConfigSectionPatch`)
 * that duplicated `ObservabilityConfig`/`Patch` field-for-field is deleted.
 *
 * @lore AU19 Increment 2d: `readServerConfig`/`updateServerConfig`
 * (`@hyperidle/settings`) used to be imported directly —
 * `composition-boundary-guard` bans that once this file lives in
 * `packages/core-api/observability/`. Converted to the injected
 * port — `deps.serverConfig` — wired by the caller (`packages/server`,
 * unguarded) to the real functions, zero behavior change.
 *
 * @lore AU18: re-backed onto `server_config.observability` (was
 * `factorySettings.observability.*` KV keys). `enabled` keeps its
 * default-on-unless-explicitly-false semantics (AF16 T14) — the Zod schema
 * default is `true`, so an absent row already resolves to enabled.
 */
interface ConfigPort {
	readonly serverConfig: {
		read(db: HyperIdleDb): Promise<{ observability: ObservabilityConfig }>;
		update(db: HyperIdleDb, patch: { observability?: ObservabilityConfigPatch }): Promise<unknown>;
	};
}

/**
 * Always returns a config (even when disabled) so GET /config can
 * surface values. Callers that want a null short-circuit when
 * observability is disabled inline the `cfg.enabled` check.
 */
export async function readObservabilityConfig(
	db: HyperIdleDb,
	deps: ConfigPort,
): Promise<ObservabilityConfig> {
	const { observability } = await deps.serverConfig.read(db);
	return observability;
}

export async function updateObservabilityConfig(
	db: HyperIdleDb,
	patch: ObservabilityConfigPatch,
	deps: ConfigPort,
): Promise<ObservabilityConfig> {
	await deps.serverConfig.update(db, { observability: patch });
	return readObservabilityConfig(db, deps);
}
