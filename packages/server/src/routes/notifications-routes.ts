import type { HyperIdleDb } from "@hyperidle/db";
import { notificationQueue } from "@hyperidle/db";
import type { ApiErrorResponse, Logger, NotificationTypeKey } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger, NOTIFICATION_TYPES } from "@hyperidle/shared";
import { desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import {
	loadNotificationConfig,
	type NotificationConfigPatch,
	pickRecipient,
	readNotificationConfig,
	redactNotificationConfig,
	sanitizeCron,
	sanitizeEmail,
	sanitizeNtfyUrl,
	sanitizeSmtpCredential,
	sanitizeSmtpHost,
	sanitizeTopic,
	updateNotificationConfig,
} from "../app-runtime/services/notifications/config.js";
import {
	type AdapterFactory,
	dispatchDigest,
	flushQueue,
} from "../app-runtime/services/notifications/dispatcher.js";
import {
	defaultMutePreferenceWriter,
	getMutedTypeKeys,
} from "../app-runtime/services/notifications/mute.js";
import type {
	Notification,
	NotificationChannel,
	SendResult,
} from "../app-runtime/services/notifications/types.js";
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

type SanitizeFn = (input: string) => { ok: true } | { ok: false; reason: string };

const PATCH_SANITIZERS: ReadonlyArray<{
	field: keyof z.infer<typeof patchConfigSchema>;
	sanitize: SanitizeFn;
}> = [
	{ field: "recipientEmail", sanitize: sanitizeEmail },
	{ field: "recipientNtfyTopic", sanitize: sanitizeTopic },
	{ field: "ntfyBaseUrl", sanitize: sanitizeNtfyUrl },
	{ field: "smtpHost", sanitize: sanitizeSmtpHost },
	{ field: "smtpFrom", sanitize: sanitizeEmail },
	{ field: "smtpUsername", sanitize: sanitizeSmtpCredential },
	{ field: "smtpPassword", sanitize: sanitizeSmtpCredential },
	{ field: "digestCron", sanitize: sanitizeCron },
];

function validatePatchBody(body: z.infer<typeof patchConfigSchema>): string | null {
	for (const { field, sanitize } of PATCH_SANITIZERS) {
		const value = body[field];
		if (value === undefined || value === null) continue;
		if (typeof value !== "string") continue;
		const r = sanitize(value);
		if (!r.ok) return r.reason;
	}
	if (body.smtpIgnoreTls === true && process.env.NODE_ENV === "production") {
		return "smtpIgnoreTls is not permitted in production";
	}
	return null;
}

export interface CreateNotificationRoutesOptions {
	/**
	 * Adapter factory used by `/test`, `/flush`, and `/digest`. Production
	 * wiring passes the same factory the dispatcher uses; tests pass a
	 * FakeAdapter that records every send.
	 */
	adapterFactory: AdapterFactory;
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

export function createNotificationRoutes(
	db: HyperIdleDb,
	opts: CreateNotificationRoutesOptions,
): Hono {
	const router = new Hono();
	const factory: AdapterFactory = opts.adapterFactory;
	const nowFn = opts.now ?? ((): Date => new Date());
	const auditLogger: Logger = opts.logger ?? createLogger({ pkg: "notifications.audit" });
	const testBucket = createTestBucket(5, nowFn().getTime());

	// GET / — Bounded resource descriptor. Proves the route is mounted
	// (I1 S2) without reading or redacting the config on every hit.
	// @lore I1 simplification-#2: previous handler read the full
	// NotificationConfig + redacted it on every request. The descriptor
	// shape is DB-free; callers that want config hit `/config`.
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
		const cfg = await readNotificationConfig(db);
		return c.json(redactNotificationConfig(cfg));
	});

	router.patch(
		"/config",
		requireBoundary({ kind: "public-data" }),
		validateBody(patchConfigSchema),
		async (c) => {
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
			const updated = await updateNotificationConfig(db, body);
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
			return c.json(redactNotificationConfig(updated));
		},
	);

	router.post(
		"/test",
		requireBoundary({ kind: "public-data" }),
		validateBody(testBodySchema),
		async (c) => {
			const body = c.req.valid("json");
			const cfg = await readNotificationConfig(db);
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
			const channel: NotificationChannel = body.channel ?? cfg.primaryChannel;
			const recipient = pickRecipient(cfg, channel);
			if (!recipient) {
				const response: ApiErrorResponse = {
					error: `recipient not configured for channel '${channel}'`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}
			const adapter = factory({ ...cfg, primaryChannel: channel });
			const notification: Notification = {
				title: "HyperIdle notification test",
				body: "This is a test notification from HyperIdle.",
				severity: "digest",
				timestamp: nowFn().getTime(),
			};
			let result: SendResult;
			try {
				result = await adapter.send(recipient, notification);
			} catch (err) {
				result = {
					ok: false,
					channel: adapter.name,
					error: err instanceof Error ? err.message : String(err),
					retriable: true,
				};
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
		// typos instead of silently returning an empty list. Security
		// review H2 #4 called out the divergence from the PATCH-body
		// zod enforcement.
		const parsed = queueStatusEnum.safeParse(statusParam);
		if (!parsed.success) {
			const response: ApiErrorResponse = {
				error: `invalid status '${statusParam}'; expected pending|sent|failed|dropped|sending`,
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}
		const rows = await db
			.select()
			.from(notificationQueue)
			.where(eq(notificationQueue.status, parsed.data))
			.orderBy(desc(notificationQueue.createdAt))
			.limit(limit);
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
			const cfg = await loadNotificationConfig(db);
			if (!cfg) {
				return c.json({ flushed: 0, failed: 0, reason: "disabled" });
			}
			const result = await flushQueue(db, factory, cfg, nowFn());
			return c.json(result);
		},
	);

	router.post(
		"/digest",
		requireBoundary({ kind: "public-data" }),
		validateBody(digestBodySchema),
		async (c) => {
			const result = await dispatchDigest(db, { adapterFactory: factory, now: nowFn });
			return c.json(result);
		},
	);

	// ──────────────────────────────────────────────────────────────────────────
	// AF8: In-app notification popover API
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * GET /inbox — list unread (readAt IS NULL) notifications, urgency+recency order, cap 50.
	 * Drives the popover row list and unread dot count.
	 */
	router.get("/inbox", requireBoundary({ kind: "principal-self" }), async (c) => {
		const rows = await db
			.select()
			.from(notificationQueue)
			.where(isNull(notificationQueue.readAt))
			.orderBy(desc(notificationQueue.createdAt))
			.limit(50);

		// Sort: immediate urgency first, then ambient; within each group, newest first
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
	 * Called on popover open to clear the unread dot.
	 *
	 * @lore AF8 W3: single bulk UPDATE instead of per-row loop — one statement
	 * regardless of how many unseen rows exist. The previous N+1 loop issued one
	 * round-trip per unseen row (50+ rows = 50+ DB calls on every popover open).
	 */
	router.post("/seen", requireBoundary({ kind: "principal-self" }), async (c) => {
		const now = nowFn().toISOString();
		await db.update(notificationQueue).set({ seenAt: now }).where(isNull(notificationQueue.seenAt));
		return c.json({ ok: true });
	});

	/**
	 * POST /:id/read — mark a specific notification as read (jump or dismiss).
	 *
	 * @lore AF8 W4: Use z.string().uuid() for strict UUID validation (version/variant
	 * nibbles + hyphen positions). The previous regex /^[0-9a-f-]{36}$/ accepted
	 * 36-dash strings and other non-UUID inputs. The plan promised z.string().uuid().
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
		const now = nowFn().toISOString();
		await db
			.update(notificationQueue)
			.set({ readAt: now })
			.where(eq(notificationQueue.id, parsed.data));
		return c.json({ ok: true });
	});

	/**
	 * GET /mute — return the list of muted notification type keys.
	 * Used by Settings to render initial toggle states.
	 */
	router.get("/mute", requireBoundary({ kind: "public-data" }), async (c) => {
		const muted = await getMutedTypeKeys(db);
		return c.json({ muted });
	});

	/**
	 * PUT /mute/:key — set mute state for a notification type.
	 * Validates that :key is a registered type from NOTIFICATION_TYPES.
	 * Writes via MutePreferenceWriter (factory-level until AF15).
	 *
	 * @lore AF8: No rate limiter — idempotent set-to-value, founder-tier auth,
	 * no fan-out. See architecture §Security for full justification.
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
			const writer = defaultMutePreferenceWriter(db);
			await writer.setMuted(key as NotificationTypeKey, body.muted);
			return c.json({ ok: true });
		},
	);

	return router;
}
