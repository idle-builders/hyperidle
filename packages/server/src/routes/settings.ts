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

import { agents, factorySettings, type HyperIdleDb, products } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";

interface NotificationPatch {
	reviewAlerts?: boolean;
	costAlerts?: boolean;
	blockerAlerts?: boolean;
	quietHoursStart?: string;
	quietHoursEnd?: string;
	mutedProducts?: string[];
}

interface SettingsPatchBody {
	notifications?: NotificationPatch;
}

export function createSettingsRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	function readSettings(): ReturnType<typeof buildSettingsResponse> {
		return buildSettingsResponse(db);
	}

	router.get("/", (c) => {
		return c.json(readSettings());
	});

	router.patch("/", async (c) => {
		let body: SettingsPatchBody;
		try {
			body = (await c.req.json()) as SettingsPatchBody;
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

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

function buildSettingsResponse(db: HyperIdleDb): {
	profile: { name: string; email: string; avatarUrl: null };
	products: Array<{ id: string; name: string; active: boolean }>;
	agents: Array<{ id: string; name: string; autonomyLevel: string; paused: boolean }>;
	notifications: {
		reviewAlerts: boolean;
		costAlerts: boolean;
		blockerAlerts: boolean;
		quietHoursStart: string;
		quietHoursEnd: string;
		mutedProducts: string[];
	};
	appearance: { density: string; theme: string };
} {
	// Read founder profile from factorySettings
	const nameRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "founder_name"))
		.get();
	const emailRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "founder_email"))
		.get();

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

	// Read appearance settings
	const densityRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "appearance_density"))
		.get();
	const themeRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "appearance_theme"))
		.get();

	// Products — active derived from phase !== "archived"
	const productRows = db.select().from(products).all();
	// Agents — paused derived from status === "paused"
	const agentRows = db.select().from(agents).all();

	return {
		profile: {
			name: nameRow?.value ?? "Founder",
			email: emailRow?.value ?? "",
			avatarUrl: null,
		},
		products: productRows.map((p) => ({
			id: p.id,
			name: p.name,
			active: p.phase !== "archived",
		})),
		agents: agentRows.map((a) => ({
			id: a.id,
			name: a.name,
			autonomyLevel: "supervised" as const,
			paused: a.status === "paused",
		})),
		notifications: {
			reviewAlerts: reviewAlertsRow?.value === "false" ? false : true,
			costAlerts: costAlertsRow?.value === "false" ? false : true,
			blockerAlerts: blockerAlertsRow?.value === "false" ? false : true,
			quietHoursStart: quietStartRow?.value ?? "22:00",
			quietHoursEnd: quietEndRow?.value ?? "08:00",
			mutedProducts: [],
		},
		appearance: {
			density: densityRow?.value ?? "auto",
			theme: themeRow?.value ?? "system",
		},
	};
}
