/**
 * AD8a — agentCategory 'personal' → 'individual' rename
 *
 * AC-1: Integration test verifying the schema migration and type update.
 * The `agentCategory` column is an unconstrained text column. After the AD8a
 * migration (0027_AD8a_agent_type_rename.sql), the value 'individual' must be
 * accepted and 'personal' must no longer exist in the database.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { applyFactoryBootstrap } from "../factory-bootstrap.js";
import { users } from "../schema.js";

describe("AD8a — agentCategory 'individual' rename", () => {
	test("insert and read back a user with agentCategory 'individual'", async ({ db }) => {
		const id = "test-agent-ad8a";
		await db.insert(users).values({
			id,
			name: "AD8a Test Agent",
			kind: "ai",
			role: "assistant",
			status: "active",
			createdAt: new Date().toISOString(),
			agentCategory: "individual",
		});
		const [row] = await db.select().from(users).where(eq(users.id, id));
		expect(row?.agentCategory).toBe("individual");
	});

	test("after seeding, no user rows have agentCategory 'personal'", async ({ db }) => {
		// Seed the database with all seed data. Before AD8a code changes are applied,
		// seed.ts inserts agentCategory: "personal" for the system agent. This test
		// verifies that after the migration + code changes, 'personal' is gone.
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		// @lore AD8a: The cast is intentional — asserting that no row with the OLD value exists.
		// This assertion guards against stale seed data.
		const oldValue = "personal" as unknown as string;
		const rows = await db.select().from(users).where(eq(users.agentCategory, oldValue));
		expect(rows).toHaveLength(0);
	});

	test("after seeding, seed-agent-cos has agentCategory 'individual'", async ({ db }) => {
		await applyFactoryBootstrap(db);
		await seedDemoWorld(db);

		const [cosRow] = await db.select().from(users).where(eq(users.id, "seed-agent-cos"));
		expect(cosRow?.agentCategory).toBe("individual");
	});
});
