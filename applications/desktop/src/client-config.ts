/**
 * Client-local config file: config.json in Electron userData.
 *
 * Replaces window-state.json with a single typed file that holds
 * BackendMode, serverUrl, lastView, and window state. One file, one
 * Zod schema, one read on boot.
 *
 * @lore P3: Option A chosen over Option B (separate files). The one-time
 * window position reset on upgrade is benign. Having two files (config.json
 * + window-state.json) adds complexity without benefit. See architecture.md
 * Decision 1.
 */

import * as fs from "node:fs";
import { z } from "zod";

const BackendModeSchema = z.enum(["local", "shared"]);

const WindowStateSchema = z.object({
	x: z.number().optional(),
	y: z.number().optional(),
	width: z.number().default(1280),
	height: z.number().default(800),
	isMaximized: z.boolean().default(false),
	isFullScreen: z.boolean().default(false),
});

export type WindowState = z.infer<typeof WindowStateSchema>;

const ClientConfigSchema = z.object({
	/** "local" | "shared" — the backend mode selection. Null = unset (first run). */
	backendMode: BackendModeSchema.nullable().default(null),
	/** Remote server URL for shared mode. Null when local. */
	serverUrl: z.string().url().nullable().default(null),
	/** Last active view path for restoration. */
	lastView: z.string().nullable().default(null),
	/** Window bounds and state. */
	windowState: WindowStateSchema.optional(),
	// S4: Worker registration fields
	/** Whether this desktop is registered as a worker. Default false. */
	workerEnabled: z.boolean().default(false),
	/** Maximum concurrent sessions this worker handles. Default 1, max 8. */
	workerMaxConcurrent: z.number().int().min(1).max(8).default(1),
	/** Stable UUID for worker pool identity. Generated on first enable, persisted. */
	workerDeviceId: z.string().nullable().default(null),
});

export type ClientConfig = {
	backendMode: "local" | "shared" | null;
	serverUrl: string | null;
	lastView: string | null;
	windowState: WindowState;
	/** S4: Whether this desktop is registered as a worker. */
	workerEnabled: boolean;
	/** S4: Maximum concurrent sessions. */
	workerMaxConcurrent: number;
	/** S4: Stable UUID for the worker pool entry. */
	workerDeviceId: string | null;
};

/**
 * @lore P3: DEFAULTS constructed explicitly to avoid Zod v4 nested .default({})
 * behavior where the literal {} is used without re-parsing through the sub-schema.
 * WindowStateSchema.parse({}) correctly applies all inner defaults (width: 1280, etc.).
 * @lore S4: Worker fields added with safe defaults — workerEnabled=false ensures
 * no worker is started by default. workerDeviceId=null is generated on first enable.
 */
const DEFAULTS: ClientConfig = {
	backendMode: null,
	serverUrl: null,
	lastView: null,
	windowState: WindowStateSchema.parse({}),
	workerEnabled: false,
	workerMaxConcurrent: 1,
	workerDeviceId: null,
};

/**
 * Apply defaults to a raw parsed config, handling the windowState sub-object.
 * @lore P3: Needed because Zod v4 does not re-parse .default({}) values through
 * the sub-schema — WindowStateSchema inner defaults would not apply otherwise.
 */
function applyConfigDefaults(raw: z.infer<typeof ClientConfigSchema>): ClientConfig {
	return {
		backendMode: raw.backendMode ?? null,
		serverUrl: raw.serverUrl ?? null,
		lastView: raw.lastView ?? null,
		windowState: WindowStateSchema.parse(raw.windowState ?? {}),
		workerEnabled: raw.workerEnabled ?? false,
		workerMaxConcurrent: raw.workerMaxConcurrent ?? 1,
		workerDeviceId: raw.workerDeviceId ?? null,
	};
}

/**
 * Read config from disk. Returns defaults on missing or corrupt file.
 * Never throws — the app always boots.
 */
export function loadClientConfig(configPath: string): ClientConfig {
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const json: unknown = JSON.parse(raw);
		const result = ClientConfigSchema.safeParse(json);
		if (result.success) {
			return applyConfigDefaults(result.data);
		}
		// Zod validation failure — fall back to defaults
		return DEFAULTS;
	} catch {
		// File missing or corrupt JSON — fall back to defaults
		return DEFAULTS;
	}
}

/**
 * Write config to disk. Merges partial updates with the existing config
 * (reads current state first, applies patch, writes result).
 */
export function saveClientConfig(configPath: string, patch: Partial<ClientConfig>): void {
	const current = loadClientConfig(configPath);
	const merged: ClientConfig = {
		...current,
		...patch,
		// Deep-merge windowState so partial window updates don't clobber
		windowState:
			patch.windowState !== undefined
				? { ...current.windowState, ...patch.windowState }
				: current.windowState,
	};
	fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

/**
 * One-time migration: if window-state.json exists and config.json does not,
 * read window state from the old file and write it into config.json.
 *
 * No-op if config.json already exists or window-state.json does not exist.
 * Handles corrupt window-state.json gracefully (falls back to defaults).
 */
export function migrateWindowState(windowStatePath: string, configPath: string): void {
	// No-op if config.json already exists
	if (fs.existsSync(configPath)) {
		return;
	}

	// No-op if window-state.json also doesn't exist
	if (!fs.existsSync(windowStatePath)) {
		return;
	}

	let windowState: WindowState = WindowStateSchema.parse({});
	try {
		const raw = fs.readFileSync(windowStatePath, "utf-8");
		const json: unknown = JSON.parse(raw);
		const result = WindowStateSchema.safeParse(json);
		if (result.success) {
			windowState = result.data;
		}
	} catch {
		// Corrupt window-state.json — use defaults for windowState
	}

	saveClientConfig(configPath, { windowState });
}

export { BackendModeSchema, ClientConfigSchema, DEFAULTS, WindowStateSchema };
