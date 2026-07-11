/**
 * L22 red phase — integration tests for RelevanceService.
 *
 * These tests fail until:
 * 1. packages/db schema has knowledge_access_log + relevance columns (T1)
 * 2. packages/server/src/services/relevance-service.ts is created (T6)
 */
import {
	type HyperIdleDb,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { createRelevanceService } from "../knowledge/relevance-service.js";
import { describe, expect, test } from "../test-fixtures.js";

const NOW_ISO = "2026-05-06T12:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();

async function insertItem(
	db: HyperIdleDb,
	overrides: Partial<{
		id: string;
		title: string;
		status: string;
	}> = {},
): Promise<string> {
	const id = overrides.id ?? crypto.randomUUID();
	await db.insert(knowledgeItems).values({
		id,
		topic: "testing",
		title: overrides.title ?? `Item ${id}`,
		body: "Test body",
		format: "markdown",
		status: overrides.status ?? "active",
		version: 1,
		updatedBy: "human",
		createdAt: NOW_ISO,
		updatedAt: NOW_ISO,
	});

	return id;
}

async function insertAccessLog(
	db: HyperIdleDb,
	itemId: string,
	accessedAt: string,
	accessorKind = "human",
	accessorId = "user-1",
): Promise<void> {
	// Uses knowledgeAccessLog table — exported from @hyperidle/db since T1
	const { knowledgeAccessLog } = await import("@hyperidle/db");
	await db.insert(knowledgeAccessLog).values({
		id: crypto.randomUUID(),
		itemId,
		accessorKind,
		accessorId,
		accessedAt,
	});
}

describe("RelevanceService.computeSignals (L22)", () => {
	test("returns empty map for empty itemIds array", async ({ db }) => {
		const service = createRelevanceService(db);
		const result = await service.computeSignals([], NOW_MS);
		expect(result.size).toBe(0);
	});

	test("returns null signals for item with no access log or edit log data", async ({ db }) => {
		const itemId = await insertItem(db);
		const service = createRelevanceService(db);
		const result = await service.computeSignals([itemId], NOW_MS);
		const signals = result.get(itemId);
		expect(signals).toBeDefined();
		expect(signals?.accessCount30d).toBeNull();
		expect(signals?.lastActivityAt).toBeNull();
		expect(signals?.citationCount).toBeNull(); // always null in L22 (staged)
	});

	test("computes lastAccessedAt from access log and counts accessCount30d", async ({ db }) => {
		const itemId = await insertItem(db);
		// Insert 3 access log entries within 30 days
		const access1 = "2026-05-05T10:00:00.000Z";
		const access2 = "2026-05-04T10:00:00.000Z";
		const access3 = "2026-05-03T10:00:00.000Z";

		await insertAccessLog(db, itemId, access1);
		await insertAccessLog(db, itemId, access2);
		await insertAccessLog(db, itemId, access3);

		const service = createRelevanceService(db);
		const result = await service.computeSignals([itemId], NOW_MS);
		const signals = result.get(itemId);

		expect(signals).toBeDefined();
		expect(signals?.accessCount30d).toBe(3);
		expect(signals?.lastActivityAt).toBe(access1); // MAX of the three
	});

	test("does not count access logs older than 30 days in accessCount30d", async ({ db }) => {
		const itemId = await insertItem(db);
		// One within 30 days, one outside
		const recent = "2026-05-01T00:00:00.000Z"; // 5 days ago
		const old = "2026-03-01T00:00:00.000Z"; // > 30 days ago

		await insertAccessLog(db, itemId, recent);
		await insertAccessLog(db, itemId, old);

		const service = createRelevanceService(db);
		const result = await service.computeSignals([itemId], NOW_MS);
		const signals = result.get(itemId);

		expect(signals).toBeDefined();
		expect(signals?.accessCount30d).toBe(1); // only the recent one counts
		expect(signals?.lastActivityAt).toBe(recent);
	});

	test("computes lastActivityAt as max of lastValidatedAt, lastEditedAt, lastAccessedAt", async ({
		db,
	}) => {
		const itemId = await insertItem(db);
		// Edit log: edited 2 days ago
		const editAt = "2026-05-04T00:00:00.000Z";
		await db.insert(knowledgeEditLog).values({
			id: crypto.randomUUID(),
			itemId,
			editor: "human",
			field: "body",
			oldValue: "old",
			newValue: "new",
			editType: "edit",
			createdAt: editAt,
		});

		// Access log: accessed yesterday
		const accessAt = "2026-05-05T00:00:00.000Z";
		await insertAccessLog(db, itemId, accessAt);

		const service = createRelevanceService(db);
		const result = await service.computeSignals([itemId], NOW_MS);
		const signals = result.get(itemId);

		expect(signals).toBeDefined();
		// lastActivityAt = max(accessAt, editAt) = accessAt
		expect(signals?.lastActivityAt).toBe(accessAt);
	});

	test("handles multiple items in a single batch call", async ({ db }) => {
		const id1 = await insertItem(db, { id: "item-1" });
		const id2 = await insertItem(db, { id: "item-2" });

		await insertAccessLog(db, id1, "2026-05-05T00:00:00.000Z");

		const service = createRelevanceService(db);
		const result = await service.computeSignals([id1, id2], NOW_MS);

		expect(result.size).toBe(2);
		expect(result.get(id1)?.accessCount30d).toBe(1);
		expect(result.get(id2)?.accessCount30d).toBeNull();
	});

	test("uses editor='human' for lastValidatedAt (not 'facilitator')", async ({ db }) => {
		const itemId = await insertItem(db);
		const humanEditAt = "2026-05-04T00:00:00.000Z";
		await db.insert(knowledgeEditLog).values({
			id: crypto.randomUUID(),
			itemId,
			editor: "human",
			field: "status",
			oldValue: "provisional",
			newValue: "validated",
			editType: "validation",
			createdAt: humanEditAt,
		});

		const service = createRelevanceService(db);
		const result = await service.computeSignals([itemId], NOW_MS);
		const signals = result.get(itemId);

		// lastActivityAt should reflect the human validation edit
		expect(signals?.lastActivityAt).toBe(humanEditAt);
	});
});

describe("RelevanceService.recomputeScores (L22)", () => {
	test("updates relevanceScore on knowledgeStrategyFabric after recompute", async ({ db }) => {
		const itemId = await insertItem(db);
		// Give it some access history so score is non-null
		await insertAccessLog(db, itemId, "2026-05-05T00:00:00.000Z");

		const service = createRelevanceService(db);
		await service.recomputeScores([itemId]);

		// O2: relevanceScore moved to knowledgeStrategyFabric
		const [fabricRow] = await db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, itemId));
		expect(fabricRow).toBeDefined();
		expect(fabricRow?.relevanceScore).not.toBeNull();
		expect(typeof Number(fabricRow?.relevanceScore)).toBe("number");
	});

	test("sets relevanceScore to null for items with no signal data", async ({ db }) => {
		const itemId = await insertItem(db);
		// No access log, no edit log

		const service = createRelevanceService(db);
		await service.recomputeScores([itemId]);

		// O2: relevanceScore moved to knowledgeStrategyFabric
		const [fabricRow] = await db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, itemId));
		expect(fabricRow).toBeDefined();
		expect(fabricRow?.relevanceScore).toBeNull();
	});

	test("handles empty itemIds without error", async ({ db }) => {
		const service = createRelevanceService(db);
		await expect(service.recomputeScores([])).resolves.toBeUndefined();
	});
});
