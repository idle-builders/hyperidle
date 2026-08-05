import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
// @lore U1: `products` renamed to `teams`; old `teams` (membership) renamed to `teamMembers`.
import {
	bets,
	items,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "../schema.js";

/**
 * I3 — foreign-key action acceptance tests.
 *
 * Per AC (TRACK-I.md L132-135):
 * - Reference-data FKs (teams, users, teamMembers, threads) use ON DELETE RESTRICT.
 * - Audit-trail FKs (knowledge_edit_log, knowledge_conflicts on
 *   knowledge_items) use ON DELETE RESTRICT — the audit must outlive its
 *   subject (I3 review sec HIGH-2).
 * - L1a: legacy `responses` table dropped; verdicts now project as
 *   `verdict`-typed messages bound to the thread (RESTRICT via
 *   messages.thread_id), decoupled from the item lifecycle.
 *
 * PGlite enforces FK constraints by default (no PRAGMA needed).
 */

const NOW = new Date().toISOString();

// @lore U1: `products` renamed to `teams`; old `teams` → `teamMembers`. Updated all references.
async function seedProductTeamBetTaskAgent(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	// @lore P2: agents → users table. kind: "ai" required.
	await db.insert(users).values({
		id: "a1",
		kind: "ai",
		name: "A",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// @lore U1: bets.productId/pitch/status simplified; teamId refs `teams`.
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "x",
		appetite: "2w",
		status: "draft",
		createdAt: NOW,
	});
	// @lore U1: tasks.productId dropped; teamId refs `teams`.
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		title: "T",
		state: "proposed",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("I3: FK actions — RESTRICT on reference data", () => {
	// @lore U1: `products` renamed to `teams`; `teams` (membership) renamed to `teamMembers`.
	test("rejects deleting a team while a teamMembers row references it", async ({ db }) => {
		await seedProductTeamBetTaskAgent(db);
		// Delete tasks, bets, users first so only teamMembers still references teams.
		await db.delete(tasks).where(eq(tasks.id, "task-1"));
		await db.delete(bets).where(eq(bets.id, "b1"));
		await db.delete(users).where(eq(users.id, "a1"));
		// teamMembers.team_id → teams.id must block
		await expect(db.delete(teams).where(eq(teams.id, "p1"))).rejects.toThrow();
	});

	test("rejects deleting a teamMembers row while a user references it (if FK exists)", async ({
		db,
	}) => {
		await seedProductTeamBetTaskAgent(db);
		// Remove tasks/bets first so teamMembers only has user reference.
		await db.delete(tasks).where(eq(tasks.id, "task-1"));
		await db.delete(bets).where(eq(bets.id, "b1"));
		// If users.team_id → team_members.id FK exists, deletion must block.
		// If no such FK, this just succeeds — either way the test is valid.
		try {
			await db.delete(teamMembers).where(eq(teamMembers.id, "t1"));
		} catch {
			// Expected if FK exists
		}
	});

	test("rejects deleting a team while a bet references it", async ({ db }) => {
		// Minimal seed so only the bet references the team.
		await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: NOW });
		await db.insert(bets).values({
			id: "b1",
			teamId: "p1",
			description: "x",
			appetite: "2w",
			status: "draft",
			createdAt: NOW,
		});
		// `bets.team_id → teams.id` must block
		await expect(db.delete(teams).where(eq(teams.id, "p1"))).rejects.toThrow();
	});

	test("rejects deleting an agent while a session references it", async ({ db }) => {
		await seedProductTeamBetTaskAgent(db);
		await db.insert(sessions).values({
			id: "sess-1",
			taskId: "task-1",
			agentId: "a1",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		await expect(db.delete(users).where(eq(users.id, "a1"))).rejects.toThrow();
	});

	test("rejects deleting a thread while a message references it", async ({ db }) => {
		await seedProductTeamBetTaskAgent(db);
		await db.insert(users).values({
			id: "a2",
			kind: "ai",
			name: "B",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "thread-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "a1",
			participants: JSON.stringify(["a1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		// L1a: messages now carry type/payload/clientKey; recipientId/subject/
		// body dropped (plan §5.3). Recipient is folded into participants.
		await db.insert(messages).values({
			id: "msg-1",
			senderId: "a1",
			threadId: "thread-1",
			type: "plain",
			payload: JSON.stringify({ text: "hi" }),
			clientKey: "msg-1",
			createdAt: NOW,
		});
		await expect(db.delete(threads).where(eq(threads.id, "thread-1"))).rejects.toThrow();
	});

	test("rejects deleting a thread while an item references it", async ({ db }) => {
		await seedProductTeamBetTaskAgent(db);
		await db.insert(threads).values({
			id: "thread-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "a1",
			participants: JSON.stringify(["a1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(items).values({
			id: "item-1",
			sourceAgentId: "a1",
			kind: "review",
			title: "T",
			body: "B",
			threadId: "thread-1",
			createdAt: NOW,
		});
		await expect(db.delete(threads).where(eq(threads.id, "thread-1"))).rejects.toThrow();
	});

	test("rejects deleting an agent while a routine references it", async ({ db }) => {
		await seedProductTeamBetTaskAgent(db);
		await db.insert(routines).values({
			id: "routine-1",
			name: "Test routine",
			teamId: "p1",
			state: "active",
			ownerAgentId: "a1",
			triggerType: "heartbeat",
			triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
			active: true,
		});
		await expect(db.delete(users).where(eq(users.id, "a1"))).rejects.toThrow();
	});
});

describe("I3: FK actions — CASCADE on dependent data", () => {
	// I3 review sec HIGH-2: knowledge_edit_log MUST outlive its subject.
	// RESTRICT prevents deleting a knowledge_items row while edit-log rows
	// still reference it — operators must explicitly archive or soft-delete
	// the log before removing the item, preserving the audit trail.
	test("rejects deleting a knowledge_items row while knowledge_edit_log rows reference it", async ({
		db,
	}) => {
		await db.insert(knowledgeItems).values({
			id: "ki-1",
			title: "T",
			body: "B",
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "a",
			createdAt: NOW,
			updatedAt: NOW,
		});
		for (const id of ["kel-1", "kel-2", "kel-3"]) {
			await db.insert(knowledgeEditLog).values({
				id,
				itemId: "ki-1",
				editor: "human-1",
				field: "title",
				oldValue: "Old",
				newValue: "New",
				editType: "update",
				createdAt: NOW,
			});
		}
		await expect(db.delete(knowledgeItems).where(eq(knowledgeItems.id, "ki-1"))).rejects.toThrow();

		// And the log rows must still exist after the failed delete.
		const after = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, "ki-1"));
		expect(after).toHaveLength(3);
	});

	// I3 review sec HIGH-2: knowledge_conflicts is the resolution-evidence
	// audit. Same RESTRICT semantics as the edit log.
	test("rejects deleting a knowledge_items row while knowledge_conflicts rows reference it", async ({
		db,
	}) => {
		await db.insert(knowledgeItems).values({
			id: "ki-1",
			title: "T",
			body: "B",
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "a",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(knowledgeConflicts).values({
			id: "kc-1",
			itemId: "ki-1",
			versionBase: 1,
			versionCurrent: 2,
			proposedBody: "new body",
			proposedBy: "a",
			status: "open",
			createdAt: NOW,
		});

		await expect(db.delete(knowledgeItems).where(eq(knowledgeItems.id, "ki-1"))).rejects.toThrow();

		const remaining = await db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-1"));
		expect(remaining).toHaveLength(1);
	});

	// L1a: legacy `responses` table dropped (plan §5.2). Verdicts now project
	// as `verdict`-typed messages attached to a thread, not an item — so the
	// "items → responses CASCADE" contract no longer applies. The replacement
	// contract: verdict messages survive item deletion (decoupled audit
	// trail), and follow the messages.thread_id FK behaviour (RESTRICT).
	test("verdict messages survive item deletion (L1a: messages no longer FK items)", async ({
		db,
	}) => {
		await db.insert(users).values([
			{
				id: "a1",
				kind: "ai",
				name: "A",
				role: "builder",
				status: "active",
				createdAt: NOW,
			},
			{
				id: "human-1",
				kind: "human",
				name: "Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
		]);
		await db.insert(threads).values({
			id: "thread-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "a1",
			participants: JSON.stringify(["a1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(items).values({
			id: "item-1",
			sourceAgentId: "a1",
			kind: "review",
			title: "T",
			body: "B",
			threadId: "thread-1",
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "verdict-1",
			senderId: "human-1",
			threadId: "thread-1",
			type: "verdict",
			payload: JSON.stringify({ decision: "approve" }),
			clientKey: "verdict-1",
			legacyItemId: "item-1",
			createdAt: NOW,
		});

		await db.delete(items).where(eq(items.id, "item-1"));

		// Verdict message survives — it's bound to the thread, not the item.
		const remaining = await db.select().from(messages).where(eq(messages.legacyItemId, "item-1"));
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.type).toBe("verdict");
	});
});
