/**
 * P2 RED — User schema: users table shape, kind column, email/avatarUrl nullable,
 * user_skills table has user_id column.
 *
 * These tests FAIL until:
 *  - Migration 0017 renames agents -> users and adds kind/email/avatar_url columns
 *  - Migration 0017 renames agent_skills -> user_skills and renames agent_id -> user_id
 *  - schema.ts exports `users`, `userSkills` tables and `User`/`NewUser`/`UserSkill`/`NewUserSkill` types
 *  - index.ts re-exports all new symbols
 *
 * @lore P2: "founder" role is NOT in the USER_ROLES union — it is valid text
 * stored in the role column of a human user. Tests must not assert that "founder"
 * is a member of USER_ROLES. The role column is typed as text, not constrained.
 */

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
// P2: import new symbols — these will fail to compile until implementation is done
import {
	type NewUser,
	type NewUserSkill,
	type User,
	type UserSkill,
	userSkills,
	users,
} from "../schema.js";
import { createTestDb } from "../test-utils.js";

const NOW = new Date().toISOString();

describe("P2 — users table schema (AC1, AC2, AC9)", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	// -------------------------------------------------------------------------
	// AC1: agents table renamed to users; kind column added
	// -------------------------------------------------------------------------
	describe("AC1: table renamed to users with kind column", () => {
		it("users table exists after migration", () => {
			const tableNames = db
				.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
				.map((r) => r.name);

			expect(tableNames).toContain("users");
			expect(tableNames).not.toContain("agents");
		});

		it("users table has kind column with default value ai", () => {
			const cols = db
				.all<{ name: string; dflt_value: string | null; notnull: number }>(
					sql`PRAGMA table_info(users)`,
				)
				.reduce<Record<string, { dflt_value: string | null; notnull: number }>>((acc, col) => {
					acc[col.name] = { dflt_value: col.dflt_value, notnull: col.notnull };
					return acc;
				}, {});

			expect(cols["kind"]).toBeDefined();
			expect(cols["kind"]).toMatchObject({ dflt_value: "'ai'", notnull: 1 });
		});

		it("inserts an AI user with kind defaulting to ai", () => {
			const aiUser: NewUser = {
				id: "u-test-ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				createdAt: NOW,
			};

			db.insert(users).values(aiUser).run();

			const row = db.select().from(users).where(eq(users.id, "u-test-ai")).get();
			expect(row).toBeDefined();
			expect(row).toMatchObject({ kind: "ai" });
		});

		it("inserts a human user with kind = human", () => {
			const humanUser: NewUser = {
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@hyperidle.com",
				createdAt: NOW,
			};

			db.insert(users).values(humanUser).run();

			const row = db.select().from(users).where(eq(users.id, "u-founder")).get();
			expect(row).toBeDefined();
			// role column is text — "founder" is valid even though it is not in USER_ROLES union
			expect(row).toMatchObject({ kind: "human", role: "founder" });
		});

		it("inferred User type has kind, email, avatarUrl fields", () => {
			// Type-level check: compile-time assertion that the inferred type has the fields.
			// If the schema is wrong this file will fail to compile (red phase).
			const user = {} as User;
			// Access the new fields — this will be a type error if the fields don't exist
			const Kind: string = user.kind;
			const Email: string | null = user.email;
			const AvatarUrl: string | null = user.avatarUrl;
			// Suppress unused variable lint
			void Kind;
			void Email;
			void AvatarUrl;
		});
	});

	// -------------------------------------------------------------------------
	// AC2: human-specific nullable columns: email, avatarUrl
	// -------------------------------------------------------------------------
	describe("AC2: email and avatarUrl are nullable", () => {
		it("inserts an AI user with null email and null avatarUrl", () => {
			const aiUser: NewUser = {
				id: "u-ai-no-email",
				kind: "ai",
				name: "No Email Bot",
				role: "builder",
				status: "active",
				email: null,
				avatarUrl: null,
				createdAt: NOW,
			};

			db.insert(users).values(aiUser).run();

			const row = db.select().from(users).where(eq(users.id, "u-ai-no-email")).get();
			expect(row).toBeDefined();
			expect(row).toMatchObject({ email: null, avatarUrl: null });
		});

		it("inserts a human user with email and avatarUrl populated", () => {
			const humanUser: NewUser = {
				id: "u-human-with-profile",
				kind: "human",
				name: "Test Human",
				role: "founder",
				status: "active",
				email: "human@example.com",
				avatarUrl: "https://cdn.example.com/avatar.png",
				createdAt: NOW,
			};

			db.insert(users).values(humanUser).run();

			const row = db.select().from(users).where(eq(users.id, "u-human-with-profile")).get();
			expect(row).toBeDefined();
			expect(row).toMatchObject({
				email: "human@example.com",
				avatarUrl: "https://cdn.example.com/avatar.png",
			});
		});

		it("email column exists in PRAGMA table_info and allows null", () => {
			const cols = db
				.all<{ name: string; notnull: number }>(sql`PRAGMA table_info(users)`)
				.reduce<Record<string, { notnull: number }>>((acc, col) => {
					acc[col.name] = { notnull: col.notnull };
					return acc;
				}, {});

			expect(cols["email"]).toBeDefined();
			expect(cols["email"]).toMatchObject({ notnull: 0 }); // nullable

			expect(cols["avatar_url"]).toBeDefined();
			expect(cols["avatar_url"]).toMatchObject({ notnull: 0 }); // nullable
		});
	});

	// -------------------------------------------------------------------------
	// AC1 + critique: user_skills table has user_id column (not agent_id)
	// -------------------------------------------------------------------------
	describe("AC1 (critique): user_skills table has user_id column", () => {
		it("user_skills table exists and does NOT have agent_id column", () => {
			const tableNames = db
				.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
				.map((r) => r.name);

			expect(tableNames).toContain("user_skills");
			expect(tableNames).not.toContain("agent_skills");
		});

		it("user_skills table has user_id column, not agent_id", () => {
			const colNames = db
				.all<{ name: string }>(sql`PRAGMA table_info(user_skills)`)
				.map((c) => c.name);

			expect(colNames).toContain("user_id");
			expect(colNames).not.toContain("agent_id");
		});

		it("inserts a user_skill row with userId field", () => {
			// Seed a user first (FK constraint)
			db.insert(users)
				.values({
					id: "u-skill-test",
					kind: "ai",
					name: "Skill Bot",
					role: "builder",
					status: "active",
					createdAt: NOW,
				})
				.run();

			const skill: NewUserSkill = {
				userId: "u-skill-test",
				skillId: "coding",
				autonomyLevel: 2,
			};

			db.insert(userSkills).values(skill).run();

			const row = db.select().from(userSkills).where(eq(userSkills.userId, "u-skill-test")).get();
			expect(row).toBeDefined();
			expect((row as UserSkill).userId).toBe("u-skill-test");
		});
	});

	// -------------------------------------------------------------------------
	// AC9: migrations include 0017 with expected schema
	// -------------------------------------------------------------------------
	describe("AC9: migration 0017 creates users and user_skills tables", () => {
		it("migration creates org_edges table", () => {
			const tableNames = db
				.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
				.map((r) => r.name);

			expect(tableNames).toContain("org_edges");
		});

		it("org_edges table has correct columns", () => {
			const colNames = db
				.all<{ name: string }>(sql`PRAGMA table_info(org_edges)`)
				.map((c) => c.name);

			expect(colNames).toContain("id");
			expect(colNames).toContain("from_user_id");
			expect(colNames).toContain("mechanism");
			expect(colNames).toContain("target");
			expect(colNames).toContain("created_at");
		});
	});
});
