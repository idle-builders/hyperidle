/**
 * GET /api/settings — return application settings for the authenticated founder.
 * PATCH /api/settings — persist notification preferences to server_config.
 *
 * @lore M3 B1: This endpoint replaces the DEFAULT_SETTINGS hardcoded mock in
 * the web client. It reads from factorySettings and the agents/teams tables
 * to build a SettingsData response. NotificationSettings and AppearanceSettings
 * are read from factorySettings keys; teams/agents come from their tables.
 *
 * @lore M3 B1: avatarUrl is null (not "") since no avatar upload exists yet.
 * active is derived from team.phase !== "archived". paused is derived from
 * agent.status === "paused".
 *
 * @lore P3: Notification prefs migrated from factorySettings to server_config.
 * The settings route reads/writes notifications via readServerConfig/updateServerConfig.
 * @lore AU18: factorySettings itself is now fully retired and dropped — every
 * former consumer (observability, git-export, notifications, etc.) is re-backed
 * onto server_config too.
 *
 * @lore U1: `products` table reference -> `teams`. `mutedProducts` -> `mutedTeams`.
 */

import { type HyperIdleDb, teams } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { getFirstUserByKind, listUsersByKind } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { readServerConfig, updateServerConfig } from "../services/server-config.js";

/**
 * @lore M3 review W2: Zod validation for the PATCH body so we reject malformed
 * payloads with a 400 before touching the database.
 *
 * @lore U1: `mutedProducts` renamed to `mutedTeams`.
 */
const notificationPatchSchema = z.object({
	reviewAlerts: z.boolean().optional(),
	costAlerts: z.boolean().optional(),
	blockerAlerts: z.boolean().optional(),
	quietHoursEnabled: z.boolean().optional(),
	quietHoursStart: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")
		.optional(),
	quietHoursEnd: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")
		.optional(),
	// @lore U1: renamed from mutedProducts.
	mutedTeams: z.array(z.string()).optional(),
});

const settingsPatchSchema = z.object({
	notifications: notificationPatchSchema.optional(),
});

type SettingsPatchBody = z.infer<typeof settingsPatchSchema>;

export function createSettingsRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		return c.json(await buildSettingsResponse(db));
	});

	router.patch("/", requireBoundary({ kind: "public-data" }), async (c) => {
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
 * @lore U1: `products` -> `teams`, `mutedProducts` -> `mutedTeams`.
 */
async function buildSettingsResponse(db: HyperIdleDb): Promise<{
	profile: { name: string; email: string; avatarUrl: null };
	teams: Array<{ id: string; name: string; active: boolean }>;
	users: Array<{ id: string; name: string; autonomyLevel: string; paused: boolean }>;
	notifications: {
		reviewAlerts: boolean;
		costAlerts: boolean;
		blockerAlerts: boolean;
		quietHoursEnabled: boolean;
		quietHoursStart: string;
		quietHoursEnd: string;
		mutedTeams: string[];
	};
}> {
	// P2: Read founder profile from users table (kind = 'human')
	const humanUser = await getFirstUserByKind(db, "human");

	// P3: Read notification settings from server_config (defaults if not configured)
	const serverCfg = await readServerConfig(db);

	// Teams — active derived from phase !== "archived"
	const teamRows = await db.select().from(teams);
	// AI Users — paused derived from status === "paused" (kind = 'ai' for the agents panel)
	const aiUserRows = await listUsersByKind(db, "ai");

	return {
		profile: {
			name: humanUser?.name ?? "Founder",
			email: humanUser?.email ?? "",
			avatarUrl: null,
		},
		teams: teamRows.map((t) => ({
			id: t.id,
			name: t.name,
			active: t.phase !== "archived",
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
			quietHoursEnabled: serverCfg.notifications.quietHoursEnabled,
			quietHoursStart: serverCfg.notifications.quietHoursStart,
			quietHoursEnd: serverCfg.notifications.quietHoursEnd,
			mutedTeams: serverCfg.notifications.mutedTeams,
		},
	};
}
