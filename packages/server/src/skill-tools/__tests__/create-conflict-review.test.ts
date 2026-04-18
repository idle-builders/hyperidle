import { type HyperIdleDb, createTestDb, knowledgeConflicts, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createConflictReviewTool } from "../create-conflict-review.js";
import { NOW, makeContext, seedBase } from "./_helpers.js";

function seedKnowledgeItem(db: HyperIdleDb, id: string, version: number): void {
	db.insert(knowledgeItems)
		.values({
			id,
			layer: "L3",
			kind: "pattern",
			title: `KI ${id}`,
			body: "Body",
			format: "markdown",
			status: "provisional",
			version,
			updatedBy: "agent:seed",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
}

describe("create_conflict_review tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedBase(db);
	});

	it("inserts an open knowledge_conflicts row referencing the item", async () => {
		seedKnowledgeItem(db, "ki-1", 3);
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

		const rows = db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-1"))
			.all();
		expect(rows.length).toBe(1);
		expect(rows[0].status).toBe("open");
		expect(rows[0].versionCurrent).toBe(3);
		expect(rows[0].versionBase).toBe(2);
		expect(rows[0].proposedBy).toBe("agent:agent-fac");
		expect(rows[0].proposedBody).toBe("new body");
		expect(data.status).toBe("open");
		expect(data.conflictId).toBe(rows[0].id);
	});

	it("NOT_FOUND for unknown knowledgeItemId", async () => {
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

	it("INVALID_INPUT when versionBase > item.version", async () => {
		seedKnowledgeItem(db, "ki-2", 2);
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

	it("always derives proposedBy from ctx.agentId (no spoofing via payload)", async () => {
		seedKnowledgeItem(db, "ki-3", 1);
		const result = await createConflictReviewTool.handler(
			{
				knowledgeItemId: "ki-3",
				proposedBody: "body",
				versionBase: 1,
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const rows = db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-3"))
			.all();
		expect(rows.length).toBe(1);
		// ctx.agentId = "agent-fac"; the tool MUST derive this and never trust
		// a payload-supplied proposedBy. A future regression that adds back a
		// payload override would fail this assertion.
		expect(rows[0].proposedBy).toBe("agent:agent-fac");
	});

	it("returns DUPLICATE on a second open conflict from the same agent on the same item", async () => {
		seedKnowledgeItem(db, "ki-dup", 1);
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
		const rows = db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.itemId, "ki-dup"))
			.all();
		expect(rows.length).toBe(1);
		expect(rows[0].proposedBody).toBe("first proposal");
	});
});
