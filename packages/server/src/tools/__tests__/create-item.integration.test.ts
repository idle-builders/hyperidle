import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, items, teamMembers, teams, threads, users } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { createItemTool } from "@hyperidle/agent-layer";
import type { ToolContext } from "@hyperidle/agent-layer";

async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values({
		id: "agent-a",
		name: "A",
		role: "builder",
		teamId: "t1",
		status: "active",
		maxConcurrentSessions: 2,
		createdAt: now,
	});
}

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-createitem-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("create_item tool", () => {
	describe("AC6: review item with riskTier=high routes to Conversations", () => {
		test("creates the item, routes to conversations, and emits item_created", async ({
			db,
			eventBus,
		}) => {
			await seed(db);
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

		test("auto-creates a thread when no threadId is provided", async ({ db, eventBus }) => {
			await seed(db);
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
			const [thread] = await db.select().from(threads).where(eq(threads.id, data.threadId));
			expect(thread).toBeDefined();
		});

		test("reuses an existing thread when threadId is provided", async ({ db, eventBus }) => {
			await seed(db);
			const now = new Date().toISOString();
			await db.insert(threads).values({
				id: "existing-thread",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});

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
		test("emits event with itemId, conversationId, kind, timestamp", async ({ db, eventBus }) => {
			await seed(db);
			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			const result = await createItemTool.handler(
				{ title: "Something", kind: "review", riskTier: "medium" },
				makeContext(db, eventBus),
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
		test("returns INVALID_INPUT when title missing", async ({ db, eventBus }) => {
			await seed(db);
			const result = await createItemTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for unknown riskTier", async ({ db, eventBus }) => {
			await seed(db);
			const result = await createItemTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "x", riskTier: "extreme" } as any,
				makeContext(db, eventBus),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns NOT_FOUND when supplied threadId does not exist", async ({ db, eventBus }) => {
			await seed(db);
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
