import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadClientConfig, migrateWindowState, saveClientConfig } from "../src/client-config.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-configtest-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadClientConfig", () => {
	it("returns defaults when config file does not exist", () => {
		const configPath = path.join(tmpDir, "config.json");
		const result = loadClientConfig(configPath);

		expect(result.backendMode).toBeNull();
		expect(result.serverUrl).toBeNull();
		expect(result.lastView).toBeNull();
		expect(result.windowState.width).toBe(1280);
		expect(result.windowState.height).toBe(800);
		expect(result.windowState.isMaximized).toBe(false);
		expect(result.windowState.isFullScreen).toBe(false);
	});

	it("returns defaults when file contains corrupt JSON", () => {
		const configPath = path.join(tmpDir, "config.json");
		fs.writeFileSync(configPath, "NOT_VALID_JSON{{{");

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBeNull();
		expect(result.windowState.width).toBe(1280);
	});

	it("returns parsed config when file is valid JSON", () => {
		const configPath = path.join(tmpDir, "config.json");
		const saved = {
			backendMode: "local",
			serverUrl: null,
			lastView: "/bets",
			windowState: {
				x: 100,
				y: 50,
				width: 1440,
				height: 900,
				isMaximized: false,
				isFullScreen: false,
			},
		};
		fs.writeFileSync(configPath, JSON.stringify(saved));

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBe("local");
		expect(result.lastView).toBe("/bets");
		expect(result.windowState.x).toBe(100);
		expect(result.windowState.y).toBe(50);
		expect(result.windowState.width).toBe(1440);
		expect(result.windowState.height).toBe(900);
	});

	it("accepts null backendMode (first run state)", () => {
		const configPath = path.join(tmpDir, "config.json");
		fs.writeFileSync(configPath, JSON.stringify({ backendMode: null }));

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBeNull();
	});

	it("accepts 'local' backendMode", () => {
		const configPath = path.join(tmpDir, "config.json");
		fs.writeFileSync(configPath, JSON.stringify({ backendMode: "local" }));

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBe("local");
	});

	it("accepts 'shared' backendMode", () => {
		const configPath = path.join(tmpDir, "config.json");
		fs.writeFileSync(
			configPath,
			JSON.stringify({ backendMode: "shared", serverUrl: "https://example.com" }),
		);

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBe("shared");
		expect(result.serverUrl).toBe("https://example.com");
	});

	it("falls back to defaults when backendMode is an invalid value", () => {
		const configPath = path.join(tmpDir, "config.json");
		// "invalid_mode" is not a valid BackendMode — Zod should reject and return defaults
		fs.writeFileSync(configPath, JSON.stringify({ backendMode: "invalid_mode" }));

		const result = loadClientConfig(configPath);
		// On Zod parse failure, falls back to defaults
		expect(result.backendMode).toBeNull();
	});

	it("applies default windowState.width=1280 when not specified", () => {
		const configPath = path.join(tmpDir, "config.json");
		fs.writeFileSync(configPath, JSON.stringify({ backendMode: "local", windowState: {} }));

		const result = loadClientConfig(configPath);
		expect(result.windowState.width).toBe(1280);
		expect(result.windowState.height).toBe(800);
	});
});

describe("saveClientConfig", () => {
	it("writes config to disk", () => {
		const configPath = path.join(tmpDir, "config.json");
		saveClientConfig(configPath, { backendMode: "local" });

		expect(fs.existsSync(configPath)).toBe(true);
	});

	it("merges partial update without losing other keys", () => {
		const configPath = path.join(tmpDir, "config.json");

		// First save sets initial state
		saveClientConfig(configPath, {
			backendMode: "local",
			lastView: "/tasks",
			windowState: { width: 1440, height: 900, isMaximized: false, isFullScreen: false },
		});

		// Second save updates only lastView
		saveClientConfig(configPath, { lastView: "/bets" });

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBe("local");
		expect(result.lastView).toBe("/bets");
		expect(result.windowState.width).toBe(1440);
	});

	it("creates config.json in a directory that exists", () => {
		const configPath = path.join(tmpDir, "config.json");
		expect(fs.existsSync(configPath)).toBe(false);

		saveClientConfig(configPath, { backendMode: null });
		expect(fs.existsSync(configPath)).toBe(true);
	});

	it("written file is valid JSON that can be re-read", () => {
		const configPath = path.join(tmpDir, "config.json");
		saveClientConfig(configPath, {
			backendMode: "shared",
			serverUrl: "https://remote.example.com",
		});

		const raw = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		expect(parsed.backendMode).toBe("shared");
		expect(parsed.serverUrl).toBe("https://remote.example.com");
	});
});

