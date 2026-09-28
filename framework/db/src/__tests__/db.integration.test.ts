import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../__testing__/test-utils.js";
import { teams } from "../schema.js";

describe("createTestDb", () => {
	it("creates an in-memory database that can execute queries", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		try {
			const result = await db.select().from(teams);
			expect(result).toEqual([]);
		} finally {
			await close();
		}
	});

	it("inserts and queries a team row", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		const now = new Date().toISOString();
		try {
			await db.insert(teams).values({ id: "t-default", name: "Default", createdAt: now });

			const result = await db.select().from(teams).where(eq(teams.id, "t-default"));

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: "t-default",
				name: "Default",
				createdAt: now,
			});
		} finally {
			await close();
		}
	});

	it("enforces primary key uniqueness", { timeout: 30_000 }, async () => {
		const { db, close } = await createTestDb();
		const now = new Date().toISOString();
		try {
			await db.insert(teams).values({ id: "t-dup", name: "Dup", createdAt: now });

			await expect(
				db.insert(teams).values({ id: "t-dup", name: "Dup2", createdAt: now }),
			).rejects.toThrow();
		} finally {
			await close();
		}
	});
});
