import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	bets,
	items,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	routines,
	serverConfig,
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
					"items",
					"knowledge_edit_log",
					"knowledge_items",
					"messages",
					"routines",
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
				capacity: 7,
				activeBets: 2,
				formedAt: now,
			});

			const result = await db.select().from(teams).where(eq(teams.id, "prod-1"));

			expect(result[0]).toMatchObject({
				id: "prod-1",
				name: "Acme",
				phase: "build",
				capacity: 7,
				activeBets: 2,
				formedAt: now,
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

		// @lore U1: bets.productId/pitch/status simplified; teamId now refs `teams` (formerly products).
		test("inserts and reads bets", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", phase: "build", createdAt: now });
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "prod-1",
				description: "Build file upload",
				appetite: "6w",
				status: "draft",
				createdAt: now,
			});

			const result = await db.select().from(bets).where(eq(bets.id, "bet-1"));

			expect(result[0]).toMatchObject({
				id: "bet-1",
				description: "Build file upload",
				appetite: "6w",
				status: "draft",
			});
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		test("inserts and reads tasks", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", phase: "build", createdAt: now });
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
				title: "Implement upload",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			});

			const result = await db.select().from(tasks).where(eq(tasks.id, "task-1"));

			expect(result[0]).toMatchObject({
				id: "task-1",
				title: "Implement upload",
				state: "proposed",
			});
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		test("updates tasks correctly", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", phase: "build", createdAt: now });
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
				title: "Original",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			});

			await db
				.update(tasks)
				.set({ state: "in_progress", updatedAt: new Date().toISOString() })
				.where(eq(tasks.id, "task-1"));

			const result = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(result[0]?.state).toBe("in_progress");
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		test("inserts and reads sessions", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", phase: "build", createdAt: now });
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
				createdAt: now,
			});
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
			await db.insert(sessions).values({
				id: "sess-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "workhorse",
				startedAt: now,
				state: "active",
			});

			const result = await db.select().from(sessions).where(eq(sessions.id, "sess-1"));
			expect(result[0]).toMatchObject({
				id: "sess-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "workhorse",
				state: "active",
			});
		});

		test("inserts and reads routines", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "prod-1", name: "Acme", phase: "build", createdAt: now });
			await db.insert(users).values({
				id: "agent-1",
				kind: "ai",
				name: "Test Agent",
				role: "assistant",
				status: "active",
				createdAt: now,
			});
			await db.insert(routines).values({
				id: "routine-1",
				name: "Test routine",
				state: "active",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
				active: true,
			});

			const result = await db.select().from(routines).where(eq(routines.id, "routine-1"));
			expect(result[0]).toMatchObject({
				id: "routine-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				active: true,
			});
		});

		test("inserts and reads threads and messages", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(users).values([
				{
					id: "agent-1",
					kind: "ai",
					name: "A",
					role: "builder",
					status: "active",
					createdAt: now,
				},
				{
					id: "agent-2",
					kind: "ai",
					name: "B",
					role: "builder",
					status: "active",
					createdAt: now,
				},
			]);
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});
			// L1a: messages now carry type/payload/clientKey instead of
			// recipientId/subject/body (plan §5.3).
			await db.insert(messages).values({
				id: "msg-1",
				senderId: "agent-1",
				threadId: "thread-1",
				type: "plain",
				payload: JSON.stringify({ text: "Hello" }),
				clientKey: "msg-1",
				createdAt: now,
			});

			const result = await db.select().from(messages).where(eq(messages.id, "msg-1"));
			expect(result[0]).toMatchObject({
				id: "msg-1",
				senderId: "agent-1",
				type: "plain",
			});
			const payload = JSON.parse(result[0]?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Hello");
		});

		test("inserts and reads items and verdict messages", async ({ db }) => {
			// L1a: legacy `responses` table was dropped; verdict messages
			// (type='verdict', legacy_item_id) replace it (plan §5.2).
			const now = new Date().toISOString();
			await db.insert(users).values([
				{
					id: "agent-1",
					kind: "ai",
					name: "A",
					role: "builder",
					status: "active",
					createdAt: now,
				},
				{
					id: "human-1",
					kind: "human",
					name: "Human",
					role: "founder",
					status: "active",
					createdAt: now,
				},
			]);
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(items).values({
				id: "item-1",
				sourceAgentId: "agent-1",
				kind: "review",
				title: "Review upload",
				body: "Please review",
				threadId: "thread-1",
				createdAt: now,
			});

			const item = await db.select().from(items).where(eq(items.id, "item-1"));
			expect(item[0]).toMatchObject({ id: "item-1", kind: "review", title: "Review upload" });

			await db.insert(messages).values({
				id: "resp-1",
				senderId: "human-1",
				threadId: "thread-1",
				type: "verdict",
				payload: JSON.stringify({ decision: "approve" }),
				clientKey: "resp-1",
				legacyItemId: "item-1",
				createdAt: now,
			});

			const resp = await db.select().from(messages).where(eq(messages.id, "resp-1"));
			expect(resp[0]).toMatchObject({ id: "resp-1", type: "verdict", legacyItemId: "item-1" });
			const verdict = JSON.parse(resp[0]?.payload ?? "{}") as { decision: string };
			expect(verdict.decision).toBe("approve");
		});

		test("inserts and reads knowledge_items", async ({ db }) => {
			// @lore O2: layer, kind stripped from kernel table; use knowledgeAppProjection.
			const now = new Date().toISOString();
			await db.insert(knowledgeItems).values({
				id: "ki-1",
				title: "Chunked uploads",
				body: "Use chunked uploads for files >10MB",
				format: "markdown",
				status: "draft",
				version: 1,
				updatedBy: "agent-1",
				createdAt: now,
				updatedAt: now,
			});
			// The owner's `create` always writes the projection row alongside the item.
			await db
				.insert(knowledgeAppProjection)
				.values({ id: "ki-1-projection", knowledgeItemId: "ki-1" });

			const result = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1"));
			expect(result[0]).toMatchObject({
				id: "ki-1",
				title: "Chunked uploads",
				version: 1,
			});
		});

		test("updates knowledge_items version", async ({ db }) => {
			// @lore O2: layer, kind stripped from kernel table.
			const now = new Date().toISOString();
			await db.insert(knowledgeItems).values({
				id: "ki-1",
				title: "Original",
				body: "Body",
				format: "markdown",
				status: "draft",
				version: 1,
				updatedBy: "agent-1",
				createdAt: now,
				updatedAt: now,
			});
			// The owner's `create` always writes the projection row alongside the item.
			await db
				.insert(knowledgeAppProjection)
				.values({ id: "ki-1-projection", knowledgeItemId: "ki-1" });

			await db
				.update(knowledgeItems)
				.set({ title: "Updated", version: 2, updatedAt: new Date().toISOString() })
				.where(eq(knowledgeItems.id, "ki-1"));

			const result = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1"));
			expect(result[0]?.title).toBe("Updated");
			expect(result[0]?.version).toBe(2);
		});

		test("inserts and reads knowledge_edit_log", async ({ db }) => {
			// @lore O2: layer, kind stripped from kernel table.
			const now = new Date().toISOString();
			await db.insert(knowledgeItems).values({
				id: "ki-1",
				title: "T",
				body: "B",
				format: "markdown",
				status: "draft",
				version: 1,
				updatedBy: "a",
				createdAt: now,
				updatedAt: now,
			});
			// The owner's `create` always writes the projection row alongside the item.
			await db
				.insert(knowledgeAppProjection)
				.values({ id: "ki-1-projection", knowledgeItemId: "ki-1" });
			await db.insert(knowledgeEditLog).values({
				id: "kel-1",
				itemId: "ki-1",
				editor: "human-1",
				field: "title",
				oldValue: "Old",
				newValue: "New",
				editType: "update",
				createdAt: now,
			});

			const result = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.id, "kel-1"));
			expect(result[0]).toMatchObject({
				id: "kel-1",
				itemId: "ki-1",
				field: "title",
			});
		});

		// @lore AU18: factory_settings (generic KV bucket) is retired. server_config
		// is its typed singleton-row successor — still exercises a real insert+read.
		test("inserts and reads server_config", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(serverConfig).values({ id: "default", config: "{}", updatedAt: now });

			const result = await db.select().from(serverConfig).where(eq(serverConfig.id, "default"));

			expect(result[0]).toMatchObject({ id: "default", config: "{}" });
		});
	});

	// --- AC3: knowledge_items kernel indexes exist; strategy indexes on extension table ---
	describe("AC3: knowledge_items indexes", () => {
		test("has indexes on topic, status (kernel table)", async ({ db }) => {
			// @lore O2: layer, scope_id, kind indexes removed from kernel table.
			// They now live on knowledge_app_projection.
			const result = await db.execute(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_items' AND schemaname = 'public'` as Parameters<
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
