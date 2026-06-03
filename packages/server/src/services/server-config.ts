/**
 * Typed server config read/write backed by the server_config table.
 *
 * @lore P3: Single-row table (id = "default") holds all server config as a
 * Zod-validated JSON blob. Replaces factorySettings for new structured config.
 * Deep-merges partial updates so callers only need to supply changed keys.
 * Corrupt JSON in the DB falls back to defaults — the app always boots.
 */

import { type HyperIdleDb, serverConfig } from "@hyperidle/db";
import type { ModelGatewayConfig } from "@hyperidle/shared";
import { MODEL_PROVIDERS } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { BUILT_IN_GATEWAY_CONFIG } from "./model-gateway.js";

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
	/**
	 * @lore R8: Quiet hours gate defaults to OFF so notifications are never
	 * silenced on a fresh install. The start/end fields still persist but the
	 * dispatcher only consults them when quietHoursEnabled=true. This separates
	 * "has the user configured a window?" from "is the window active?".
	 */
	quietHoursEnabled: z.boolean().default(false),
	quietHoursStart: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.default("22:00"),
	quietHoursEnd: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.default("08:00"),
	// @lore U1: renamed from mutedProducts. Old stored JSON with mutedProducts key
	// gracefully degrades to empty array via .default([]).
	mutedTeams: z.array(z.string()).default([]),
});

/**
 * X4: Per-tier model configuration schema — used within the ModelGateway schema.
 *
 * @lore X4 A-SEC-1: The PATCH endpoint uses the global rate limiter (60 req/min).
 * The model-gateway PATCH effectively becomes a credential mutation endpoint when
 * storing openai-compatible apiKey. The global limiter is sufficient because:
 * (a) the endpoint is authenticated (X-API-Key), (b) a dedicated limiter would
 * require restructuring the route registration. A future hardening pass could
 * add a mutateLimiter mirroring the credentials route.
 */
const ModelTierConfigSchema = z.object({
	provider: z.enum(MODEL_PROVIDERS),
	model: z.string().min(1),
	baseUrl: z.string().url().optional(),
	/** X4 A-TYPE-1: apiKey only for openai-compatible — stripped from GET responses. */
	apiKey: z.string().optional(),
});

const ModelGatewayConfigSchema = z.object({
	reasoning: ModelTierConfigSchema,
	workhorse: ModelTierConfigSchema,
	fast: ModelTierConfigSchema,
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
	/** X4: Model gateway configuration (provider per tier). Optional — defaults to BUILT_IN_GATEWAY_CONFIG. */
	modelGateway: ModelGatewayConfigSchema.optional(),
});

type RawServerConfig = z.infer<typeof ServerConfigSchema>;

export type ServerConfig = {
	notifications: z.infer<typeof NotificationsSchema>;
	/** X4: Fully-typed model gateway config (always present, defaults applied). */
	modelGateway: ModelGatewayConfig;
};

/** Deep partial type for use in updateServerConfig patches. */
type DeepPartialNotifications = {
	reviewAlerts?: boolean;
	costAlerts?: boolean;
	blockerAlerts?: boolean;
	quietHoursEnabled?: boolean;
	quietHoursStart?: string;
	quietHoursEnd?: string;
	// @lore U1: renamed from mutedProducts.
	mutedTeams?: string[];
};

type ServerConfigPatch = {
	notifications?: DeepPartialNotifications;
	/** X4: Full replacement — not deep merged. 3 tiers is the complete shape. */
	modelGateway?: ModelGatewayConfig;
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
	modelGateway: BUILT_IN_GATEWAY_CONFIG,
};

/**
 * Merge raw parsed config with defaults, applying NotificationsSchema defaults.
 * This is needed because Zod v4 does not re-parse .default({}) values through
 * the sub-schema — we must explicitly parse the notifications sub-object.
 */
function applyDefaults(raw: RawServerConfig): ServerConfig {
	return {
		notifications: NotificationsSchema.parse(raw.notifications ?? {}),
		modelGateway: raw.modelGateway
			? (ModelGatewayConfigSchema.parse(raw.modelGateway) as ModelGatewayConfig)
			: BUILT_IN_GATEWAY_CONFIG,
	};
}

/**
 * Read config from the server_config table.
 * Returns defaults if the table is empty or the JSON is corrupt.
 */
export async function readServerConfig(db: HyperIdleDb): Promise<ServerConfig> {
	const [row] = await db.select().from(serverConfig).where(eq(serverConfig.id, "default")).limit(1);

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
export async function updateServerConfig(
	db: HyperIdleDb,
	patch: ServerConfigPatch,
): Promise<ServerConfig> {
	const current = await readServerConfig(db);
	const merged: ServerConfig = {
		...current,
		notifications:
			patch.notifications !== undefined
				? { ...current.notifications, ...patch.notifications }
				: current.notifications,
		// X4: Full replacement — 3 tiers is the complete shape, no deep merge needed.
		modelGateway: patch.modelGateway !== undefined ? patch.modelGateway : current.modelGateway,
	};

	const now = new Date().toISOString();
	const configJson = JSON.stringify(merged);

	// Upsert: update if row exists, insert if not
	const [existing] = await db
		.select()
		.from(serverConfig)
		.where(eq(serverConfig.id, "default"))
		.limit(1);

	if (existing) {
		await db
			.update(serverConfig)
			.set({ config: configJson, updatedAt: now })
			.where(eq(serverConfig.id, "default"));
	} else {
		await db.insert(serverConfig).values({ id: "default", config: configJson, updatedAt: now });
	}

	return merged;
}

export { ModelGatewayConfigSchema, ModelTierConfigSchema, NotificationsSchema, ServerConfigSchema };
