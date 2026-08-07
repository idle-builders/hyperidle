/**
 * I2 — A6: Server validates HYPERIDLE_API_KEY at startup.
 *
 * Laptop/dev profile auto-defaults to a well-known dev key.
 * VPS/cloud profiles fail fast when the key is unset.
 */

import { LAPTOP_DEV_API_KEY, validateStartupEnv } from "@hyperidle/shared";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

describe("I2 A6 — validateStartupEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("defaults to dev key in laptop profile when missing", () => {
		const env: Record<string, string | undefined> = {};
		const result = validateStartupEnv(env);
		expect(result).toBeNull();
		expect(env.HYPERIDLE_API_KEY).toBe(LAPTOP_DEV_API_KEY);
	});

	test("defaults to dev key when undefined", () => {
		const env: Record<string, string | undefined> = { HYPERIDLE_API_KEY: undefined };
		const result = validateStartupEnv(env);
		expect(result).toBeNull();
		expect(env.HYPERIDLE_API_KEY).toBe(LAPTOP_DEV_API_KEY);
	});

	test("returns error when missing in vps profile", () => {
		const result = validateStartupEnv({ HYPERIDLE_PROFILE: "vps" });
		expect(result).not.toBeNull();
		expect(result).toMatch(/HYPERIDLE_API_KEY/);
	});

	test("returns error when missing in cloud profile", () => {
		const result = validateStartupEnv({ HYPERIDLE_PROFILE: "cloud" });
		expect(result).not.toBeNull();
		expect(result).toMatch(/HYPERIDLE_API_KEY/);
	});

	test("returns null when HYPERIDLE_API_KEY is set", () => {
		const result = validateStartupEnv({ HYPERIDLE_API_KEY: "some-key" });
		expect(result).toBeNull();
	});
});
