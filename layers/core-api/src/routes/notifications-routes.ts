import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse, NotificationTypeKey } from "@hyperidle/domain-model";
import { API_ERROR_CODES, NOTIFICATION_TYPES } from "@hyperidle/domain-model";
import { validateBody } from "@hyperidle/domain-model/http";
import {
	listNotifications,
	markNotifications,
	type NotificationsDeps,
	readPreferences,
	updatePreferences,
} from "@hyperidle/notifications";
import { Hono } from "hono";
import z from "zod";

export interface CreateNotificationRoutesOptions {
	/**
	 * Collapsed deps bag (replaces the old notificationsConfig +
	 * silencePolicy + work triple).
	 *
	 * @lore AU20 Ag6b: single deps bag; internal functions extract the
	 * sub-deps they need.
	 */
	deps: NotificationsDeps;
	now?: () => Date;
}

export function createNotificationRoutes(
	db: HyperIdleDb,
	opts: CreateNotificationRoutesOptions,
): Hono {
	const router = new Hono();
	const nowFn = opts.now ?? ((): Date => new Date());

	// ──────────────────────────────────────────────────────────────────────────
	// AF8: In-app notification popover API
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * GET /inbox — list unread (readAt IS NULL) notifications, urgency+recency order, cap 50.
	 */
	router.get("/inbox", async (c) => {
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
	router.post("/seen", async (c) => {
		await markNotifications(db, { kind: "all" }, { seen: true }, nowFn());
		return c.json({ ok: true });
	});

	/**
	 * POST /:id/read — mark a specific notification as read.
	 *
	 * @lore AF8 W4: z.string().uuid() for strict UUID validation.
	 */
	router.post("/:id/read", async (c) => {
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
	router.get("/mute", async (c) => {
		const muted = await readPreferences(db, opts.deps);
		return c.json({ muted });
	});

	/**
	 * PUT /mute/:key — set mute state for a notification type.
	 *
	 * @lore AF8: No rate limiter — idempotent set-to-value, founder-tier auth.
	 */
	router.put("/mute/:key", validateBody(z.object({ muted: z.boolean() }).strict()), async (c) => {
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
	});

	return router;
}
