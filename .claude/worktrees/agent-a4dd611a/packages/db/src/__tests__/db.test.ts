import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { factorySettings } from "../schema.js";
import { createTestDb } from "../test-utils.js";

describe("createTestDb", () => {
	it("creates an in-memory database that can execute queries", () => {
		const db = createTestDb();
		const result = db.select().from(factorySettings).all();
		expect(result).toEqual([]);
	});

	it("inserts and queries factory_settings", () => {
		const db = createTestDb();
		const now = new Date().toISOString();

		db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: now }).run();

		const result = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "cost_cap"))
			.get();

		expect(result).toEqual({
			key: "cost_cap",
			value: "1000",
			updatedAt: now,
		});
	});

	it("enforces primary key uniqueness", () => {
		const db = createTestDb();
		const now = new Date().toISOString();

		db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: now }).run();

		expect(() =>
			db.insert(factorySettings).values({ key: "cost_cap", value: "2000", updatedAt: now }).run(),
		).toThrow();
	});
});
