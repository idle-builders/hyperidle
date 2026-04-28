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
 * - Audit-trail FKs (knowledge_edit_log, knowledge_conflicts on
 *   knowledge_items) use ON DELETE RESTRICT — the audit must outlive its
 *   subject (I3 review sec HIGH-2).
 * - L1a: legacy `responses` table dropped; verdicts now project as
 *   `verdict`-typed messages bound to the thread (RESTRICT via
 *   messages.thread_id), decoupled from the item lifecycle.
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
		db.insert(threads)
			.values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			})
			.run();
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
		// L1a: messages now carry type/payload/clientKey; recipientId/subject/
		// body dropped (plan §5.3). Recipient is folded into participants.
		db.insert(messages)
			.values({
				id: "msg-1",
				senderId: "a1",
				threadId: "thread-1",
				type: "plain",
				payload: JSON.stringify({ text: "hi" }),
				clientKey: "msg-1",
				createdAt: NOW,
			})
			.run();
		expect(() => db.delete(threads).where(eq(threads.id, "thread-1")).run()).toThrow(/constraint/i);
	});

	it("rejects deleting a thread while an item references it", () => {
		seedProductTeamBetTaskAgent(db);
		db.insert(threads)
			.values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: NOW,
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

	// I3 review sec HIGH-2: knowledge_edit_log MUST outlive its subject.
	// RESTRICT prevents deleting a knowledge_items row while edit-log rows
	// still reference it — operators must explicitly archive or soft-delete
	// the log before removing the item, preserving the audit trail.
	it("rejects deleting a knowledge_items row while knowledge_edit_log rows reference it", () => {
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
		expect(() => db.delete(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).run()).toThrow(
			/constraint/i,
		);

		// And the log rows must still exist after the failed delete.
		const after = db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, "ki-1"))
			.all();
		expect(after).toHaveLength(3);
	});

	// I3 review sec HIGH-2: knowledge_conflicts is the resolution-evidence
	// audit. Same RESTRICT semantics as the edit log.
	it("rejects deleting a knowledge_items row while knowledge_conflicts rows reference it", () => {
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

		expect(() => db.delete(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).run()).toThrow(
			/constraint/i,
		);

		const remaining = db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-1"))
			.all();
		expect(remaining).toHaveLength(1);
	});

	// L1a: legacy `responses` table dropped (plan §5.2). Verdicts now project
	// as `verdict`-typed messages attached to a thread, not an item — so the
	// "items → responses CASCADE" contract no longer applies. The replacement
	// contract: verdict messages survive item deletion (decoupled audit
	// trail), and follow the messages.thread_id FK behaviour (RESTRICT).
	it("verdict messages survive item deletion (L1a: messages no longer FK items)", () => {
		db.insert(threads)
			.values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			})
			.run();
		db.insert(agents)
			.values([
				{
					id: "a1",
					name: "A",
					role: "builder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: NOW,
				},
				{
					id: "human-1",
					name: "Human",
					role: "founder",
					status: "active",
					maxConcurrentSessions: 1,
					createdAt: NOW,
				},
			])
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
		db.insert(messages)
			.values({
				id: "verdict-1",
				senderId: "human-1",
				threadId: "thread-1",
				type: "verdict",
				payload: JSON.stringify({ decision: "approve" }),
				clientKey: "verdict-1",
				legacyItemId: "item-1",
				createdAt: NOW,
			})
			.run();

		db.delete(items).where(eq(items.id, "item-1")).run();

		// Verdict message survives — it's bound to the thread, not the item.
		const remaining = db.select().from(messages).where(eq(messages.legacyItemId, "item-1")).all();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].type).toBe("verdict");
	});
});
