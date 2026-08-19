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
	propagationLog,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { NotificationEvent } from "@hyperidle/domain-model";
import { type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const policyEngineDeps: PolicyDeps = {
	work: {
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: (exec: WriteExecutor, agentId: string) =>
			work.list(exec, "item", { sourceAgentId: agentId }).then((rows) => rows.map((r) => r.id)),
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
		// lifecycle stub (never called in engine tests):
		insertThread,
	},
	users: {
		// lifecycle stub (never called in engine tests):
		getFirstUserByKind: () => Promise.resolve(undefined),
	},
	notifications: { insert: () => Promise.resolve() },
};

// L1a: legacy `responses` table dropped (plan §5.2). Verdicts now project as
// `verdict`-typed messages whose `legacy_item_id` ties them back to the source
// item. The test contract maps 1:1: instead of "row in responses for itemId
// with approver=policy_engine and decision=approve", we assert "verdict-typed
// message with legacy_item_id=itemId, sender_id=policy_engine, payload.decision".
async function selectVerdictsForItem(
	db: HyperIdleDb,
	itemId: string,
): Promise<
	Array<{
		id: string;
		itemId: string;
		decision: string;
		approverId: string;
	}>
> {
	const allMessages = await db.select().from(messages).where(eq(messages.legacyItemId, itemId));
	const rows = allMessages.filter((m) => m.type === "verdict");
	return rows.map((m) => {
		const payload = JSON.parse(m.payload) as { decision: string };
		return {
			id: m.id,
			itemId: m.legacyItemId ?? "",
			decision: payload.decision,
			approverId: m.senderId,
		};
	});
}

describe("Policy Engine (E7)", () => {
	let unsubscribe: (() => void) | undefined;
	const now = new Date().toISOString();

	test("persists an evaluation failure", async ({ db, eventBus }) => {
		const failingDeps: PolicyDeps = {
			...policyEngineDeps,
			work: {
				...policyEngineDeps.work,
				getItemById: () => Promise.reject(new Error("item read unavailable")),
			},
		};
		unsubscribe = registerPolicy(db, eventBus, failingDeps);
		eventBus.emit({
			type: "item_created",
			streamId: "item-failure",
			itemId: "item-failure",
			conversationId: "conversation-failure",
			kind: "review",
			timestamp: Date.now(),
		});
		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, "item-failure"));
			expect(row).toMatchObject({ status: "failed", failureReason: "item read unavailable" });
		});
	});

	async function seedBase(db: HyperIdleDb): Promise<void> {
		await db
			.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });
		await db.insert(users).values([
			{
				id: "agent-1",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: now,
			},
			{
				id: "human-1",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@test.local",
				createdAt: now,
			},
			// @lore L1a: synthetic sender for verdict-typed messages emitted by
			// the policy engine. The new `messages.sender_id` FK requires
			// the user row to exist (legacy `responses.approver_id` had
			// no FK). P2: agents → users table.
			{
				id: "policy_engine",
				kind: "ai",
				name: "Policy Engine",
				role: "system",
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
	}

	/** AD4: Seed N past verdicts for agent-1 via legacy_item_id path. */
	async function seedVerdicts(
		db: HyperIdleDb,
		count: number,
		decision: "approve" | "reject",
	): Promise<void> {
		const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
		for (let i = 0; i < count; i++) {
			const verdictThreadId = crypto.randomUUID();
			const itemId = crypto.randomUUID();

			await db.insert(threads).values({
				id: verdictThreadId,
				hostKind: "task",
				hostId: `verdict-task-${i}-${decision}`,
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: fiveDaysAgo,
				createdAt: fiveDaysAgo,
			});

			await db.insert(items).values({
				id: itemId,
				sourceAgentId: "agent-1",
				kind: "approval",
				title: `Past item ${i}`,
				riskTier: "low",
				threadId: verdictThreadId,
				createdAt: fiveDaysAgo,
			});

			await db.insert(messages).values({
				id: crypto.randomUUID(),
				senderId: "human-1",
				threadId: verdictThreadId,
				type: "verdict",
				payload: JSON.stringify({ decision }),
				clientKey: `verdict-${crypto.randomUUID()}`,
				legacyItemId: itemId,
				createdAt: fiveDaysAgo,
			});
		}
	}

	async function createItem(
		db: HyperIdleDb,
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
			sourceAgentId: overrides.sourceAgentId ?? "agent-1",
			kind: overrides.kind ?? "approval",
			title: "Test item",
			riskTier: overrides.riskTier ?? "low",
			blocking: overrides.blocking ?? false,
			threadId: "thread-1",
			createdAt: now,
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
			conversationId: "thread-1",
			kind: "approval",
			timestamp: Date.now(),
		});
	}

	afterEach(() => {
		unsubscribe?.();
	});

	test("AC1: high approval rate (10/10) + low risk -> auto-resolve with approverId=policy_engine", async ({
		db,
		eventBus,
	}) => {
		// AD4: replaced L4 autonomy with verdict-based trust (10 approvals = 100% >= 0.90 threshold)
		await seedBase(db);
		await seedVerdicts(db, 10, "approve");
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(async () => {
			const resp = await selectVerdictsForItem(db, itemId);
			expect(resp).toHaveLength(1);
		});
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp[0]!.itemId).toBe(itemId);
		expect(resp[0]!.decision).toBe("approve");
		expect(resp[0]!.approverId).toBe("policy_engine");
	});

	test("AC2: medium approval rate (7/10) + low risk -> queue silently (policy_queued in auditTrail, no notification)", async ({
		db,
		eventBus,
	}) => {
		// AD4: replaced L3 autonomy with verdict-based trust (7/10 = 70% >= 0.70 queue threshold)
		await seedBase(db);
		await seedVerdicts(db, 7, "approve");
		await seedVerdicts(db, 3, "reject");
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(async () => {
			const allItems = await db.select().from(items);
			const item = allItems.find((i) => i.id === itemId);
			expect(item?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
		// No verdict-typed message created (legacy: no row in `responses`).
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	test("AC3: L2 + low risk -> push notification", async ({ db, eventBus }) => {
		await seedBase(db);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0]!.targetId).toBe(itemId);
	});

	test("AC4: L1 -> push for every action", async ({ db, eventBus }) => {
		await seedBase(db);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0]!.targetId).toBe(itemId);
	});

	test("AC4: an item with no trust history pushes", async ({ db, eventBus }) => {
		await seedBase(db);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	test("AC7: high risk + L4 -> NEVER auto-resolve, always push", async ({ db, eventBus }) => {
		await seedBase(db);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "high" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		// No auto-resolve
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	test("AC8: skill-change kind + L4 -> NEVER auto-resolve, always push", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { kind: "skill_change", riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	test("AC6: auto-resolve creates Response with approver=policy_engine", async ({
		db,
		eventBus,
	}) => {
		// AD4: replaced L4 autonomy with verdict-based trust
		await seedBase(db);
		await seedVerdicts(db, 10, "approve");
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, { riskTier: "low" });

		emitItemCreated(eventBus, itemId);

		// L1a: Response now projects as a verdict-typed message; approver maps
		// to senderId, decision lives in payload.decision, respondedAt is the
		// message createdAt.
		await vi.waitFor(async () => {
			const verdicts = await selectVerdictsForItem(db, itemId);
			expect(verdicts).toHaveLength(1);
		});
		const verdicts = await selectVerdictsForItem(db, itemId);
		expect(verdicts[0]!.approverId).toBe("policy_engine");
		expect(verdicts[0]!.decision).toBe("approve");
		const [message] = await db.select().from(messages).where(eq(messages.id, verdicts[0]!.id));
		expect(message?.createdAt).toBeTruthy();
	});
});
