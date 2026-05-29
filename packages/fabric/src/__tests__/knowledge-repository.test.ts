import { createTestDb, type HyperIdleDb, knowledgeEditLog } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionConflictError } from "../errors.js";
import { KnowledgeEventType, knowledgeEvents } from "../events.js";
import { setupFts } from "../fts.js";
import { create, getById, list, search, update } from "../knowledge-repository.js";

let handle: Awaited<ReturnType<typeof createTestDb>>;

async function makeDb(): Promise<HyperIdleDb> {
	handle = await createTestDb();
	await setupFts(handle.db);
	return handle.db;
}

describe("knowledge-repository", () => {
	let db: HyperIdleDb;

	beforeEach(async () => {
		db = await makeDb();
		knowledgeEvents.removeAllListeners();
	});

	afterEach(async () => {
		await handle.close();
	});

	const baseItem = {
		layer: "L1" as const,
		scopeId: "product-1",
		kind: "pattern" as const,
		topic: "testing",
		title: "Test Pattern",
		body: "This is a test pattern for unit testing.",
		format: "markdown" as const,
		status: "active" as const,
		updatedBy: "agent-1",
	};

	describe("create", () => {
		it("creates a knowledge item with version 1", async () => {
			const item = await create(db, baseItem);
			expect(item.id).toBeTruthy();
			expect(item.version).toBe(1);
			expect(item.title).toBe("Test Pattern");
			expect(item.layer).toBe("L1");
		});

		it("assigns created_at and updated_at timestamps", async () => {
			const item = await create(db, baseItem);
			expect(item.createdAt).toBeTruthy();
			expect(item.updatedAt).toBeTruthy();
		});
	});

	describe("getById", () => {
		it("returns the item by id", async () => {
			const created = await create(db, baseItem);
			const found = await getById(db, created.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.title).toBe("Test Pattern");
		});

		it("returns null for non-existent id", async () => {
			const found = await getById(db, "non-existent");
			expect(found).toBeNull();
		});
	});

	describe("update", () => {
		it("updates fields and increments version", async () => {
			const created = await create(db, baseItem);
			const updated = await update(db, created.id, { title: "Updated Title" }, 1);
			expect(updated.title).toBe("Updated Title");
			expect(updated.version).toBe(2);
		});

		it("updates multiple fields at once", async () => {
			const created = await create(db, baseItem);
			const updated = await update(
				db,
				created.id,
				{ title: "New Title", body: "New body content", topic: "new-topic" },
				1,
			);
			expect(updated.title).toBe("New Title");
			expect(updated.body).toBe("New body content");
			expect(updated.topic).toBe("new-topic");
			expect(updated.version).toBe(2);
		});

		it("updates updatedAt timestamp", async () => {
			const created = await create(db, baseItem);
			const updated = await update(db, created.id, { title: "New" }, 1);
			expect(updated.updatedAt).toBeTruthy();
			expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
				new Date(created.updatedAt).getTime(),
			);
			expect(updated.version).toBe(2);
		});
	});

	describe("optimistic concurrency", () => {
		it("throws VersionConflictError on stale version", async () => {
			const created = await create(db, baseItem);
			await update(db, created.id, { title: "First update" }, 1);

			try {
				await update(db, created.id, { title: "Stale update" }, 1);
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(VersionConflictError);
				const vce = err as VersionConflictError;
				expect(vce.currentVersion).toBe(2);
			}
		});

		it("succeeds with correct version after prior update", async () => {
			const created = await create(db, baseItem);
			await update(db, created.id, { title: "V2" }, 1);
			const v3 = await update(db, created.id, { title: "V3" }, 2);
			expect(v3.version).toBe(3);
			expect(v3.title).toBe("V3");
		});
	});

	describe("search", () => {
		it("returns matching items ranked by relevance from 10 items", async () => {
			const items = [
				{
					...baseItem,
					title: "TypeScript testing patterns",
					body: "Advanced testing patterns for TypeScript projects.",
				},
				{
					...baseItem,
					title: "React component design",
					body: "How to design reusable React components.",
				},
				{
					...baseItem,
					title: "Database optimization",
					body: "Optimize database queries for performance.",
				},
				{ ...baseItem, title: "API design principles", body: "REST API design best practices." },
				{
					...baseItem,
					title: "Testing strategies",
					body: "Comprehensive testing strategies for modern apps.",
				},
				{ ...baseItem, title: "CSS architecture", body: "Scalable CSS architecture patterns." },
				{
					...baseItem,
					title: "Error handling patterns",
					body: "Robust error handling in TypeScript.",
				},
				{
					...baseItem,
					title: "Deployment automation",
					body: "CI/CD pipeline automation strategies.",
				},
				{
					...baseItem,
					title: "Code review checklist",
					body: "Essential code review checklist items.",
				},
				{
					...baseItem,
					title: "Performance monitoring",
					body: "Application performance monitoring setup.",
				},
			];
			for (const item of items) {
				await create(db, item);
			}

			const results = await search(db, "testing");
			expect(results.length).toBeGreaterThanOrEqual(2);
			const titles = results.map((r) => r.title);
			expect(titles).toContain("TypeScript testing patterns");
			expect(titles).toContain("Testing strategies");
		});

		it("returns empty array for no matches", async () => {
			await create(db, baseItem);
			const results = await search(db, "xyznonexistent");
			expect(results).toEqual([]);
		});

		it("supports pagination in search", async () => {
			for (let i = 0; i < 5; i++) {
				await create(db, {
					...baseItem,
					title: `Pattern item ${i}`,
					body: `Pattern description ${i}`,
				});
			}
			const page1 = await search(db, "Pattern", { limit: 2, offset: 0 });
			const page2 = await search(db, "Pattern", { limit: 2, offset: 2 });
			expect(page1.length).toBe(2);
			expect(page2.length).toBe(2);
		});
	});

	describe("edit log", () => {
		it("creates edit log entry on create", async () => {
			const item = await create(db, baseItem);
			const logs = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, item.id));
			expect(logs.length).toBe(1);
			expect(logs[0]?.editType).toBe("create");
			expect(logs[0]?.editor).toBe("agent-1");
		});

		it("creates edit log entries on update for each changed field", async () => {
			const item = await create(db, baseItem);
			await update(db, item.id, { title: "New Title", body: "New Body" }, 1);
			const logs = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, item.id));
			expect(logs.length).toBe(3);
			const updateLogs = logs.filter((l) => l.editType === "update");
			expect(updateLogs.length).toBe(2);
			const fields = updateLogs.map((l) => l.field).sort();
			expect(fields).toEqual(["body", "title"]);
		});

		it("records old and new values in edit log", async () => {
			const item = await create(db, baseItem);
			await update(db, item.id, { title: "New Title" }, 1);
			const logs = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, item.id));
			const titleLog = logs.find((l) => l.editType === "update" && l.field === "title");
			expect(titleLog).toBeTruthy();
			expect(titleLog?.oldValue).toBe("Test Pattern");
			expect(titleLog?.newValue).toBe("New Title");
		});
	});

	describe("events", () => {
		it("emits event on create", async () => {
			const handler = vi.fn();
			knowledgeEvents.on(KnowledgeEventType.UPDATED, handler);
			const item = await create(db, baseItem);
			expect(handler).toHaveBeenCalledOnce();
			expect(handler).toHaveBeenCalledWith({
				type: KnowledgeEventType.UPDATED,
				itemId: item.id,
				version: 1,
			});
		});

		it("emits event on update", async () => {
			const item = await create(db, baseItem);
			const handler = vi.fn();
			knowledgeEvents.on(KnowledgeEventType.UPDATED, handler);
			await update(db, item.id, { title: "Changed" }, 1);
			expect(handler).toHaveBeenCalledOnce();
			expect(handler).toHaveBeenCalledWith({
				type: KnowledgeEventType.UPDATED,
				itemId: item.id,
				version: 2,
			});
		});
	});

	describe("pagination", () => {
		it("returns first 5 items with limit 5 offset 0", async () => {
			for (let i = 0; i < 10; i++) {
				await create(db, { ...baseItem, title: `Item ${String(i).padStart(2, "0")}` });
			}
			const page = await list(db, { limit: 5, offset: 0 });
			expect(page.length).toBe(5);
		});

		it("returns next 5 items with limit 5 offset 5", async () => {
			for (let i = 0; i < 10; i++) {
				await create(db, { ...baseItem, title: `Item ${String(i).padStart(2, "0")}` });
			}
			const page1 = await list(db, { limit: 5, offset: 0 });
			const page2 = await list(db, { limit: 5, offset: 5 });
			expect(page2.length).toBe(5);
			const ids1 = new Set(page1.map((i) => i.id));
			for (const item of page2) {
				expect(ids1.has(item.id)).toBe(false);
			}
		});

		it("returns remaining items when offset + limit exceeds total", async () => {
			for (let i = 0; i < 7; i++) {
				await create(db, { ...baseItem, title: `Item ${i}` });
			}
			const page = await list(db, { limit: 5, offset: 5 });
			expect(page.length).toBe(2);
		});
	});

	describe("filters", () => {
		beforeEach(async () => {
			await create(db, { ...baseItem, layer: "L0", kind: "pattern", topic: "arch", scopeId: "s1" });
			await create(db, {
				...baseItem,
				layer: "L1",
				kind: "decision",
				topic: "arch",
				scopeId: "s1",
			});
			await create(db, {
				...baseItem,
				layer: "L1",
				kind: "pattern",
				topic: "testing",
				scopeId: "s2",
			});
			await create(db, { ...baseItem, layer: "L2", kind: "brief", topic: "design", scopeId: "s2" });
			await create(db, {
				...baseItem,
				layer: "L2",
				kind: "pattern",
				topic: "testing",
				scopeId: "s1",
			});
		});

		it("filters by layer", async () => {
			const items = await list(db, { layer: "L1" });
			expect(items.length).toBe(2);
			for (const item of items) {
				expect(item.layer).toBe("L1");
			}
		});

		it("filters by scopeId", async () => {
			const items = await list(db, { scopeId: "s2" });
			expect(items.length).toBe(2);
			for (const item of items) {
				expect(item.scopeId).toBe("s2");
			}
		});

		it("filters by kind", async () => {
			const items = await list(db, { kind: "pattern" });
			expect(items.length).toBe(3);
			for (const item of items) {
				expect(item.kind).toBe("pattern");
			}
		});

		it("filters by topic", async () => {
			const items = await list(db, { topic: "arch" });
			expect(items.length).toBe(2);
			for (const item of items) {
				expect(item.topic).toBe("arch");
			}
		});

		it("combines multiple filters", async () => {
			const items = await list(db, { layer: "L1", kind: "pattern" });
			expect(items.length).toBe(1);
			expect(items[0]?.topic).toBe("testing");
		});

		it("combines filters with pagination", async () => {
			for (let i = 0; i < 8; i++) {
				await create(db, { ...baseItem, layer: "L1", kind: "pattern", topic: `topic-${i}` });
			}
			const page = await list(db, { layer: "L1", kind: "pattern", limit: 3, offset: 0 });
			expect(page.length).toBe(3);
			for (const item of page) {
				expect(item.layer).toBe("L1");
				expect(item.kind).toBe("pattern");
			}
		});
	});
});
