import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES, createLogger } from "@hyperidle/shared";
import type { ApiErrorResponse, Logger } from "@hyperidle/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import {
	type ObservabilityConfig,
	type ObservabilityConfigPatch,
	readObservabilityConfig,
	redactObservabilityConfig,
	sanitizeLangfuseKey,
	sanitizeLangfuseUrl,
	updateObservabilityConfig,
} from "../services/observability/config.js";
import type { ObservabilityDispatcher } from "../services/observability/types.js";

/**
 * Per-request body cap for POST routes. Observability POSTs carry
 * minimal payloads (`{}` for /flush). Bounding at 8 KiB stops a
 * pathological caller from pushing MBs into the server for a no-op
 * route (security review L-3).
 */
const MAX_BODY_BYTES = 8 * 1024;

const requestSizeCap: MiddlewareHandler = async (c, next) => {
	const header = c.req.header("content-length");
	if (header !== undefined) {
		const n = Number.parseInt(header, 10);
		if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
			const response: ApiErrorResponse = {
				error: `request body exceeds ${MAX_BODY_BYTES} bytes`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 413);
		}
	}
	await next();
};

const adapterEnum = z.enum(["console", "langfuse", "noop"]);

const patchConfigSchema = z
	.object({
		enabled: z.boolean().optional(),
		adapter: adapterEnum.optional(),
		langfuseUrl: z.string().min(1).max(2048).optional(),
		langfusePublicKey: z.union([z.string().max(512), z.null()]).optional(),
		langfuseSecretKey: z.union([z.string().max(512), z.null()]).optional(),
		batchSize: z.number().int().min(1).max(1000).optional(),
		flushIntervalMs: z.number().int().min(100).max(60_000).optional(),
		bufferCap: z.number().int().min(100).max(100_000).optional(),
	})
	.strict();

function validatePatchBody(body: z.infer<typeof patchConfigSchema>): string | null {
	if (body.langfuseUrl !== undefined) {
		const r = sanitizeLangfuseUrl(body.langfuseUrl);
		if (!r.ok) return r.reason;
	}
	if (typeof body.langfusePublicKey === "string") {
		const r = sanitizeLangfuseKey(body.langfusePublicKey);
		if (!r.ok) return r.reason;
	}
	if (typeof body.langfuseSecretKey === "string") {
		const r = sanitizeLangfuseKey(body.langfuseSecretKey);
		if (!r.ok) return r.reason;
	}
	return null;
}

/** Sanitize a patch for the admin audit log — booleans kept, secrets masked. */
function auditDiff(body: ObservabilityConfigPatch): Record<string, unknown> {
	const SECRET_FIELDS: ReadonlyArray<keyof ObservabilityConfigPatch> = [
		"langfusePublicKey",
		"langfuseSecretKey",
	];
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body) as Array<
		[keyof ObservabilityConfigPatch, unknown]
	>) {
		if (value === undefined) continue;
		if (SECRET_FIELDS.includes(key)) {
			out[key] = value === null ? null : "***";
			continue;
		}
		out[key] = value;
	}
	return out;
}

export interface CreateObservabilityRoutesOptions {
	/** Access to the active dispatcher so /status + /flush can introspect it. */
	readonly getDispatcher: () => ObservabilityDispatcher | null;
	readonly now?: () => Date;
	readonly logger?: Logger;
	/**
	 * Called after a successful PATCH /config with the freshly-read
	 * config. Allows callers to rebuild the dispatcher + adapter so key
	 * rotations and adapter switches take effect without a process
	 * restart (security review M-3, adversary H3 WARN).
	 */
	readonly onConfigChange?: (cfg: ObservabilityConfig) => void;
}

export function createObservabilityRoutes(
	db: HyperIdleDb,
	opts: CreateObservabilityRoutesOptions,
): Hono {
	const router = new Hono();
	const nowFn = opts.now ?? ((): Date => new Date());
	const auditLogger: Logger = opts.logger ?? createLogger({ pkg: "observability.audit" });

	// /status read-cache. Invalidated on PATCH /config. Avoids re-reading
	// every `factory_settings` row on each poll when no dispatcher is
	// attached (architect W5).
	let statusCfgCache: { cfg: ObservabilityConfig } | null = null;
	function invalidateStatusCache(): void {
		statusCfgCache = null;
	}
	function getCachedConfig(): ObservabilityConfig {
		if (statusCfgCache) return statusCfgCache.cfg;
		const cfg = readObservabilityConfig(db);
		statusCfgCache = { cfg };
		return cfg;
	}

	// GET / — Bounded resource descriptor. Proves the route is mounted
	// (I1 S2) without a DB read on every hit.
	// @lore I1 simplification-#2: previous handler read + redacted the
	// observability config on every request. Callers that want config
	// hit `/config`.
	router.get("/", (c) =>
		c.json({
			ok: true,
			resource: "observability",
			endpoints: ["GET /config", "PATCH /config", "GET /status", "POST /flush"],
		}),
	);

	router.get("/config", (c) => {
		const cfg = readObservabilityConfig(db);
		return c.json(redactObservabilityConfig(cfg));
	});

	router.patch("/config", requestSizeCap, validateBody(patchConfigSchema), (c) => {
		const body = c.req.valid("json");
		const reason = validatePatchBody(body);
		if (reason !== null) {
			const response: ApiErrorResponse = {
				error: reason,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		const diff = auditDiff(body);
		const updated = updateObservabilityConfig(db, body);
		auditLogger.info("config_changed", {
			resource: "observability.config",
			actor: "api-key",
			diff,
			timestamp: nowFn().toISOString(),
		});
		invalidateStatusCache();
		if (opts.onConfigChange) {
			try {
				opts.onConfigChange(updated);
			} catch (err) {
				auditLogger.error("observability config rebuild failed", {
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
		return c.json(redactObservabilityConfig(updated));
	});

	router.get("/status", (c) => {
		const dispatcher = opts.getDispatcher();
		if (dispatcher) {
			const snapshot = dispatcher.status();
			return c.json({ enabled: true, ...snapshot });
		}
		// No active dispatcher: either observability is disabled, or the
		// adapter is `noop` (which skips dispatcher wiring). Reflect the
		// persisted config so the UI shows the true enabled/adapter state
		// instead of always reporting "disabled".
		const cfg = getCachedConfig();
		return c.json({
			enabled: cfg.enabled,
			adapter: cfg.adapter,
			bufferDepth: 0,
			lastFlushAt: null,
			lastErrorAt: null,
			lastError: null,
			dropped: 0,
			delivered: 0,
		});
	});

	router.post("/flush", requestSizeCap, async (c) => {
		const dispatcher = opts.getDispatcher();
		if (!dispatcher) {
			return c.json({ flushed: 0, reason: "disabled" });
		}
		const before = dispatcher.status();
		const outcome = await dispatcher.flush();
		const after = dispatcher.status();
		// `delivered` is kept for backward compatibility with the original
		// H3 response shape; `flushed / dropped / errors` come from the
		// FlushOutcome return so callers can distinguish full vs partial
		// success.
		return c.json({
			delivered: outcome.flushed,
			flushed: outcome.flushed,
			dropped: outcome.dropped,
			errors: outcome.errors,
			bufferDepthBefore: before.bufferDepth,
			bufferDepthAfter: after.bufferDepth,
		});
	});

	return router;
}
