import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	bets,
	knowledgeEditLog,
	messages,
	sessions,
	tasks,
	// @lore U1: `teams` is the domain entity (formerly `products`).
	teams,
	threads,
	users,
} from "../schema.js";

describe("A2: Database Schema", () => {
	// --- AC1: Migrations apply to fresh PGlite without errors ---
	describe("AC1: migrations apply correctly", () => {
		test("creates all current tables", async ({ db }) => {
			// L1a: `responses` table dropped (plan §5.2). Verdicts now project
			// as `verdict`-typed messages. Knowledge_conflicts and
			// notification_queue were added in earlier migrations.
			const result = await db.execute(
				`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_l1_snapshot_%' ORDER BY tablename` as Parameters<
					typeof db.execute
				>[0],
			);
			const tableNames = (result as { rows: Array<{ name: string }> }).rows.map((r) => r.name);

			expect(tableNames).toEqual(
				expect.arrayContaining([
					// @lore P2: agents → users
					// @lore U1: `products` → `teams`; old `teams` → `team_members`
					"users",
					"bets",
					// @lore AU18: `factory_settings` retired — `server_config` is its
					// typed singleton-row successor.
					"server_config",
					"",
					"knowledge_edit_log",
					"knowledge_",
					"messages",
					"",
					"sessions",
					"tasks",
					"teams",
					"threads",
				]),
			);
			expect(tableNames).not.toContain("responses");
			// @lore U1: `products` table was renamed to `teams`
			expect(tableNames).not.toContain("products");
			// @lore AU18: factory_settings dropped — must not reappear.
			expect(tableNames).not.toContain("factory_settings");
			// @lore AU30: `user_skills` dropped. Exact-absence, because the expected
			// list above is `arrayContaining` and tolerates extras — see the longer
			// note in migration.integration.test.ts.
			expect(tableNames).not.toContain("user_skills");
			expect(tableNames.length).toBeGreaterThanOrEqual(15);
		});
	});

	// --- AC2: All tables insert/read/update correctly with full type safety ---
	describe("AC2: CRUD operations", () => {
		// @lore U1: `products` renamed to `teams`.
		test("inserts and reads teams (formerly products)", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "prod-1",
				name: "Acme",
				phase: "build",
				createdAt: now,
			});

			const result = await db.select().from(teams).where(eq(teams.id, "prod-1"));

			expect(result[0]).toMatchObject({
				id: "prod-1",
				name: "Acme",
				phase: "build",
			});
		});

		test("inserts and reads users (AI kind)", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
				createdAt: now,
			});

			const result = await db.select().from(users).where(eq(users.id, "agent-1"));

			expect(result[0]).toMatchObject({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
			});
		});
	});
	// --- AC3: knowledge_ kernel indexes exist; strategy indexes on extension table ---
	describe("AC3: knowledge_ indexes", () => {
		test("has indexes on topic, status (kernel table)", async ({ db }) => {
			// @lore O2: layer, scope_id, kind indexes removed from kernel table.
			// They now live on knowledge_app_projection.
			const result = await db.execute(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_' AND schemaname = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map(
				(r) => r.indexname,
			);

			// Should have at least 3 indexes (PK + topic + status/updated_at)
			expect(indexes.length).toBeGreaterThanOrEqual(3);
		});

		test("knowledge_app_projection has index on knowledge_item_id", async ({ db }) => {
			// @lore O2: strategy-layer indexes live on the extension table.
			const result = await db.execute(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_app_projection' AND schemaname = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map(
				(r) => r.indexname,
			);

			expect(indexes.length).toBeGreaterThanOrEqual(1);
		});
	});

	// --- AC6: Foreign key constraints enforced ---
	describe("AC6: foreign key constraints", () => {
		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		test("rejects task with invalid bet_id", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "P", phase: "build", createdAt: now });

			await expect(
				db.insert(tasks).values({
					id: "task-1",
					betId: "nonexistent-bet",
					teamId: "prod-1",
					title: "T",
					state: "proposed",
					createdAt: now,
					updatedAt: now,
				}),
			).rejects.toThrow();
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		test("rejects session with invalid agent_id", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "P", phase: "build", createdAt: now });
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "prod-1",
				description: "X",
				appetite: "2w",
				status: "draft",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-1",
				betId: "bet-1",
				teamId: "prod-1",
				title: "T",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			});

			await expect(
				db.insert(sessions).values({
					id: "sess-1",
					taskId: "task-1",
					agentId: "nonexistent-agent",
					modelTier: "workhorse",
					startedAt: now,
					state: "active",
				}),
			).rejects.toThrow();
		});

		test("rejects verdict message with invalid sender_id (replaces legacy responses FK contract)", async ({
			db,
		}) => {
			// L1a: legacy `responses.item_id` FK no longer exists — `responses`
			// table dropped (plan §5.2). Replacement contract: verdict-typed
			// messages set sender_id=approver; messages.sender_id FK to
			// users.id rejects unknown senders. P2: agents → users.
			const now = new Date().toISOString();
			await db.insert(threads).values({
				id: "thread-fk",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify([]),
				lastActiveAt: now,
				createdAt: now,
			});
			await expect(
				db.insert(messages).values({
					id: "verdict-fk",
					senderId: "nonexistent-agent",
					threadId: "thread-fk",
					type: "verdict",
					payload: JSON.stringify({ decision: "approve" }),
					clientKey: "verdict-fk",
					createdAt: now,
				}),
			).rejects.toThrow();
		});

		test("rejects knowledge_edit_log with invalid item_id", async ({ db }) => {
			const now = new Date().toISOString();
			await expect(
				db.insert(knowledgeEditLog).values({
					id: "kel-1",
					itemId: "nonexistent-ki",
					editor: "human-1",
					field: "title",
					oldValue: "Old",
					newValue: "New",
					editType: "update",
					createdAt: now,
				}),
			).rejects.toThrow();
		});
	});
});
