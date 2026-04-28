import * as os from "node:os";
import * as path from "node:path";
import {
	agents,
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	teams,
	threads,
} from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createItemTool } from "../create-item.js";
import type { ToolContext } from "../tool-registry.js";

function seed(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "agent-a",
			name: "A",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		})
		.run();
}

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-d4-createitem-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("create_item tool", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seed(db);
	});

	describe("AC6: review item with riskTier=high routes to Conversations", () => {
		it("creates the item, routes to conversations, and emits item_created", async () => {
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
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as {
				itemId: string;
				view: string;
				threadId: string;
			};
			expect(data.view).toBe("conversations");

			const row = db.select().from(items).where(eq(items.id, data.itemId)).get();
			expect(row?.kind).toBe("review");
			expect(row?.riskTier).toBe("high");
			expect(row?.title).toBe("Please review this design");

			// A review thread should exist
			const thread = db.select().from(threads).where(eq(threads.id, data.threadId)).get();
			expect(thread).toBeDefined();

			// Event emitted with the item ID
			expect(emitted).toHaveLength(1);
			expect(emitted[0].itemId).toBe(data.itemId);
			expect(emitted[0].kind).toBe("review");
		});

		it("auto-creates a thread when no threadId is provided", async () => {
			const result = await createItemTool.handler(
				{
					title: "New review",
					kind: "review",
					riskTier: "high",
				},
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { threadId: string };
			const thread = db.select().from(threads).where(eq(threads.id, data.threadId)).get();
			expect(thread).toBeDefined();
		});

		it("reuses an existing thread when threadId is provided", async () => {
			const now = new Date().toISOString();
			db.insert(threads)
				.values({
					id: "existing-thread",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: now,
					createdAt: now,
				})
				.run();

			const result = await createItemTool.handler(
				{
					title: "Follow-up",
					kind: "review",
					threadId: "existing-thread",
				},
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { threadId: string };
			expect(data.threadId).toBe("existing-thread");
		});
	});

	describe("item_created event fields (validation scenario)", () => {
		it("emits event with itemId, conversationId, kind, timestamp", async () => {
			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			const result = await createItemTool.handler(
				{ title: "Something", kind: "review", riskTier: "medium" },
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(true);

			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("item_created");
			expect(typeof emitted[0].itemId).toBe("string");
			expect(typeof emitted[0].conversationId).toBe("string");
			expect(emitted[0].kind).toBe("review");
			expect(typeof emitted[0].timestamp).toBe("number");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("returns INVALID_INPUT when title missing", async () => {
			const result = await createItemTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT for unknown riskTier", async () => {
			const result = await createItemTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "x", riskTier: "extreme" } as any,
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns NOT_FOUND when supplied threadId does not exist", async () => {
			const result = await createItemTool.handler(
				{ title: "x", threadId: "nope" },
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});
