import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { THROWING_GATE_ACCESSOR } from "@hyperidle/agent-orchestration/testing";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeItems,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { makeContext, NOW, seedBase } from "./_helpers.js";

function buildCreateConflictReviewTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_GATE_ACCESSOR).find(
		(t) => t.name === "create_conflict_review",
	)!;
}

// @lore this file's own positional (id, version) seeder predates and shapes four call sites
// differently from the shared `seedKnowledgeItem(db, options)` in `_helpers.ts` — kept as its own
// function rather than switched over, with the companion inserted inline.
async function seedKnowledgeItem(db: HyperIdleDb, id: string, version: number): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		title: `KI ${id}`,
		body: "Body",
		format: "markdown",
		status: "provisional",
		version,
		updatedBy: "agent:seed",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({ id: `${id}-projection`, knowledgeItemId: id });
}

describe("create_conflict_review tool", () => {
	test("inserts an open knowledge_conflicts row referencing the item", async ({ db, app }) => {
		const createConflictReviewTool = buildCreateConflictReviewTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-1", 3);
		const result = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "ki-1",
				proposedBody: "new body",
				versionBase: 2,
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { conflictId: string; itemId: string; status: string };

		const rows = await db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-1"));
		expect(rows.length).toBe(1);
		expect(rows[0]!.status).toBe("open");
		expect(rows[0]!.versionCurrent).toBe(3);
		expect(rows[0]!.versionBase).toBe(2);
		expect(rows[0]!.proposedBy).toBe("agent:agent-fac");
		expect(rows[0]!.proposedBody).toBe("new body");
		expect(data.status).toBe("open");
		expect(data.conflictId).toBe(rows[0]!.id);
	});

	test("NOT_FOUND for unknown knowledgeItemId", async ({ db, app }) => {
		const createConflictReviewTool = buildCreateConflictReviewTool(app);
		await seedBase(db);
		const result = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "does-not-exist",
				proposedBody: "body",
				versionBase: 0,
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("INVALID_INPUT when versionBase > item.version", async ({ db, app }) => {
		const createConflictReviewTool = buildCreateConflictReviewTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-2", 2);
		const result = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "ki-2",
				proposedBody: "body",
				versionBase: 5,
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("always derives proposedBy from ctx.agentId (no spoofing via payload)", async ({
		db,
		app,
	}) => {
		const createConflictReviewTool = buildCreateConflictReviewTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-3", 1);
		const result = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "ki-3",
				proposedBody: "body",
				versionBase: 1,
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const rows = await db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-3"));
		expect(rows.length).toBe(1);
		// ctx.agentId = "agent-fac"; the tool MUST derive this and never trust
		// a payload-supplied proposedBy. A future regression that adds back a
		// payload override would fail this assertion.
		expect(rows[0]!.proposedBy).toBe("agent:agent-fac");
	});

	test("returns DUPLICATE on a second open conflict from the same agent on the same item", async ({
		db,
		app,
	}) => {
		const createConflictReviewTool = buildCreateConflictReviewTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-dup", 1);
		const first = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "ki-dup",
				proposedBody: "first proposal",
				versionBase: 1,
			},
			makeContext(db),
		);
		expect(first.success).toBe(true);

		const second = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "ki-dup",
				proposedBody: "second proposal",
				versionBase: 1,
			},
			makeContext(db),
		);
		expect(second.success).toBe(false);
		if (second.success) return;
		expect(second.code).toBe("DUPLICATE");

		// Exactly one conflict row exists — the second call did NOT write.
		const rows = await db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-dup"));
		expect(rows.length).toBe(1);
		expect(rows[0]!.proposedBody).toBe("first proposal");
	});
});
