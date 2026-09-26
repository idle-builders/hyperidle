/**
 * P2 — User schema: users table shape, kind column, avatarUrl nullable.
 *
 * @lore P2: "founder" role is NOT in the USER_ROLES union — it is valid text
 * stored in the role column of a human user. Tests must not assert that "founder"
 * is a member of USER_ROLES. The role column is typed as text, not constrained.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
// P2: import new symbols — these will fail to compile until implementation is done
import { type NewUser, type User, users } from "../schema.js";

const NOW = new Date().toISOString();

describe("P2 — users table schema (AC1, AC2, AC9)", () => {
	// -------------------------------------------------------------------------
	// AC1: agents table renamed to users; kind column added
	// -------------------------------------------------------------------------
	describe("AC1: table renamed to users with kind column", () => {
		test("users table exists after migration", async ({ db }) => {
			const result = await db.execute(
				`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename` as Parameters<
					typeof db.execute
				>[0],
			);
			const tableNames = (result as { rows: Array<{ tablename: string }> }).rows.map(
				(r) => r.tablename,
			);

			expect(tableNames).toContain("users");
			expect(tableNames).not.toContain("agents");
		});

		test("users table has kind column with default value ai", async ({ db }) => {
			const result = await db.execute(
				`SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public' AND column_name = 'kind'` as Parameters<
					typeof db.execute
				>[0],
			);
			const rows =
				// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
				(
					result as {
						rows: Array<{
							column_name: string;
							column_default: string | null;
							is_nullable: string;
						}>;
					}
				).rows;
			expect(rows[0]).toBeDefined();
			expect(rows[0]?.column_default).toContain("ai");
			expect(rows[0]?.is_nullable).toBe("NO");
		});

		test("inserts an AI user with kind defaulting to ai", async ({ db }) => {
			const aiUser: NewUser = {
				id: "u-test-ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				createdAt: NOW,
			};

			await db.insert(users).values(aiUser);

			const rows = await db.select().from(users).where(eq(users.id, "u-test-ai"));
			expect(rows[0]).toBeDefined();
			expect(rows[0]).toMatchObject({ kind: "ai" });
		});

		test("inserts a human user with kind = human", async ({ db }) => {
			const humanUser: NewUser = {
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			};

			await db.insert(users).values(humanUser);

			const rows = await db.select().from(users).where(eq(users.id, "u-founder"));
			expect(rows[0]).toBeDefined();
			// role column is text — "founder" is valid even though it is not in USER_ROLES union
			expect(rows[0]).toMatchObject({ kind: "human", role: "founder" });
		});

		test("inferred User type has kind and avatarUrl fields", () => {
			// Type-level check: compile-time assertion that the inferred type has the fields.
			// If the schema is wrong this file will fail to compile (red phase).
			const user = {} as User;
			// Access the new fields — this will be a type error if the fields don't exist
			const Kind: string = user.kind;
			const AvatarUrl: string | null = user.avatarUrl;
			// Suppress unused variable lint
			void Kind;
			void AvatarUrl;
		});
	});

	// -------------------------------------------------------------------------
	// AC2: human-specific nullable column: avatarUrl
	// -------------------------------------------------------------------------
	describe("AC2: avatarUrl is nullable", () => {
		test("inserts an AI user with null avatarUrl", async ({ db }) => {
			const aiUser: NewUser = {
				id: "u-ai-no-avatar",
				kind: "ai",
				name: "No Avatar Bot",
				role: "builder",
				status: "active",
				avatarUrl: null,
				createdAt: NOW,
			};

			await db.insert(users).values(aiUser);

			const rows = await db.select().from(users).where(eq(users.id, "u-ai-no-avatar"));
			expect(rows[0]).toBeDefined();
			expect(rows[0]).toMatchObject({ avatarUrl: null });
		});

		test("inserts a human user with avatarUrl populated", async ({ db }) => {
			const humanUser: NewUser = {
				id: "u-human-with-profile",
				kind: "human",
				name: "Test Human",
				role: "founder",
				status: "active",
				avatarUrl: "https://cdn.example.com/avatar.png",
				createdAt: NOW,
			};

			await db.insert(users).values(humanUser);

			const rows = await db.select().from(users).where(eq(users.id, "u-human-with-profile"));
			expect(rows[0]).toBeDefined();
			expect(rows[0]).toMatchObject({
				avatarUrl: "https://cdn.example.com/avatar.png",
			});
		});

		test("avatar_url column exists and allows null; the users table has no email column", async ({
			db,
		}) => {
			const result = await db.execute(
				`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public' AND column_name IN ('email', 'avatar_url')` as Parameters<
					typeof db.execute
				>[0],
			);
			const cols = new Map(
				// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
				(result as { rows: Array<{ column_name: string; is_nullable: string }> }).rows.map((r) => [
					r.column_name,
					r.is_nullable,
				]),
			);

			expect(cols.has("email")).toBe(false);
			expect(cols.get("avatar_url")).toBe("YES"); // nullable
		});
	});

	// -------------------------------------------------------------------------
	// AC9: migrations include 0017 with expected schema
	// -------------------------------------------------------------------------
	describe("AC9: migration 0017 creates the org_edges table", () => {
		test("migration creates org_edges table", async ({ db }) => {
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

		test("org_edges table has correct columns", async ({ db }) => {
			const result = await db.execute(
				`SELECT column_name FROM information_schema.columns WHERE table_name = 'org_edges' AND table_schema = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
			const colNames = (result as { rows: Array<{ column_name: string }> }).rows.map(
				(r) => r.column_name,
			);

			expect(colNames).toContain("id");
			expect(colNames).toContain("from_user_id");
			expect(colNames).toContain("mechanism");
			expect(colNames).toContain("target");
			expect(colNames).toContain("created_at");
		});
	});
});
