/**
 * Typed server config read/write backed by the server_config table.
 *
 * @lore P3: Single-row table (id = "default") holds all server config as a
 * Zod-validated JSON blob. Replaces factorySettings for new structured config.
 * Deep-merges partial updates so callers only need to supply changed keys.
 * Corrupt JSON in the DB falls back to defaults — the app always boots.
 */

import { type HyperIdleDb, serverConfig } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

/**
 * @lore P3: The notifications sub-schema is defined separately so we can
 * call NotificationsSchema.parse({}) to build DEFAULTS. In Zod v4, calling
 * ServerConfigSchema.parse({}) does NOT recursively apply nested .default()
 * values for nested object schemas with a .default({}) — the {} literal is
 * used as-is without re-parsing through the nested schema. This means inner
 * defaults (reviewAlerts: true, etc.) would not be applied. The fix is to
 * explicitly construct DEFAULTS by parsing each nested schema separately.
 */
const NotificationsSchema = z.object({
	reviewAlerts: z.boolean().default(true),
	costAlerts: z.boolean().default(true),
	blockerAlerts: z.boolean().default(true),
	quietHoursStart: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.default("22:00"),
	quietHoursEnd: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.default("08:00"),
	mutedProducts: z.array(z.string()).default([]),
});

/**
 * @lore P3: notifications is optional in the raw DB JSON schema. We handle
 * the missing/empty case by merging with NOTIFICATION_DEFAULTS in read/write.
 * We do NOT use .default({}) here because in Zod v4, .default(value) uses the
 * literal value WITHOUT re-parsing it through the sub-schema — inner defaults
 * (reviewAlerts: true etc.) would NOT be applied when {} is the default.
 * See test: safeParse({}) → {notifications: {}} (not {notifications: {reviewAlerts:true}}).
 */
const ServerConfigSchema = z.object({
	/** Notification preferences (migrated from factorySettings). */
	notifications: NotificationsSchema.optional(),
});

type RawServerConfig = z.infer<typeof ServerConfigSchema>;

export type ServerConfig = {
	notifications: z.infer<typeof NotificationsSchema>;
};

/** Deep partial type for use in updateServerConfig patches. */
type DeepPartialNotifications = {
	reviewAlerts?: boolean;
	costAlerts?: boolean;
	blockerAlerts?: boolean;
	quietHoursStart?: string;
	quietHoursEnd?: string;
	mutedProducts?: string[];
};

type ServerConfigPatch = {
	notifications?: DeepPartialNotifications;
};

/**
 * Fully-populated defaults with all nested defaults applied.
 *
 * @lore P3: Constructed explicitly rather than via ServerConfigSchema.parse({})
 * because in Zod v4, nested .default({}) values are not re-parsed through the
 * nested schema when building defaults. NotificationsSchema.parse({}) triggers
 * all the boolean/string defaults correctly.
 */
const DEFAULTS: ServerConfig = {
	notifications: NotificationsSchema.parse({}),
};

/**
 * Merge raw parsed config with defaults, applying NotificationsSchema defaults.
 * This is needed because Zod v4 does not re-parse .default({}) values through
 * the sub-schema — we must explicitly parse the notifications sub-object.
 */
function applyDefaults(raw: RawServerConfig): ServerConfig {
	return {
		notifications: NotificationsSchema.parse(raw.notifications ?? {}),
	};
}

/**
 * Read config from the server_config table.
 * Returns defaults if the table is empty or the JSON is corrupt.
 */
export function readServerConfig(db: HyperIdleDb): ServerConfig {
	const row = db.select().from(serverConfig).where(eq(serverConfig.id, "default")).get();

	if (!row) {
		return DEFAULTS;
	}

	try {
		const json: unknown = JSON.parse(row.config);
		const result = ServerConfigSchema.safeParse(json);
		if (result.success) {
			return applyDefaults(result.data);
		}
		// Zod validation failure — fall back to defaults
		return DEFAULTS;
	} catch {
		// Corrupt JSON — fall back to defaults
		return DEFAULTS;
	}
}

/**
 * Patch config in the server_config table.
 * Deep-merges with the existing config. Returns the new merged config.
 */
export function updateServerConfig(db: HyperIdleDb, patch: ServerConfigPatch): ServerConfig {
	const current = readServerConfig(db);
	const merged: ServerConfig = {
		...current,
		notifications:
			patch.notifications !== undefined
				? { ...current.notifications, ...patch.notifications }
				: current.notifications,
	};

	const now = new Date().toISOString();
	const configJson = JSON.stringify(merged);

	// Upsert: update if row exists, insert if not
	const existing = db.select().from(serverConfig).where(eq(serverConfig.id, "default")).get();

	if (existing) {
		db.update(serverConfig)
			.set({ config: configJson, updatedAt: now })
			.where(eq(serverConfig.id, "default"))
			.run();
	} else {
		db.insert(serverConfig).values({ id: "default", config: configJson, updatedAt: now }).run();
	}

	return merged;
}

export { NotificationsSchema, ServerConfigSchema };
