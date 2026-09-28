import { describe, expect, it } from "vitest";
import { createTestDb } from "../__testing__/test-utils.js";
import { DEFAULT_PG_POOL_SIZE, parsePgPoolSize } from "../connection.js";

describe("PostgreSQL pool-size parsing", () => {
	it("parsePgPoolSize returns default when undefined", () => {
		expect(parsePgPoolSize(undefined)).toBe(DEFAULT_PG_POOL_SIZE);
		expect(DEFAULT_PG_POOL_SIZE).toBe(10);
	});

	it("parsePgPoolSize accepts numeric strings (env-var path)", () => {
		expect(parsePgPoolSize("15")).toBe(15);
	});

	it("parsePgPoolSize returns override when positive integer", () => {
		expect(parsePgPoolSize(25)).toBe(25);
	});

	it("parsePgPoolSize rejects non-positive and non-integer", () => {
		expect(() => parsePgPoolSize(0)).toThrow();
		expect(() => parsePgPoolSize(-5)).toThrow();
		expect(() => parsePgPoolSize(1.5)).toThrow();
		expect(() => parsePgPoolSize("nope")).toThrow();
	});
});

describe("in-memory Postgres via pglite (drizzle-orm/pglite)", () => {
	it("createTestDb returns a usable Drizzle instance", { timeout: 15_000 }, async () => {
		const { db, close } = await createTestDb();
		try {
			// Exercise the driver — bare SELECT should work on an empty DB.
			const result = await db.execute("SELECT 1 AS one" as Parameters<typeof db.execute>[0]);
			// pglite result rows shape: { rows: [...] }
			const rows = (result as { rows: Array<{ one: number }> }).rows;
			expect(rows[0]?.one).toBe(1);
		} finally {
			await close();
		}
	});
});
