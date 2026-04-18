import { describe, expect, it } from "vitest";
import { DEFAULT_PG_POOL_SIZE, parsePgPoolSize } from "../pg-connection.js";
import { createPgTestDb } from "../pg-test-utils.js";

describe("H4 AC5: PostgreSQL connection pooling", () => {
	it("exposes a documented default pool size of 10", () => {
		expect(DEFAULT_PG_POOL_SIZE).toBe(10);
	});

	it("parsePgPoolSize returns default when undefined", () => {
		expect(parsePgPoolSize(undefined)).toBe(DEFAULT_PG_POOL_SIZE);
	});

	it("parsePgPoolSize returns override when positive integer", () => {
		expect(parsePgPoolSize(25)).toBe(25);
	});

	it("parsePgPoolSize rejects non-positive", () => {
		expect(() => parsePgPoolSize(0)).toThrow();
		expect(() => parsePgPoolSize(-5)).toThrow();
	});
});

describe("H4 AC3/AC4: In-memory Postgres via pglite (drizzle-orm/pglite)", () => {
	it("createPgTestDb returns a usable Drizzle instance", async () => {
		const { db, close } = await createPgTestDb();
		try {
			// Exercise the driver — bare SELECT should work on an empty DB.
			const result = await db.execute("SELECT 1 AS one");
			// pglite result rows shape: { rows: [...] }
			const rows = (result as { rows: Array<{ one: number }> }).rows;
			expect(rows[0]?.one).toBe(1);
		} finally {
			await close();
		}
	});
});
