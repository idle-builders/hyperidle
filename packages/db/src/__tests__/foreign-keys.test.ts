import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import {
	agents,
	bets,
	items,
	knowledgeConflicts,
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
import { createTestDb } from "../test-utils.js";

/**
 * I3 — foreign-key action acceptance tests.
 *
 * Per AC (TRACK-I.md L132-135):
 * - Reference-data FKs (products, agents, teams, threads) use ON DELETE RESTRICT.
 * - Dependent-data FKs (knowledge_edit_log on knowledge_items) use ON DELETE CASCADE.
 *
 * The tests insert a parent + dependent row and attempt the deletion that the
 * configured action should respectively reject (RESTRICT) or propagate
 * (CASCADE). One test per FK action listed in the plan §3.2.
 *
 * SQLite enforces FK actions when `PRAGMA foreign_keys = ON` (set by
 * `createTestDb`). Drizzle generates the action via the column builder
 * `.references(..., { onDelete: 'restrict' | 'cascade' })`.
 */

const NOW = new Date().toISOString();

function seedProductTeamBetTaskAgent(db: HyperIdleDb): void {
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: NOW }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
		.run();
	db.insert(agents)
		.values({
			id: "a1",
			name: "A",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			teamId: "t1",
			createdAt: NOW,
		})
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "x",
			appetite: "small",
			status: "shaped",
			createdAt: NOW,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
}

describe("I3: FK actions — RESTRICT on reference data", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("rejects deleting a product while a team references it", () => {
		seedProductTeamBetTaskAgent(db);
		expect(() => db.delete(products).where(eq(products.id, "p1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting a team while a bet references it", () => {
		seedProductTeamBetTaskAgent(db);
		// Remove tasks first so only the bet still references the team.
		db.delete(tasks).where(eq(tasks.id, "task-1")).run();
		expect(() => db.delete(teams).where(eq(teams.id, "t1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting a product while a bet references it", () => {
		// Minimal seed so only the bet references the product (no tasks or
		// agents getting in the way of the assertion path).
		db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: NOW }).run();
		db.insert(teams)
			.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
			.run();
		db.insert(bets)
			.values({
				id: "b1",
				productId: "p1",
				teamId: "t1",
				pitch: "x",
				appetite: "small",
				status: "shaped",
				createdAt: NOW,
			})
			.run();
		// `bets.product_id → products.id` must block (independent of teams.product_id → products.id).
		expect(() => db.delete(products).where(eq(products.id, "p1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting an agent while a session references it", () => {
		seedProductTeamBetTaskAgent(db);
		db.insert(sessions)
			.values({
				id: "sess-1",
				taskId: "task-1",
				agentId: "a1",
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			})
			.run();
		expect(() => db.delete(agents).where(eq(agents.id, "a1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting a thread while a message references it", () => {
		seedProductTeamBetTaskAgent(db);
		db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW }).run();
		db.insert(agents)
			.values({
				id: "a2",
				name: "B",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 1,
				createdAt: NOW,
			})
			.run();
		db.insert(messages)
			.values({
				id: "msg-1",
				senderId: "a1",
				recipientId: "a2",
				threadId: "thread-1",
				body: "hi",
				createdAt: NOW,
			})
			.run();
		expect(() => db.delete(threads).where(eq(threads.id, "thread-1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting a thread while an item references it", () => {
		seedProductTeamBetTaskAgent(db);
		db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW }).run();
		db.insert(items)
			.values({
				id: "item-1",
				sourceAgentId: "a1",
				kind: "review",
				title: "T",
				body: "B",
				threadId: "thread-1",
				createdAt: NOW,
			})
			.run();
		expect(() => db.delete(threads).where(eq(threads.id, "thread-1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting an agent while a routine references it", () => {
		seedProductTeamBetTaskAgent(db);
		db.insert(routines)
			.values({
				id: "routine-1",
				ownerAgentId: "a1",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
				active: 1,
			})
			.run();
		expect(() => db.delete(agents).where(eq(agents.id, "a1")).run()).toThrow(/constraint/i);
	});
});

describe("I3: FK actions — CASCADE on dependent data", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("cascades delete from knowledge_items to knowledge_edit_log rows", () => {
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
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
		for (const id of ["kel-1", "kel-2", "kel-3"]) {
			db.insert(knowledgeEditLog)
				.values({
					id,
					itemId: "ki-1",
					editor: "human-1",
					field: "title",
					oldValue: "Old",
					newValue: "New",
					editType: "update",
					createdAt: NOW,
				})
				.run();
		}
		const before = db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, "ki-1"))
			.all();
		expect(before).toHaveLength(3);

		db.delete(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).run();

		const after = db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, "ki-1"))
			.all();
		expect(after).toHaveLength(0);
	});

	it("cascades delete from knowledge_items to knowledge_conflicts rows", () => {
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
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
		db.insert(knowledgeConflicts)
			.values({
				id: "kc-1",
				itemId: "ki-1",
				versionBase: 1,
				versionCurrent: 2,
				proposedBody: "new body",
				proposedBy: "a",
				status: "open",
				createdAt: NOW,
			})
			.run();

		db.delete(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).run();

		const remaining = db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-1"))
			.all();
		expect(remaining).toHaveLength(0);
	});

	it("cascades delete from items to responses rows", () => {
		db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW }).run();
		db.insert(agents)
			.values({
				id: "a1",
				name: "A",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 1,
				createdAt: NOW,
			})
			.run();
		db.insert(items)
			.values({
				id: "item-1",
				sourceAgentId: "a1",
				kind: "review",
				title: "T",
				body: "B",
				threadId: "thread-1",
				createdAt: NOW,
			})
			.run();
		db.insert(responses)
			.values({
				id: "resp-1",
				itemId: "item-1",
				decision: "approve",
				approverId: "human-1",
				respondedAt: NOW,
			})
			.run();

		db.delete(items).where(eq(items.id, "item-1")).run();

		const remaining = db.select().from(responses).where(eq(responses.itemId, "item-1")).all();
		expect(remaining).toHaveLength(0);
	});
});
