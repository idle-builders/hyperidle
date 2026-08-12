/**
 * AD8a — agentCategory 'personal' → 'individual' rename
 *
 * AC-1: Integration test verifying the schema migration and type update.
 * The `agentCategory` column is an unconstrained text column. After the AD8a
 * migration (0027_AD8a_agent_type_rename.sql), the value 'individual' must be
 * accepted and 'personal' must no longer exist in the database.
 */

import { users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

describe("AD8a — agentCategory 'individual' rename", () => {
	test("insert and read back a user with agentCategory 'individual'", async ({ db, ids }) => {
		const id = ids("test-agent-ad8a");
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
		// @lore AU38 P10: diff before/after — in a populated world another test may
		// have inserted 'personal' rows; assert seeding didn't ADD any.
		const oldValue = "personal" as unknown as string;
		const before = await db.select().from(users).where(eq(users.agentCategory, oldValue));
		const beforeCount = before.length;

		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const after = await db.select().from(users).where(eq(users.agentCategory, oldValue));
		expect(after.length - beforeCount).toBe(0);
	});

	test("after seeding, seed-agent-cos has agentCategory 'individual'", async ({ db }) => {
		await runFactoryBootstrap(db);
		await seedDemoWorld(db);

		const [cosRow] = await db.select().from(users).where(eq(users.id, "seed-agent-cos"));
		expect(cosRow?.agentCategory).toBe("individual");
	});
});
