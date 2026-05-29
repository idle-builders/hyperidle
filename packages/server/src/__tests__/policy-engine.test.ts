import {
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	items,
	messages,
	products,
	type TestDbHandle,
	teams,
	threads,
	userSkills,
	users,
} from "@hyperidle/db";
import { registerPolicyEngine } from "@hyperidle/fabric";
import { EventBus, type NotificationEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;
	const now = new Date().toISOString();

	async function seedBase(): Promise<void> {
		await db
			.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });

		await db
			.insert(teams)
			.values({ id: "team-1", productId: "prod-1", capacity: 3, activeBets: 0, formedAt: now });

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

	async function seedAgentSkill(autonomyLevel: number): Promise<void> {
		await db.insert(userSkills).values({
			userId: "agent-1",
			skillId: "skill-1",
			autonomyLevel,
			successCount: 0,
			failureCount: 0,
		});
	}

	async function createItem(
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

	function emitItemCreated(itemId: string): void {
		eventBus.emit({
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: "thread-1",
			kind: "approval",
			timestamp: Date.now(),
		});
	}

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		await seedBase();
	});

	afterEach(async () => {
		unsubscribe?.();
	});

	it("AC1: L4 + low risk -> auto-resolve with approverId=policy_engine", async () => {
		await seedAgentSkill(4);
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		await vi.waitFor(async () => {
			const resp = await selectVerdictsForItem(db, itemId);
			expect(resp).toHaveLength(1);
		});
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp[0].itemId).toBe(itemId);
		expect(resp[0].decision).toBe("approve");
		expect(resp[0].approverId).toBe("policy_engine");
	});

	it("AC2: L3 + low risk -> queue silently (policy_queued in auditTrail, no notification)", async () => {
		await seedAgentSkill(3);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low" });

		emitItemCreated(itemId);

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

	it("AC3: L2 + low risk -> push notification", async () => {
		await seedAgentSkill(2);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0].targetId).toBe(itemId);
	});

	it("AC4: L1 -> push for every action", async () => {
		await seedAgentSkill(1);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0].targetId).toBe(itemId);
	});

	it("AC4: no agentSkills defaults to L1 -> push", async () => {
		// No seedAgentSkill call — defaults to L1
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	it("AC7: high risk + L4 -> NEVER auto-resolve, always push", async () => {
		await seedAgentSkill(4);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "high" });

		emitItemCreated(itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		// No auto-resolve
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	it("AC8: skill-change kind + L4 -> NEVER auto-resolve, always push", async () => {
		await seedAgentSkill(4);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ kind: "skill_change", riskTier: "low" });

		emitItemCreated(itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	it("AC5: silence mode active + non-blocking -> queue all items", async () => {
		await seedAgentSkill(2); // Would normally push
		await db.insert(factorySettings).values({ key: "silence_mode", value: "true", updatedAt: now });
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low", blocking: false });

		emitItemCreated(itemId);

		await vi.waitFor(async () => {
			const allItems = await db.select().from(items);
			const item = allItems.find((i) => i.id === itemId);
			expect(item?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	it("AC5: silence mode active + blocking -> push (not queued)", async () => {
		await seedAgentSkill(2);
		await db.insert(factorySettings).values({ key: "silence_mode", value: "true", updatedAt: now });
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low", blocking: true });

		emitItemCreated(itemId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	it("AC6: auto-resolve creates Response with approver=policy_engine", async () => {
		await seedAgentSkill(4);
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		// L1a: Response now projects as a verdict-typed message; approver maps
		// to senderId, decision lives in payload.decision, respondedAt is the
		// message createdAt.
		await vi.waitFor(async () => {
			const verdicts = await selectVerdictsForItem(db, itemId);
			expect(verdicts).toHaveLength(1);
		});
		const verdicts = await selectVerdictsForItem(db, itemId);
		expect(verdicts[0].approverId).toBe("policy_engine");
		expect(verdicts[0].decision).toBe("approve");
		const [message] = await db.select().from(messages).where(eq(messages.id, verdicts[0].id));
		expect(message?.createdAt).toBeTruthy();
	});

	it("AC10: per-product silence -> items from that product queued", async () => {
		await seedAgentSkill(2); // Would normally push
		await db
			.insert(factorySettings)
			.values({ key: "silence_product_prod-1", value: "true", updatedAt: now });

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "low", blocking: false });

		emitItemCreated(itemId);

		await vi.waitFor(async () => {
			const allItems = await db.select().from(items);
			const item = allItems.find((i) => i.id === itemId);
			expect(item?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	it("AC11: silence window - current time in window -> queue", async () => {
		await seedAgentSkill(2); // Would normally push
		// Set silence window to cover 00:00–23:59 (always active)
		await db.insert(factorySettings).values([
			{ key: "silence_window_start", value: "00:00", updatedAt: now },
			{ key: "silence_window_end", value: "23:59", updatedAt: now },
		]);

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		// Use a `now` parameter in the middle of the window
		unsubscribe = registerPolicyEngine(db, eventBus, {
			nowFn: () => new Date("2026-04-16T14:00:00Z"),
		});
		const itemId = await createItem({ riskTier: "low", blocking: false });

		emitItemCreated(itemId);

		await vi.waitFor(async () => {
			const allItems = await db.select().from(items);
			const item = allItems.find((i) => i.id === itemId);
			expect(item?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	it("AC11: silence window - current time outside window -> normal rules", async () => {
		await seedAgentSkill(2); // L2 should push
		// Set window 22:00–07:00 (overnight)
		await db.insert(factorySettings).values([
			{ key: "silence_window_start", value: "22:00", updatedAt: now },
			{ key: "silence_window_end", value: "07:00", updatedAt: now },
		]);

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		// 14:00 is outside 22:00–07:00
		unsubscribe = registerPolicyEngine(db, eventBus, {
			nowFn: () => new Date("2026-04-16T14:00:00Z"),
		});
		const itemId = await createItem({ riskTier: "low", blocking: false });

		emitItemCreated(itemId);

		// Normal L2 behavior: push
		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	it("AC11: silence window - overnight wrap (e.g. 22:00-07:00), time is 23:00 -> queue", async () => {
		await seedAgentSkill(2);
		await db.insert(factorySettings).values([
			{ key: "silence_window_start", value: "22:00", updatedAt: now },
			{ key: "silence_window_end", value: "07:00", updatedAt: now },
		]);

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus, {
			nowFn: () => new Date("2026-04-16T23:00:00Z"),
		});
		const itemId = await createItem({ riskTier: "low", blocking: false });

		emitItemCreated(itemId);

		await vi.waitFor(async () => {
			const allItems = await db.select().from(items);
			const item = allItems.find((i) => i.id === itemId);
			expect(item?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	it("high risk items always push even in silence mode", async () => {
		await seedAgentSkill(4);
		await db.insert(factorySettings).values({ key: "silence_mode", value: "true", updatedAt: now });
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = await createItem({ riskTier: "high", blocking: false });

		emitItemCreated(itemId);

		// High risk always pushes
		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});
});
