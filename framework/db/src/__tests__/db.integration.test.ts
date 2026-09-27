import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
// @lore this file uses createTestDb() directly (not the fixture) because it tests the createTestDb API itself.
import { createTestDb } from "../__testing__/test-utils.js";
import { serverConfig } from "../schema.js";

// @lore server_config is a real table with a text PK, enough to prove basic CRUD + uniqueness.
describe("createTestDb", () => {
	it("creates an in-memory database that can execute queries", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		try {
			const result = await db.select().from(serverConfig);
			expect(result).toEqual([]);
		} finally {
			await close();
		}
	});

	it("inserts and queries server_config", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		const now = new Date().toISOString();
		try {
			await db.insert(serverConfig).values({ id: "default", config: "{}", updatedAt: now });

			const result = await db.select().from(serverConfig).where(eq(serverConfig.id, "default"));

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: "default",
				config: "{}",
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
			await db.insert(serverConfig).values({ id: "default", config: "{}", updatedAt: now });

			await expect(
				db.insert(serverConfig).values({ id: "default", config: "{}", updatedAt: now }),
			).rejects.toThrow();
		} finally {
			await close();
		}
	});
});
