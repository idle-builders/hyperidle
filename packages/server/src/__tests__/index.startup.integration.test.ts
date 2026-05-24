/**
 * I2 — A6: Server fails fast when HYPERIDLE_API_KEY is unset.
 *
 * Tests the validateStartupEnv function in-process — no subprocess spawn
 * needed. The function returns an error string when the env var is missing,
 * and null when it's present. index.ts calls process.exit(1) on non-null.
 */

import { describe, expect, it } from "vitest";
import { validateStartupEnv } from "../validate-env.js";

describe("I2 A6 — validateStartupEnv", () => {
	it("returns error message when HYPERIDLE_API_KEY is missing", () => {
		const result = validateStartupEnv({});
		expect(result).not.toBeNull();
		expect(result).toMatch(/HYPERIDLE_API_KEY/);
	});

	it("returns error message when HYPERIDLE_API_KEY is undefined", () => {
		const result = validateStartupEnv({ HYPERIDLE_API_KEY: undefined });
		expect(result).not.toBeNull();
		expect(result).toMatch(/HYPERIDLE_API_KEY/);
	});

	it("returns error message when HYPERIDLE_API_KEY is empty string", () => {
		const result = validateStartupEnv({ HYPERIDLE_API_KEY: "" });
		expect(result).not.toBeNull();
		expect(result).toMatch(/HYPERIDLE_API_KEY/);
	});

	it("returns null when HYPERIDLE_API_KEY is set", () => {
		const result = validateStartupEnv({ HYPERIDLE_API_KEY: "some-key" });
		expect(result).toBeNull();
	});
});
