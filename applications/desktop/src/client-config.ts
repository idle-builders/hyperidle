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
	lastView: z.string().nullable().default(null),
	windowState: WindowStateSchema.optional(),
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
	workerEnabled: boolean;
	workerMaxConcurrent: number;
	workerDeviceId: string | null;
};

// @lore: Zod v4 — nested .default({}) does not re-parse through sub-schema; DEFAULTS uses WindowStateSchema.parse({}) to apply inner defaults
const DEFAULTS: ClientConfig = {
	backendMode: null,
	serverUrl: null,
	lastView: null,
	windowState: WindowStateSchema.parse({}),
	workerEnabled: false,
	workerMaxConcurrent: 1,
	workerDeviceId: null,
};

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
