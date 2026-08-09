/**
 * The constant-time API-key comparator, in its new home: `@hyperidle/http-middleware`.
 * Both applications' auth paths need it, so it may not live behind core-api.
 */
import { describe, expect, test } from "vitest";
import { constantTimeStringEqual } from "../http/timing-safe.js";

describe("constantTimeStringEqual", () => {
	test("is true for identical strings", () => {
		expect(constantTimeStringEqual("sk-live-abc123", "sk-live-abc123")).toBe(true);
	});

	test("is false for different strings of the same length", () => {
		expect(constantTimeStringEqual("sk-live-abc123", "sk-live-abc124")).toBe(false);
	});

	test("is false — not a throw — for different lengths", () => {
		expect(constantTimeStringEqual("short", "a-much-longer-api-key")).toBe(false);
	});

	test("is true for two empty strings, false when only one is empty", () => {
		expect(constantTimeStringEqual("", "")).toBe(true);
		expect(constantTimeStringEqual("", "key")).toBe(false);
		expect(constantTimeStringEqual("key", "")).toBe(false);
	});
});
