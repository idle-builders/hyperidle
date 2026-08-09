import { describe, expect, test } from "vitest";

import { normalizeBase } from "../lib/base-path.js";

describe("normalizeBase", () => {
	test("passes through the default root base", () => {
		expect(normalizeBase("/")).toBe("/");
	});

	test("adds the trailing slash a subpath needs", () => {
		expect(normalizeBase("/hyperidle")).toBe("/hyperidle/");
	});

	test("keeps a well-formed subpath untouched", () => {
		expect(normalizeBase("/hyperidle/")).toBe("/hyperidle/");
	});

	test("trims surrounding whitespace", () => {
		expect(normalizeBase("  /site/  ")).toBe("/site/");
	});

	test("rejects an empty value", () => {
		expect(() => normalizeBase("")).toThrow(/must not be empty/);
	});

	test("rejects a value without a leading slash", () => {
		expect(() => normalizeBase("hyperidle/")).toThrow(/must start with/);
	});
});
