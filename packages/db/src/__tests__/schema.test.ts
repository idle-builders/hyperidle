import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
	agentSkills,
	agents,
	bets,
	factorySettings,
	fileLeases,
	items,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	products,
	responses,
	routines,
	sessions,
	tasks,
	teams,
	threads,
} from "../schema.js";
import { createSeededTestDb, createTestDb } from "../test-utils.js";

function uuid(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

/** Insert the minimum rows needed to satisfy FK constraints up to tasks */
function insertBaseData(db: ReturnType<typeof createTestDb>): {
	productId: string;
	teamId: string;
	agentId: string;
	betId: string;
	taskId: string;
	threadId: string;
} {
	const timestamp = now();
	const productId = uuid();
	const teamId = uuid();
	const agentId = uuid();
	const betId = uuid();
	const taskId = uuid();
	const threadId = uuid();

	db.insert(products)
		.values({ id: productId, name: "Test Product", phase: "building", createdAt: timestamp })
		.run();
	db.insert(threads)
		.values({ id: threadId, kind: "general", participants: "[]", createdAt: timestamp })
		.run();
	db.insert(agents)
		.values({
			id: agentId,
			name: "Test Agent",
			role: "engineer",
			skills: "[]",
			status: "active",
			createdAt: timestamp,
		})
		.run();
	db.insert(teams)
		.values({
			id: teamId,
			productId,
			members: JSON.stringify([agentId]),
			formedAt: timestamp,
		})
		.run();
	db.insert(bets)
		.values({
			id: betId,
			productId,
			teamId,
			pitch: "Test bet",
			appetite: "1 week",
			doneCondition: "Tests pass",
			hypothesis: "It works",
			status: "committed",
			revisionLog: "[]",
			createdAt: timestamp,
		})
		.run();
	db.insert(tasks)
		.values({
			id: taskId,
			betId,
			productId,
			teamId,
			ownerAgentId: agentId,
			title: "Test task",
			description: "A test task",
			doneCondition: "Done",
			state: "proposed",
			dependencies: "[]",
			artifacts: "[]",
			durability: "durable",
			riskTier: "low",
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.run();

	return { productId, teamId, agentId, betId, taskId, threadId };
}

describe("Migration applies cleanly", () => {
	it("creates an in-memory database with all tables", () => {
		const db = createTestDb();
		// Verify we can query all 16 tables
		expect(db.select().from(products).all()).toEqual([]);
		expect(db.select().from(factorySettings).all()).toEqual([]);
		expect(db.select().from(threads).all()).toEqual([]);
		expect(db.select().from(agents).all()).toEqual([]);
		expect(db.select().from(teams).all()).toEqual([]);
		expect(db.select().from(bets).all()).toEqual([]);
		expect(db.select().from(tasks).all()).toEqual([]);
		expect(db.select().from(sessions).all()).toEqual([]);
		expect(db.select().from(routines).all()).toEqual([]);
		expect(db.select().from(messages).all()).toEqual([]);
		expect(db.select().from(items).all()).toEqual([]);
		expect(db.select().from(responses).all()).toEqual([]);
		expect(db.select().from(agentSkills).all()).toEqual([]);
		expect(db.select().from(knowledgeItems).all()).toEqual([]);
		expect(db.select().from(knowledgeEditLog).all()).toEqual([]);
		expect(db.select().from(fileLeases).all()).toEqual([]);
	});
});

describe("Products CRUD", () => {
	it("inserts and reads a product", () => {
		const db = createTestDb();
		const id = uuid();
		const ts = now();
		db.insert(products).values({ id, name: "MyApp", phase: "shaping", createdAt: ts }).run();

		const result = db.select().from(products).where(eq(products.id, id)).get();
		expect(result).toMatchObject({ id, name: "MyApp", phase: "shaping" });
		expect(result?.briefPath).toBeNull();
	});

	it("updates a product", () => {
		const db = createTestDb();
		const id = uuid();
		db.insert(products).values({ id, name: "MyApp", phase: "shaping", createdAt: now() }).run();
		db.update(products).set({ phase: "building" }).where(eq(products.id, id)).run();

		const result = db.select().from(products).where(eq(products.id, id)).get();
		expect(result?.phase).toBe("building");
	});
});

describe("Agents CRUD", () => {
	it("inserts and reads an agent with defaults", () => {
		const db = createTestDb();
		const id = uuid();
		db.insert(agents)
			.values({
				id,
				name: "Agent-1",
				role: "engineer",
				skills: JSON.stringify(["ts"]),
				status: "active",
				createdAt: now(),
			})
			.run();

		const result = db.select().from(agents).where(eq(agents.id, id)).get();
		expect(result?.maxConcurrentSessions).toBe(1);
		expect(result?.costCap).toBe(0);
		expect(result?.costActual).toBe(0);
		expect(result?.teamId).toBeNull();
	});
});

describe("Teams CRUD", () => {
	it("inserts a team with FK to product", () => {
		const db = createTestDb();
		const productId = uuid();
		const teamId = uuid();
		db.insert(products)
			.values({ id: productId, name: "P", phase: "building", createdAt: now() })
			.run();
		db.insert(teams).values({ id: teamId, productId, members: "[]", formedAt: now() }).run();

		const result = db.select().from(teams).where(eq(teams.id, teamId)).get();
		expect(result?.productId).toBe(productId);
		expect(result?.capacity).toBe(3);
	});
});

describe("Bets CRUD", () => {
	it("inserts and reads a bet", () => {
		const db = createTestDb();
		const { productId, teamId } = insertBaseData(db);
		const betId2 = uuid();
		db.insert(bets)
			.values({
				id: betId2,
				productId,
				teamId,
				pitch: "Another bet",
				appetite: "3 days",
				doneCondition: "Ship it",
				hypothesis: "Users love it",
				status: "shaped",
				revisionLog: "[]",
				createdAt: now(),
			})
			.run();

		const result = db.select().from(bets).where(eq(bets.id, betId2)).get();
		expect(result?.status).toBe("shaped");
		expect(result?.shippedAt).toBeNull();
	});
});

describe("Tasks CRUD", () => {
	it("inserts a task with all FK references", () => {
		const db = createTestDb();
		const { taskId } = insertBaseData(db);

		const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		expect(result?.title).toBe("Test task");
		expect(result?.crossTeam).toBe(false);
		expect(result?.attentionScore).toBe(0);
	});

	it("updates a task state", () => {
		const db = createTestDb();
		const { taskId } = insertBaseData(db);
		db.update(tasks).set({ state: "done", updatedAt: now() }).where(eq(tasks.id, taskId)).run();

		const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
		expect(result?.state).toBe("done");
	});
});

describe("Sessions CRUD", () => {
	it("inserts and reads a session", () => {
		const db = createTestDb();
		const { taskId, agentId } = insertBaseData(db);
		const sessionId = uuid();
		db.insert(sessions)
			.values({
				id: sessionId,
				taskId,
				agentId,
				modelTier: "workhorse",
				startedAt: now(),
				state: "active",
				workspaceSnapshot: "{}",
			})
			.run();

		const result = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		expect(result?.modelTier).toBe("workhorse");
		expect(result?.cost).toBe(0);
		expect(result?.outcome).toBeNull();
	});
});

describe("Routines CRUD", () => {
	it("inserts and reads a routine", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);
		const routineId = uuid();
		db.insert(routines)
			.values({
				id: routineId,
				ownerAgentId: agentId,
				triggerType: "cron",
				triggerConfig: "{}",
				skillId: "review",
				doneCondition: "Done",
				stateKey: "state-1",
				autonomyLevel: "L2",
			})
			.run();

		const result = db.select().from(routines).where(eq(routines.id, routineId)).get();
		expect(result?.delegationAllowed).toBe(false);
		expect(result?.active).toBe(true);
		expect(result?.silent).toBe(false);
	});
});

describe("Messages CRUD", () => {
	it("inserts and reads a message", () => {
		const db = createTestDb();
		const { agentId, threadId } = insertBaseData(db);
		// Need a second agent for recipient
		const agent2Id = uuid();
		db.insert(agents)
			.values({
				id: agent2Id,
				name: "Agent-2",
				role: "reviewer",
				skills: "[]",
				status: "idle",
				createdAt: now(),
			})
			.run();

		const msgId = uuid();
		db.insert(messages)
			.values({
				id: msgId,
				senderId: agentId,
				recipientId: agent2Id,
				threadId,
				subject: "Hello",
				body: "World",
				fileLeases: "[]",
				createdAt: now(),
			})
			.run();

		const result = db.select().from(messages).where(eq(messages.id, msgId)).get();
		expect(result?.subject).toBe("Hello");
	});
});

describe("Items and Responses CRUD", () => {
	it("inserts an item and a response", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);
		const itemId = uuid();
		db.insert(items)
			.values({
				id: itemId,
				sourceAgentId: agentId,
				layer: "L1",
				verb: "propose",
				kind: "decision",
				title: "Pick a lib",
				body: "Which lib?",
				attachments: "[]",
				proposedAction: "approve",
				options: "[]",
				riskTier: "low",
				reasoning: "Best option",
				auditTrail: "[]",
				createdAt: now(),
			})
			.run();

		const responseId = uuid();
		db.insert(responses)
			.values({
				id: responseId,
				itemId,
				decision: "approved",
				approverId: agentId,
				view: "summary",
				respondedAt: now(),
			})
			.run();

		const result = db.select().from(responses).where(eq(responses.id, responseId)).get();
		expect(result?.decision).toBe("approved");
		expect(result?.edits).toBeNull();
	});
});

