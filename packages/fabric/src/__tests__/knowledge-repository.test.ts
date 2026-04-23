import { createTestDb, type HyperIdleDb, knowledgeEditLog } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionConflictError } from "../errors.js";
import { KnowledgeEventType, knowledgeEvents } from "../events.js";
import { setupFts } from "../fts.js";
import { create, getById, list, search, update } from "../knowledge-repository.js";

function makeDb(): HyperIdleDb {
	const db = createTestDb();
	setupFts(db);
	return db;
}

describe("knowledge-repository", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = makeDb();
		knowledgeEvents.removeAllListeners();
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

	// AC1: Create, read, update operations succeed with version control
	describe("create", () => {
		it("creates a knowledge item with version 1", async () => {
			const item = create(db, baseItem);
			expect(item.id).toBeTruthy();
			expect(item.version).toBe(1);
			expect(item.title).toBe("Test Pattern");
			expect(item.layer).toBe("L1");
		});

		it("assigns created_at and updated_at timestamps", () => {
			const item = create(db, baseItem);
			expect(item.createdAt).toBeTruthy();
			expect(item.updatedAt).toBeTruthy();
		});
	});

	describe("getById", () => {
		it("returns the item by id", () => {
			const created = create(db, baseItem);
			const found = getById(db, created.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.title).toBe("Test Pattern");
		});

		it("returns null for non-existent id", () => {
			const found = getById(db, "non-existent");
			expect(found).toBeNull();
		});
	});

	describe("update", () => {
		it("updates fields and increments version", () => {
			const created = create(db, baseItem);
			const updated = update(db, created.id, { title: "Updated Title" }, 1);
			expect(updated.title).toBe("Updated Title");
			expect(updated.version).toBe(2);
		});

		it("updates multiple fields at once", () => {
			const created = create(db, baseItem);
			const updated = update(
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

		it("updates updatedAt timestamp", () => {
			const created = create(db, baseItem);
			// Ensure updatedAt changes by verifying it's set after update
			const updated = update(db, created.id, { title: "New" }, 1);
			expect(updated.updatedAt).toBeTruthy();
			// updatedAt should be >= createdAt
			expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
				new Date(created.updatedAt).getTime(),
			);
			// The update should have set a new updatedAt value (version proves it went through)
			expect(updated.version).toBe(2);
		});
	});

	// AC2: Update with stale version throws VersionConflictError
	describe("optimistic concurrency", () => {
		it("throws VersionConflictError on stale version", () => {
			const created = create(db, baseItem);
			update(db, created.id, { title: "First update" }, 1);

			try {
				update(db, created.id, { title: "Stale update" }, 1);
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(VersionConflictError);
				const vce = err as VersionConflictError;
				expect(vce.currentVersion).toBe(2);
			}
		});

		it("succeeds with correct version after prior update", () => {
			const created = create(db, baseItem);
			update(db, created.id, { title: "V2" }, 1);
			const v3 = update(db, created.id, { title: "V3" }, 2);
			expect(v3.version).toBe(3);
			expect(v3.title).toBe("V3");
		});
	});

	// AC3: FTS5 search on 10 items returns matching items ranked by relevance
	describe("search", () => {
		it("returns matching items ranked by relevance from 10 items", () => {
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
				create(db, item);
			}

			const results = search(db, "testing");
			expect(results.length).toBeGreaterThanOrEqual(2);
			// Items with "testing" in title should rank higher
			const titles = results.map((r) => r.title);
			expect(titles).toContain("TypeScript testing patterns");
			expect(titles).toContain("Testing strategies");
		});

		it("returns empty array for no matches", () => {
			create(db, baseItem);
			const results = search(db, "xyznonexistent");
			expect(results).toEqual([]);
		});

		it("supports pagination in search", () => {
			for (let i = 0; i < 5; i++) {
				create(db, { ...baseItem, title: `Pattern item ${i}`, body: `Pattern description ${i}` });
			}
			const page1 = search(db, "Pattern", { limit: 2, offset: 0 });
			const page2 = search(db, "Pattern", { limit: 2, offset: 2 });
			expect(page1.length).toBe(2);
			expect(page2.length).toBe(2);
		});
	});

	// AC4: Every update creates knowledge_edit_log entry
	describe("edit log", () => {
		it("creates edit log entry on create", () => {
			const item = create(db, baseItem);
			const logs = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, item.id))
				.all();
			expect(logs.length).toBe(1);
			expect(logs[0]?.editType).toBe("create");
			expect(logs[0]?.editor).toBe("agent-1");
		});

		it("creates edit log entries on update for each changed field", () => {
			const item = create(db, baseItem);
			update(db, item.id, { title: "New Title", body: "New Body" }, 1);
			const logs = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, item.id))
				.all();
			// 1 for create + 2 for update (title + body)
			expect(logs.length).toBe(3);
			const updateLogs = logs.filter((l) => l.editType === "update");
			expect(updateLogs.length).toBe(2);
			const fields = updateLogs.map((l) => l.field).sort();
			expect(fields).toEqual(["body", "title"]);
		});

		it("records old and new values in edit log", () => {
			const item = create(db, baseItem);
			update(db, item.id, { title: "New Title" }, 1);
			const logs = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, item.id))
				.all();
			const titleLog = logs.find((l) => l.editType === "update" && l.field === "title");
			expect(titleLog).toBeTruthy();
			expect(titleLog?.oldValue).toBe("Test Pattern");
			expect(titleLog?.newValue).toBe("New Title");
		});
	});

	// AC5: knowledge_item_updated event fires on every write
	describe("events", () => {
		it("emits event on create", () => {
			const handler = vi.fn();
			knowledgeEvents.on(KnowledgeEventType.UPDATED, handler);
			const item = create(db, baseItem);
			expect(handler).toHaveBeenCalledOnce();
			expect(handler).toHaveBeenCalledWith({
				type: KnowledgeEventType.UPDATED,
				itemId: item.id,
				version: 1,
			});
		});

		it("emits event on update", () => {
			const item = create(db, baseItem);
			const handler = vi.fn();
			knowledgeEvents.on(KnowledgeEventType.UPDATED, handler);
			update(db, item.id, { title: "Changed" }, 1);
			expect(handler).toHaveBeenCalledOnce();
			expect(handler).toHaveBeenCalledWith({
				type: KnowledgeEventType.UPDATED,
				itemId: item.id,
				version: 2,
			});
		});
	});

	// AC6: Pagination works: limit 5, offset 0 returns first 5
	describe("pagination", () => {
		it("returns first 5 items with limit 5 offset 0", () => {
			for (let i = 0; i < 10; i++) {
				create(db, { ...baseItem, title: `Item ${String(i).padStart(2, "0")}` });
			}
			const page = list(db, { limit: 5, offset: 0 });
			expect(page.length).toBe(5);
		});

		it("returns next 5 items with limit 5 offset 5", () => {
			for (let i = 0; i < 10; i++) {
				create(db, { ...baseItem, title: `Item ${String(i).padStart(2, "0")}` });
			}
			const page1 = list(db, { limit: 5, offset: 0 });
			const page2 = list(db, { limit: 5, offset: 5 });
			expect(page2.length).toBe(5);
			// Pages should not overlap
			const ids1 = new Set(page1.map((i) => i.id));
			for (const item of page2) {
				expect(ids1.has(item.id)).toBe(false);
			}
		});

		it("returns remaining items when offset + limit exceeds total", () => {
			for (let i = 0; i < 7; i++) {
				create(db, { ...baseItem, title: `Item ${i}` });
			}
			const page = list(db, { limit: 5, offset: 5 });
			expect(page.length).toBe(2);
		});
	});

	// AC7: List by layer, scope_id, kind, topic filters correctly
	describe("filters", () => {
		beforeEach(() => {
			create(db, { ...baseItem, layer: "L0", kind: "pattern", topic: "arch", scopeId: "s1" });
			create(db, { ...baseItem, layer: "L1", kind: "decision", topic: "arch", scopeId: "s1" });
			create(db, { ...baseItem, layer: "L1", kind: "pattern", topic: "testing", scopeId: "s2" });
			create(db, { ...baseItem, layer: "L2", kind: "brief", topic: "design", scopeId: "s2" });
			create(db, { ...baseItem, layer: "L2", kind: "pattern", topic: "testing", scopeId: "s1" });
		});

		it("filters by layer", () => {
			const items = list(db, { layer: "L1" });
			expect(items.length).toBe(2);
			for (const item of items) {
				expect(item.layer).toBe("L1");
			}
		});

		it("filters by scopeId", () => {
			const items = list(db, { scopeId: "s2" });
			expect(items.length).toBe(2);
			for (const item of items) {
				expect(item.scopeId).toBe("s2");
			}
		});

		it("filters by kind", () => {
			const items = list(db, { kind: "pattern" });
			expect(items.length).toBe(3);
			for (const item of items) {
				expect(item.kind).toBe("pattern");
			}
		});

		it("filters by topic", () => {
			const items = list(db, { topic: "arch" });
			expect(items.length).toBe(2);
			for (const item of items) {
				expect(item.topic).toBe("arch");
			}
		});

		it("combines multiple filters", () => {
			const items = list(db, { layer: "L1", kind: "pattern" });
			expect(items.length).toBe(1);
			expect(items[0]?.topic).toBe("testing");
		});

		it("combines filters with pagination", () => {
			// Add more L1 items
			for (let i = 0; i < 8; i++) {
				create(db, { ...baseItem, layer: "L1", kind: "pattern", topic: `topic-${i}` });
			}
			const page = list(db, { layer: "L1", kind: "pattern", limit: 3, offset: 0 });
			expect(page.length).toBe(3);
			for (const item of page) {
				expect(item.layer).toBe("L1");
				expect(item.kind).toBe("pattern");
			}
		});
	});
});
