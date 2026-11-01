/**
 * The server validates HYPERIDLE_API_KEY at startup: the laptop/dev profile auto-defaults to a
 * well-known dev key; VPS/cloud profiles fail fast when the key is unset.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { validateStartupEnv } from "../validate-startup-env.js";

describe("validateStartupEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("defaults to dev key in laptop profile when missing", () => {
		const env: Record<string, string | undefined> = {};
		const result = validateStartupEnv(env);
		expect(result).toBeNull();
		expect(env.HYPERIDLE_API_KEY).toBe("hyperidle-dev-local");
	});

	test("defaults to dev key when undefined", () => {
		const env: Record<string, string | undefined> = { HYPERIDLE_API_KEY: undefined };
		const result = validateStartupEnv(env);
		expect(result).toBeNull();
		expect(env.HYPERIDLE_API_KEY).toBe("hyperidle-dev-local");
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

	test.each([
		[{ HYPERIDLE_TLS_DOMAIN: "team.example.com", HYPERIDLE_API_KEY: "k" }, /CLOUDFLARE_API_TOKEN/],
		[{ HYPERIDLE_TLS_DOMAIN: "team.example.com", CLOUDFLARE_API_TOKEN: "t" }, /HYPERIDLE_API_KEY/],
	])("serving HTTPS refuses to start without what it needs: %o", (env, problem) => {
		expect(validateStartupEnv({ ...env })).toMatch(problem);
	});

	test("returns null when HYPERIDLE_API_KEY is set", () => {
		const result = validateStartupEnv({ HYPERIDLE_API_KEY: "some-key" });
		expect(result).toBeNull();
	});
});
