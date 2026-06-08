/**
 * P2 — org_edges table: CRUD, unique constraint, cascade delete.
 *
 * @lore P2: org_edges has a composite unique index on (from_user_id, mechanism, target).
 * The id column is a UUID primary key for stable REST addressing. The composite
 * uniqueness prevents duplicate edges — an upsert returns the existing edge if
 * the tuple already exists.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
// P2: import new symbols — these will fail to compile until implementation is done
import { type NewOrgEdge, type NewUser, type OrgEdge, orgEdges, users } from "../schema.js";

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
			email: "human@example.com",
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

describe("P2 — org_edges table (AC5)", () => {
	// -------------------------------------------------------------------------
	// AC5: org_edges table created with correct schema
	// -------------------------------------------------------------------------
	describe("AC5: table exists with correct columns", () => {
		test("org_edges table exists after migration", async ({ db }) => {
			const result = await db.execute(
				`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename` as Parameters<
					typeof db.execute
				>[0],
			);
			const tableNames = (result as { rows: Array<{ tablename: string }> }).rows.map(
				(r) => r.tablename,
			);

			expect(tableNames).toContain("org_edges");
		});

		test("org_edges has all required columns", async ({ db }) => {
			const result = await db.execute(
				`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'org_edges' AND table_schema = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const cols = new Set(
				// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
				(result as { rows: Array<{ column_name: string }> }).rows.map((r) => r.column_name),
			);

			expect(cols.has("id")).toBe(true);
			expect(cols.has("from_user_id")).toBe(true);
			expect(cols.has("mechanism")).toBe(true);
			expect(cols.has("target")).toBe(true);
			expect(cols.has("created_at")).toBe(true);
		});

		test("org_edges_unique index exists on (from_user_id, mechanism, target)", async ({ db }) => {
			const result = await db.execute(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'org_edges' AND schemaname = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map(
				(r) => r.indexname,
			);

			expect(indexes).toContain("org_edges_unique");
		});
	});

	// -------------------------------------------------------------------------
	// AC5: CRUD operations
	// -------------------------------------------------------------------------
	describe("AC5: CRUD operations", () => {
		test("inserts and reads an org edge", async ({ db }) => {
			await seedHumanUser(db);
			await seedAiUser(db, "u-ai-1", "builder");

			const edge: NewOrgEdge = {
				id: "edge-1",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-1",
				createdAt: NOW,
			};

			await db.insert(orgEdges).values(edge);

			const rows = await db.select().from(orgEdges).where(eq(orgEdges.id, "edge-1"));
			const row = rows[0];
			expect(row).toBeDefined();
			expect((row as OrgEdge).fromUserId).toBe("u-human-1");
			expect((row as OrgEdge).mechanism).toBe("direct");
			expect((row as OrgEdge).target).toBe("u-ai-1");
		});

		test("inserts an org edge with mechanism = function", async ({ db }) => {
			await seedHumanUser(db);

			const edge: NewOrgEdge = {
				id: "edge-func-1",
				fromUserId: "u-human-1",
				mechanism: "function",
				target: "builder",
				createdAt: NOW,
			};

			await db.insert(orgEdges).values(edge);

			const rows = await db.select().from(orgEdges).where(eq(orgEdges.id, "edge-func-1"));
			expect(rows[0]).toMatchObject({ mechanism: "function", target: "builder" });
		});

		test("inserts an org edge with mechanism = team", async ({ db }) => {
			await seedHumanUser(db);

			const edge: NewOrgEdge = {
				id: "edge-team-1",
				fromUserId: "u-human-1",
				mechanism: "team",
				target: "team-alpha",
				createdAt: NOW,
			};

			await db.insert(orgEdges).values(edge);

			const rows = await db.select().from(orgEdges).where(eq(orgEdges.id, "edge-team-1"));
			expect(rows[0]).toMatchObject({ mechanism: "team", target: "team-alpha" });
		});

		test("deletes an org edge by id", async ({ db }) => {
			await seedHumanUser(db);
			await seedAiUser(db, "u-ai-2", "growth");

			await db.insert(orgEdges).values({
				id: "edge-delete-me",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-2",
				createdAt: NOW,
			});

			await db.delete(orgEdges).where(eq(orgEdges.id, "edge-delete-me"));

			const rows = await db.select().from(orgEdges).where(eq(orgEdges.id, "edge-delete-me"));
			expect(rows).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// AC5: Unique constraint prevents duplicate (from, mechanism, target) tuples
	// -------------------------------------------------------------------------
	describe("AC5: unique constraint on (fromUserId, mechanism, target)", () => {
		test("rejects a duplicate (fromUserId, mechanism, target) tuple", async ({ db }) => {
			await seedHumanUser(db);
			await seedAiUser(db, "u-ai-dup", "builder");

			const edge1: NewOrgEdge = {
				id: "edge-dup-1",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-dup",
				createdAt: NOW,
			};

			const edge2: NewOrgEdge = {
				id: "edge-dup-2",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-dup",
				createdAt: NOW,
			};

			await db.insert(orgEdges).values(edge1);

			// Second insert with same (fromUserId, mechanism, target) should throw
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

			// Different mechanism — should succeed
			await expect(
				db.insert(orgEdges).values({
					id: "edge-m2",
					fromUserId: "u-human-1",
					mechanism: "function",
					target: "builder",
					createdAt: NOW,
				}),
			).resolves.not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// AC5: CASCADE delete — deleting a user removes their org edges
	// -------------------------------------------------------------------------
	describe("AC5: cascade delete on user deletion", () => {
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

			// Delete the fromUserId user — edge should cascade-delete
			await db.delete(users).where(eq(users.id, "u-cascade-test"));

			const remaining = await db
				.select()
				.from(orgEdges)
				.where(eq(orgEdges.fromUserId, "u-cascade-test"));
			expect(remaining).toHaveLength(0);
		});
	});
});
