import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, items, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { makeContext, NOW, seedBase } from "./_helpers.js";

function buildScoreAttentionTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "score_attention",
	)!;
}

async function seedKnowledgeItemWithScore(
	db: HyperIdleDb,
	ids: ScopedIds,
	label: string,
	score: number | null,
): Promise<void> {
	const id = ids(label);
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
		id: ids(`${label}-projection`),
		knowledgeItemId: id,
		layer: "L3",
		kind: "brief",
		attentionScore: score != null ? String(score) : null,
		confidence: "0.1",
	});
}

async function seedKnowledgeItem(db: HyperIdleDb, ids: ScopedIds, label: string): Promise<string> {
	const id = ids(label);
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
	return id;
}

async function seedItem(db: HyperIdleDb, ids: ScopedIds, label: string): Promise<string> {
	const id = ids(label);
	await db.insert(items).values({
		id,
		sourceAgentId: ids("agent-fac"),
		title: "Some item",
		threadId: ids("th1"),
		createdAt: NOW,
	});
	return id;
}

describe("score_attention tool", () => {
	test("sets attention_score on a knowledge_item (target=knowledge_item)", async ({
		db,
		app,
		ids,
	}) => {
		const scoreAttentionTool = buildScoreAttentionTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-1");
		const result = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: kiId, score: 0.42 },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(true);
		// O2: attentionScore moved to knowledgeAppProjection extension table
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, kiId));
		expect(Number(fabricRow?.attentionScore)).toBeCloseTo(0.42, 5);
	});

	test("score on items row is a no-op after O2 (attentionScore stripped)", async ({
		db,
		app,
		ids,
	}) => {
		const scoreAttentionTool = buildScoreAttentionTool(app);
		await seedBase(db, ids);
		// O2: items.attentionScore stripped from kernel. Score writes are no-op.
		const itId = await seedItem(db, ids, "it-1");
		const result = await scoreAttentionTool.handler(
			{ target: "item", id: itId, score: 0.5 },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(true);
	});

	test("does NOT bump knowledge_items.version", async ({ db, app, ids }) => {
		const scoreAttentionTool = buildScoreAttentionTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-2");
		const [before] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, kiId));
		const versionBefore = before?.version;
		await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: kiId, score: 0.7 },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		const [after] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, kiId));
		expect(after?.version).toBe(versionBefore);
		// But fabric row should exist with the score
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, kiId));
		expect(Number(fabricRow?.attentionScore)).toBeCloseTo(0.7, 5);
	});

	test("returns NOT_FOUND for unknown id (both targets)", async ({ db, app, ids }) => {
		const scoreAttentionTool = buildScoreAttentionTool(app);
		await seedBase(db, ids);
		const kiResult = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: ids("nope"), score: 0.1 },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(kiResult.success).toBe(false);
		if (kiResult.success) return;
		expect(kiResult.code).toBe("NOT_FOUND");

		const itResult = await scoreAttentionTool.handler(
			{ target: "item", id: ids("nope"), score: 0.1 },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(itResult.success).toBe(false);
		if (itResult.success) return;
		expect(itResult.code).toBe("NOT_FOUND");
	});

	test("returns INVALID_INPUT for score < 0 or > 1 via registry dispatch", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-3");
		// I2 B1-B4: registry now requires explicit role. score_attention is
		// facilitator-only — use chief_of_staff so it stays visible. // @lore AD8a: role string renamed in AD8b
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db, { agentId: ids("agent-fac") }),
			{ role: "assistant" },
		); // @lore AD8a: role string renamed to "assistant" in AD8b

		const neg = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: kiId,
			score: -0.1,
		});
		expect(neg.success).toBe(false);
		if (neg.success) return;
		expect(neg.code).toBe("INVALID_INPUT");

		const over = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: kiId,
			score: 1.1,
		});
		expect(over.success).toBe(false);
		if (over.success) return;
		expect(over.code).toBe("INVALID_INPUT");
	});

	test("mode: 'override' (default) keeps G1 behavior (uses provided score verbatim)", async ({
		db,
		app,
		ids,
	}) => {
		const scoreAttentionTool = buildScoreAttentionTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-override");
		const result = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: kiId, score: 0.42, mode: "override" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(true);
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, kiId));
		expect(Number(fabricRow?.attentionScore)).toBeCloseTo(0.42, 5);
	});

	test("mode: 'recompute' with target=knowledge_item invokes the engine (score arg omitted)", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedKnowledgeItemWithScore(db, ids, "ki-recompute", 0.05);
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db, { agentId: ids("agent-fac") }),
			{ role: "assistant" },
		);
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: ids("ki-recompute"),
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
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		await seedKnowledgeItemWithScore(db, ids, "ki-reject", 0.05);
		// I2 B1-B4: registry now requires explicit role. score_attention is
		// facilitator-only — use chief_of_staff so it stays visible. // @lore AD8a: role string renamed in AD8b
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db, { agentId: ids("agent-fac") }),
			{ role: "assistant" },
		); // @lore AD8a: role string renamed in AD8b
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: ids("ki-reject"),
			score: 0.42,
			mode: "recompute",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("mode: 'override' requires `score` — rejects missing score via registry validation", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-need-score");
		// I2 B1-B4: registry now requires explicit role. score_attention is
		// facilitator-only — use chief_of_staff so it stays visible. // @lore AD8a: role string renamed in AD8b
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db, { agentId: ids("agent-fac") }),
			{ role: "assistant" },
		); // @lore AD8a: role string renamed in AD8b
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: kiId,
			mode: "override",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("mode: 'recompute' with target=item returns INVALID_INPUT", async ({ db, app, ids }) => {
		const scoreAttentionTool = buildScoreAttentionTool(app);
		await seedBase(db, ids);
		const itId = await seedItem(db, ids, "it-recompute");
		const result = await scoreAttentionTool.handler(
			{ target: "item", id: itId, mode: "recompute" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});
});
