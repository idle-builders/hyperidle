import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { ObservabilityChannel } from "./types.js";

const PREFIX = "observability.";

export const KEYS = {
	enabled: `${PREFIX}enabled`,
	adapter: `${PREFIX}adapter`,
	batchSize: `${PREFIX}batch_size`,
	flushIntervalMs: `${PREFIX}flush_interval_ms`,
	bufferCap: `${PREFIX}buffer_cap`,
} as const;

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

const DEFAULTS = {
	adapter: "console" as ObservabilityChannel,
	batchSize: 100,
	flushIntervalMs: 2000,
	bufferCap: 10_000,
} as const;

const ADAPTERS: ReadonlySet<ObservabilityChannel> = new Set(["console", "noop"]);

function isAdapter(value: string | undefined): value is ObservabilityChannel {
	return value !== undefined && ADAPTERS.has(value as ObservabilityChannel);
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	const floored = Math.floor(n);
	if (floored < min) return min;
	if (floored > max) return max;
	return floored;
}

function readAllSettings(db: HyperIdleDb): Map<string, string> {
	const rows = db.select().from(factorySettings).all();
	const map = new Map<string, string>();
	for (const row of rows) {
		if (row.key.startsWith(PREFIX)) map.set(row.key, row.value);
	}
	return map;
}

function buildConfig(kv: Map<string, string>): ObservabilityConfig {
	const enabled = kv.get(KEYS.enabled) === "true";
	const adapterRaw = kv.get(KEYS.adapter);
	// @lore P1 (W-3): Existing databases that have observability.adapter set to
	// a previously-supported value (e.g. the purged adapter) in factory_settings
	// will return false from isAdapter() after the purge. This is correct and
	// safe: buildConfig falls back to DEFAULTS.adapter ("console"). No migration
	// of old rows is needed — they become orphaned and are never read.
	const adapter = isAdapter(adapterRaw) ? adapterRaw : DEFAULTS.adapter;
	const batchSize = clampInt(kv.get(KEYS.batchSize), DEFAULTS.batchSize, 1, 1000);
	const flushIntervalMs = clampInt(
		kv.get(KEYS.flushIntervalMs),
		DEFAULTS.flushIntervalMs,
		100,
		60_000,
	);
	const bufferCap = clampInt(kv.get(KEYS.bufferCap), DEFAULTS.bufferCap, 100, 100_000);
	return {
		enabled,
		adapter,
		batchSize,
		flushIntervalMs,
		bufferCap,
	};
}

/**
 * Always returns a config (even when disabled) so GET /config can
 * surface values. Callers that want a null short-circuit when
 * observability is disabled inline the `cfg.enabled` check.
 */
export function readObservabilityConfig(db: HyperIdleDb): ObservabilityConfig {
	return buildConfig(readAllSettings(db));
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

function upsert(db: HyperIdleDb, key: string, value: string, now: string): void {
	db.insert(factorySettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({
			target: factorySettings.key,
			set: { value, updatedAt: now },
		})
		.run();
}

export function updateObservabilityConfig(
	db: HyperIdleDb,
	patch: ObservabilityConfigPatch,
): ObservabilityConfig {
	const now = new Date().toISOString();
	if (patch.enabled !== undefined) upsert(db, KEYS.enabled, patch.enabled ? "true" : "false", now);
	if (patch.adapter !== undefined) upsert(db, KEYS.adapter, patch.adapter, now);
	if (patch.batchSize !== undefined) upsert(db, KEYS.batchSize, String(patch.batchSize), now);
	if (patch.flushIntervalMs !== undefined)
		upsert(db, KEYS.flushIntervalMs, String(patch.flushIntervalMs), now);
	if (patch.bufferCap !== undefined) upsert(db, KEYS.bufferCap, String(patch.bufferCap), now);
	return readObservabilityConfig(db);
}
