/**
 * GET /api/settings — return application settings for the authenticated founder.
 * PATCH /api/settings — persist notification preferences to server_config.
 *
 * @lore M3 B1: This endpoint replaces the DEFAULT_SETTINGS hardcoded mock in
 * the web client. It reads from factorySettings and the agents/products tables
 * to build a SettingsData response. NotificationSettings and AppearanceSettings
 * are read from factorySettings keys; products/agents come from their tables.
 *
 * @lore M3 B1: avatarUrl is null (not "") since no avatar upload exists yet.
 * active is derived from product.phase !== "archived". paused is derived from
 * agent.status === "paused".
 *
 * @lore P3: Notification prefs migrated from factorySettings to server_config.
 * The factorySettings table is not dropped — it still serves observability config,
 * git-export, and other consumers. The settings route now reads/writes notifications
 * via readServerConfig/updateServerConfig.
 */

import { type HyperIdleDb, products, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { readServerConfig, updateServerConfig } from "../services/server-config.js";

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

	router.get("/", async (c) => {
		return c.json(await buildSettingsResponse(db));
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

		// @lore P3: Write notifications to server_config instead of factorySettings.
		if (body.notifications) {
			await updateServerConfig(db, { notifications: body.notifications });
		}

		return c.json(await buildSettingsResponse(db));
	});

	return router;
}

/**
 * @lore M3 review W1: `appearance` is a client-side concern (localStorage-backed
 * via useTheme). Contract 2 says appearance stays in localStorage, NOT in the API
 * response. The appearance field is excluded from this response type.
 * @lore P2: profile now reads from users table (kind = 'human') instead of
 * factorySettings founder_name/founder_email. The `agents` field renamed to `users`
 * but returns only AI users (kind = 'ai') for the settings panel display.
 * @lore P3: notifications now read from server_config table via readServerConfig.
 */
async function buildSettingsResponse(db: HyperIdleDb): Promise<{
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
}> {
	// P2: Read founder profile from users table (kind = 'human')
	const [humanUser] = await db.select().from(users).where(eq(users.kind, "human")).limit(1);

	// P3: Read notification settings from server_config (defaults if not configured)
	const serverCfg = await readServerConfig(db);

	// Products — active derived from phase !== "archived"
	const productRows = await db.select().from(products);
	// AI Users — paused derived from status === "paused" (kind = 'ai' for the agents panel)
	const aiUserRows = await db.select().from(users).where(eq(users.kind, "ai"));

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
			reviewAlerts: serverCfg.notifications.reviewAlerts,
			costAlerts: serverCfg.notifications.costAlerts,
			blockerAlerts: serverCfg.notifications.blockerAlerts,
			quietHoursStart: serverCfg.notifications.quietHoursStart,
			quietHoursEnd: serverCfg.notifications.quietHoursEnd,
			mutedProducts: serverCfg.notifications.mutedProducts,
		},
	};
}
