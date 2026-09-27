/**
 * org_edges has a composite unique index on (from_user_id, mechanism, target) — an insert with the
 * same tuple must be rejected — and cascades on the referenced user's deletion.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { type NewUser, orgEdges, users } from "../schema.js";

const NOW = new Date().toISOString();

async function seedHumanUser(db: HyperIdleDb, id = "u-human-1"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "Test Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		} satisfies NewUser)
		.onConflictDoNothing();
}

async function seedAiUser(db: HyperIdleDb, id: string, role = "builder"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "ai",
			name: `AI User ${id}`,
			role,
			status: "active",
			createdAt: NOW,
		} satisfies NewUser)
		.onConflictDoNothing();
}

describe("org_edges", () => {
	// -------------------------------------------------------------------------
	// unique constraint prevents duplicate (from, mechanism, target) tuples
	// -------------------------------------------------------------------------
	describe("unique constraint on (fromUserId, mechanism, target)", () => {
		test("rejects a duplicate (fromUserId, mechanism, target) tuple", async ({ db }) => {
			await seedHumanUser(db);
			await seedAiUser(db, "u-ai-dup", "builder");

			const edge1: typeof orgEdges.$inferInsert = {
				id: "edge-dup-1",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-dup",
				createdAt: NOW,
			};

			const edge2: typeof orgEdges.$inferInsert = {
				id: "edge-dup-2",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-dup",
				createdAt: NOW,
			};

			await db.insert(orgEdges).values(edge1);

			await expect(db.insert(orgEdges).values(edge2)).rejects.toThrow();
		});

		test("allows same fromUserId with different mechanism", async ({ db }) => {
			await seedHumanUser(db);
			await seedAiUser(db, "u-ai-mech", "builder");

			await db.insert(orgEdges).values({
				id: "edge-m1",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-mech",
				createdAt: NOW,
			});

			await db.insert(orgEdges).values({
				id: "edge-m2",
				fromUserId: "u-human-1",
				mechanism: "function",
				target: "builder",
				createdAt: NOW,
			});

			const rows = await db.select().from(orgEdges).where(eq(orgEdges.fromUserId, "u-human-1"));
			expect(rows.map((r) => r.mechanism).sort()).toEqual(["direct", "function"]);
		});
	});

	// -------------------------------------------------------------------------
	// cascade delete — deleting a user removes their org edges
	// -------------------------------------------------------------------------
	describe("cascade delete on user deletion", () => {
		test("deleting a user cascades to their org edges", async ({ db }) => {
			await seedHumanUser(db, "u-cascade-test");
			await seedAiUser(db, "u-ai-cascade", "builder");

			await db.insert(orgEdges).values({
				id: "edge-cascade-1",
				fromUserId: "u-cascade-test",
				mechanism: "direct",
				target: "u-ai-cascade",
				createdAt: NOW,
			});

			await db.delete(users).where(eq(users.id, "u-cascade-test"));

			const remaining = await db
				.select()
				.from(orgEdges)
				.where(eq(orgEdges.fromUserId, "u-cascade-test"));
			expect(remaining).toHaveLength(0);
		});
	});
});
