import {
	type HyperIdleDb,
	agentSkills,
	agents,
	createTestDb,
	factorySettings,
	items,
	products,
	responses,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus, type NotificationEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerPolicyEngine } from "../services/policy-engine.js";

describe("Policy Engine (E7)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;
	const now = new Date().toISOString();

	function seedBase(): void {
		db.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })
			.run();
		db.insert(teams)
			.values({ id: "team-1", productId: "prod-1", capacity: 3, activeBets: 0, formedAt: now })
			.run();
		db.insert(agents)
			.values({
				id: "agent-1",
				name: "Builder",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: now,
			})
			.run();
		db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: now }).run();
	}

	function seedAgentSkill(autonomyLevel: number): void {
		db.insert(agentSkills)
			.values({
				agentId: "agent-1",
				skillId: "skill-1",
				autonomyLevel,
				successCount: 0,
				failureCount: 0,
			})
			.run();
	}

	function createItem(
		overrides: Partial<{
			id: string;
			kind: string;
			riskTier: string;
			blocking: number;
			sourceAgentId: string;
		}> = {},
	): string {
		const itemId = overrides.id ?? crypto.randomUUID();
		db.insert(items)
			.values({
				id: itemId,
				sourceAgentId: overrides.sourceAgentId ?? "agent-1",
				kind: overrides.kind ?? "approval",
				title: "Test item",
				riskTier: overrides.riskTier ?? "low",
				blocking: overrides.blocking ?? 0,
				threadId: "thread-1",
				createdAt: now,
			})
			.run();
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

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase();
	});

	afterEach(() => {
		unsubscribe?.();
	});

	it("AC1: L4 + low risk -> auto-resolve with approverId=policy_engine", () => {
		seedAgentSkill(4);
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		const resp = db.select().from(responses).all();
		expect(resp).toHaveLength(1);
		expect(resp[0].itemId).toBe(itemId);
		expect(resp[0].decision).toBe("approve");
		expect(resp[0].approverId).toBe("policy_engine");
	});

	it("AC2: L3 + low risk -> queue silently (policy_queued in auditTrail, no notification)", () => {
		seedAgentSkill(3);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		const item = db
			.select()
			.from(items)
			.all()
			.find((i) => i.id === itemId);
		expect(item?.auditTrail).toContain("policy_queued");
		expect(notifications).toHaveLength(0);
		// No response created
		const resp = db.select().from(responses).all();
		expect(resp).toHaveLength(0);
	});

	it("AC3: L2 + low risk -> push notification", () => {
		seedAgentSkill(2);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		expect(notifications).toHaveLength(1);
		expect(notifications[0].targetId).toBe(itemId);
	});

	it("AC4: L1 -> push for every action", () => {
		seedAgentSkill(1);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		expect(notifications).toHaveLength(1);
		expect(notifications[0].targetId).toBe(itemId);
	});

	it("AC4: no agentSkills defaults to L1 -> push", () => {
		// No seedAgentSkill call — defaults to L1
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		expect(notifications).toHaveLength(1);
	});

	it("AC7: high risk + L4 -> NEVER auto-resolve, always push", () => {
		seedAgentSkill(4);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "high" });

		emitItemCreated(itemId);

		// No auto-resolve
		const resp = db.select().from(responses).all();
		expect(resp).toHaveLength(0);
		// Push notification
		expect(notifications).toHaveLength(1);
	});

	it("AC8: skill-change kind + L4 -> NEVER auto-resolve, always push", () => {
		seedAgentSkill(4);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ kind: "skill_change", riskTier: "low" });

		emitItemCreated(itemId);

		const resp = db.select().from(responses).all();
		expect(resp).toHaveLength(0);
		expect(notifications).toHaveLength(1);
	});

	it("AC5: silence mode active + non-blocking -> queue all items", () => {
		seedAgentSkill(2); // Would normally push
		db.insert(factorySettings).values({ key: "silence_mode", value: "true", updatedAt: now }).run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low", blocking: 0 });

		emitItemCreated(itemId);

		const item = db
			.select()
			.from(items)
			.all()
			.find((i) => i.id === itemId);
		expect(item?.auditTrail).toContain("policy_queued");
		expect(notifications).toHaveLength(0);
	});

	it("AC5: silence mode active + blocking -> push (not queued)", () => {
		seedAgentSkill(2);
		db.insert(factorySettings).values({ key: "silence_mode", value: "true", updatedAt: now }).run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low", blocking: 1 });

		emitItemCreated(itemId);

		expect(notifications).toHaveLength(1);
	});

	it("AC6: auto-resolve creates Response with approver=policy_engine", () => {
		seedAgentSkill(4);
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low" });

		emitItemCreated(itemId);

		const resp = db.select().from(responses).all();
		expect(resp).toHaveLength(1);
		expect(resp[0].approverId).toBe("policy_engine");
		expect(resp[0].decision).toBe("approve");
		expect(resp[0].respondedAt).toBeTruthy();
	});

	it("AC10: per-product silence -> items from that product queued", () => {
		seedAgentSkill(2); // Would normally push
		db.insert(factorySettings)
			.values({ key: "silence_product_prod-1", value: "true", updatedAt: now })
			.run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "low", blocking: 0 });

		emitItemCreated(itemId);

		const item = db
			.select()
			.from(items)
			.all()
			.find((i) => i.id === itemId);
		expect(item?.auditTrail).toContain("policy_queued");
		expect(notifications).toHaveLength(0);
	});

	it("AC11: silence window - current time in window -> queue", () => {
		seedAgentSkill(2); // Would normally push
		// Set silence window to cover 00:00–23:59 (always active)
		db.insert(factorySettings)
			.values([
				{ key: "silence_window_start", value: "00:00", updatedAt: now },
				{ key: "silence_window_end", value: "23:59", updatedAt: now },
			])
			.run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		// Use a `now` parameter in the middle of the window
		unsubscribe = registerPolicyEngine(db, eventBus, {
			nowFn: () => new Date("2026-04-16T14:00:00Z"),
		});
		const itemId = createItem({ riskTier: "low", blocking: 0 });

		emitItemCreated(itemId);

		const item = db
			.select()
			.from(items)
			.all()
			.find((i) => i.id === itemId);
		expect(item?.auditTrail).toContain("policy_queued");
		expect(notifications).toHaveLength(0);
	});

	it("AC11: silence window - current time outside window -> normal rules", () => {
		seedAgentSkill(2); // L2 should push
		// Set window 22:00–07:00 (overnight)
		db.insert(factorySettings)
			.values([
				{ key: "silence_window_start", value: "22:00", updatedAt: now },
				{ key: "silence_window_end", value: "07:00", updatedAt: now },
			])
			.run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		// 14:00 is outside 22:00–07:00
		unsubscribe = registerPolicyEngine(db, eventBus, {
			nowFn: () => new Date("2026-04-16T14:00:00Z"),
		});
		const itemId = createItem({ riskTier: "low", blocking: 0 });

		emitItemCreated(itemId);

		// Normal L2 behavior: push
		expect(notifications).toHaveLength(1);
	});

	it("AC11: silence window - overnight wrap (e.g. 22:00-07:00), time is 23:00 -> queue", () => {
		seedAgentSkill(2);
		db.insert(factorySettings)
			.values([
				{ key: "silence_window_start", value: "22:00", updatedAt: now },
				{ key: "silence_window_end", value: "07:00", updatedAt: now },
			])
			.run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus, {
			nowFn: () => new Date("2026-04-16T23:00:00Z"),
		});
		const itemId = createItem({ riskTier: "low", blocking: 0 });

		emitItemCreated(itemId);

		const item = db
			.select()
			.from(items)
			.all()
			.find((i) => i.id === itemId);
		expect(item?.auditTrail).toContain("policy_queued");
		expect(notifications).toHaveLength(0);
	});

	it("high risk items always push even in silence mode", () => {
		seedAgentSkill(4);
		db.insert(factorySettings).values({ key: "silence_mode", value: "true", updatedAt: now }).run();
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicyEngine(db, eventBus);
		const itemId = createItem({ riskTier: "high", blocking: 0 });

		emitItemCreated(itemId);

		// High risk always pushes
		expect(notifications).toHaveLength(1);
		const resp = db.select().from(responses).all();
		expect(resp).toHaveLength(0);
	});
});
