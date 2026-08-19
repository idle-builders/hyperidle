/**
 * AD4 — Policy Engine tests (RED phase)
 *
 * Replaces the autonomy-level-based trust logic with approval-rate-based trust.
 * These tests seed verdict messages to create known approval rates, then assert
 * on the policy engine's decision.
 *
 * AC3: Policy engine's auto-resolve vs escalate decision is based on review
 *      verdict history (approve rate), NOT manually-assigned autonomy level.
 *
 * Test cases (per architecture plan §6):
 * 1. High approval rate (>= 0.90) + >= 10 verdicts + low risk → auto-resolve
 * 2. Medium approval rate (>= 0.70, < 0.90) + low risk → queue
 * 3. Low approval rate (< 0.70) + low risk → push
 * 4. High approval rate + insufficient verdicts (< 10) + low risk → push (cold start)
 * 5. High approval rate + high risk → push (risk overrides trust)
 * 6. Skill-change kind → push (unchanged)
 * 7. No verdicts (cold start) → push
 * 8. Silence mode still queues (unchanged behavior)
 * 9. Custom thresholds from factory settings respected
 *
 * These tests FAIL until:
 * - packages/server/app-runtime/src/services/approval-rate.ts is created
 * - packages/server/app-runtime/src/services/policy-engine.ts is rewritten to use computeApprovalRate
 */

