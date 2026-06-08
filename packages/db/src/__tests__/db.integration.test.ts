import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { factorySettings } from "../schema.js";
// @lore test-infra: This file keeps createTestDb() because each test manages
// its own instance lifecycle via try/finally close(), rather than using
// beforeEach/afterEach. The fixture handles the pool pattern but these tests
// intentionally test the createTestDb API itself and need explicit close().
import { createTestDb } from "../test-utils.js";

describe("createTestDb", () => {
	it("creates an in-memory database that can execute queries", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		try {
			const result = await db.select().from(factorySettings);
			expect(result).toEqual([]);
		} finally {
			await close();
		}
	});

	it("inserts and queries factory_settings", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		const now = new Date().toISOString();
		try {
			await db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: now });

			const result = await db
				.select()
				.from(factorySettings)
				.where(eq(factorySettings.key, "cost_cap"));

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				key: "cost_cap",
				value: "1000",
				updatedAt: now,
			});
		} finally {
			await close();
		}
	});

	it("enforces primary key uniqueness", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		const now = new Date().toISOString();
		try {
			await db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: now });

			await expect(
				db.insert(factorySettings).values({ key: "cost_cap", value: "2000", updatedAt: now }),
			).rejects.toThrow();
		} finally {
			await close();
		}
	});
});
