import { describe, expect, test } from "vitest";
import { loadWaivers, parseWaivers } from "../waivers.js";

describe("parseWaivers", () => {
	test("groups backtick entries under their rule heading", () => {
		const sets = parseWaivers(
			[
				"# Waivers",
				"",
				"Prose that is ignored.",
				"",
				"## no-literal-entity-ids",
				"",
				"- `layers/core-api/src/__tests__/a.integration.test.ts`",
				"- `framework/db/src/__tests__/b.integration.test.ts`",
				"",
				"## no-unscoped-table-read",
				"",
				"- `layers/core-api/src/__tests__/c.integration.test.ts`",
				"",
			].join("\n"),
		);
		expect([...(sets["no-literal-entity-ids"] ?? [])]).toEqual([
			"layers/core-api/src/__tests__/a.integration.test.ts",
			"framework/db/src/__tests__/b.integration.test.ts",
		]);
		expect([...(sets["no-unscoped-table-read"] ?? [])]).toEqual([
			"layers/core-api/src/__tests__/c.integration.test.ts",
		]);
	});

	test("empty markdown gives no sets", () => {
		expect(parseWaivers("")).toEqual({});
	});
});

describe("loadWaivers", () => {
	test("reads the real waivers.md with both ratchet sections", () => {
		const sets = loadWaivers();
		expect(sets["no-literal-entity-ids"]).toBeInstanceOf(Set);
		expect(sets["no-unscoped-table-read"]).toBeInstanceOf(Set);
	});
});
