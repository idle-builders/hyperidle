/**
 * P2 RED — org_edges table: CRUD, unique constraint, cascade delete.
 *
 * These tests FAIL until:
 *  - Migration 0017 creates the org_edges table with the correct schema
 *  - schema.ts exports `orgEdges` table and `OrgEdge`/`NewOrgEdge` types
 *  - index.ts re-exports orgEdges, OrgEdge, NewOrgEdge
 *
 * @lore P2: org_edges has a composite unique index on (from_user_id, mechanism, target).
 * The id column is a UUID primary key for stable REST addressing. The composite
 * uniqueness prevents duplicate edges — an upsert returns the existing edge if
 * the tuple already exists.
 */

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
// P2: import new symbols — these will fail to compile until implementation is done
import { type NewOrgEdge, type NewUser, type OrgEdge, orgEdges, users } from "../schema.js";
import { createTestDb } from "../test-utils.js";

const NOW = new Date().toISOString();

function seedHumanUser(db: HyperIdleDb, id = "u-human-1"): void {
	db.insert(users)
		.values({
			id,
			kind: "human",
			name: "Test Human",
			role: "founder",
			status: "active",
			email: "human@example.com",
			createdAt: NOW,
		} satisfies NewUser)
		.onConflictDoNothing()
		.run();
}

function seedAiUser(db: HyperIdleDb, id: string, role = "builder"): void {
	db.insert(users)
		.values({
			id,
			kind: "ai",
			name: `AI User ${id}`,
			role,
			status: "active",
			createdAt: NOW,
		} satisfies NewUser)
		.onConflictDoNothing()
		.run();
}

