import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { seed } from "../seed.js";
import { createTestDb } from "../test-utils.js";

describe("A2: Seed script", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	// --- AC4: Seed populates ≥1 row per major table ---
	it("populates at least 1 row per major table", () => {
		seed(db);

		const majorTables = ["agents", "teams", "products", "knowledge_items", "factory_settings"];

		for (const table of majorTables) {
			const result = db.get<{ count: number }>(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
			expect(result?.count, `${table} should have ≥1 row`).toBeGreaterThanOrEqual(1);
		}
	});

	it("seed data is well-formed (queryable without errors)", () => {
		seed(db);

		// Verify we can read back with all fields
		const product = db.get<{ id: string; name: string }>(
			sql`SELECT id, name FROM products LIMIT 1`,
		);
		expect(product?.id).toBeTruthy();
		expect(product?.name).toBeTruthy();

		const agent = db.get<{ id: string; name: string; role: string }>(
			sql`SELECT id, name, role FROM agents LIMIT 1`,
		);
		expect(agent?.id).toBeTruthy();
		expect(agent?.name).toBeTruthy();
		expect(agent?.role).toBeTruthy();

		const team = db.get<{ id: string; capacity: number }>(
			sql`SELECT id, capacity FROM teams LIMIT 1`,
		);
		expect(team?.id).toBeTruthy();
		expect(team?.capacity).toBeGreaterThan(0);

		const ki = db.get<{ id: string; layer: string; version: number }>(
			sql`SELECT id, layer, version FROM knowledge_items LIMIT 1`,
		);
		expect(ki?.id).toBeTruthy();
		expect(ki?.layer).toBeTruthy();
		expect(ki?.version).toBeGreaterThanOrEqual(1);
	});

	it("is idempotent (running twice does not error)", () => {
		seed(db);
		// Second run should not throw (uses INSERT OR IGNORE or similar)
		expect(() => seed(db)).not.toThrow();
	});
});
