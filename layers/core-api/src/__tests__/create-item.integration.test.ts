import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, items, teamMembers, teams, threads, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { ItemCreatedEvent } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function buildCreateItemTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "create_item",
	)!;
}

async function seed(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: ids("p1"), name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values({
		id: ids("agent-a"),
		name: "A",
		role: "builder",
		teamId: ids("t1"),
		status: "active",
		createdAt: now,
	});
}

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	ids: ScopedIds,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: ids("agent-a"),
		sessionId: ids("session-1"),
		taskId: ids("task-1"),
		sandboxPath: path.join(os.tmpdir(), `hi-d4-createitem-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("create_item tool", () => {
	describe("AC6: review item with riskTier=high routes to Conversations", () => {
		test("creates the item, routes to conversations, and emits item_created", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e) => {
				emitted.push(e);
			});

			const result = await createItemTool.handler(
				{
					title: "Please review this design",
					kind: "review",
					riskTier: "high",
					body: "Design doc draft.",
				},
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as {
				itemId: string;
				threadId: string;
			};

			const [row] = await db.select().from(items).where(eq(items.id, data.itemId));
			expect(row?.kind).toBe("review");
			expect(row?.riskTier).toBe("high");
			expect(row?.title).toBe("Please review this design");

			// A review thread should exist
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();

			// Event emitted with the item ID
			expect(emitted).toHaveLength(1);
			expect(emitted[0]!.itemId).toBe(data.itemId);
			expect(emitted[0]!.kind).toBe("review");
		});

		test("auto-creates a thread when no threadId is provided", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const result = await createItemTool.handler(
				{
					title: "New review",
					kind: "review",
					riskTier: "high",
				},
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { threadId: string };
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();
		});

		test("reuses an existing thread when threadId is provided", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const now = new Date().toISOString();
			await db.insert(threads).values({
				id: ids("existing-thread"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: now,
				createdAt: now,
			});

			const result = await createItemTool.handler(
				{
					title: "Follow-up",
					kind: "review",
					threadId: ids("existing-thread"),
				},
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { threadId: string };
			expect(data.threadId).toBe(ids("existing-thread"));
		});
	});

	describe("AU21 §6 Decision L3: result shape has no view field (routeItem deleted)", () => {
		test("result is exactly {itemId, threadId} — no view field", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const result = await createItemTool.handler(
				{
					title: "Please review this design",
					kind: "review",
					riskTier: "high",
					body: "Design doc draft.",
				},
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as Record<string, unknown>;
			expect(Object.hasOwn(data, "view")).toBe(false);
			expect(Object.keys(data).sort()).toEqual(["itemId", "threadId"]);
		});
	});

	describe("item_created event fields (validation scenario)", () => {
		test("emits event with itemId, conversationId, kind, timestamp", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			const result = await createItemTool.handler(
				{ title: "Something", kind: "review", riskTier: "medium" },
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(true);

			expect(emitted).toHaveLength(1);
			expect(emitted[0]!.type).toBe("item_created");
			expect(typeof emitted[0]!.itemId).toBe("string");
			expect(typeof emitted[0]!.conversationId).toBe("string");
			expect(emitted[0]!.kind).toBe("review");
			expect(typeof emitted[0]!.timestamp).toBe("number");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when title missing", async ({ db, eventBus, app, ids }) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const result = await createItemTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for unknown riskTier", async ({ db, eventBus, app, ids }) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const result = await createItemTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "x", riskTier: "extreme" } as any,
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns NOT_FOUND when supplied threadId does not exist", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createItemTool = buildCreateItemTool(app);
			await seed(db, ids);
			const result = await createItemTool.handler(
				{ title: "x", threadId: ids("nonexistent-thread") },
				makeContext(db, eventBus, ids),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});
