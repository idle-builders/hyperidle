/**
 * Typed server config read/write backed by the server_config table.
 *
 * @lore P3: Single-row table (id = "default") holds all server config as a
 * Zod-validated JSON blob. Replaces factorySettings for new structured config.
 * Deep-merges partial updates so callers only need to supply changed keys.
 * Corrupt JSON in the DB falls back to defaults — the app always boots.
 */

import { type HyperIdleDb, serverConfig, type WriteExecutor } from "@hyperidle/db";
import type { ModelGatewayConfig, ModelTierConfig } from "@hyperidle/domain-model";
import { BUILT_IN_GATEWAY_CONFIG, MODEL_PROVIDERS } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { z } from "zod";

/**
 * @lore AU44 batch 4: primaryChannel, digestChannel, recipientEmail,
 * recipientNtfyTopic, ntfyBaseUrl, floodMaxPerMinute, floodCoalesceWindowMs,
 * testMaxPerHour, smtpIgnoreTls, digestCron removed — dispatcher, ntfy adapter,
 * flood cap, and digest all deleted. Only SMTP delivery config survives.
 */
const NotificationsDeliverySchema = z.object({
	enabled: z.boolean().default(false),
	smtpHost: z.string().nullable().default(null),
	smtpPort: z.number().default(587),
	smtpSecure: z.boolean().default(false),
	smtpUsername: z.string().nullable().default(null),
	smtpFrom: z.string().nullable().default(null),
});

/**
 * @lore P3: The notifications sub-schema is defined separately so we can
 * call NotificationsSchema.parse({}) to build DEFAULTS. In Zod v4, calling
 * ServerConfigSchema.parse({}) does NOT recursively apply nested .default()
 * values for nested object schemas with a .default({}) — the {} literal is
 * used as-is without re-parsing through the nested schema. This means inner
 * defaults would not be applied. The fix is to explicitly construct DEFAULTS
 * by parsing each nested schema separately.
 *
 * @lore AU44 batch 4: reviewAlerts, blockerAlerts, quietHoursEnabled,
 * quietHoursStart, quietHoursEnd, mutedTeams, silence removed — alert prefs
 * and silence policy deleted along with the dispatcher.
 */
const NotificationsSchema = z.object({
	/** AU18: per-notification-type mute keys (notifications/mute.ts), migrated off factorySettings. */
	mutedTypes: z.array(z.string()).default([]),
	delivery: NotificationsDeliverySchema.optional(),
});

const ModelTierConfigSchema = z.object({
	provider: z.enum(MODEL_PROVIDERS),
	model: z.string().min(1),
	baseUrl: z.string().url().optional(),
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
	harnessDisabled: z.array(z.string()).default([]),
});

type RawServerConfig = z.infer<typeof ServerConfigSchema>;

export type ServerConfig = {
	notifications: z.infer<typeof NotificationsSchema> & {
		delivery: z.infer<typeof NotificationsDeliverySchema>;
	};
	/** X4: Fully-typed model gateway config (always present, defaults applied). */
	modelGateway: ModelGatewayConfig;
	/** AM4: List of harness types the user has disabled. Defaults to []. */
	harnessDisabled: string[];
};

/** Deep partial type for use in updateServerConfig patches. */
type DeepPartialNotifications = {
	/** AU18: per-type mute keys. */
	mutedTypes?: string[];
	delivery?: Partial<z.infer<typeof NotificationsDeliverySchema>>;
};

type DeepPartialModelTier = {
	provider?: ModelTierConfig["provider"];
	model?: string;
	baseUrl?: string;
};

type DeepPartialModelGateway = {
	reasoning?: DeepPartialModelTier;
	workhorse?: DeepPartialModelTier;
	fast?: DeepPartialModelTier;
};

export type ServerConfigPatch = {
	notifications?: DeepPartialNotifications;
	/**
	 * AF15: Deep-partial — each tier is optional; within a present tier, every field is optional.
	 *
	 * @lore AF15: Changed from full-replacement (ModelGatewayConfig) to deep-partial so a
	 * PATCH of only one tier does not clobber adjacent tiers.
	 * @lore AH1 §2: apiKey removed from patch. Keys go to server_credentials via PUT /api/credentials.
	 */
	modelGateway?: DeepPartialModelGateway;
	/**
	 * AM4: Full-replacement write — the caller supplies the complete new list.
	 * Use updateServerConfig to add/remove a type atomically (read-modify-write).
	 */
	harnessDisabled?: string[];
};

/**
 * Apply NotificationsSchema defaults, INCLUDING its own nested `delivery`
 * sub-schema. Same Zod v4 nested-default gotcha as the top-level
 * ServerConfigSchema: `delivery` is `.optional()` (not `.default()`) on
 * NotificationsSchema, so NotificationsSchema.parse({}) alone leaves it
 * `undefined` — it must be explicitly re-parsed.
 */
function applyNotificationsDefaults(
	raw: RawServerConfig["notifications"],
): ServerConfig["notifications"] {
	const parsed = NotificationsSchema.parse(raw ?? {});
	return {
		...parsed,
		delivery: NotificationsDeliverySchema.parse(parsed.delivery ?? {}),
	};
}