describe("AgentSkills CRUD", () => {
	it("inserts and reads agent skills with composite PK", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);
		db.insert(agentSkills)
			.values({
				agentId,
				skillId: "typescript",
				autonomyLevel: "L3",
			})
			.run();

		const result = db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId)).get();
		expect(result?.successCount).toBe(0);
		expect(result?.failureCount).toBe(0);
		expect(result?.autonomyLevel).toBe("L3");
	});

	it("enforces composite PK uniqueness", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);
		db.insert(agentSkills).values({ agentId, skillId: "ts", autonomyLevel: "L1" }).run();

		expect(() =>
			db.insert(agentSkills).values({ agentId, skillId: "ts", autonomyLevel: "L2" }).run(),
		).toThrow();
	});
});

describe("KnowledgeItems CRUD", () => {
	it("inserts and reads a knowledge item", () => {
		const db = createTestDb();
		const id = uuid();
		const ts = now();
		db.insert(knowledgeItems)
			.values({
				id,
				layer: "L2",
				scopeId: "global",
				kind: "pattern",
				topic: "testing",
				title: "TDD Pattern",
				body: "Write tests first",
				format: "markdown",
				status: "active",
				updatedBy: "system",
				createdAt: ts,
				updatedAt: ts,
			})
			.run();

		const result = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		expect(result?.version).toBe(1);
		expect(result?.confidence).toBe(0.5);
		expect(result?.meta).toBeNull();
	});
});

