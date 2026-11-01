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
	/** True once the login item has been registered so a later user toggle is respected. */
	loginItemSet: z.boolean().optional(),
	windowState: WindowStateSchema.optional(),
});

export type ClientConfig = {
	backendMode: "local" | "shared" | null;
	serverUrl: string | null;
	loginItemSet?: boolean;
	windowState: WindowState;
};

// @lore: Zod v4 — nested .default({}) does not re-parse through sub-schema; DEFAULTS uses WindowStateSchema.parse({}) to apply inner defaults
const DEFAULTS: ClientConfig = {
	backendMode: null,
	serverUrl: null,
	windowState: WindowStateSchema.parse({}),
};

function applyConfigDefaults(raw: z.infer<typeof ClientConfigSchema>): ClientConfig {
	return {
		backendMode: raw.backendMode ?? null,
		serverUrl: raw.serverUrl ?? null,
		loginItemSet: raw.loginItemSet,
		windowState: WindowStateSchema.parse(raw.windowState ?? {}),
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

/** Merges partial updates with the existing config. */
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

export function migrateWindowState(windowStatePath: string, configPath: string): void {
	if (fs.existsSync(configPath)) {
		return;
	}

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
