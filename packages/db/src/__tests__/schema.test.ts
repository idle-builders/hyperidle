import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import {
	agentSkills,
	agents,
	bets,
	factorySettings,
	items,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	products,
	routines,
	sessions,
	tasks,
	teams,
	threads,
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
					"agents",
					"agent_skills",
					"bets",
					"factory_settings",
					"items",
					"knowledge_edit_log",
					"knowledge_items",
					"messages",
					"products",
					"routines",
					"sessions",
					"tasks",
					"teams",
					"threads",
				]),
			);
			expect(tableNames).not.toContain("responses");
			expect(tableNames.length).toBeGreaterThanOrEqual(15);
		});
	});

	// --- AC2: All tables insert/read/update correctly with full type safety ---
	describe("AC2: CRUD operations", () => {
		it("inserts and reads products", () => {
			const now = new Date().toISOString();
			db.insert(products)
				.values({
					id: "prod-1",
					name: "Nimmly",
					phase: "build",
					createdAt: now,
				})
				.run();

			const result = db.select().from(products).where(eq(products.id, "prod-1")).get();

			expect(result).toMatchObject({
				id: "prod-1",
				name: "Nimmly",
				phase: "build",
			});
		});

		it("inserts and reads agents", () => {
			const now = new Date().toISOString();
			db.insert(agents)
				.values({
					id: "agent-1",
					name: "Builder",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 3,
					createdAt: now,
				})
				.run();

			const result = db.select().from(agents).where(eq(agents.id, "agent-1")).get();

			expect(result).toMatchObject({
				id: "agent-1",
				name: "Builder",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 3,
			});
		});

		it("inserts and reads teams", () => {
			const now = new Date().toISOString();
			db.insert(products)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(teams)
				.values({
					id: "team-1",
					productId: "prod-1",
					capacity: 5,
					activeBets: 0,
					formedAt: now,
				})
				.run();

			const result = db.select().from(teams).where(eq(teams.id, "team-1")).get();

			expect(result).toMatchObject({
				id: "team-1",
				productId: "prod-1",
				capacity: 5,
				activeBets: 0,
			});
		});

		it("inserts and reads bets", () => {
			const now = new Date().toISOString();
			db.insert(products)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(teams)
				.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Build file upload",
					appetite: "6w",
					status: "shaped",
					createdAt: now,
				})
				.run();

			const result = db.select().from(bets).where(eq(bets.id, "bet-1")).get();

			expect(result).toMatchObject({
				id: "bet-1",
				pitch: "Build file upload",
				appetite: "6w",
				status: "shaped",
			});
		});

		it("inserts and reads tasks", () => {
			const now = new Date().toISOString();
			db.insert(products)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(teams)
				.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "X",
					appetite: "2w",
					status: "shaped",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
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

		it("updates tasks correctly", () => {
			const now = new Date().toISOString();
			db.insert(products)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(teams)
				.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "X",
					appetite: "2w",
					status: "shaped",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
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

		it("inserts and reads sessions", () => {
			const now = new Date().toISOString();
			db.insert(products)
				.values({ id: "prod-1", name: "Nimmly", phase: "build", createdAt: now })
				.run();
			db.insert(teams)
				.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })
				.run();
			db.insert(agents)
				.values({
					id: "agent-1",
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
					productId: "prod-1",
					teamId: "team-1",
					pitch: "X",
					appetite: "2w",
					status: "shaped",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
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
			db.insert(agents)
				.values({
					id: "agent-1",
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
			db.insert(agents)
				.values({
					id: "agent-1",
					name: "A",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: now,
				})
				.run();
			db.insert(agents)
				.values({
					id: "agent-2",
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
			db.insert(agents)
				.values([
					{
						id: "agent-1",
						name: "A",
						role: "builder",
						status: "active",
						maxConcurrentSessions: 1,
						createdAt: now,
					},
					{
						id: "human-1",
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

		it("inserts and reads agent_skills", () => {
			const now = new Date().toISOString();
			db.insert(agents)
				.values({
					id: "agent-1",
					name: "A",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: now,
				})
				.run();
			db.insert(agentSkills)
				.values({
					agentId: "agent-1",
					skillId: "code_review",
					autonomyLevel: 3,
					successCount: 10,
					failureCount: 1,
				})
				.run();

			const result = db.select().from(agentSkills).where(eq(agentSkills.agentId, "agent-1")).get();

			expect(result).toMatchObject({
				agentId: "agent-1",
				skillId: "code_review",
				autonomyLevel: 3,
			});
		});

		it("inserts and reads knowledge_items", () => {
			const now = new Date().toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-1",
					layer: "L3",
					kind: "pattern",
					title: "Chunked uploads",
					body: "Use chunked uploads for files >10MB",
					format: "markdown",
					status: "captured",
					version: 1,
					updatedBy: "agent-1",
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const result = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).get();
			expect(result).toMatchObject({
				id: "ki-1",
				layer: "L3",
				kind: "pattern",
				title: "Chunked uploads",
				version: 1,
			});
		});

		it("updates knowledge_items version", () => {
			const now = new Date().toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-1",
					layer: "L3",
					kind: "pattern",
					title: "Original",
					body: "Body",
					format: "markdown",
					status: "captured",
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
			const now = new Date().toISOString();
			db.insert(knowledgeItems)
				.values({
					id: "ki-1",
					layer: "L3",
					kind: "pattern",
					title: "T",
					body: "B",
					format: "markdown",
					status: "captured",
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

	// --- AC3: All five knowledge_items indexes exist ---
	describe("AC3: knowledge_items indexes", () => {
		it("has indexes on layer, scope_id, kind, topic, and status", () => {
			const indexes = db
				.all<{ name: string }>(
					sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_items' AND name NOT LIKE 'sqlite_%'`,
				)
				.map((r) => r.name);

			// Should have at least 5 indexes
			expect(indexes.length).toBeGreaterThanOrEqual(5);

			// Verify each indexed column by checking index info
			const indexedColumns = new Set<string>();
			for (const idx of indexes) {
				const cols = db.all<{ name: string }>(sql.raw(`PRAGMA index_info("${idx}")`));
				for (const col of cols) {
					indexedColumns.add(col.name);
				}
			}

			expect(indexedColumns).toContain("layer");
			expect(indexedColumns).toContain("scope_id");
			expect(indexedColumns).toContain("kind");
			expect(indexedColumns).toContain("topic");
			expect(indexedColumns).toContain("status");
		});
	});

	// --- AC6: Foreign key constraints enforced ---
	describe("AC6: foreign key constraints", () => {
		it("rejects task with invalid bet_id", () => {
			const now = new Date().toISOString();
			db.insert(products).values({ id: "prod-1", name: "P", phase: "build", createdAt: now }).run();
			db.insert(teams)
				.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })
				.run();

			expect(() =>
				db
					.insert(tasks)
					.values({
						id: "task-1",
						betId: "nonexistent-bet",
						productId: "prod-1",
						teamId: "team-1",
						title: "T",
						state: "proposed",
						createdAt: now,
						updatedAt: now,
					})
					.run(),
			).toThrow();
		});

		it("rejects session with invalid agent_id", () => {
			const now = new Date().toISOString();
			db.insert(products).values({ id: "prod-1", name: "P", phase: "build", createdAt: now }).run();
			db.insert(teams)
				.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })
				.run();
			db.insert(bets)
				.values({
					id: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "X",
					appetite: "2w",
					status: "shaped",
					createdAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
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
			// agents.id rejects unknown senders.
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
