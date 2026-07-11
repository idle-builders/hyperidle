import { factorySettings, type HyperIdleDb, sessions, users } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { validateBody } from "../middleware/validate.js";
import { REDACTED } from "../notifications/config.js";
import { getDailyDigest } from "../notifications/daily-digest.js";

const updateSettingSchema = z.object({
	key: z.string().min(1),
	value: z.string(),
});

const SERVER_START_TIME = new Date().toISOString();

/**
 * Factory-settings keys whose values are credentials and MUST be redacted
 * on any outbound response. Matches the per-domain redactors in
 * `services/notifications/config.ts` and `services/observability/config.ts`
 * but expressed as raw key strings because `GET /settings` returns the
 * untyped `factorySettings` rows rather than the structured configs.
 *
 * @lore I1 security-H1: before I1, `GET /api/status/settings` leaked every
 * raw factorySetting to the authenticated caller — including SMTP passwords
 * and ntfy auth tokens. A single compromised API key would therefore leak
 * every third-party credential. The domain-specific routes
 * (`/api/notifications/config`, `/api/observability/config`) already
 * redacted; this generic listing had to match.
 */
const SECRET_SETTING_KEYS: ReadonlySet<string> = new Set([
	"notifications.smtp_password",
	"notifications.ntfy_auth_token",
]);

/**
 * Setting key prefixes whose values must NOT be written through the
 * generic PATCH /api/status/settings route. These domains have dedicated
 * routes (`/api/notifications/config`, `/api/observability/config`,
 * `/api/git-export/config`) that perform structured validation, redaction,
 * and downstream side effects (dispatcher rebuilds, etc).
 *
 * @lore I2 V5: I1 closed the read-side leak (SECRET_SETTING_KEYS). I2
 * closes the write-side: silently upserting `notifications.smtp_password`
 * via this generic route would let an authenticated caller bypass every
 * structured-config invariant.
 */
const BLOCKED_SETTING_PREFIXES = ["git_export.", "notifications.", "observability."] as const;

function isBlockedSettingKey(key: string): boolean {
	return BLOCKED_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function redactSettingRow(row: { key: string; value: string | null }): {
	key: string;
	value: string | null;
} {
	if (!SECRET_SETTING_KEYS.has(row.key)) return row;
	// Keep the row shape stable: redact only when a value is actually set
	// so the UI can still distinguish "configured" from "not configured".
	return { ...row, value: row.value === null || row.value === "" ? row.value : REDACTED };
}

/**
 * Create Hono routes for status and settings endpoints (E6).
 */
export function createStatusRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	// GET /health — Authenticated status probe. Distinct from the public
	// `/api/health` (liveness) — this route sits behind the auth middleware
	// and is the canonical "status/health" endpoint referenced by I1 S1.
	router.get("/health", requireBoundary({ kind: "public-data" }), (c) => {
		return c.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// GET / — Factory-wide status
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const activeSessions = await db.select().from(sessions).where(eq(sessions.state, "active"));

		const allAgents = await db.select().from(users);

		const agentStates: Record<string, number> = {};
		for (const agent of allAgents) {
			agentStates[agent.status] = (agentStates[agent.status] ?? 0) + 1;
		}

		const totalCost = allAgents.reduce((sum, a) => sum + (a.costActual ?? 0), 0);

		// Get uptime from factory settings, fallback to server start time
		const [uptimeSetting] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "factory_start_time"))
			.limit(1);

		const uptime = uptimeSetting?.value ?? SERVER_START_TIME;

		return c.json({
			activeSessions: activeSessions.length,
			agentStates,
			totalCost,
			uptime,
		});
	});

	// GET /settings — List all factory settings. Credentials in
	// SECRET_SETTING_KEYS are redacted before the response leaves the
	// process (I1 security-H1).
	router.get("/settings", requireBoundary({ kind: "public-data" }), async (c) => {
		const allSettings = await db.select().from(factorySettings);
		return c.json(allSettings.map(redactSettingRow));
	});

	// PATCH /settings — Update a factory setting. The echoed row also
	// passes through `redactSettingRow` so PATCHing a secret key doesn't
	// bounce the raw value back in the response body.
	//
	// I2 V5: keys with reserved namespace prefixes are routed to their
	// domain-specific config endpoints; this generic write rejects them
	// with 400 so structured-config invariants stay intact.
	router.patch(
		"/settings",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateSettingSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof updateSettingSchema>;

			if (isBlockedSettingKey(body.key)) {
				const response: ApiErrorResponse = {
					error: `Setting key '${body.key}' is reserved. Use the dedicated /api/{notifications,observability,git-export}/config routes instead.`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}

			const now = new Date().toISOString();

			await db
				.insert(factorySettings)
				.values({
					key: body.key,
					value: body.value,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: factorySettings.key,
					set: { value: body.value, updatedAt: now },
				});

			const [updated] = await db
				.select()
				.from(factorySettings)
				.where(eq(factorySettings.key, body.key))
				.limit(1);

			return c.json(updated ? redactSettingRow(updated) : updated);
		},
	);

	// GET /digest — Daily digest of queued items from past 24h
	router.get("/digest", requireBoundary({ kind: "public-data" }), async (c) => {
		const digest = await getDailyDigest(db);
		return c.json(digest);
	});

	return router;
}