describe("migrateWindowState", () => {
	it("creates config.json from window-state.json when config.json does not exist", () => {
		const windowStatePath = path.join(tmpDir, "window-state.json");
		const configPath = path.join(tmpDir, "config.json");

		const oldWindowState = {
			x: 200,
			y: 100,
			width: 1600,
			height: 1000,
			isMaximized: false,
			isFullScreen: false,
		};
		fs.writeFileSync(windowStatePath, JSON.stringify(oldWindowState));

		migrateWindowState(windowStatePath, configPath);

		expect(fs.existsSync(configPath)).toBe(true);
		const result = loadClientConfig(configPath);
		expect(result.windowState.x).toBe(200);
		expect(result.windowState.y).toBe(100);
		expect(result.windowState.width).toBe(1600);
		expect(result.windowState.height).toBe(1000);
	});

	it("is a no-op when config.json already exists", () => {
		const windowStatePath = path.join(tmpDir, "window-state.json");
		const configPath = path.join(tmpDir, "config.json");

		// Pre-existing config.json with specific state
		const existingConfig = {
			backendMode: "local",
			windowState: { width: 999, height: 777, isMaximized: false, isFullScreen: false },
		};
		fs.writeFileSync(configPath, JSON.stringify(existingConfig));

		// Old window-state.json with different values
		fs.writeFileSync(
			windowStatePath,
			JSON.stringify({ x: 0, y: 0, width: 1280, height: 800, isMaximized: false }),
		);

		migrateWindowState(windowStatePath, configPath);

		// config.json should remain unchanged
		const result = loadClientConfig(configPath);
		expect(result.windowState.width).toBe(999);
		expect(result.windowState.height).toBe(777);
	});

	it("is a no-op when neither file exists", () => {
		const windowStatePath = path.join(tmpDir, "window-state.json");
		const configPath = path.join(tmpDir, "config.json");

		// Should not throw
		expect(() => migrateWindowState(windowStatePath, configPath)).not.toThrow();
		expect(fs.existsSync(configPath)).toBe(false);
	});

	it("handles corrupt window-state.json gracefully", () => {
		const windowStatePath = path.join(tmpDir, "window-state.json");
		const configPath = path.join(tmpDir, "config.json");

		fs.writeFileSync(windowStatePath, "CORRUPT{{{");

		migrateWindowState(windowStatePath, configPath);
		expect(fs.existsSync(configPath)).toBe(true);
	});
});

describe("ClientConfig worker fields", () => {
	it("default workerEnabled is false", () => {
		const configPath = path.join(tmpDir, "config.json");
		const result = loadClientConfig(configPath);
		expect(result.workerEnabled).toBe(false);
	});

	it("default workerMaxConcurrent is 1", () => {
		const configPath = path.join(tmpDir, "config.json");
		const result = loadClientConfig(configPath);
		expect(result.workerMaxConcurrent).toBe(1);
	});

	it("default workerDeviceId is null", () => {
		const configPath = path.join(tmpDir, "config.json");
		const result = loadClientConfig(configPath);
		expect(result.workerDeviceId).toBeNull();
	});

	it("round-trip: save all three worker fields and reload", () => {
		const configPath = path.join(tmpDir, "config.json");
		const deviceId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
		saveClientConfig(configPath, {
			workerEnabled: true,
			workerMaxConcurrent: 8,
			workerDeviceId: deviceId,
		});

		const result = loadClientConfig(configPath);
		expect(result.workerEnabled).toBe(true);
		expect(result.workerMaxConcurrent).toBe(8);
		expect(result.workerDeviceId).toBe(deviceId);
	});

	it("old config without worker fields loads with defaults (backward compat)", () => {
		const configPath = path.join(tmpDir, "config.json");
		const legacyConfig = {
			backendMode: "shared",
			serverUrl: "https://example.com",
			lastView: "/work/portfolio",
			windowState: { width: 1440, height: 900, isMaximized: false, isFullScreen: false },
		};
		fs.writeFileSync(configPath, JSON.stringify(legacyConfig));

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBe("shared");
		expect(result.workerEnabled).toBe(false);
		expect(result.workerMaxConcurrent).toBe(1);
		expect(result.workerDeviceId).toBeNull();
	});

	it("worker fields do not overwrite existing config keys when patching", () => {
		const configPath = path.join(tmpDir, "config.json");
		saveClientConfig(configPath, {
			backendMode: "shared",
			serverUrl: "https://remote.example.com",
		});
		saveClientConfig(configPath, { workerEnabled: true });

		const result = loadClientConfig(configPath);
		expect(result.backendMode).toBe("shared");
		expect(result.serverUrl).toBe("https://remote.example.com");
		expect(result.workerEnabled).toBe(true);
	});
});
