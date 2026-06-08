/**
 * AD4 — computeApprovalRate unit tests (RED phase)
 *
 * Tests for the new approval rate computation service that replaces the
 * userSkills autonomy level as the trust signal for the policy engine.
 *
 * AC coverage:
 * AC3: Policy engine decision based on review verdict history (approval rate)
 * AC4: Founder can see agent's review track record (approval rate, recent verdicts)
 *
 * These tests FAIL until:
 * - packages/fabric/src/services/approval-rate.ts is created
 * - computeApprovalRate is exported from packages/fabric/src/index.ts
 */

import {
	createTestDb,
	type HyperIdleDb,
	items,
	messages,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { computeApprovalRate } from "@hyperidle/fabric";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const NOW = new Date().toISOString();
// 10 days ago — outside a 30-day window
const FORTY_DAYS_AGO = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
// 5 days ago — inside a 30-day window
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

describe("AD4 computeApprovalRate", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;

		// Seed base entities
		await db.insert(teams).values({
			id: "team-1",
			name: "Test Team",
			phase: "build",
			createdAt: NOW,
		});

		await db.insert(teamMembers).values({
			id: "tm-1",
			teamId: "team-1",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});

		await db.insert(users).values([
			{
				id: "agent-1",
				kind: "ai",
				name: "Builder Agent",
				role: "builder",
				status: "idle",
				teamId: "tm-1",
				createdAt: NOW,
			},
			{
				id: "human-1",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@test.com",
				createdAt: NOW,
			},
			// policy_engine sender (required for FK)
			{
				id: "policy_engine",
				kind: "ai",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: NOW,
			},
		]);
	});

	afterEach(async () => {
		await handle.close();
	});

	// -------------------------------------------------------------------------
	// Helper: seed an item + verdict for agent-1 via legacy_item_id path (Path 1)
	// -------------------------------------------------------------------------
	async function seedVerdictViaItem(opts: {
		decision: string;
		createdAt: string;
		itemId?: string;
		threadId?: string;
	}): Promise<void> {
		const threadId = opts.threadId ?? crypto.randomUUID();
		const itemId = opts.itemId ?? crypto.randomUUID();

		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		await db.insert(items).values({
			id: itemId,
			sourceAgentId: "agent-1",
			kind: "approval",
			title: "Test item",
			riskTier: "low",
			threadId,
			createdAt: NOW,
		});

		await db.insert(messages).values({
			id: crypto.randomUUID(),
			senderId: "human-1",
			threadId,
			type: "verdict",
			payload: JSON.stringify({ decision: opts.decision }),
			clientKey: `verdict-${crypto.randomUUID()}`,
			legacyItemId: itemId,
			createdAt: opts.createdAt,
		});
	}

	// -------------------------------------------------------------------------
	// Helper: seed a verdict via thread initiator path (Path 2)
	// -------------------------------------------------------------------------
	async function seedVerdictViaThreadInitiator(opts: {
		decision: string;
		createdAt: string;
		threadId?: string;
	}): Promise<void> {
		const threadId = opts.threadId ?? crypto.randomUUID();

		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-2",
			initiatorId: "agent-1", // agent-1 initiated this thread
			participants: JSON.stringify(["agent-1", "human-1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		// No legacyItemId — verdict attributes via thread initiator
		await db.insert(messages).values({
			id: crypto.randomUUID(),
			senderId: "human-1",
			threadId,
			type: "verdict",
			payload: JSON.stringify({ decision: opts.decision }),
			clientKey: `verdict-${crypto.randomUUID()}`,
			// legacyItemId is NULL — uses path 2 attribution
			createdAt: opts.createdAt,
		});
	}

	// =========================================================================
	// AC: Zero verdicts → approvalRate=0, totalVerdicts=0
	// =========================================================================

	it("returns approvalRate=0 and totalVerdicts=0 when agent has no verdicts", async () => {
		const result = await computeApprovalRate(db, "agent-1", 30);

		expect(result.approvalRate).toBe(0);
		expect(result.totalVerdicts).toBe(0);
		expect(result.recentVerdicts).toHaveLength(0);
	});

	// =========================================================================
	// AC: All approvals → approvalRate=1.0
	// =========================================================================

	it("returns approvalRate=1.0 when all verdicts are approve", async () => {
		await seedVerdictViaItem({ decision: "approve", createdAt: FIVE_DAYS_AGO });
		await seedVerdictViaItem({ decision: "approve", createdAt: FIVE_DAYS_AGO });
		await seedVerdictViaItem({
			decision: "approve-with-comments",
			createdAt: FIVE_DAYS_AGO,
		});

		const result = await computeApprovalRate(db, "agent-1", 30);

		expect(result.approvalRate).toBe(1.0);
		expect(result.totalVerdicts).toBe(3);
	});

	// =========================================================================
	// AC: Mixed approve/reject → correct rate (3 approve + 1 reject = 0.75)
	// =========================================================================

	it("computes correct approval rate for mixed verdicts", async () => {
		await seedVerdictViaItem({ decision: "approve", createdAt: FIVE_DAYS_AGO });
		await seedVerdictViaItem({ decision: "approve", createdAt: FIVE_DAYS_AGO });
		await seedVerdictViaItem({
			decision: "approve-with-comments",
			createdAt: FIVE_DAYS_AGO,
		});
		await seedVerdictViaItem({ decision: "reject", createdAt: FIVE_DAYS_AGO });

		const result = await computeApprovalRate(db, "agent-1", 30);

		expect(result.approvalRate).toBeCloseTo(0.75);
		expect(result.totalVerdicts).toBe(4);
	});

	// =========================================================================
	// AC: All rejections → approvalRate=0
	// =========================================================================

	it("returns approvalRate=0 when all verdicts are reject", async () => {
		await seedVerdictViaItem({ decision: "reject", createdAt: FIVE_DAYS_AGO });
		await seedVerdictViaItem({ decision: "reject", createdAt: FIVE_DAYS_AGO });

		const result = await computeApprovalRate(db, "agent-1", 30);

		expect(result.approvalRate).toBe(0);
		expect(result.totalVerdicts).toBe(2);
	});

	// =========================================================================
	// AC: Sliding window — old verdicts excluded
	// =========================================================================

	it("excludes verdicts older than the window from the approval rate", async () => {
		// Old approvals outside the 30-day window
		await seedVerdictViaItem({ decision: "approve", createdAt: FORTY_DAYS_AGO });
		await seedVerdictViaItem({ decision: "approve", createdAt: FORTY_DAYS_AGO });
		// Recent rejection inside window
		await seedVerdictViaItem({ decision: "reject", createdAt: FIVE_DAYS_AGO });

		const result = await computeApprovalRate(db, "agent-1", 30);

		// Only the recent rejection counts — 0% approval
		expect(result.approvalRate).toBe(0);
		expect(result.totalVerdicts).toBe(1);
	});

	// =========================================================================
	// AC: Path 2 attribution (thread initiator) works
	// =========================================================================

	it("counts verdicts attributed via thread initiatorId (path 2)", async () => {
		// Verdict on a thread that agent-1 initiated (no legacyItemId)
		await seedVerdictViaThreadInitiator({ decision: "approve", createdAt: FIVE_DAYS_AGO });

		const result = await computeApprovalRate(db, "agent-1", 30);

		expect(result.totalVerdicts).toBeGreaterThanOrEqual(1);
		expect(result.approvalRate).toBe(1.0);
	});

	// =========================================================================
	// AC: No double-counting when both paths match the same message
	// =========================================================================

	it("does not double-count a verdict that has both a legacyItemId and thread initiator match", async () => {
		const threadId = crypto.randomUUID();
		const itemId = crypto.randomUUID();

		// Thread where agent-1 is initiator (path 2 would match)
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-dc",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		// Item with sourceAgentId=agent-1 (path 1 would also match)
		await db.insert(items).values({
			id: itemId,
			sourceAgentId: "agent-1",
			kind: "approval",
			title: "Double-count test",
			threadId,
			createdAt: NOW,
		});

		// Verdict message has legacyItemId set — path 2 should exclude it (AND m.legacy_item_id IS NULL)
		await db.insert(messages).values({
			id: crypto.randomUUID(),
			senderId: "human-1",
			threadId,
			type: "verdict",
			payload: JSON.stringify({ decision: "approve" }),
			clientKey: `verdict-dc-${crypto.randomUUID()}`,
			legacyItemId: itemId,
			createdAt: FIVE_DAYS_AGO,
		});

		const result = await computeApprovalRate(db, "agent-1", 30);

		// Must be exactly 1, not 2
		expect(result.totalVerdicts).toBe(1);
	});

	// =========================================================================
	// AC: recentLimit parameter limits recent verdicts returned
	// =========================================================================

	it("respects recentLimit parameter for recentVerdicts list", async () => {
		// Seed 5 verdicts
		for (let i = 0; i < 5; i++) {
			await seedVerdictViaItem({ decision: "approve", createdAt: FIVE_DAYS_AGO });
		}

		const result = await computeApprovalRate(db, "agent-1", 30, 3);

		// Total count should still be 5
		expect(result.totalVerdicts).toBe(5);
		// But recentVerdicts is limited to 3
		expect(result.recentVerdicts.length).toBeLessThanOrEqual(3);
	});

	// =========================================================================
	// AC: recentVerdicts entries have correct shape
	// =========================================================================

	it("recentVerdicts entries have decision, threadId, and createdAt", async () => {
		await seedVerdictViaItem({ decision: "approve", createdAt: FIVE_DAYS_AGO });

		const result = await computeApprovalRate(db, "agent-1", 30);

		expect(result.recentVerdicts.length).toBe(1);
		const entry = result.recentVerdicts[0];
		expect(entry).toHaveProperty("decision");
		expect(entry).toHaveProperty("threadId");
		expect(entry).toHaveProperty("createdAt");
		expect(entry?.decision).toBe("approve");
	});

	// =========================================================================
	// AC: Agent with no items/threads returns 0 (correct scoping)
	// =========================================================================

	it("does not count verdicts attributed to other agents", async () => {
		// Seed another agent
		await db.insert(users).values({
			id: "agent-2",
			kind: "ai",
			name: "Other Agent",
			role: "designer",
			status: "idle",
			teamId: "tm-1",
			createdAt: NOW,
		});

		// Seed an item attributed to agent-2
		const threadId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-other",
			initiatorId: "agent-2",
			participants: JSON.stringify(["agent-2"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(items).values({
			id: itemId,
			sourceAgentId: "agent-2",
			kind: "approval",
			title: "Other agent item",
			threadId,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: crypto.randomUUID(),
			senderId: "human-1",
			threadId,
			type: "verdict",
			payload: JSON.stringify({ decision: "approve" }),
			clientKey: `verdict-other-${crypto.randomUUID()}`,
			legacyItemId: itemId,
			createdAt: FIVE_DAYS_AGO,
		});

		// Query for agent-1 — should see 0 verdicts
		const result = await computeApprovalRate(db, "agent-1", 30);
		expect(result.totalVerdicts).toBe(0);
		expect(result.approvalRate).toBe(0);
	});

	// =========================================================================
	// AC: Non-verdict message types are not counted
	// =========================================================================

	it("ignores non-verdict message types", async () => {
		const threadId = crypto.randomUUID();
		const itemId = crypto.randomUUID();

		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-nv",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(items).values({
			id: itemId,
			sourceAgentId: "agent-1",
			kind: "approval",
			title: "Non-verdict test",
			threadId,
			createdAt: NOW,
		});

		// Insert a text message (not verdict type) with legacyItemId
		await db.insert(messages).values({
			id: crypto.randomUUID(),
			senderId: "human-1",
			threadId,
			type: "text",
			payload: JSON.stringify({ text: "Looks good" }),
			clientKey: `text-${crypto.randomUUID()}`,
			legacyItemId: itemId,
			createdAt: FIVE_DAYS_AGO,
		});

		const result = await computeApprovalRate(db, "agent-1", 30);
		expect(result.totalVerdicts).toBe(0);
	});
});