describe("KnowledgeEditLog CRUD", () => {
	it("inserts and reads an edit log entry", () => {
		const db = createTestDb();
		const kiId = uuid();
		const ts = now();
		db.insert(knowledgeItems)
			.values({
				id: kiId,
				layer: "L1",
				scopeId: "s1",
				kind: "decision",
				topic: "arch",
				title: "Title",
				body: "Body",
				format: "markdown",
				status: "captured",
				updatedBy: "agent",
				createdAt: ts,
				updatedAt: ts,
			})
			.run();

		const logId = uuid();
		db.insert(knowledgeEditLog)
			.values({
				id: logId,
				itemId: kiId,
				editor: "agent",
				field: "body",
				oldValue: null,
				newValue: "Body",
				editType: "correction",
				createdAt: ts,
			})
			.run();

		const result = db.select().from(knowledgeEditLog).where(eq(knowledgeEditLog.id, logId)).get();
		expect(result?.editType).toBe("correction");
		expect(result?.oldValue).toBeNull();
	});
});

describe("FileLeases CRUD", () => {
	it("inserts and reads a file lease", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);
		const leaseId = uuid();
		db.insert(fileLeases)
			.values({
				id: leaseId,
				agentId,
				filePath: "/src/main.ts",
				acquiredAt: now(),
			})
			.run();

		const result = db.select().from(fileLeases).where(eq(fileLeases.id, leaseId)).get();
		expect(result?.filePath).toBe("/src/main.ts");
		expect(result?.releasedAt).toBeNull();
	});
});

