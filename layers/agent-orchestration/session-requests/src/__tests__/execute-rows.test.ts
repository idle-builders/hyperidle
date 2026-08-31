import { describe, expect, it } from "vitest";
import { executeRows } from "../execute-rows.js";

describe("executeRows", () => {
	it("normalizes postgres-js array results", () => {
		expect(executeRows([{ id: "postgres-js" }])).toEqual([{ id: "postgres-js" }]);
	});

	it("normalizes PGlite rows-wrapper results", () => {
		expect(executeRows({ rows: [{ id: "pglite" }] })).toEqual([{ id: "pglite" }]);
	});
});
