import { type HyperIdleDb, items, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { buildToolRegistry } from "../services/tool-provider-bindings.js";

/**
 * @lore AU21 §9 Increment 2: this file's tool handler(s) now reach
 * `ports.coreApi.*` (the seam) — this file-scoped `auto:true` fixture
 * registers a real in-process `CoreApiPort` transport off THIS test's own
 * `app` for every test in this file, without forcing `app`'s full
 * subscriber wiring onto every OTHER test file that imports the bare
 * `test` from `test-fixtures.ts` (that fixture's `app` stays lazy — a
 * global auto-fixture there double-fired `app.ts`'s task-`done`
 * dep-watcher against tests that manually drive the same transition,
 * an AU21 Increment 2 GREEN-phase finding).
 */
const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

import { makeContext, NOW, seedBase } from "./_helpers.js";

const scoreAttentionTool = buildToolDefinitions(toolHandlersPorts).find(
	(t) => t.name === "score_attention",
)!;

async function seedKnowledgeItemWithScore(
	db: HyperIdleDb,
	id: string,
	score: number | null,
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		topic: "brand",
		title: "Crossable KI",
		body: "Body",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent:seed",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: `ksf-${id}`,
		knowledgeItemId: id,
		layer: "L3",
		kind: "brief",
		attentionScore: score != null ? String(score) : null,
		confidence: "0.1",
	});
}

async function seedKnowledgeItem(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		title: "Test KI",
		body: "Body",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent:seed",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

async function seedItem(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(items).values({
		id,
		sourceAgentId: "agent-fac",
		title: "Some item",
		threadId: "th1",
		createdAt: NOW,
	});
}

describe("score_attention tool", () => {
	test("sets attention_score on a knowledge_item (target=knowledge_item)", async ({ db }) => {
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-1");
		const result = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "ki-1", score: 0.42 },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		// O2: attentionScore moved to knowledgeAppProjection extension table
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-1"));
		expect(Number(fabricRow?.attentionScore)).toBeCloseTo(0.42, 5);
	});

	test("score on items row is a no-op after O2 (attentionScore stripped)", async ({ db }) => {
		await seedBase(db);
		// O2: items.attentionScore stripped from kernel. Score writes are no-op.
		await seedItem(db, "it-1");
		const result = await scoreAttentionTool.handler(
			{ target: "item", id: "it-1", score: 0.5 },
			makeContext(db),
		);
		expect(result.success).toBe(true);
	});

	test("does NOT bump knowledge_items.version", async ({ db }) => {
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-2");
		const [before] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-2"));
		const versionBefore = before?.version;
		await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "ki-2", score: 0.7 },
			makeContext(db),
		);
		const [after] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-2"));
		expect(after?.version).toBe(versionBefore);
		// But fabric row should exist with the score
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-2"));
		expect(Number(fabricRow?.attentionScore)).toBeCloseTo(0.7, 5);
	});

	test("returns NOT_FOUND for unknown id (both targets)", async ({ db }) => {
		await seedBase(db);
		const kiResult = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "nope", score: 0.1 },
			makeContext(db),
		);
		expect(kiResult.success).toBe(false);
		if (kiResult.success) return;
		expect(kiResult.code).toBe("NOT_FOUND");

		const itResult = await scoreAttentionTool.handler(
			{ target: "item", id: "nope", score: 0.1 },
			makeContext(db),
		);
		expect(itResult.success).toBe(false);
		if (itResult.success) return;
		expect(itResult.code).toBe("NOT_FOUND");
	});

	test("returns INVALID_INPUT for score < 0 or > 1 via registry dispatch", async ({ db }) => {
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-3");
		// I2 B1-B4: registry now requires explicit role. score_attention is
		// facilitator-only — use chief_of_staff so it stays visible. // @lore AD8a: role string renamed in AD8b
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" }); // @lore AD8a: role string renamed to "assistant" in AD8b

		const neg = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-3",
			score: -0.1,
		});
		expect(neg.success).toBe(false);
		if (neg.success) return;
		expect(neg.code).toBe("INVALID_INPUT");

		const over = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-3",
			score: 1.1,
		});
		expect(over.success).toBe(false);
		if (over.success) return;
		expect(over.code).toBe("INVALID_INPUT");
	});

	test("mode: 'override' (default) keeps G1 behavior (uses provided score verbatim)", async ({
		db,
	}) => {
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-override");
		const result = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "ki-override", score: 0.42, mode: "override" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-override"));
		expect(Number(fabricRow?.attentionScore)).toBeCloseTo(0.42, 5);
	});

	test("mode: 'recompute' with target=knowledge_item invokes the engine (score arg omitted)", async ({
		db,
	}) => {
		await seedBase(db);
		await seedKnowledgeItemWithScore(db, "ki-recompute", 0.05);
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" });
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-recompute",
			mode: "recompute",
		});
		expect(result.success).toBe(true);
		// O2: attentionScore in knowledgeAppProjection; recompute returns a result
		if (result.success) {
			const data = result.data as { score: number };
			expect(data.score).toBeGreaterThanOrEqual(0);
		}
	});

	test("mode: 'recompute' rejects a provided `score` via registry-level validation", async ({
		db,
	}) => {
		await seedBase(db);
		await seedKnowledgeItemWithScore(db, "ki-reject", 0.05);
		// I2 B1-B4: registry now requires explicit role. score_attention is
		// facilitator-only — use chief_of_staff so it stays visible. // @lore AD8a: role string renamed in AD8b
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" }); // @lore AD8a: role string renamed in AD8b
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-reject",
			score: 0.42,
			mode: "recompute",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("mode: 'override' requires `score` — rejects missing score via registry validation", async ({
		db,
	}) => {
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-need-score");
		// I2 B1-B4: registry now requires explicit role. score_attention is
		// facilitator-only — use chief_of_staff so it stays visible. // @lore AD8a: role string renamed in AD8b
		const registry = buildToolRegistry(makeContext(db), { role: "assistant" }); // @lore AD8a: role string renamed in AD8b
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-need-score",
			mode: "override",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("mode: 'recompute' with target=item returns INVALID_INPUT", async ({ db }) => {
		await seedBase(db);
		await seedItem(db, "it-recompute");
		const result = await scoreAttentionTool.handler(
			{ target: "item", id: "it-recompute", mode: "recompute" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});
});
