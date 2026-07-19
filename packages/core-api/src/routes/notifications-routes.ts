import type { HyperIdleDb } from "@hyperidle/db";
import {
	flush,
	listNotifications,
	markNotifications,
	type NotificationAdapter,
	type NotificationChannel,
	type NotificationConfigPatch,
	type NotificationsDeps,
	readConfig,
	readPreferences,
	runDigest,
	sendTest,
	updateConfig,
	updatePreferences,
} from "@hyperidle/notifications";
import type { ApiErrorResponse, Logger, NotificationTypeKey } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger, NOTIFICATION_TYPES } from "@hyperidle/shared";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { validateBody } from "../middleware/validate.js";

const channelEnum = z.enum(["console", "ntfy", "smtp"]);
const queueStatusEnum = z.enum(["pending", "sent", "failed", "dropped", "sending"]);

const patchConfigSchema = z
	.object({
		enabled: z.boolean().optional(),
		primaryChannel: channelEnum.optional(),
		digestChannel: channelEnum.optional(),
		recipientEmail: z.union([z.string().max(254), z.null()]).optional(),
		recipientNtfyTopic: z.union([z.string().max(64), z.null()]).optional(),
		ntfyBaseUrl: z.string().min(1).max(2048).optional(),
		ntfyAuthToken: z.union([z.string().max(2048), z.null()]).optional(),
		smtpHost: z.union([z.string().max(253), z.null()]).optional(),
		smtpPort: z.number().int().min(1).max(65535).optional(),
		smtpSecure: z.boolean().optional(),
		smtpUsername: z.union([z.string().max(256), z.null()]).optional(),
		smtpPassword: z.union([z.string().max(1024), z.null()]).optional(),
		smtpFrom: z.union([z.string().max(254), z.null()]).optional(),
		floodMaxPerMinute: z.number().int().min(0).max(1000).optional(),
		floodCoalesceWindowMs: z.number().int().min(0).max(3_600_000).optional(),
		testMaxPerHour: z.number().int().min(0).max(1000).optional(),
		smtpIgnoreTls: z.boolean().optional(),
		digestCron: z.string().min(1).max(128).optional(),
	})
	.strict();

const testBodySchema = z
	.object({
		channel: channelEnum.optional(),
	})
	.strict();

const flushBodySchema = z.object({}).strict();
const digestBodySchema = z.object({}).strict();

/**
 * Sanitize a config patch for the audit log — booleans / enums kept,
 * secret strings replaced with `"***"`. We never persist the full patch
 * body.
 */
function auditDiff(body: NotificationConfigPatch): Record<string, unknown> {
	const SECRET_FIELDS: ReadonlyArray<keyof NotificationConfigPatch> = [
		"smtpPassword",
		"ntfyAuthToken",
		"smtpUsername",
	];
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body) as Array<
		[keyof NotificationConfigPatch, unknown]
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

export interface CreateNotificationRoutesOptions {
	/**
	 * Collapsed deps bag (replaces the old notificationsConfig +
	 * silencePolicy + work triple).
	 *
	 * @lore AU20 Ag6b: single deps bag; internal functions extract the
	 * sub-deps they need.
	 */
	deps: NotificationsDeps;
	/**
	 * Optional adapter override for `/test`, `/flush`, and `/digest`.
	 * Production omits this; tests inject a FakeAdapter that records every send.
	 *
	 * @lore AU20 Ag6b: simplified from `(cfg: NotificationConfig) =>
	 * NotificationAdapter` to a plain `NotificationAdapter` instance — the
	 * route layer no longer needs to pass the internal config shape.
	 */
	adapterOverride?: NotificationAdapter;
	now?: () => Date;
	/**
	 * Logger used for the admin-audit log. Injectable so tests can
	 * assert the `config_changed` event shape without grepping stdout.
	 */
	logger?: Logger;
}

/**
 * @lore Per-process token bucket for `POST /test`. Refill = `maxPerHour`
 * tokens per 3600s sliding window. Defaults to 5/hour (security review
 * H2 #7). Bucket is in-memory — single-node assumption matches the rest
 * of the notification system. Distributed enforcement is tracked as a
 * follow-up.
 */
interface TestBucket {
	tokens: number;
	lastRefill: number;
	capacity: number;
}

function createTestBucket(capacity: number, now: number): TestBucket {
	return { tokens: capacity, lastRefill: now, capacity };
}

