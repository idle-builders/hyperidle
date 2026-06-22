/**
 * Typed server config read/write backed by the server_config table.
 *
 * @lore P3: Single-row table (id = "default") holds all server config as a
 * Zod-validated JSON blob. Replaces factorySettings for new structured config.
 * Deep-merges partial updates so callers only need to supply changed keys.
 * Corrupt JSON in the DB falls back to defaults — the app always boots.
 */

import { type HyperIdleDb, serverConfig, serverCredentials } from "@hyperidle/db";
import type { ModelGatewayConfig, ModelTierConfig } from "@hyperidle/shared";
import { MODEL_PROVIDERS } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	decryptCredentialValue,
	encryptCredentialValue,
	getServerSecret,
} from "./credential-encryption.js";
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
 * @lore AH1 §2: apiKey removed from ModelTierConfigSchema. The openai-compatible key
 * now lives in server_credentials (not the config blob). baseUrl (non-secret) stays.
 */
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
	/**
	 * AM4: Persisted list of harness types the user has disabled.
	 * Consumed by AdapterPool.select() via a caller-supplied disabledTypes requirement
	 * (the pool is DB-free and select() is synchronous — it cannot read this directly).
	 * Stamped onto discovery.disabled in the GET /api/harnesses route handler.
	 * "builtin" is always exempt even if listed here — guarded in select() and the route.
	 */
	harnessDisabled: z.array(z.string()).default([]),
});

type RawServerConfig = z.infer<typeof ServerConfigSchema>;

export type ServerConfig = {
	notifications: z.infer<typeof NotificationsSchema>;
	/** X4: Fully-typed model gateway config (always present, defaults applied). */
	modelGateway: ModelGatewayConfig;
	/** AM4: List of harness types the user has disabled. Defaults to []. */
	harnessDisabled: string[];
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

type ServerConfigPatch = {
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

export type { ServerConfigPatch };

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
	harnessDisabled: [],
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
	const current = await readServerConfig(db);
	const merged: ServerConfig = {
		...current,
		notifications:
			patch.notifications !== undefined
				? { ...current.notifications, ...patch.notifications }
				: current.notifications,
		// AF15: Per-tier merge — preserves adjacent tiers' stored apiKey when patch omits them.
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

// ---------------------------------------------------------------------------
// AH1 §4: One-shot boot migration — relocate legacy openai-compatible key +
//          seed anthropic key from env. Replaces migrateServerConfigEncryption.
// ---------------------------------------------------------------------------

/**
 * Migrate legacy credentials into the server_credentials store.
 * Idempotent: safe to run N times.
 *
 * 1. Strip any legacy apiKey fields from server_config blob tiers (AH1 §2 removed
 *    apiKey from ModelTierConfig; legacy rows may still carry them). This is a
 *    forward-only schema cleanup — we relocate any non-empty legacy tier apiKey to
 *    server_credentials as openai_compatible_api_key (if the slot is absent).
 *
 * 2. Seed anthropic_api_key from ANTHROPIC_API_KEY env (desktop safeStorage path)
 *    if the slot in server_credentials is absent and the env var is set.
 *
 * Guards:
 * - Never writes a row if getServerSecret() is null (no encryption secret).
 * - Never overwrites an existing server_credentials row (absent-only seed).
 * - Never seeds an empty-string value.
 *
 * @lore AH1 §4: Replaces migrateServerConfigEncryption (AF11 hole 4).
 * migrateServerConfigEncryption is deleted because apiKey no longer lives in
 * the server_config blob. Legacy rows carrying apiKey in the blob are cleaned up here.
 * @lore AH1 §4.2: The env→store seed bridges existing installs where the key
 * only lived in safeStorage/env (main.ts boot env-injection). The env resolver
 * is no longer wired in production (server-factory.ts §3), so this one-time seed
 * is the migration path. Guarded: only when slot absent + secret non-null + non-empty.
 */
export async function migrateCredentialsToStore(db: HyperIdleDb): Promise<void> {
	const secret = getServerSecret();
	if (!secret) {
		// No root secret — cannot encrypt, skip migration. Boot warning already logged.
		return;
	}

	const now = new Date().toISOString();

	// Step 1: Read the existing server_config blob and strip legacy apiKey fields.
	const [configRow] = await db
		.select()
		.from(serverConfig)
		.where(eq(serverConfig.id, "default"))
		.limit(1);

	if (configRow) {
		let rawJson: unknown;
		try {
			rawJson = JSON.parse(configRow.config);
		} catch {
			rawJson = null;
		}

		if (rawJson && typeof rawJson === "object") {
			// Look for legacy tier blobs with apiKey — not typed since ModelTierConfig
			// no longer has apiKey, but the raw DB JSON may still carry it.
			const raw = rawJson as Record<string, unknown>;
			const gateway = raw.modelGateway as Record<string, Record<string, unknown>> | undefined;
			let needsRewrite = false;
			let legacyApiKey: string | null = null;

			if (gateway && typeof gateway === "object") {
				for (const [_tierName, tier] of Object.entries(gateway)) {
					if (tier && typeof tier === "object" && "apiKey" in tier) {
						const rawKey = tier.apiKey;
						if (typeof rawKey === "string" && rawKey !== "") {
							// Decrypt-or-take-as-is: if it's our ciphertext, decrypt; else it's legacy plaintext.
							const decrypted = decryptCredentialValue(rawKey, secret);
							const plaintext = decrypted !== null ? decrypted : rawKey;
							if (plaintext !== "" && legacyApiKey === null) {
								legacyApiKey = plaintext;
							}
						}
						// Strip the apiKey from the tier blob.
						delete tier.apiKey;
						needsRewrite = true;
					}
				}
			}

			if (needsRewrite) {
				await db
					.update(serverConfig)
					.set({ config: JSON.stringify(raw), updatedAt: now })
					.where(eq(serverConfig.id, "default"));
			}

			// If we found a legacy openai-compatible key, seed server_credentials (absent-only).
			if (legacyApiKey !== null) {
				const [existing] = await db
					.select()
					.from(serverCredentials)
					.where(eq(serverCredentials.name, "openai_compatible_api_key"))
					.limit(1);
				if (!existing) {
					const encryptedValue = encryptCredentialValue(legacyApiKey, secret);
					await db.insert(serverCredentials).values({
						name: "openai_compatible_api_key",
						encryptedValue,
						validationState: "present_untested",
						lastValidatedAt: null,
						updatedAt: now,
					});
				}
			}
		}
	}

	// Step 2: Seed anthropic_api_key from env (desktop safeStorage one-time bridge).
	const envAnthropicKey = process.env.ANTHROPIC_API_KEY;
	if (envAnthropicKey && envAnthropicKey !== "") {
		const [existing] = await db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, "anthropic_api_key"))
			.limit(1);
		if (!existing) {
			const encryptedValue = encryptCredentialValue(envAnthropicKey, secret);
			await db.insert(serverCredentials).values({
				name: "anthropic_api_key",
				encryptedValue,
				validationState: "present_untested",
				lastValidatedAt: null,
				updatedAt: now,
			});
		}
	}
}
