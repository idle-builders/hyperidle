import { describe, expect, it } from "vitest";
// @lore test-infra: createTestDb is kept here because the H4 AC3/AC4 test
// manages its own instance lifecycle via try/finally close(). These tests
// explicitly test the createTestDb API itself and need direct handle access.
import { createTestDb } from "../__testing__/test-utils.js";
import {
	createPgDb,
	DEFAULT_PG_POOL_SIZE,
	PG_POOL_SIZE_ENV,
	parsePgPoolSize,
	resolvePgPoolSize,
} from "../connection.js";

describe("H4 AC5: PostgreSQL connection pooling", () => {
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

	it("resolvePgPoolSize prefers explicit override over env", () => {
		expect(
			resolvePgPoolSize({
				maxConnections: 7,
				env: { [PG_POOL_SIZE_ENV]: "99" },
			}),
		).toBe(7);
	});

	it("resolvePgPoolSize reads PG_POOL_SIZE env var when no explicit value", () => {
		expect(resolvePgPoolSize({ env: { [PG_POOL_SIZE_ENV]: "42" } })).toBe(42);
	});

	it("resolvePgPoolSize falls back to default when env is unset", () => {
		expect(resolvePgPoolSize({ env: {} })).toBe(DEFAULT_PG_POOL_SIZE);
	});

	// Honor-test: the resolved pool size must flow into the actual
	// postgres() call. We cannot connect (no real cluster in sandbox) but
	// we can assert the handle exposes the resolved value and that
	// createPgDb wired it from env.
	it("createPgDb exposes the resolved poolSize from PG_POOL_SIZE env", () => {
		const handle = createPgDb({
			url: "postgres://u:p@localhost:5432/hyperidle",
			env: { [PG_POOL_SIZE_ENV]: "17" },
		});
		try {
			expect(handle.poolSize).toBe(17);
		} finally {
			// Best effort — no server to close against, but postgres-js lazy-connects
			// so end() with a short timeout won't block. Fire and forget.
			void handle.close();
		}
	});

	it("createPgDb explicit maxConnections wins over env", () => {
		const handle = createPgDb({
			url: "postgres://u:p@localhost:5432/hyperidle",
			maxConnections: 3,
			env: { [PG_POOL_SIZE_ENV]: "99" },
		});
		try {
			expect(handle.poolSize).toBe(3);
		} finally {
			void handle.close();
		}
	});
});

describe("H4 AC3/AC4: In-memory Postgres via pglite (drizzle-orm/pglite)", () => {
	// @lore test-infra: Uses createTestDb() directly because this test exercises
	// the createTestDb API itself and needs explicit close() via try/finally.
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