describe("P2 — org_edges table (AC5)", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	// -------------------------------------------------------------------------
	// AC5: org_edges table created with correct schema
	// -------------------------------------------------------------------------
	describe("AC5: table exists with correct columns", () => {
		it("org_edges table exists after migration", () => {
			const tableNames = db
				.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
				.map((r) => r.name);

			expect(tableNames).toContain("org_edges");
		});

		it("org_edges has all required columns", () => {
			const cols = db
				.all<{ name: string; notnull: number }>(sql`PRAGMA table_info(org_edges)`)
				.reduce<Record<string, { notnull: number }>>((acc, col) => {
					acc[col.name] = { notnull: col.notnull };
					return acc;
				}, {});

			expect(cols["id"]).toBeDefined();
			expect(cols["from_user_id"]).toBeDefined();
			expect(cols["from_user_id"]).toMatchObject({ notnull: 1 });
			expect(cols["mechanism"]).toBeDefined();
			expect(cols["mechanism"]).toMatchObject({ notnull: 1 });
			expect(cols["target"]).toBeDefined();
			expect(cols["target"]).toMatchObject({ notnull: 1 });
			expect(cols["created_at"]).toBeDefined();
			expect(cols["created_at"]).toMatchObject({ notnull: 1 });
		});

		it("org_edges_unique index exists on (from_user_id, mechanism, target)", () => {
			const indexes = db
				.all<{ name: string }>(
					sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='org_edges'`,
				)
				.map((i) => i.name);

			expect(indexes).toContain("org_edges_unique");
		});
	});

	// -------------------------------------------------------------------------
	// AC5: CRUD operations
	// -------------------------------------------------------------------------
	describe("AC5: CRUD operations", () => {
		it("inserts and reads an org edge", () => {
			seedHumanUser(db);
			seedAiUser(db, "u-ai-1", "builder");

			const edge: NewOrgEdge = {
				id: "edge-1",
				fromUserId: "u-human-1",
				mechanism: "direct",
				target: "u-ai-1",
				createdAt: NOW,
			};

			db.insert(orgEdges).values(edge).run();

			const row = db.select().from(orgEdges).where(eq(orgEdges.id, "edge-1")).get();
			expect(row).toBeDefined();
			expect((row as OrgEdge).fromUserId).toBe("u-human-1");
			expect((row as OrgEdge).mechanism).toBe("direct");
			expect((row as OrgEdge).target).toBe("u-ai-1");
		});

		it("inserts an org edge with mechanism = function", () => {
			seedHumanUser(db);

			const edge: NewOrgEdge = {
				id: "edge-func-1",
				fromUserId: "u-human-1",
				mechanism: "function",
				target: "builder",
				createdAt: NOW,
			};

			db.insert(orgEdges).values(edge).run();

			const row = db.select().from(orgEdges).where(eq(orgEdges.id, "edge-func-1")).get();
			expect(row).toBeDefined();
			expect(row).toMatchObject({ mechanism: "function", target: "builder" });
		});

		it("inserts an org edge with mechanism = team", () => {
			seedHumanUser(db);

			const edge: NewOrgEdge = {
				id: "edge-team-1",
				fromUserId: "u-human-1",
				mechanism: "team",
				target: "team-alpha",
				createdAt: NOW,
			};

			db.insert(orgEdges).values(edge).run();

			const row = db.select().from(orgEdges).where(eq(orgEdges.id, "edge-team-1")).get();
			expect(row).toBeDefined();
			expect(row).toMatchObject({ mechanism: "team", target: "team-alpha" });
		});

		it("deletes an org edge by id", () => {
			seedHumanUser(db);
			seedAiUser(db, "u-ai-2", "growth");

			db.insert(orgEdges)
				.values({
					id: "edge-delete-me",
					fromUserId: "u-human-1",
					mechanism: "direct",
					target: "u-ai-2",
					createdAt: NOW,
				})
				.run();

			db.delete(orgEdges).where(eq(orgEdges.id, "edge-delete-me")).run();

			const row = db.select().from(orgEdges).where(eq(orgEdges.id, "edge-delete-me")).get();
			expect(row).toBeUndefined();
		});
	});

	// -------------------------------------------------------------------------
	// AC5: Unique constraint prevents duplicate (from, mechanism, target) tuples
	// -------------------------------------------------------------------------
	describe("AC5: unique constraint on (fromUserId, mechanism, target)", () => {
		it("rejects a duplicate (fromUserId, mechanism, target) tuple", () => {
			seedHumanUser(db);
			seedAiUser(db, "u-ai-dup", "builder");

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

			db.insert(orgEdges).values(edge1).run();

			// Second insert with same (fromUserId, mechanism, target) should throw
			expect(() => {
				db.insert(orgEdges).values(edge2).run();
			}).toThrow();
		});

		it("allows same fromUserId with different mechanism", () => {
			seedHumanUser(db);
			seedAiUser(db, "u-ai-mech", "builder");

			db.insert(orgEdges)
				.values({
					id: "edge-m1",
					fromUserId: "u-human-1",
					mechanism: "direct",
					target: "u-ai-mech",
					createdAt: NOW,
				})
				.run();

			// Different mechanism — should succeed
			expect(() => {
				db.insert(orgEdges)
					.values({
						id: "edge-m2",
						fromUserId: "u-human-1",
						mechanism: "function",
						target: "builder",
						createdAt: NOW,
					})
					.run();
			}).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// AC5: CASCADE delete — deleting a user removes their org edges
	// -------------------------------------------------------------------------
	describe("AC5: cascade delete on user deletion", () => {
		it("deleting a user cascades to their org edges", () => {
			seedHumanUser(db, "u-cascade-test");
			seedAiUser(db, "u-ai-cascade", "builder");

			db.insert(orgEdges)
				.values({
					id: "edge-cascade-1",
					fromUserId: "u-cascade-test",
					mechanism: "direct",
					target: "u-ai-cascade",
					createdAt: NOW,
				})
				.run();

			// Delete the fromUserId user — edge should cascade-delete
			db.delete(users).where(eq(users.id, "u-cascade-test")).run();

			const remaining = db
				.select()
				.from(orgEdges)
				.where(eq(orgEdges.fromUserId, "u-cascade-test"))
				.all();
			expect(remaining).toHaveLength(0);
		});
	});
});