/**
 * Fully-populated defaults with all nested defaults applied.
 *
 * @lore P3: Constructed explicitly rather than via ServerConfigSchema.parse({})
 * because in Zod v4, nested .default({}) values are not re-parsed through the
 * nested schema when building defaults. NotificationsSchema.parse({}) triggers
 * all the boolean/string defaults correctly.
 */
const DEFAULTS: ServerConfig = {
	notifications: applyNotificationsDefaults(undefined),
	modelGateway: BUILT_IN_GATEWAY_CONFIG,
	harnessDisabled: [],
};

/**
 * Merge raw parsed config with defaults, applying NotificationsSchema defaults.
 * This is needed because Zod v4 does not re-parse .default({}) values through
 * the sub-schema — we must explicitly parse the notifications sub-object.
 */
function applyDefaults(raw: RawServerConfig): ServerConfig {
	return {
		notifications: applyNotificationsDefaults(raw.notifications),
		modelGateway: raw.modelGateway
			? (ModelGatewayConfigSchema.parse(raw.modelGateway) as ModelGatewayConfig)
			: BUILT_IN_GATEWAY_CONFIG,
		// AM4: default to empty array when absent (legacy rows have no harnessDisabled key)
		harnessDisabled: Array.isArray(raw.harnessDisabled) ? raw.harnessDisabled : [],
	};
}

/**
 * Read config from the server_config table.
 * Returns defaults if the table is empty or the JSON is corrupt.
 */
export async function readServerConfig(db: HyperIdleDb): Promise<ServerConfig> {
	const [row] = await db.select().from(serverConfig).where(eq(serverConfig.id, "default")).limit(1);
	return parseServerConfig(row?.config);
}

function parseServerConfig(configJson: string | undefined): ServerConfig {
	if (configJson === undefined) {
		return DEFAULTS;
	}

	try {
		const json: unknown = JSON.parse(configJson);
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
 * Merge a partial tier patch with the current stored tier.
 *
 * @lore AH1 §2: apiKey removed from tiers — keys live in server_credentials.
 * baseUrl (non-secret) merges normally.
 */
function mergeTier(current: ModelTierConfig, patch: DeepPartialModelTier): ModelTierConfig {
	return {
		provider: patch.provider ?? current.provider,
		model: patch.model ?? current.model,
		baseUrl: patch.baseUrl ?? current.baseUrl,
	};
}

/**
 * Patch config in the server_config table.
 * Deep-merges with the existing config. Returns the new merged config.
 */
export async function updateServerConfig(
	db: HyperIdleDb,
	patch: ServerConfigPatch,
): Promise<ServerConfig> {
	return db.transaction(async (tx) => {
		const now = new Date().toISOString();
		await tx
			.insert(serverConfig)
			.values({ id: "default", config: JSON.stringify(DEFAULTS), updatedAt: now })
			.onConflictDoNothing();

		const [row] = await tx
			.select({ config: serverConfig.config })
			.from(serverConfig)
			.where(eq(serverConfig.id, "default"))
			.for("update");

		return patchServerConfig(tx, parseServerConfig(row?.config), patch, now);
	});
}

/**
 * The singleton is a JSON blob, so a patch is necessarily read/merge/write.
 * `updateServerConfig` locks its singleton row in a transaction: independent DB
 * handles and processes cannot both merge against the same stale blob.
 */
async function patchServerConfig(
	db: WriteExecutor,
	current: ServerConfig,
	patch: ServerConfigPatch,
	now: string,
): Promise<ServerConfig> {
	const merged: ServerConfig = {
		...current,
		notifications:
			patch.notifications !== undefined
				? {
						...current.notifications,
						...patch.notifications,
						// AU18 §5 merge-hazard fix: `delivery` is a nested sub-object — a
						// shallow `...patch.notifications` spread would silently replace the
						// whole `delivery` object. Merge it independently so a partial patch
						// only touches the fields supplied.
						delivery:
							patch.notifications.delivery !== undefined
								? { ...current.notifications.delivery, ...patch.notifications.delivery }
								: current.notifications.delivery,
					}
				: current.notifications,
		// Per-tier merge preserves adjacent tier configuration when patch omits it.
		modelGateway: patch.modelGateway
			? {
					reasoning: mergeTier(current.modelGateway.reasoning, patch.modelGateway.reasoning ?? {}),
					workhorse: mergeTier(current.modelGateway.workhorse, patch.modelGateway.workhorse ?? {}),
					fast: mergeTier(current.modelGateway.fast, patch.modelGateway.fast ?? {}),
				}
			: current.modelGateway,
		// AM4: Full-replacement — the patch supplies the complete new list of disabled types.
		harnessDisabled:
			patch.harnessDisabled !== undefined ? patch.harnessDisabled : current.harnessDisabled,
	};

	// AH1 §2: no apiKey in tiers — no encryption step needed here. Keys go to server_credentials.
	const configJson = JSON.stringify(merged);
	await db
		.update(serverConfig)
		.set({ config: configJson, updatedAt: now })
		.where(eq(serverConfig.id, "default"));

	return merged;
}

// @lore AU20 Am6: ServerConfigSchema / NotificationsSchema / ModelGatewayConfigSchema /
// ModelTierConfigSchema are validation internals — zero census demand from callers;
// dropped from the public barrel. Not re-exported here.
