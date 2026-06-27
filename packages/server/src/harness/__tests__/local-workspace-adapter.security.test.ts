/**
 * I2 — S4: LocalSandboxAdapter refuses to operate when
 * `NODE_ENV === "production"`.
 *
 * The adapter executes commands directly on the host filesystem with no
 * isolation. Allowing it in production would let any agent escape the
 * intended Docker boundary and read or mutate the host. The gate lives at
 * `spawn()` (per the I2 plan) so type-only imports in tests still work.
 *
 * Red phase: the current adapter has no production check; both tests fail.
 */

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";

let baseDir: string;
const originalEnv = { ...process.env };

beforeAll(async () => {
	baseDir = join(tmpdir(), `hyperidle-i2-local-prod-${Date.now()}`);
	await mkdir(baseDir, { recursive: true });
});

afterAll(async () => {
	await rm(baseDir, { recursive: true, force: true });
});

beforeEach(() => {
	process.env = { ...originalEnv };
});

afterEach(() => {
	process.env = { ...originalEnv };
});

describe("I2 S4 / review A3 — LocalSandboxAdapter production guard", () => {
	it("constructor throws when NODE_ENV === 'production' on a server profile", () => {
		process.env.NODE_ENV = "production";
		process.env.HYPERIDLE_PROFILE = "vps";
		expect(() => new LocalSandboxAdapter()).toThrow(/not allowed/i);
	});

	it("error message indicates server-profile restriction (AQ1: no Docker reference)", () => {
		process.env.NODE_ENV = "production";
		process.env.HYPERIDLE_PROFILE = "vps";
		expect(() => new LocalSandboxAdapter()).toThrow(/not allowed.*server/i);
	});

	it("spawn() succeeds in NODE_ENV=test (the default for the suite)", async () => {
		process.env.NODE_ENV = "test";
		const adapter = new LocalSandboxAdapter();

		const handle = await adapter.spawn(baseDir);
		expect(handle.sandboxId).toBeDefined();
		await adapter.destroy(handle);
	});

	it("spawn() succeeds when NODE_ENV is unset (dev convenience)", async () => {
		process.env.NODE_ENV = undefined;
		const adapter = new LocalSandboxAdapter();

		const handle = await adapter.spawn(baseDir);
		expect(handle.sandboxId).toBeDefined();
		await adapter.destroy(handle);
	});

	it("constructing in production gates exec() too — no handle can leak past the constructor", () => {
		process.env.NODE_ENV = "production";
		process.env.HYPERIDLE_PROFILE = "vps";
		expect(() => new LocalSandboxAdapter()).toThrow(/not allowed/i);
	});
});