describe("Foreign key constraints", () => {
	it("rejects a team with non-existent product_id", () => {
		const db = createTestDb();
		expect(() =>
			db
				.insert(teams)
				.values({
					id: uuid(),
					productId: "nonexistent",
					members: "[]",
					formedAt: now(),
				})
				.run(),
		).toThrow();
	});

	it("rejects a bet with non-existent team_id", () => {
		const db = createTestDb();
		const productId = uuid();
		db.insert(products)
			.values({ id: productId, name: "P", phase: "building", createdAt: now() })
			.run();

		expect(() =>
			db
				.insert(bets)
				.values({
					id: uuid(),
					productId,
					teamId: "nonexistent",
					pitch: "X",
					appetite: "1d",
					doneCondition: "X",
					hypothesis: "X",
					status: "shaped",
					revisionLog: "[]",
					createdAt: now(),
				})
				.run(),
		).toThrow();
	});

	it("rejects a task with non-existent bet_id", () => {
		const db = createTestDb();
		const productId = uuid();
		const teamId = uuid();
		const agentId = uuid();
		db.insert(products)
			.values({ id: productId, name: "P", phase: "building", createdAt: now() })
			.run();
		db.insert(agents)
			.values({
				id: agentId,
				name: "A",
				role: "eng",
				skills: "[]",
				status: "active",
				createdAt: now(),
			})
			.run();
		db.insert(teams).values({ id: teamId, productId, members: "[]", formedAt: now() }).run();

		expect(() =>
			db
				.insert(tasks)
				.values({
					id: uuid(),
					betId: "nonexistent",
					productId,
					teamId,
					ownerAgentId: agentId,
					title: "T",
					description: "D",
					doneCondition: "DC",
					state: "proposed",
					dependencies: "[]",
					artifacts: "[]",
					durability: "durable",
					riskTier: "low",
					createdAt: now(),
					updatedAt: now(),
				})
				.run(),
		).toThrow();
	});

	it("rejects a session with non-existent task_id", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);

		expect(() =>
			db
				.insert(sessions)
				.values({
					id: uuid(),
					taskId: "nonexistent",
					agentId,
					modelTier: "fast",
					startedAt: now(),
					state: "active",
					workspaceSnapshot: "{}",
				})
				.run(),
		).toThrow();
	});

	it("rejects a response with non-existent item_id", () => {
		const db = createTestDb();
		const { agentId } = insertBaseData(db);

		expect(() =>
			db
				.insert(responses)
				.values({
					id: uuid(),
					itemId: "nonexistent",
					decision: "approved",
					approverId: agentId,
					view: "summary",
					respondedAt: now(),
				})
				.run(),
		).toThrow();
	});

	it("rejects a knowledge_edit_log entry with non-existent item_id", () => {
		const db = createTestDb();
		expect(() =>
			db
				.insert(knowledgeEditLog)
				.values({
					id: uuid(),
					itemId: "nonexistent",
					editor: "agent",
					field: "body",
					editType: "correction",
					createdAt: now(),
				})
				.run(),
		).toThrow();
	});
});

describe("KnowledgeItems indexes", () => {
	it("has all five required indexes", () => {
		const db = createTestDb();
		const result = db.all<{ name: string }>(
			sql`SELECT name FROM pragma_index_list('knowledge_items')`,
		);
		const indexNames = result.map((r) => r.name);

		expect(indexNames).toContain("idx_ki_layer_scope");
		expect(indexNames).toContain("idx_ki_kind");
		expect(indexNames).toContain("idx_ki_topic");
		expect(indexNames).toContain("idx_ki_status");
		expect(indexNames).toContain("idx_ki_attention");
	});
});

describe("Seed populates all major tables", () => {
	it("seeds at least 1 row per major table", async () => {
		const db = await createSeededTestDb();

		expect(db.select().from(products).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(factorySettings).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(threads).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(agents).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(teams).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(bets).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(tasks).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(sessions).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(routines).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(messages).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(items).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(responses).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(agentSkills).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(knowledgeItems).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(knowledgeEditLog).all().length).toBeGreaterThanOrEqual(1);
		expect(db.select().from(fileLeases).all().length).toBeGreaterThanOrEqual(1);
	});
});

describe("FactorySettings (backward compat)", () => {
	it("inserts and queries factory_settings", () => {
		const db = createTestDb();
		const ts = now();
		db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: ts }).run();

		const result = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "cost_cap"))
			.get();
		expect(result).toEqual({ key: "cost_cap", value: "1000", updatedAt: ts });
	});

	it("enforces primary key uniqueness", () => {
		const db = createTestDb();
		const ts = now();
		db.insert(factorySettings).values({ key: "cost_cap", value: "1000", updatedAt: ts }).run();
		expect(() =>
			db.insert(factorySettings).values({ key: "cost_cap", value: "2000", updatedAt: ts }).run(),
		).toThrow();
	});
});
