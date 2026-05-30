import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import {
	bets,
	factorySettings,
	items,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	routines,
	sessions,
	tasks,
	// @lore U1: `teams` is the domain entity (formerly `products`).
	// `teamMembers` is the agent-membership group (formerly `teams`).
	teamMembers,
	teams,
	threads,
	userSkills,
	users,
} from "../schema.js";
import { createTestDb } from "../test-utils.js";

describe("A2: Database Schema", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	// --- AC1: Migrations apply to fresh SQLite without errors ---
	describe("AC1: migrations apply correctly", () => {
		it("creates all current tables", () => {
			// L1a: `responses` table dropped (plan §5.2). Verdicts now project
			// as `verdict`-typed messages. Knowledge_conflicts and
			// notification_queue were added in earlier migrations.
			const tableNames = db
				.all<{ name: string }>(
					sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'd1%' AND name NOT LIKE '_l1_snapshot_%' ORDER BY name`,
				)
				.map((r) => r.name);

			expect(tableNames).toEqual(
				expect.arrayContaining([
					// @lore P2: agents → users, agent_skills → user_skills
					// @lore U1: `products` → `teams`; old `teams` → `team_members`
					"users",
					"user_skills",
					"bets",
					"factory_settings",
					"items",
					"knowledge_edit_log",
					"knowledge_items",
					"messages",
					"routines",
					"sessions",
					"tasks",
					"team_members",
					"teams",
					"threads",
				]),
			);
			expect(tableNames).not.toContain("responses");
			// @lore U1: `products` table was renamed to `teams`
			expect(tableNames).not.toContain("products");
			expect(tableNames.length).toBeGreaterThanOrEqual(15);
		});
	});

	// --- AC2: All tables insert/read/update correctly with full type safety ---
	describe("AC2: CRUD operations", () => {
		// @lore U1: `products` renamed to `teams`.
		it("inserts and reads teams (formerly products)", () => {
			const now = new Date().toISOString();
			db.insert(teams)
				.values({
					id: "prod-1",
					name: "Nimmly",
					phase: "build",
					createdAt: now,
				})
				.run();

			const result = db.select().from(teams).where(eq(teams.id, "prod-1")).get();

			expect(result).toMatchObject({
				id: "prod-1",
				name: "Nimmly",
				phase: "build",
			});
		});

		it("inserts and reads users (AI kind)", () => {
			const now = new Date().toISOString();
			db.insert(users)
				.values({
					id: "agent-1",
					kind: "ai",
					name: "Builder",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 3,
					createdAt: now,
				})
				.run();

			const result = db.select().from(users).where(eq(users.id, "agent-1")).get();

			expect(result).toMatchObject({
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 3,
			});
		});

		// @lore U1: old `teams` (agent membership) renamed to `teamMembers`.
		it("inserts and reads teamMembers (formerly teams)", () => {
			const now = new Date().toISOString();
			db.insert(teams)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(teamMembers)
				.values({
					id: "team-1",
					teamId: "prod-1",
					capacity: 5,
					activeBets: 0,
					formedAt: now,
				})
				.run();

			const result = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();

			expect(result).toMatchObject({
				id: "team-1",
				teamId: "prod-1",
				capacity: 5,
				activeBets: 0,
			});
		});

		// @lore U1: bets.productId/pitch/status simplified; teamId now refs `teams` (formerly products).
		it("inserts and reads bets", () => {
			const now = new Date().toISOString();
			db.insert(teams)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					teamId: "prod-1",
					description: "Build file upload",
					appetite: "6w",
					status: "draft",
					createdAt: now,
				})
				.run();

			const result = db.select().from(bets).where(eq(bets.id, "bet-1")).get();

			expect(result).toMatchObject({
				id: "bet-1",
				description: "Build file upload",
				appetite: "6w",
				status: "draft",
			});
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		it("inserts and reads tasks", () => {
			const now = new Date().toISOString();
			db.insert(teams)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					teamId: "prod-1",
					description: "X",
					appetite: "2w",
					status: "draft",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "Implement upload",
					state: "proposed",
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const result = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();

			expect(result).toMatchObject({
				id: "task-1",
				title: "Implement upload",
				state: "proposed",
			});
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		it("updates tasks correctly", () => {
			const now = new Date().toISOString();
			db.insert(teams)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					teamId: "prod-1",
					description: "X",
					appetite: "2w",
					status: "draft",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "Original",
					state: "proposed",
					createdAt: now,
					updatedAt: now,
				})
				.run();

			db.update(tasks)
				.set({ state: "in_progress", updatedAt: new Date().toISOString() })
				.where(eq(tasks.id, "task-1"))
				.run();

			const result = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(result?.state).toBe("in_progress");
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		it("inserts and reads sessions", () => {
			const now = new Date().toISOString();
			db.insert(teams)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(users)
				.values({
					id: "agent-1",
					kind: "ai",
					name: "Builder",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 3,
					createdAt: now,
				})
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					teamId: "prod-1",
					description: "X",
					appetite: "2w",
					status: "draft",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "T",
					state: "proposed",
					createdAt: now,
					updatedAt: now,
				})
				.run();
			db.insert(sessions)
				.values({
					id: "sess-1",
					taskId: "task-1",
					agentId: "agent-1",
					modelTier: "workhorse",
					startedAt: now,
					state: "active",
				})
				.run();

			const result = db.select().from(sessions).where(eq(sessions.id, "sess-1")).get();
			expect(result).toMatchObject({
				id: "sess-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "workhorse",
				state: "active",
			});
		});

		it("inserts and reads routines", () => {
			const now = new Date().toISOString();
			db.insert(users)
				.values({
					id: "agent-1",
					kind: "ai",
					name: "CoS",
					role: "chief_of_staff",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: now,
				})
				.run();
			db.insert(routines)
				.values({
					id: "routine-1",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
					active: 1,
				})
				.run();

			const result = db.select().from(routines).where(eq(routines.id, "routine-1")).get();
			expect(result).toMatchObject({
				id: "routine-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				active: 1,
			});
		});

		it("inserts and reads threads and messages", () => {
			const now = new Date().toISOString();
			db.insert(threads)
				.values({
					id: "thread-1",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: now,
					createdAt: now,
				})
				.run();
			db.insert(users)
				.values({
					id: "agent-1",
					kind: "ai",
					name: "A",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: now,
				})
				.run();
			db.insert(users)
				.values({
					id: "agent-2",
					kind: "ai",
					name: "B",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: now,
				})
				.run();
			// L1a: messages now carry type/payload/clientKey instead of
			// recipientId/subject/body (plan §5.3).
			db.insert(messages)
				.values({
					id: "msg-1",
					senderId: "agent-1",
					threadId: "thread-1",
					type: "plain",
					payload: JSON.stringify({ text: "Hello" }),
					clientKey: "msg-1",
					createdAt: now,
				})
				.run();

			const result = db.select().from(messages).where(eq(messages.id, "msg-1")).get();
			expect(result).toMatchObject({
				id: "msg-1",
				senderId: "agent-1",
				type: "plain",
			});
			const payload = JSON.parse(result?.payload ?? "{}") as { text?: string };
			expect(payload.text).toBe("Hello");
		});

		it("inserts and reads items and verdict messages", () => {
			// L1a: legacy `responses` table was dropped; verdict messages
			// (type='verdict', legacy_item_id) replace it (plan §5.2).
			const now = new Date().toISOString();
			db.insert(threads)
				.values({
					id: "thread-1",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: now,
					createdAt: now,
				})
				.run();
			db.insert(users)
				.values([
					{
						id: "agent-1",
						kind: "ai",
						name: "A",
						role: "builder",
						status: "active",
						maxConcurrentSessions: 1,
						createdAt: now,
					},
					{
						id: "human-1",
						kind: "human",
						name: "Human",
						role: "founder",
						status: "active",
						maxConcurrentSessions: 1,
						createdAt: now,
					},
				])
				.run();
			db.insert(items)
				.values({
					id: "item-1",
					sourceAgentId: "agent-1",
					kind: "review",
					title: "Review upload",
					body: "Please review",
					threadId: "thread-1",
					createdAt: now,
				})
				.run();

			const item = db.select().from(items).where(eq(items.id, "item-1")).get();
			expect(item).toMatchObject({ id: "item-1", kind: "review", title: "Review upload" });

			db.insert(messages)
				.values({
					id: "resp-1",
					senderId: "human-1",
					threadId: "thread-1",
					type: "verdict",
					payload: JSON.stringify({ decision: "approve" }),
					clientKey: "resp-1",
					legacyItemId: "item-1",
					createdAt: now,
				})
				.run();

			const resp = db.select().from(messages).where(eq(messages.id, "resp-1")).get();
			expect(resp).toMatchObject({ id: "resp-1", type: "verdict", legacyItemId: "item-1" });
			const verdict = JSON.parse(resp?.payload ?? "{}") as { decision: string };
			expect(verdict.decision).toBe("approve");
		});

		it("inserts and reads user_skills", () => {
			const now = new Date().toISOString();
			db.insert(users)
				.values({
					id: "agent-1",
					kind: "ai",
					name: "A",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: now,
				})
				.run();
			db.insert(userSkills)
				.values({
					userId: "agent-1",
					skillId: "code_review",
					autonomyLevel: 3,
					successCount: 10,
					failureCount: 1,
				})
				.run();

			const result = db.select().from(userSkills).where(eq(userSkills.userId, "agent-1")).get();

			expect(result).toMatchObject({
				userId: "agent-1",
				skillId: "code_review",
				autonomyLevel: 3,
			});
		});

		it("inserts and reads knowledge_items", () => {
			// @lore O2: layer, kind stripped from kernel table; use knowledgeStrategyFabric.
			const now = new Date().toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-1",
					title: "Chunked uploads",
					body: "Use chunked uploads for files >10MB",
					format: "markdown",
					status: "draft",
					version: 1,
					updatedBy: "agent-1",
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const result = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).get();
			expect(result).toMatchObject({
				id: "ki-1",
				title: "Chunked uploads",
				version: 1,
			});
		});

		it("updates knowledge_items version", () => {
			// @lore O2: layer, kind stripped from kernel table.
			const now = new Date().toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-1",
					title: "Original",
					body: "Body",
					format: "markdown",
					status: "draft",
					version: 1,
					updatedBy: "agent-1",
					createdAt: now,
					updatedAt: now,
				})
				.run();

			db.update(knowledgeItems)
				.set({ title: "Updated", version: 2, updatedAt: new Date().toISOString() })
				.where(eq(knowledgeItems.id, "ki-1"))
				.run();

			const result = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).get();
			expect(result?.title).toBe("Updated");
			expect(result?.version).toBe(2);
		});

		it("inserts and reads knowledge_edit_log", () => {
			// @lore O2: layer, kind stripped from kernel table.
			const now = new Date().toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-1",
					title: "T",
					body: "B",
					format: "markdown",
					status: "draft",
					version: 1,
					updatedBy: "a",
					createdAt: now,
					updatedAt: now,
				})
				.run();
			db.insert(knowledgeEditLog)
				.values({
					id: "kel-1",
					itemId: "ki-1",
					editor: "human-1",
					field: "title",
					oldValue: "Old",
					newValue: "New",
					editType: "update",
					createdAt: now,
				})
				.run();

			const result = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.id, "kel-1"))
				.get();
			expect(result).toMatchObject({
				id: "kel-1",
				itemId: "ki-1",
				field: "title",
			});
		});

		it("inserts and reads factory_settings", () => {
			const now = new Date().toISOString();
			db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: now }).run();

			const result = db
				.select()
				.from(factorySettings)
				.where(eq(factorySettings.key, "cost_cap"))
				.get();

			expect(result).toMatchObject({ key: "cost_cap", value: "1000" });
		});
	});

	// --- AC3: knowledge_items kernel indexes exist; strategy indexes on extension table ---
	describe("AC3: knowledge_items indexes", () => {
		it("has indexes on topic, status, and updated_at (kernel table)", () => {
			// @lore O2: layer, scope_id, kind indexes removed from kernel table.
			// They now live on knowledge_strategy_fabric.
			const indexes = db
				.all<{ name: string }>(
					sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_items' AND name NOT LIKE 'sqlite_%'`,
				)
				.map((r) => r.name);

			// Should have at least 3 indexes (topic, status, updated_at)
			expect(indexes.length).toBeGreaterThanOrEqual(3);

			// Verify each indexed column by checking index info
			const indexedColumns = new Set<string>();
			for (const idx of indexes) {
				const cols = db.all<{ name: string }>(sql.raw(`PRAGMA index_info("${idx}")`));
				for (const col of cols) {
					indexedColumns.add(col.name);
				}
			}

			expect(indexedColumns).toContain("topic");
			expect(indexedColumns).toContain("status");
		});

		it("knowledge_strategy_fabric has indexes on knowledge_item_id, layer, and kind", () => {
			// @lore O2: strategy-layer indexes live on the extension table.
			const indexes = db
				.all<{ name: string }>(
					sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_strategy_fabric' AND name NOT LIKE 'sqlite_%'`,
				)
				.map((r) => r.name);

			const indexedColumns = new Set<string>();
			for (const idx of indexes) {
				const cols = db.all<{ name: string }>(sql.raw(`PRAGMA index_info("${idx}")`));
				for (const col of cols) {
					indexedColumns.add(col.name);
				}
			}

			expect(indexedColumns).toContain("knowledge_item_id");
			expect(indexedColumns).toContain("layer");
			expect(indexedColumns).toContain("kind");
		});
	});

	// --- AC6: Foreign key constraints enforced ---
	describe("AC6: foreign key constraints", () => {
		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		it("rejects task with invalid bet_id", () => {
			const now = new Date().toISOString();
			db.insert(teams).values({ id: "prod-1", name: "P", phase: "build", createdAt: now }).run();

			expect(() =>
				db
					.insert(tasks)
					.values({
						id: "task-1",
						betId: "nonexistent-bet",
						teamId: "prod-1",
						title: "T",
						state: "proposed",
						createdAt: now,
						updatedAt: now,
					})
					.run(),
			).toThrow();
		});

		// @lore U1: tasks.productId dropped; teamId refs `teams` (formerly products).
		it("rejects session with invalid agent_id", () => {
			const now = new Date().toISOString();
			db.insert(teams).values({ id: "prod-1", name: "P", phase: "build", createdAt: now }).run();
			db.insert(bets)
				.values({
					id: "bet-1",
					teamId: "prod-1",
					description: "X",
					appetite: "2w",
					status: "draft",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "T",
					state: "proposed",
					createdAt: now,
					updatedAt: now,
				})
				.run();

			expect(() =>
				db
					.insert(sessions)
					.values({
						id: "sess-1",
						taskId: "task-1",
						agentId: "nonexistent-agent",
						modelTier: "workhorse",
						startedAt: now,
						state: "active",
					})
					.run(),
			).toThrow();
		});

		it("rejects verdict message with invalid sender_id (replaces legacy responses FK contract)", () => {
			// L1a: legacy `responses.item_id` FK no longer exists — `responses`
			// table dropped (plan §5.2). Replacement contract: verdict-typed
			// messages set sender_id=approver; messages.sender_id FK to
			// users.id rejects unknown senders. P2: agents → users.
			const now = new Date().toISOString();
			db.insert(threads)
				.values({
					id: "thread-fk",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify([]),
					lastActiveAt: now,
					createdAt: now,
				})
				.run();
			expect(() =>
				db
					.insert(messages)
					.values({
						id: "verdict-fk",
						senderId: "nonexistent-agent",
						threadId: "thread-fk",
						type: "verdict",
						payload: JSON.stringify({ decision: "approve" }),
						clientKey: "verdict-fk",
						createdAt: now,
					})
					.run(),
			).toThrow();
		});

		it("rejects knowledge_edit_log with invalid item_id", () => {
			const now = new Date().toISOString();
			expect(() =>
				db
					.insert(knowledgeEditLog)
					.values({
						id: "kel-1",
						itemId: "nonexistent-ki",
						editor: "human-1",
						field: "title",
						oldValue: "Old",
						newValue: "New",
						editType: "update",
						createdAt: now,
					})
					.run(),
			).toThrow();
		});
	});
});
