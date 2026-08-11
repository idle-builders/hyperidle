import { describe, expect, test } from "vitest";
import { makeScopedIds } from "../__testing__/scoped-ids.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("makeScopedIds", () => {
	test("same label resolves to the same id within one maker", () => {
		const ids = makeScopedIds();
		expect(ids("t1")).toBe(ids("t1"));
		expect(ids("team-1")).toBe(ids("team-1"));
	});

	test("every derived id is a canonical RFC-9562 v4-shaped UUID", () => {
		const ids = makeScopedIds();
		expect(ids("t1")).toMatch(UUID_V4);
		expect(ids("other")).toMatch(UUID_V4);
		expect(ids.next()).toMatch(UUID_V4);
	});

	test("two makers give different ids for the same label", () => {
		const a = makeScopedIds();
		const b = makeScopedIds();
		expect(a("t1")).not.toBe(b("t1"));
	});

	test("different labels within one maker give different ids", () => {
		const ids = makeScopedIds();
		const seen = new Set(["t1", "t2", "team-1", "tm-1", "t1-team"].map((l) => ids(l)));
		expect(seen.size).toBe(5);
	});

	test("next() never equals a label-derived value and never repeats", () => {
		const ids = makeScopedIds();
		const labelIds = new Set(["t1", "t2", "next", "0", "1"].map((l) => ids(l)));
		const nexts = new Set<string>();
		for (let i = 0; i < 50; i += 1) {
			const value = ids.next();
			expect(labelIds.has(value)).toBe(false);
			nexts.add(value);
		}
		expect(nexts.size).toBe(50);
	});
});
