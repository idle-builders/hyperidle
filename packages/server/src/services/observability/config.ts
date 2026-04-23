import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { SanitizeResult } from "@hyperidle/shared";
import { sanitizeHttpUrl as sharedSanitizeHttpUrl } from "@hyperidle/shared/net";
import { eq } from "drizzle-orm";
import type { ObservabilityChannel } from "./types.js";

const PREFIX = "observability.";

export const KEYS = {
	enabled: `${PREFIX}enabled`,
	adapter: `${PREFIX}adapter`,
	langfuseUrl: `${PREFIX}langfuse_url`,
	langfusePublicKey: `${PREFIX}langfuse_public_key`,
	langfuseSecretKey: `${PREFIX}langfuse_secret_key`,
	batchSize: `${PREFIX}batch_size`,
	flushIntervalMs: `${PREFIX}flush_interval_ms`,
	bufferCap: `${PREFIX}buffer_cap`,
} as const;

export const REDACTED = "***" as const;

export interface ObservabilityConfig {
	readonly enabled: boolean;
	readonly adapter: ObservabilityChannel;
	readonly langfuse: {
		readonly url: string;
		readonly publicKey: string | null;
		readonly secretKey: string | null;
	};
	readonly batchSize: number;
	readonly flushIntervalMs: number;
	readonly bufferCap: number;
}

export type SafeObservabilityConfig = Omit<ObservabilityConfig, "langfuse"> & {
	readonly langfuse: Omit<ObservabilityConfig["langfuse"], "publicKey" | "secretKey"> & {
		readonly publicKey: typeof REDACTED | null;
		readonly secretKey: typeof REDACTED | null;
	};
};

const DEFAULTS = {
	adapter: "console" as ObservabilityChannel,
	langfuseUrl: "https://cloud.langfuse.com",
	batchSize: 100,
	flushIntervalMs: 2000,
	bufferCap: 10_000,
} as const;

const ADAPTERS: ReadonlySet<ObservabilityChannel> = new Set(["console", "langfuse", "noop"]);

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
	const adapter = isAdapter(adapterRaw) ? adapterRaw : DEFAULTS.adapter;
	const langfuseUrl = kv.get(KEYS.langfuseUrl) ?? DEFAULTS.langfuseUrl;
	const publicKey = kv.get(KEYS.langfusePublicKey);
	const secretKey = kv.get(KEYS.langfuseSecretKey);
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
		langfuse: {
			url: langfuseUrl,
			publicKey: publicKey && publicKey.length > 0 ? publicKey : null,
			secretKey: secretKey && secretKey.length > 0 ? secretKey : null,
		},
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

export function redactObservabilityConfig(cfg: ObservabilityConfig): SafeObservabilityConfig {
	return {
		enabled: cfg.enabled,
		adapter: cfg.adapter,
		langfuse: {
			url: cfg.langfuse.url,
			publicKey: cfg.langfuse.publicKey !== null ? REDACTED : null,
			secretKey: cfg.langfuse.secretKey !== null ? REDACTED : null,
		},
		batchSize: cfg.batchSize,
		flushIntervalMs: cfg.flushIntervalMs,
		bufferCap: cfg.bufferCap,
	};
}

export interface ObservabilityConfigPatch {
	enabled?: boolean;
	adapter?: ObservabilityChannel;
	langfuseUrl?: string;
	langfusePublicKey?: string | null;
	langfuseSecretKey?: string | null;
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

function clearOrSet(
	db: HyperIdleDb,
	key: string,
	value: string | null | undefined,
	now: string,
): void {
	if (value === undefined) return;
	if (value === null || value.length === 0) {
		db.delete(factorySettings).where(eq(factorySettings.key, key)).run();
		return;
	}
	upsert(db, key, value, now);
}

export function updateObservabilityConfig(
	db: HyperIdleDb,
	patch: ObservabilityConfigPatch,
): ObservabilityConfig {
	const now = new Date().toISOString();
	if (patch.enabled !== undefined) upsert(db, KEYS.enabled, patch.enabled ? "true" : "false", now);
	if (patch.adapter !== undefined) upsert(db, KEYS.adapter, patch.adapter, now);
	if (patch.langfuseUrl !== undefined) upsert(db, KEYS.langfuseUrl, patch.langfuseUrl, now);
	if (patch.batchSize !== undefined) upsert(db, KEYS.batchSize, String(patch.batchSize), now);
	if (patch.flushIntervalMs !== undefined)
		upsert(db, KEYS.flushIntervalMs, String(patch.flushIntervalMs), now);
	if (patch.bufferCap !== undefined) upsert(db, KEYS.bufferCap, String(patch.bufferCap), now);
	clearOrSet(db, KEYS.langfusePublicKey, patch.langfusePublicKey, now);
	clearOrSet(db, KEYS.langfuseSecretKey, patch.langfuseSecretKey, now);
	return readObservabilityConfig(db);
}

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/** Thin wrapper around the shared SSRF sanitizer with an observability-specific label. */
export function sanitizeLangfuseUrl(input: string): SanitizeResult {
	return sharedSanitizeHttpUrl(input, { label: "langfuse url" });
}

/**
 * Langfuse key sanitizer. Keys are documented as `pk-lf-...` /
 * `sk-lf-...` tokens but the prefix is not enforced (the operator may
 * paste a key from a self-hosted instance). We only guard against
 * control characters + unreasonable length to block injection attacks.
 *
 * @lore Security review (H3 §3.6): Refusing CR/LF/NUL prevents HTTP
 * header injection if the key is ever concatenated into a Basic auth
 * blob without base64 at some future call site. The base64 step in
 * `langfuse-adapter.ts` already handles this, but defense in depth is
 * cheap.
 */
export function sanitizeLangfuseKey(input: string): SanitizeResult {
	if (input.length === 0) {
		return { ok: false, reason: "langfuse key must not be empty" };
	}
	if (input.length > 512) {
		return { ok: false, reason: "langfuse key must be <= 512 chars" };
	}
	if (/[\0\r\n]/.test(input)) {
		return { ok: false, reason: "langfuse key must not contain control characters" };
	}
	return { ok: true };
}
