/**
 * GET /api/settings — return application settings for the authenticated founder.
 * PATCH /api/settings — persist notification preferences to factorySettings.
 *
 * @lore M3 B1: This endpoint replaces the DEFAULT_SETTINGS hardcoded mock in
 * the web client. It reads from factorySettings and the agents/products tables
 * to build a SettingsData response. NotificationSettings and AppearanceSettings
 * are read from factorySettings keys; products/agents come from their tables.
 *
 * @lore M3 B1: avatarUrl is null (not "") since no avatar upload exists yet.
 * active is derived from product.phase !== "archived". paused is derived from
 * agent.status === "paused".
 */

import { factorySettings, type HyperIdleDb, products, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";

/**
 * @lore M3 review W2: Zod validation for the PATCH body so we reject malformed
 * payloads with a 400 before touching the database.
 */
const notificationPatchSchema = z.object({
	reviewAlerts: z.boolean().optional(),
	costAlerts: z.boolean().optional(),
	blockerAlerts: z.boolean().optional(),
	quietHoursStart: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")
		.optional(),
	quietHoursEnd: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")
		.optional(),
	mutedProducts: z.array(z.string()).optional(),
});

const settingsPatchSchema = z.object({
	notifications: notificationPatchSchema.optional(),
});

type SettingsPatchBody = z.infer<typeof settingsPatchSchema>;

export function createSettingsRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	function readSettings(): ReturnType<typeof buildSettingsResponse> {
		return buildSettingsResponse(db);
	}

	router.get("/", (c) => {
		return c.json(readSettings());
	});

	router.patch("/", async (c) => {
		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		// @lore M3 review W2: validate with Zod before touching the database.
		const parsed = settingsPatchSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}
		const body: SettingsPatchBody = parsed.data;

		const now = new Date().toISOString();
		const notif = body.notifications;
		if (notif) {
			if (notif.reviewAlerts !== undefined) {
				persistSetting(db, "notifications_review_alerts", String(notif.reviewAlerts), now);
			}
			if (notif.costAlerts !== undefined) {
				persistSetting(db, "notifications_cost_alerts", String(notif.costAlerts), now);
			}
			if (notif.blockerAlerts !== undefined) {
				persistSetting(db, "notifications_blocker_alerts", String(notif.blockerAlerts), now);
			}
			if (notif.quietHoursStart !== undefined) {
				persistSetting(db, "notifications_quiet_hours_start", notif.quietHoursStart, now);
			}
			if (notif.quietHoursEnd !== undefined) {
				persistSetting(db, "notifications_quiet_hours_end", notif.quietHoursEnd, now);
			}
			// @lore M3 review W3: persist mutedProducts as a comma-separated list in factorySettings.
			if (notif.mutedProducts !== undefined) {
				persistSetting(db, "notifications_muted_products", notif.mutedProducts.join(","), now);
			}
		}

		return c.json(readSettings());
	});

	return router;
}

function persistSetting(db: HyperIdleDb, key: string, value: string, updatedAt: string): void {
	// Try update first; if no row exists, insert
	const existing = db.select().from(factorySettings).where(eq(factorySettings.key, key)).get();
	if (existing) {
		db.update(factorySettings).set({ value, updatedAt }).where(eq(factorySettings.key, key)).run();
	} else {
		db.insert(factorySettings).values({ key, value, updatedAt }).run();
	}
}

/**
 * @lore M3 review W1: `appearance` is a client-side concern (localStorage-backed
 * via useTheme). Contract 2 says appearance stays in localStorage, NOT in the API
 * response. The appearance field is excluded from this response type.
 * @lore P2: profile now reads from users table (kind = 'human') instead of
 * factorySettings founder_name/founder_email. The `agents` field renamed to `users`
 * but returns only AI users (kind = 'ai') for the settings panel display.
 */
function buildSettingsResponse(db: HyperIdleDb): {
	profile: { name: string; email: string; avatarUrl: null };
	products: Array<{ id: string; name: string; active: boolean }>;
	users: Array<{ id: string; name: string; autonomyLevel: string; paused: boolean }>;
	notifications: {
		reviewAlerts: boolean;
		costAlerts: boolean;
		blockerAlerts: boolean;
		quietHoursStart: string;
		quietHoursEnd: string;
		mutedProducts: string[];
	};
} {
	// P2: Read founder profile from users table (kind = 'human')
	const humanUser = db.select().from(users).where(eq(users.kind, "human")).limit(1).get();

	// Read notification settings (with defaults if not configured)
	const reviewAlertsRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "notifications_review_alerts"))
		.get();
	const costAlertsRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "notifications_cost_alerts"))
		.get();
	const blockerAlertsRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "notifications_blocker_alerts"))
		.get();
	const quietStartRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "notifications_quiet_hours_start"))
		.get();
	const quietEndRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "notifications_quiet_hours_end"))
		.get();
	// @lore M3 review W3: mutedProducts is stored as a comma-separated list in factorySettings
	const mutedProductsRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "notifications_muted_products"))
		.get();

	// Products — active derived from phase !== "archived"
	const productRows = db.select().from(products).all();
	// AI Users — paused derived from status === "paused" (kind = 'ai' for the agents panel)
	const aiUserRows = db.select().from(users).where(eq(users.kind, "ai")).all();

	return {
		profile: {
			name: humanUser?.name ?? "Founder",
			email: humanUser?.email ?? "",
			avatarUrl: null,
		},
		products: productRows.map((p) => ({
			id: p.id,
			name: p.name,
			active: p.phase !== "archived",
		})),
		users: aiUserRows.map((u) => ({
			id: u.id,
			name: u.name,
			autonomyLevel: "supervised" as const,
			paused: u.status === "paused",
		})),
		notifications: {
			reviewAlerts: reviewAlertsRow?.value !== "false",
			costAlerts: costAlertsRow?.value !== "false",
			blockerAlerts: blockerAlertsRow?.value !== "false",
			quietHoursStart: quietStartRow?.value ?? "22:00",
			quietHoursEnd: quietEndRow?.value ?? "08:00",
			mutedProducts: mutedProductsRow?.value
				? mutedProductsRow.value.split(",").filter(Boolean)
				: [],
		},
	};
}
