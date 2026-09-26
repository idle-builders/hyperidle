import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveOrigin } from "../cors.js";

describe("resolveOrigin", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test.each([
		["http://localhost:5173", true, "Vite dev origin"],
		["http://127.0.0.1:49321", true, "Electron renderer on a random port"],
		["http://127.0.0.1:3001", true, "Electron on the server's own port"],
		["http://127.0.0.1.evil.com", false, "prefix-bypass attempt"],
		["http://127.0.0.2:3001", false, "not the loopback address"],
		["http://evil.example.com", false, "unrelated origin"],
	])("%s -> allowed=%s (%s)", (origin, allowed) => {
		const result = resolveOrigin(origin, {} as never);
		expect(result).toBe(allowed ? origin : undefined);
	});

	test("allows an origin from HYPERIDLE_CORS_ORIGINS", () => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001,https://10.0.1.5:3001");
		expect(resolveOrigin("https://hyperidle.local:3001", {} as never)).toBe(
			"https://hyperidle.local:3001",
		);
		expect(resolveOrigin("https://10.0.1.5:3001", {} as never)).toBe("https://10.0.1.5:3001");
	});

	test("trims whitespace around configured origins", () => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", " https://hyperidle.local:3001 , https://10.0.1.5:3001 ");
		expect(resolveOrigin("https://hyperidle.local:3001", {} as never)).toBe(
			"https://hyperidle.local:3001",
		);
	});

	test("denies an origin not in HYPERIDLE_CORS_ORIGINS", () => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001");
		expect(resolveOrigin("https://evil.example.com", {} as never)).toBeUndefined();
	});

	test("denies every configurable origin when HYPERIDLE_CORS_ORIGINS is unset", () => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "");
		expect(resolveOrigin("https://hyperidle.local:3001", {} as never)).toBeUndefined();
	});
});
