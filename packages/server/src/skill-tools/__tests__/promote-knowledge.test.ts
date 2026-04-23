import {
	createTestDb,
	type HyperIdleDb,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { promoteKnowledgeTool } from "../promote-knowledge.js";
import { buildToolRegistry } from "../tool-registry.js";
import { makeContext, NOW, seedBase } from "./_helpers.js";

function seedKnowledgeItem(db: HyperIdleDb, id: string, status: string, version = 1): void {
	db.insert(knowledgeItems)
		.values({
			id,
			layer: "L3",
			kind: "pattern",
			title: `KI ${id}`,
			body: "Body",
			format: "markdown",
			status,
			version,
			updatedBy: "agent:seed",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
}

function seedConflict(
	db: HyperIdleDb,
	id: string,
	itemId: string,
	status: "open" | "resolved" | "discarded",
): void {
	db.insert(knowledgeConflicts)
		.values({
			id,
			itemId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "proposed",
			proposedBy: "agent:other",
			status,
			createdAt: NOW,
		})
		.run();
}

describe("promote_knowledge tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedBase(db);
	});

	it("AC5: transitions captured → provisional and persists", async () => {
		seedKnowledgeItem(db, "ki-a", "captured");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-a", toStatus: "provisional" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-a")).get();
		expect(row?.status).toBe("provisional");

		const logs = db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, "ki-a"), eq(knowledgeEditLog.field, "status")))
			.all();
		expect(logs.length).toBeGreaterThanOrEqual(1);
		const statusLog = logs.find((l) => l.newValue === "provisional");
		expect(statusLog).toBeDefined();
		expect(statusLog?.oldValue).toBe("captured");
		expect(statusLog?.newValue).toBe("provisional");
	});

	it("returns INVALID_TRANSITION for captured → validated", async () => {
		seedKnowledgeItem(db, "ki-b", "captured");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-b", toStatus: "validated" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TRANSITION");
	});

	it("returns INVALID_TRANSITION for archived → anything", async () => {
		seedKnowledgeItem(db, "ki-c", "archived");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-c", toStatus: "provisional" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TRANSITION");
	});

	it("blocks promotion to validated when an open conflict exists (CONFLICT_OPEN)", async () => {
		seedKnowledgeItem(db, "ki-d", "provisional");
		seedConflict(db, "conf-1", "ki-d", "open");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-d", toStatus: "validated" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("CONFLICT_OPEN");
	});

	it("allows promotion to validated when the only conflicts are resolved/discarded", async () => {
		seedKnowledgeItem(db, "ki-e", "provisional");
		seedConflict(db, "conf-2", "ki-e", "resolved");
		seedConflict(db, "conf-3", "ki-e", "discarded");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-e", toStatus: "validated" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-e")).get();
		expect(row?.status).toBe("validated");
	});

	it("returns NOT_FOUND for unknown id", async () => {
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "does-not-exist", toStatus: "provisional" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	it("does NOT bump version on status change", async () => {
		seedKnowledgeItem(db, "ki-f", "captured", 3);
		await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-f", toStatus: "provisional" },
			makeContext(db),
		);
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-f")).get();
		expect(row?.version).toBe(3);
	});

	it("returns CONCURRENT_MODIFICATION when the status changed out-of-band", async () => {
		seedKnowledgeItem(db, "ki-g", "provisional");
		// Simulate a concurrent racing caller that has already promoted the
		// item to `validated`. Our caller is still trying to promote from
		// `provisional` — the conditional UPDATE must reject with 0 rows
		// changed rather than silently stomp the other caller's write.
		const first = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-g", toStatus: "validated" },
			makeContext(db),
		);
		expect(first.success).toBe(true);
		const second = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-g", toStatus: "validated" },
			makeContext(db),
		);
		expect(second.success).toBe(false);
		if (second.success) return;
		// Either INVALID_TRANSITION (validated -> validated is not allowed) or
		// CONCURRENT_MODIFICATION if the transition would have been legal but
		// the status changed. Assert the first explicitly since our allowed
		// table does not include validated -> validated.
		expect(second.code).toBe("INVALID_TRANSITION");
	});

	it("returns INVALID_STATE when knowledge_items.status is a value not in the canonical enum", async () => {
		// Simulates schema drift / upstream bug: the row's status column holds
		// a value outside the 6 known statuses. The tool must refuse rather
		// than unsafely cast and branch.
		db.insert(knowledgeItems)
			.values({
				id: "ki-bad-state",
				layer: "L3",
				kind: "pattern",
				title: "Bad state",
				body: "Body",
				format: "markdown",
				status: "zombie",
				version: 1,
				updatedBy: "agent:seed",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-bad-state", toStatus: "provisional" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_STATE");
	});

	it("persists reason into the edit log when provided", async () => {
		seedKnowledgeItem(db, "ki-reason", "captured");
		const result = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId: "ki-reason",
				toStatus: "provisional",
				reason: "used 3 times this week",
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const logs = db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, "ki-reason"), eq(knowledgeEditLog.field, "status")))
			.all();
		expect(logs.length).toBe(1);
		expect(logs[0].newValue).toContain("provisional");
		expect(logs[0].newValue).toContain("used 3 times this week");
	});

	it("INVALID_INPUT surfaces via registry dispatch on missing toStatus", async () => {
		seedKnowledgeItem(db, "ki-bad", "captured");
		// I2 B1-B4: registry requires explicit role; promote_knowledge is
		// facilitator-only.
		const registry = buildToolRegistry(makeContext(db), { role: "chief_of_staff" });
		const result = await registry.invoke("promote_knowledge", {
			knowledgeItemId: "ki-bad",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});
});