import {
	insertMessage,
	insertThread,
	listMessages,
	updateMessage,
	updateThread,
} from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import {
	type HyperIdleDb,
	items,
	messages,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { NotificationEvent } from "@hyperidle/domain-model";
import { computeApprovalRate, type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import * as work from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const policyEngineDeps: PolicyDeps = {
	work: {
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: async (exec: WriteExecutor, agentId: string) => {
			const rows = await work.list(exec, "item", { sourceAgentId: agentId });
			return rows.map((r) => r.id);
		},
		// lifecycle stubs (never called in engine tests):
		getTaskById: () => Promise.resolve(undefined),
		getBetById: () => Promise.resolve(undefined),
		transitionBetStatus: () => Promise.resolve({ applied: false }),
		transitionTaskState: () => Promise.resolve({ applied: false }),
		listTasks: () => Promise.resolve([]),
	},
	conversation: {
		insertMessage,
		listMessagesByThread: (db, threadId, opts) =>
			listMessages(db, {
				threadId,
				types: opts?.type ? [opts.type] : undefined,
				order: opts?.order,
				dir: opts?.dir,
				limit: opts?.limit,
			}),
		updateMessage,
		updateThread,
		listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
			listMessages(db, { threadInitiatorId: initiatorId, types: ["verdict"], since: windowStart }),
		listVerdictMessagesByItemIds: (db, itemIds, windowStart) =>
			listMessages(db, { legacyItemIds: itemIds, types: ["verdict"], since: windowStart }),
		insertThread,
	},
	users: {
		// lifecycle stub (never called in engine tests):
		getFirstUserByKind: () => Promise.resolve(undefined),
	},
	notifications: { insert: () => Promise.resolve() },
};

const NOW = new Date().toISOString();
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Helper: get auto-resolve verdicts written by the policy engine for an item
// ---------------------------------------------------------------------------
async function getPolicyEngineVerdicts(
	db: HyperIdleDb,
	itemId: string,
): Promise<Array<{ id: string; decision: string; approverId: string }>> {
	const rows = await db
		.select()
		.from(messages)
		.where(and(eq(messages.legacyItemId, itemId), eq(messages.type, "verdict")));
	return rows.map((m) => {
		const payload = JSON.parse(m.payload) as { decision: string };
		return { id: m.id, decision: payload.decision, approverId: m.senderId };
	});
}

describe("AD4 Policy Engine — approval-rate-based trust", () => {
	let unsubscribe: (() => void) | undefined;

	// -------------------------------------------------------------------------
	// Seed base entities for each test
	// -------------------------------------------------------------------------
	async function seedBase(db: HyperIdleDb): Promise<void> {
		await db.insert(teams).values({
			id: "ad4-team-1",
			name: "AD4 Test Team",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(users).values([
			{
				id: "ad4-agent-1",
				kind: "ai",
				name: "Builder Agent",
				role: "builder",
				status: "idle",
				teamId: "ad4-team-1",
				createdAt: NOW,
			},
			{
				id: "ad4-human-1",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@ad4.test",
				createdAt: NOW,
			},
			// policy_engine sender row required for messages FK
			{
				id: "policy_engine",
				kind: "ai",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: NOW,
			},
		]);
		await db.insert(threads).values({
			id: "ad4-thread-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "ad4-agent-1",
			participants: JSON.stringify(["ad4-agent-1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
	}

	// -------------------------------------------------------------------------
	// Seed N verdicts for agent-1 (via legacyItemId path, within window)
	// -------------------------------------------------------------------------
	async function seedVerdicts(
		db: HyperIdleDb,
		count: number,
		decision: "approve" | "reject",
	): Promise<void> {
		for (let i = 0; i < count; i++) {
			const verdictThreadId = crypto.randomUUID();
			const itemId = crypto.randomUUID();

			await db.insert(threads).values({
				id: verdictThreadId,
				hostKind: "task",
				hostId: `verdict-task-${i}-${decision}`,
				initiatorId: "ad4-agent-1",
				participants: JSON.stringify(["ad4-agent-1"]),
				lastActiveAt: FIVE_DAYS_AGO,
				createdAt: FIVE_DAYS_AGO,
			});

			await db.insert(items).values({
				id: itemId,
				sourceAgentId: "ad4-agent-1",
				kind: "approval",
				title: `Past item ${i}`,
				riskTier: "low",
				threadId: verdictThreadId,
				createdAt: FIVE_DAYS_AGO,
			});

			await db.insert(messages).values({
				id: crypto.randomUUID(),
				senderId: "ad4-human-1",
				threadId: verdictThreadId,
				type: "verdict",
				payload: JSON.stringify({ decision }),
				clientKey: `verdict-${crypto.randomUUID()}`,
				legacyItemId: itemId,
				createdAt: FIVE_DAYS_AGO,
			});
		}
	}

	// -------------------------------------------------------------------------
	// Create an item to be evaluated by the policy engine
	// -------------------------------------------------------------------------
	async function createItem(
		db: HyperIdleDb,
		_eventBus: import("@hyperidle/event-bus").EventBus,
		overrides: Partial<{
			id: string;
			kind: string;
			riskTier: string;
			blocking: boolean;
			sourceAgentId: string;
		}> = {},
	): Promise<string> {
		const itemId = overrides.id ?? crypto.randomUUID();
		await db.insert(items).values({
			id: itemId,
			sourceAgentId: overrides.sourceAgentId ?? "ad4-agent-1",
			kind: overrides.kind ?? "approval",
			title: "Test item",
			riskTier: overrides.riskTier ?? "low",
			blocking: overrides.blocking ?? false,
			threadId: "ad4-thread-1",
			createdAt: NOW,
		});
		return itemId;
	}

	function emitItemCreated(
		eventBus: import("@hyperidle/event-bus").EventBus,
		itemId: string,
	): void {
		eventBus.emit({
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: "ad4-thread-1",
			kind: "approval",
			timestamp: Date.now(),
		});
	}

	afterEach(() => {
		unsubscribe?.();
	});

	describe("AU20 policy completeness contract — approval-rate query", () => {
		test("combines both attribution paths, applies the time window, and returns newest verdicts first", async ({
			db,
		}) => {
			await seedBase(db);

			const legacyItemId = crypto.randomUUID();
			await db.insert(items).values({
				id: legacyItemId,
				sourceAgentId: "ad4-agent-1",
				kind: "approval",
				title: "Legacy-attributed item",
				threadId: "ad4-thread-1",
				createdAt: FIVE_DAYS_AGO,
			});
			await db.insert(messages).values([
				{
					id: "contract-legacy-approve",
					senderId: "ad4-human-1",
					threadId: "ad4-thread-1",
					type: "verdict",
					payload: JSON.stringify({ decision: "approve" }),
					clientKey: "contract-legacy-approve",
					legacyItemId,
					createdAt: FIVE_DAYS_AGO,
				},
				{
					id: "contract-thread-reject",
					senderId: "ad4-human-1",
					threadId: "ad4-thread-1",
					type: "verdict",
					payload: JSON.stringify({ decision: "reject" }),
					clientKey: "contract-thread-reject",
					createdAt: NOW,
				},
				{
					id: "contract-expired-approve",
					senderId: "ad4-human-1",
					threadId: "ad4-thread-1",
					type: "verdict",
					payload: JSON.stringify({ decision: "approve-with-comments" }),
					clientKey: "contract-expired-approve",
					createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
				},
			]);

			const result = await computeApprovalRate(db, "ad4-agent-1", 30, policyEngineDeps, 2);

			expect(result.approvalRate).toBe(0.5);
			expect(result.totalVerdicts).toBe(2);
			expect(result.recentVerdicts).toEqual([
				{ decision: "reject", threadId: "ad4-thread-1", createdAt: NOW },
				{ decision: "approve", threadId: "ad4-thread-1", createdAt: FIVE_DAYS_AGO },
			]);
		});

		test("returns the stable empty result when an agent has no verdict history", async ({ db }) => {
			await seedBase(db);

			await expect(
				computeApprovalRate(db, "agent-without-history", 30, policyEngineDeps),
			).resolves.toEqual({ approvalRate: 0, totalVerdicts: 0, recentVerdicts: [] });
		});
	});

	// =========================================================================
	// TC1: High approval rate (>= 0.90) + >= 10 verdicts + low risk → auto-resolve
	// =========================================================================

	test("TC1: high approval rate (10/10 approve) + low risk → auto-resolve", async ({
		db,
		eventBus,
	}) => {
		// Seed 10 approvals — rate = 1.0 (>= 0.90 threshold)
		await seedBase(db);
		await seedVerdicts(db, 10, "approve");

		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { riskTier: "low" });
		emitItemCreated(eventBus, itemId);

		await vi.waitFor(async () => {
			const verdicts = await getPolicyEngineVerdicts(db, itemId);
			expect(verdicts).toHaveLength(1);
		});

		const verdicts = await getPolicyEngineVerdicts(db, itemId);
		expect(verdicts[0]?.decision).toBe("approve");
		expect(verdicts[0]?.approverId).toBe("policy_engine");
	});

	// =========================================================================
	// TC2: Medium approval rate (>= 0.70, < 0.90) + low risk → queue
	// =========================================================================

	test("TC2: medium approval rate (7/10 approve) + low risk → queue", async ({ db, eventBus }) => {
		// 7 approvals + 3 rejections = 70% rate (>= 0.70 queue threshold, < 0.90 auto-resolve)
		await seedBase(db);
		await seedVerdicts(db, 7, "approve");
		await seedVerdicts(db, 3, "reject");

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { riskTier: "low" });
		emitItemCreated(eventBus, itemId);

		await vi.waitFor(async () => {
			const [currentItem] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
			expect(currentItem?.auditTrail).toContain("policy_queued");
		});

		// No notification (queued, not pushed)
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);

		// No auto-resolve verdict
		const verdicts = await getPolicyEngineVerdicts(db, itemId);
		expect(verdicts).toHaveLength(0);
	});

	// =========================================================================
	// TC3: Low approval rate (< 0.70) + low risk → push
	// =========================================================================

	test("TC3: low approval rate (5/10 approve) + low risk → push notification", async ({
		db,
		eventBus,
	}) => {
		// 5 approvals + 5 rejections = 50% rate (< 0.70 threshold)
		await seedBase(db);
		await seedVerdicts(db, 5, "approve");
		await seedVerdicts(db, 5, "reject");

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { riskTier: "low" });
		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0]?.targetId).toBe(itemId);
	});

	// =========================================================================
	// TC4: High approval rate + insufficient verdicts (< 10) → push (cold start)
	// =========================================================================

	test("TC4: high approval rate (5/5 = 100%) but only 5 verdicts → push (cold start)", async ({
		db,
		eventBus,
	}) => {
		// 5/5 approvals = 100% rate BUT only 5 verdicts — below min_verdicts=10
		await seedBase(db);
		await seedVerdicts(db, 5, "approve");

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { riskTier: "low" });
		emitItemCreated(eventBus, itemId);

		// Should push (not auto-resolve) — insufficient evidence
		await vi.waitFor(() => expect(notifications).toHaveLength(1));

		// No auto-resolve verdict
		const verdicts = await getPolicyEngineVerdicts(db, itemId);
		expect(verdicts).toHaveLength(0);
	});

	// =========================================================================
	// TC5: High approval rate + high risk → push (risk overrides trust)
	// =========================================================================

	test("TC5: high approval rate (10/10) + high risk → always push", async ({ db, eventBus }) => {
		await seedBase(db);
		await seedVerdicts(db, 10, "approve");

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { riskTier: "high" });
		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));

		// No auto-resolve
		const verdicts = await getPolicyEngineVerdicts(db, itemId);
		expect(verdicts).toHaveLength(0);
	});

	// =========================================================================
	// TC6: Skill-change kind → always push (unchanged)
	// =========================================================================

	test("TC6: skill-change kind → always push regardless of approval rate", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		await seedVerdicts(db, 10, "approve");

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { kind: "skill_change", riskTier: "low" });
		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));

		const verdicts = await getPolicyEngineVerdicts(db, itemId);
		expect(verdicts).toHaveLength(0);
	});

	// =========================================================================
	// TC7: No verdicts (cold start) → push
	// =========================================================================

	test("TC7: no verdicts (cold start) → push notification", async ({ db, eventBus }) => {
		// No seedVerdicts call — agent has no history
		await seedBase(db);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, eventBus, { riskTier: "low" });
		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	// =========================================================================
	// TC9: Custom thresholds from factory settings — RETIRED (AU18)
	// =========================================================================
	// @lore AU18: trust threshold settability via `factory_settings` is
	// retired (plan §3/§10 — no production or eval writer ever existed; the
	// only path was the generic PATCH /api/status/settings catch-all, also
	// retired this WP). `getFactorySettingFloat`/`getFactorySettingInt` in
	// policy-engine.ts now always return their hardcoded defaults, so TC9a/b's
	// "custom threshold" premise no longer applies — dropped per the plan's
	// explicit "defaults-only, boring tech" decision for this namespace.
	// Default-threshold policy behavior remains covered by TC1-TC7 above.
	// @lore AU43: TC8 (silence mode queues) removed — silence config has no
	// writer; silence branch was constant-false in all real installs.
});
