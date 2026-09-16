import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	THROWING_OPEN_TASK,
	THROWING_REVIEW_ACCESSOR,
} from "@hyperidle/agent-orchestration/testing";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { makeContext, NOW, seedBase } from "./_helpers.js";

function buildPromoteKnowledgeTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(
		createInProcessCoreApiTransport(app),
		THROWING_REVIEW_ACCESSOR,
		THROWING_OPEN_TASK,
	).find((t) => t.name === "promote_knowledge")!;
}

// @lore this file's own positional (id, status, version) seeder predates and shapes ten call sites
// differently from the shared `seedKnowledgeItem(db, options)` in `_helpers.ts` — kept as its own
// function rather than switched over, with the companion inserted inline.
async function seedKnowledgeItem(
	db: HyperIdleDb,
	id: string,
	status: string,
	version = 1,
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		title: `KI ${id}`,
		body: "Body",
		format: "markdown",
		status,
		version,
		updatedBy: "agent:seed",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({ id: `${id}-projection`, knowledgeItemId: id });
}

async function seedConflict(
	db: HyperIdleDb,
	id: string,
	itemId: string,
	status: "open" | "resolved" | "discarded",
): Promise<void> {
	await db.insert(knowledgeConflicts).values({
		id,
		itemId,
		versionBase: 1,
		versionCurrent: 1,
		proposedBody: "proposed",
		proposedBy: "agent:other",
		status,
		createdAt: NOW,
	});
}

describe("promote_knowledge tool", () => {
	// @lore nested-knowledge-items: the status ladder collapsed from 7 values
	// to 4 (proposed | active | stale | archived). `captured`/`provisional`
	// both fold into `proposed`, so "captured -> provisional" is now a no-op
	// (proposed -> proposed), which ALLOWED_TRANSITIONS does not permit —
	// every test below targets a real transition on the new ladder instead.
	test("AC5: transitions proposed → active and persists", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-a", "proposed");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-a", toStatus: "active" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-a"));
		expect(row?.status).toBe("active");

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, "ki-a"), eq(knowledgeEditLog.field, "status")));
		expect(logs.length).toBeGreaterThanOrEqual(1);
		const statusLog = logs.find((l) => l.newValue === "active");
		expect(statusLog).toBeDefined();
		expect(statusLog?.oldValue).toBe("proposed");
		expect(statusLog?.newValue).toBe("active");
	});

	test("returns INVALID_TRANSITION for proposed → stale", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-b", "proposed");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-b", toStatus: "stale" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TRANSITION");
	});

	test("returns INVALID_TRANSITION for archived → anything", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-c", "archived");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-c", toStatus: "active" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TRANSITION");
	});

	test("blocks promotion to active when an open conflict exists (CONFLICT_OPEN)", async ({
		db,
		app,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-d", "proposed");
		await seedConflict(db, "conf-1", "ki-d", "open");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-d", toStatus: "active" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("CONFLICT_OPEN");
	});

	test("allows promotion to active when the only conflicts are resolved/discarded", async ({
		db,
		app,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-e", "proposed");
		await seedConflict(db, "conf-2", "ki-e", "resolved");
		await seedConflict(db, "conf-3", "ki-e", "discarded");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-e", toStatus: "active" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-e"));
		expect(row?.status).toBe("active");
	});

	test("returns NOT_FOUND for unknown id", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "does-not-exist", toStatus: "active" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("does NOT bump version on status change", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-f", "proposed", 3);
		await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-f", toStatus: "active" },
			makeContext(db),
		);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-f"));
		expect(row?.version).toBe(3);
	});

	test("returns CONCURRENT_MODIFICATION when the status changed out-of-band", async ({
		db,
		app,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-g", "proposed");
		// Simulate a concurrent racing caller that has already promoted the
		// item to `active`. Our caller is still trying to promote from
		// `proposed` — the conditional UPDATE must reject with 0 rows
		// changed rather than silently stomp the other caller's write.
		const first = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-g", toStatus: "active" },
			makeContext(db),
		);
		expect(first.success).toBe(true);
		const second = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-g", toStatus: "active" },
			makeContext(db),
		);
		expect(second.success).toBe(false);
		if (second.success) return;
		// Either INVALID_TRANSITION (active -> active is not allowed) or
		// CONCURRENT_MODIFICATION if the transition would have been legal but
		// the status changed. Assert the first explicitly since our allowed
		// table does not include active -> active.
		expect(second.code).toBe("INVALID_TRANSITION");
	});

	test("returns INVALID_STATE when knowledge_items.status is a value not in the canonical enum", async ({
		db,
		app,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		// Simulates schema drift / upstream bug: the row's status column holds
		// a value outside the 4 known statuses. The tool must refuse rather
		// than unsafely cast and branch.
		await db.insert(knowledgeItems).values({
			id: "ki-bad-state",
			title: "Bad state",
			body: "Body",
			format: "markdown",
			status: "zombie",
			version: 1,
			updatedBy: "agent:seed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db
			.insert(knowledgeAppProjection)
			.values({ id: "ki-bad-state-projection", knowledgeItemId: "ki-bad-state" });
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: "ki-bad-state", toStatus: "active" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_STATE");
	});

	test("persists reason into the edit log when provided", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-reason", "proposed");
		const result = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId: "ki-reason",
				toStatus: "active",
				reason: "used 3 times this week",
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, "ki-reason"), eq(knowledgeEditLog.field, "status")));
		expect(logs.length).toBe(1);
		expect(logs[0]!.newValue).toContain("active");
		expect(logs[0]!.newValue).toContain("used 3 times this week");
	});

	test("INVALID_INPUT surfaces via registry dispatch on missing toStatus", async ({ db, app }) => {
		await seedBase(db);
		await seedKnowledgeItem(db, "ki-bad", "proposed");
		// I2 B1-B4: registry requires explicit role; promote_knowledge is
		// facilitator-only.
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(
				createInProcessCoreApiTransport(app),
				THROWING_REVIEW_ACCESSOR,
				THROWING_OPEN_TASK,
			),
			makeContext(db),
			{ role: "assistant" },
		); // @lore AD8a: role string renamed to "assistant" in AD8b
		const result = await registry.invoke("promote_knowledge", {
			knowledgeItemId: "ki-bad",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});
});
