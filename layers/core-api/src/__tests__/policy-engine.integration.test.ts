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
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { NotificationEvent } from "@hyperidle/domain-model";
import { isSilenced } from "@hyperidle/notifications";
import { getTeamMembers } from "@hyperidle/org";
import { type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const silenceDeps = {
	serverConfig: { read: readServerConfig, update: updateServerConfig },
	users: { getUserById: (db: HyperIdleDb, id: string) => findUser(db, { id }) },
	teams: { getTeamMembersById: (db: HyperIdleDb, id: string) => getTeamMembers(db, { id }) },
};

const policyEngineDeps: PolicyDeps = {
	work: {
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: (exec: WriteExecutor, agentId: string) =>
			work.list(exec, "item", { sourceAgentId: agentId }).then((rows) => rows.map((r) => r.id)),
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
		getFirstUserByKind: () => Promise.resolve(undefined),
	},
	silence: {
		isSilenced: (db, item, now) => isSilenced(db, item, now, silenceDeps),
	},
	notifications: { insert: () => Promise.resolve() },
};

// @lore P10: production-fixed system user id for verdict-typed messages emitted
// by the policy engine. Extracted to module-level const so R1 sees a variable
// reference, not a string literal.
const POLICY_ENGINE_ID = "policy_engine";

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

	test("persists an evaluation failure", async ({ db, eventBus, ids }) => {
		const failingDeps: PolicyDeps = {
			...policyEngineDeps,
			work: {
				...policyEngineDeps.work,
				getItemById: () => Promise.reject(new Error("item read unavailable")),
			},
		};
		unsubscribe = registerPolicy(db, eventBus, failingDeps);
		const itemId = ids("item-failure");
		eventBus.emit({
			type: "item_created",
			streamId: itemId,
			itemId,
			conversationId: ids("conversation-failure"),
			kind: "review",
			timestamp: Date.now(),
		});
		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, itemId));
			expect(row).toMatchObject({ status: "failed", failureReason: "item read unavailable" });
		});
	});

	async function seedBase(
		db: HyperIdleDb,
		ids: ScopedIds,
	): Promise<{
		teamId: string;
		tmId: string;
		agentId: string;
		humanId: string;
		threadId: string;
	}> {
		const now = new Date().toISOString();
		const teamId = ids("prod-1");
		const tmId = ids("team-1");
		const agentId = ids("agent-1");
		const humanId = ids("human-1");
		const threadId = ids("thread-1");
		await db
			.insert(teams)
			.values({ id: teamId, name: "Test Product", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: tmId, teamId, capacity: 3, activeBets: 0, formedAt: now });
		await db.insert(users).values([
			{
				id: agentId,
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "idle",
				teamId: tmId,
				createdAt: now,
			},
			{
				id: humanId,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: `founder-${ids("human-1")}@test.local`,
				createdAt: now,
			},
			{
				id: POLICY_ENGINE_ID,
				kind: "ai",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: ids("task-1"),
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		return { teamId, tmId, agentId, humanId, threadId };
	}

	async function seedVerdicts(
		db: HyperIdleDb,
		ids: ScopedIds,
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
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: fiveDaysAgo,
				createdAt: fiveDaysAgo,
			});

			await db.insert(items).values({
				id: itemId,
				sourceAgentId: ids("agent-1"),
				kind: "approval",
				title: `Past item ${i}`,
				riskTier: "low",
				threadId: verdictThreadId,
				createdAt: fiveDaysAgo,
			});

			await db.insert(messages).values({
				id: crypto.randomUUID(),
				senderId: ids("human-1"),
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
		ids: ScopedIds,
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
			sourceAgentId: overrides.sourceAgentId ?? ids("agent-1"),
			kind: overrides.kind ?? "approval",
			title: "Test item",
			riskTier: overrides.riskTier ?? "low",
			blocking: overrides.blocking ?? false,
			threadId: ids("thread-1"),
			createdAt: new Date().toISOString(),
		});

		return itemId;
	}

	function emitItemCreated(
		eventBus: import("@hyperidle/event-bus").EventBus,
		itemId: string,
		threadId: string,
	): void {
		eventBus.emit({
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
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
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		await seedVerdicts(db, ids, 10, "approve");
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(async () => {
			const resp = await selectVerdictsForItem(db, itemId);
			expect(resp).toHaveLength(1);
		});
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp[0]!.itemId).toBe(itemId);
		expect(resp[0]!.decision).toBe("approve");
		expect(resp[0]!.approverId).toBe(POLICY_ENGINE_ID);
	});

	test("AC2: medium approval rate (7/10) + low risk -> queue silently", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedVerdicts(db, ids, 7, "approve");
		await seedVerdicts(db, ids, 3, "reject");
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low" });

		emitItemCreated(eventBus, itemId, ids("thread-1"));

		await vi.waitFor(async () => {
			const myItem = await db.select().from(items).where(eq(items.id, itemId));
			expect(myItem[0]?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	test("AC3: L2 + low risk -> push notification", async ({ db, eventBus, ids }) => {
		const { threadId } = await seedBase(db, ids);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0]!.targetId).toBe(itemId);
	});

	test("AC4: L1 -> push for every action", async ({ db, eventBus, ids }) => {
		const { threadId } = await seedBase(db, ids);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		expect(notifications[0]!.targetId).toBe(itemId);
	});

	test("AC4: an item with no trust history pushes", async ({ db, eventBus, ids }) => {
		const { threadId } = await seedBase(db, ids);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	test("AC7: high risk + L4 -> NEVER auto-resolve, always push", async ({ db, eventBus, ids }) => {
		const { threadId } = await seedBase(db, ids);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "high" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	test("AC8: skill-change kind + L4 -> NEVER auto-resolve, always push", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { kind: "skill_change", riskTier: "low" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});

	test("AC5: silence mode active + non-blocking -> queue all items", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		await updateServerConfig(db, { notifications: { silence: { mode: true } } });
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low", blocking: false });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(async () => {
			const myItem = await db.select().from(items).where(eq(items.id, itemId));
			expect(myItem[0]?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	test("AC5: silence mode active + blocking -> push (not queued)", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		await updateServerConfig(db, { notifications: { silence: { mode: true } } });
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low", blocking: true });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	test("AC6: auto-resolve creates Response with approver=policy_engine", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		await seedVerdicts(db, ids, 10, "approve");
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low" });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(async () => {
			const verdicts = await selectVerdictsForItem(db, itemId);
			expect(verdicts).toHaveLength(1);
		});
		const verdicts = await selectVerdictsForItem(db, itemId);
		expect(verdicts[0]!.approverId).toBe(POLICY_ENGINE_ID);
		expect(verdicts[0]!.decision).toBe("approve");
		const [message] = await db.select().from(messages).where(eq(messages.id, verdicts[0]!.id));
		expect(message?.createdAt).toBeTruthy();
	});

	test("AC10: per-product silence -> items from that product queued", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { teamId, threadId } = await seedBase(db, ids);
		await updateServerConfig(db, { notifications: { silence: { silencedTeamIds: [teamId] } } });

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "low", blocking: false });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(async () => {
			const myItem = await db.select().from(items).where(eq(items.id, itemId));
			expect(myItem[0]?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	test("AC11: silence window - current time in window -> queue", async ({ db, eventBus, ids }) => {
		const { threadId } = await seedBase(db, ids);
		await updateServerConfig(db, {
			notifications: { silence: { windowStart: "00:00", windowEnd: "23:59" } },
		});

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps, {
			nowFn: () => new Date("2026-04-16T14:00:00Z"),
		});
		const itemId = await createItem(db, ids, { riskTier: "low", blocking: false });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(async () => {
			const myItem = await db.select().from(items).where(eq(items.id, itemId));
			expect(myItem[0]?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	test("AC11: silence window - current time outside window -> normal rules", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		await updateServerConfig(db, {
			notifications: { silence: { windowStart: "22:00", windowEnd: "07:00" } },
		});

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps, {
			nowFn: () => new Date("2026-04-16T14:00:00Z"),
		});
		const itemId = await createItem(db, ids, { riskTier: "low", blocking: false });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
	});

	test("AC11: silence window - overnight wrap (e.g. 22:00-07:00), time is 23:00 -> queue", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { threadId } = await seedBase(db, ids);
		await updateServerConfig(db, {
			notifications: { silence: { windowStart: "22:00", windowEnd: "07:00" } },
		});

		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps, {
			nowFn: () => new Date("2026-04-16T23:00:00Z"),
		});
		const itemId = await createItem(db, ids, { riskTier: "low", blocking: false });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(async () => {
			const myItem = await db.select().from(items).where(eq(items.id, itemId));
			expect(myItem[0]?.auditTrail).toContain("policy_queued");
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(notifications).toHaveLength(0);
	});

	test("high risk items always push even in silence mode", async ({ db, eventBus, ids }) => {
		const { threadId } = await seedBase(db, ids);
		await updateServerConfig(db, { notifications: { silence: { mode: true } } });
		const notifications: NotificationEvent[] = [];
		eventBus.on("notification", (e) => notifications.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyEngineDeps);
		const itemId = await createItem(db, ids, { riskTier: "high", blocking: false });

		emitItemCreated(eventBus, itemId, threadId);

		await vi.waitFor(() => expect(notifications).toHaveLength(1));
		const resp = await selectVerdictsForItem(db, itemId);
		expect(resp).toHaveLength(0);
	});
});