function takeTestToken(bucket: TestBucket, capacity: number, now: number): boolean {
	// Lazy refill on every attempt.
	if (bucket.capacity !== capacity) {
		bucket.capacity = capacity;
		bucket.tokens = Math.min(bucket.tokens, capacity);
	}
	const windowMs = 3_600_000;
	const elapsed = now - bucket.lastRefill;
	if (elapsed > 0 && capacity > 0) {
		const refill = (elapsed / windowMs) * capacity;
		bucket.tokens = Math.min(capacity, bucket.tokens + refill);
		bucket.lastRefill = now;
	}
	if (bucket.tokens < 1) return false;
	bucket.tokens -= 1;
	return true;
}

/** Compute the delay until at least one token is available (seconds). */
function retryAfterSeconds(bucket: TestBucket, capacity: number): number {
	if (capacity <= 0) return 3600;
	const deficit = 1 - bucket.tokens;
	if (deficit <= 0) return 0;
	const windowMs = 3_600_000;
	return Math.max(1, Math.ceil((deficit * windowMs) / capacity / 1000));
}

export function createNotificationRoutes(
	db: HyperIdleDb,
	opts: CreateNotificationRoutesOptions,
): Hono {
	const router = new Hono();
	const nowFn = opts.now ?? ((): Date => new Date());
	const auditLogger: Logger = opts.logger ?? createLogger({ pkg: "notifications.audit" });
	const testBucket = createTestBucket(5, nowFn().getTime());

	// GET / — Bounded resource descriptor.
	router.get("/", requireBoundary({ kind: "principal-self" }), (c) =>
		c.json({
			ok: true,
			resource: "notifications",
			endpoints: [
				"GET /config",
				"PATCH /config",
				"GET /queue",
				"POST /test",
				"POST /flush",
				"GET /digest",
			],
		}),
	);

	router.get("/config", requireBoundary({ kind: "public-data" }), async (c) => {
		const cfg = await readConfig(db, opts.deps);
		return c.json(cfg);
	});

	router.patch(
		"/config",
		requireBoundary({ kind: "public-data" }),
		validateBody(patchConfigSchema),
		async (c) => {
			const body = c.req.valid("json");
			const diff = auditDiff(body);
			let updated;
			try {
				updated = await updateConfig(db, body, opts.deps);
			} catch (err) {
				if (
					err instanceof Error &&
					(err as { code?: string }).code === "NOTIFICATIONS_VALIDATION_ERROR"
				) {
					const response: ApiErrorResponse = {
						error: err.message,
						code: API_ERROR_CODES.VALIDATION_ERROR,
					};
					return c.json(response, 400);
				}
				throw err;
			}
			// @lore Emit an admin-action audit record on every PATCH so any
			// rewrite of `recipientEmail`, `ntfyBaseUrl`, or SMTP creds is
			// attributable. Secret fields are replaced with "***" before
			// logging; we never log plaintext passwords or tokens.
			auditLogger.info("config_changed", {
				resource: "notifications.config",
				actor: "api-key",
				diff,
				timestamp: nowFn().toISOString(),
			});
			return c.json(updated);
		},
	);

	router.post(
		"/test",
		requireBoundary({ kind: "public-data" }),
		validateBody(testBodySchema),
		async (c) => {
			const body = c.req.valid("json");
			// Rate-limit check uses the public readConfig (redacted is enough for testMaxPerHour).
			const cfg = await readConfig(db, opts.deps);
			const capacity = Math.max(0, cfg.testMaxPerHour);
			const took = takeTestToken(testBucket, capacity, nowFn().getTime());
			if (!took) {
				const wait = retryAfterSeconds(testBucket, capacity);
				c.header("Retry-After", String(wait));
				const response: ApiErrorResponse = {
					error: `rate limit exceeded: max ${capacity} test sends per hour`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 429);
			}
			const channel = body.channel as NotificationChannel | undefined;
			const result = await sendTest(db, channel, opts.deps, opts.adapterOverride);
			if (!result.ok && result.error?.startsWith("recipient not configured")) {
				const response: ApiErrorResponse = {
					error: result.error,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			return c.json(result);
		},
	);

	router.get("/queue", requireBoundary({ kind: "public-data" }), async (c) => {
		const statusParam = c.req.query("status") ?? "pending";
		const limitParam = c.req.query("limit");
		const limitNum = limitParam ? Number.parseInt(limitParam, 10) : 50;
		const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 500) : 50;
		// @lore zod-enum validation on `status` query parameter — rejects
		// typos instead of silently returning an empty list.
		const parsed = queueStatusEnum.safeParse(statusParam);
		if (!parsed.success) {
			const response: ApiErrorResponse = {
				error: `invalid status '${statusParam}'; expected pending|sent|failed|dropped|sending`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		const rows = await listNotifications(db, { kind: "by-status", status: parsed.data, limit });
		return c.json({
			status: parsed.data,
			count: rows.length,
			rows: rows.map((r) => ({
				id: r.id,
				eventType: r.eventType,
				subjectId: r.subjectId,
				severity: r.severity,
				title: r.title,
				reason: r.reason,
				channel: r.channel,
				status: r.status,
				attempts: r.attempts,
				createdAt: r.createdAt,
				sentAt: r.sentAt,
			})),
		});
	});

	router.post(
		"/flush",
		requireBoundary({ kind: "public-data" }),
		validateBody(flushBodySchema),
		async (c) => {
			const result = await flush(db, opts.deps, {
				adapterOverride: opts.adapterOverride,
				now: nowFn(),
			});
			if (result.disabled) {
				return c.json({ flushed: 0, failed: 0, reason: "disabled" });
			}
			return c.json(result);
		},
	);

	router.post(
		"/digest",
		requireBoundary({ kind: "public-data" }),
		validateBody(digestBodySchema),
		async (c) => {
			const result = await runDigest(db, opts.deps, {
				adapterOverride: opts.adapterOverride,
				now: nowFn(),
			});
			return c.json(result);
		},
	);

	// ──────────────────────────────────────────────────────────────────────────
	// AF8: In-app notification popover API
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * GET /inbox — list unread (readAt IS NULL) notifications, urgency+recency order, cap 50.
	 */
	router.get("/inbox", requireBoundary({ kind: "principal-self" }), async (c) => {
		const rows = await listNotifications(db, { kind: "unread", limit: 50 });

		const sorted = [...rows].sort((a, b) => {
			if (a.urgency === "immediate" && b.urgency !== "immediate") return -1;
			if (a.urgency !== "immediate" && b.urgency === "immediate") return 1;
			return a.createdAt < b.createdAt ? 1 : -1;
		});

		const unseenCount = sorted.filter((r) => r.seenAt === null).length;

		return c.json({
			unseenCount,
			rows: sorted.map((r) => ({
				id: r.id,
				typeKey: r.typeKey,
				urgency: r.urgency,
				title: r.title,
				sourceLink: r.sourceLink,
				createdAt: r.createdAt,
				seenAt: r.seenAt,
				readAt: r.readAt,
			})),
		});
	});

	/**
	 * POST /seen — mark all currently-unseen rows as seen.
	 *
	 * @lore AF8 W3: single bulk UPDATE instead of per-row loop.
	 */
	router.post("/seen", requireBoundary({ kind: "principal-self" }), async (c) => {
		await markNotifications(db, { kind: "all" }, { seen: true }, nowFn());
		return c.json({ ok: true });
	});

	/**
	 * POST /:id/read — mark a specific notification as read.
	 *
	 * @lore AF8 W4: z.string().uuid() for strict UUID validation.
	 */
	router.post("/:id/read", requireBoundary({ kind: "principal-self" }), async (c) => {
		const id = c.req.param("id");
		const parsed = z.string().uuid().safeParse(id);
		if (!parsed.success) {
			const response: ApiErrorResponse = {
				error: "invalid notification id",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		await markNotifications(db, { kind: "ids", ids: [parsed.data] }, { read: true }, nowFn());
		return c.json({ ok: true });
	});

	/**
	 * GET /mute — return the list of muted notification type keys.
	 */
	router.get("/mute", requireBoundary({ kind: "public-data" }), async (c) => {
		const muted = await readPreferences(db, opts.deps);
		return c.json({ muted });
	});

	/**
	 * PUT /mute/:key — set mute state for a notification type.
	 *
	 * @lore AF8: No rate limiter — idempotent set-to-value, founder-tier auth.
	 */
	router.put(
		"/mute/:key",
		requireBoundary({ kind: "public-data" }),
		validateBody(z.object({ muted: z.boolean() }).strict()),
		async (c) => {
			const key = c.req.param("key");
			const validKeys = NOTIFICATION_TYPES.map((t) => t.key);
			if (!validKeys.includes(key as NotificationTypeKey)) {
				const response: ApiErrorResponse = {
					error: `unknown notification type key '${key}'; must be one of: ${validKeys.join(", ")}`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			const body = c.req.valid("json");
			await updatePreferences(db, key as NotificationTypeKey, body.muted, opts.deps);
			return c.json({ ok: true });
		},
	);

	return router;
}
