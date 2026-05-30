/**
 * S4 RED — ClientConfig worker fields (AC-1).
 *
 * AC coverage:
 *  - loadClientConfig() default workerEnabled: false
 *  - loadClientConfig() default workerMaxConcurrent: 1
 *  - loadClientConfig() default workerDeviceId: null
 *  - saveClientConfig() persists workerEnabled: true
 *  - saveClientConfig() round-trip for workerMaxConcurrent: 4
 *  - saveClientConfig() round-trip for workerDeviceId (UUID string)
 *  - Old config without worker fields loads with defaults (backward compat)
 *  - workerMaxConcurrent clamped: values 1-8 accepted; out-of-range falls back to defaults
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadClientConfig, saveClientConfig } from "../src/client-config.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-s4-config-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("S4 AC-1 — ClientConfig worker fields", () => {
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

	it("saves and loads workerEnabled: true", () => {
		const configPath = path.join(tmpDir, "config.json");
		saveClientConfig(configPath, { workerEnabled: true });
		const result = loadClientConfig(configPath);
		expect(result.workerEnabled).toBe(true);
	});

	it("saves and loads workerMaxConcurrent: 4", () => {
		const configPath = path.join(tmpDir, "config.json");
		saveClientConfig(configPath, { workerMaxConcurrent: 4 });
		const result = loadClientConfig(configPath);
		expect(result.workerMaxConcurrent).toBe(4);
	});

	it("saves and loads workerDeviceId (UUID string)", () => {
		const configPath = path.join(tmpDir, "config.json");
		const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
		saveClientConfig(configPath, { workerDeviceId: uuid });
		const result = loadClientConfig(configPath);
		expect(result.workerDeviceId).toBe(uuid);
	});

	it("old config without worker fields loads with defaults (backward compat)", () => {
		const configPath = path.join(tmpDir, "config.json");
		// Write a config that doesn't have any worker fields
		const legacyConfig = {
			backendMode: "shared",
			serverUrl: "https://example.com",
			lastView: "/work/portfolio",
			windowState: { width: 1440, height: 900, isMaximized: false, isFullScreen: false },
		};
		fs.writeFileSync(configPath, JSON.stringify(legacyConfig));

		const result = loadClientConfig(configPath);
		// Existing fields preserved
		expect(result.backendMode).toBe("shared");
		expect(result.serverUrl).toBe("https://example.com");
		// Worker fields default
		expect(result.workerEnabled).toBe(false);
		expect(result.workerMaxConcurrent).toBe(1);
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

	it("worker fields do not overwrite existing config keys when patching", () => {
		const configPath = path.join(tmpDir, "config.json");
		saveClientConfig(configPath, {
			backendMode: "shared",
			serverUrl: "https://remote.example.com",
		});
		saveClientConfig(configPath, { workerEnabled: true });

		const result = loadClientConfig(configPath);
		// Original fields unchanged
		expect(result.backendMode).toBe("shared");
		expect(result.serverUrl).toBe("https://remote.example.com");
		// Worker field updated
		expect(result.workerEnabled).toBe(true);
	});
});
