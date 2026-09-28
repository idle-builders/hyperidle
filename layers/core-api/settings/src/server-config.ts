// Typed server config read/write backed by the server_config table.
// @lore: schema is z.object not .strict() — unknown keys (e.g. stale notifications) are dropped silently so old rows always parse

import { type HyperIdleDb, serverConfig, type WriteExecutor } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const ServerConfigSchema = z.object({
	harnessDisabled: z.array(z.string()).default([]),
});

type RawServerConfig = z.infer<typeof ServerConfigSchema>;

export type ServerConfig = {
	/** List of harness types the user has disabled. Defaults to []. */
	harnessDisabled: string[];
};

export type ServerConfigPatch = {
	/**
	 * Full-replacement write — the caller supplies the complete new list.
	 * Use updateServerConfig to add/remove a type atomically (read-modify-write).
	 */
	harnessDisabled?: string[];
};

const DEFAULTS: ServerConfig = {
	harnessDisabled: [],
};

function applyDefaults(raw: RawServerConfig): ServerConfig {
	return {
		// Default to empty array when absent (legacy rows have no harnessDisabled key)
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
 * Patch config in the server_config table.
 * Deep-merges with the existing config. Returns the new merged config.
 */
export function updateServerConfig(
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
		// Full-replacement — the patch supplies the complete new list of disabled types.
		harnessDisabled:
			patch.harnessDisabled !== undefined ? patch.harnessDisabled : current.harnessDisabled,
	};

	// No apiKey in tiers — no encryption step needed here. Keys go to server_credentials.
	const configJson = JSON.stringify(merged);
	await db
		.update(serverConfig)
		.set({ config: configJson, updatedAt: now })
		.where(eq(serverConfig.id, "default"));

	return merged;
}
