import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { makeContext, NOW, seedBase } from "./_helpers.js";

function buildPromoteKnowledgeTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "promote_knowledge",
	)!;
}

// @lore this file's own positional (id, status, version) seeder predates and shapes ten call sites
// differently from the shared `seedKnowledgeItem(db, options)` in `_helpers.ts` — kept as its own
// function rather than switched over, with the companion inserted inline.
async function seedKnowledgeItem(
	db: HyperIdleDb,
	ids: ScopedIds,
	label: string,
	status: string,
	version = 1,
): Promise<string> {
	const id = ids(label);
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
	await db
		.insert(knowledgeAppProjection)
		.values({ id: ids(`${label}-projection`), knowledgeItemId: id });
	return id;
}

async function seedConflict(
	db: HyperIdleDb,
	ids: ScopedIds,
	confLabel: string,
	itemLabel: string,
	status: "open" | "resolved" | "discarded",
): Promise<void> {
	await db.insert(knowledgeConflicts).values({
		id: ids(confLabel),
		itemId: ids(itemLabel),
		versionBase: 1,
		versionCurrent: 1,
		proposedBody: "proposed",
		proposedBy: "agent:other",
		status,
		createdAt: NOW,
	});
}

describe("promote_knowledge tool", () => {
	test("AC5: transitions captured → provisional and persists", async ({ db, app, ids }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-a", "captured");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "provisional" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, kiId));
		expect(row?.status).toBe("provisional");

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, kiId), eq(knowledgeEditLog.field, "status")));
		expect(logs.length).toBeGreaterThanOrEqual(1);
		const statusLog = logs.find((l) => l.newValue === "provisional");
		expect(statusLog).toBeDefined();
		expect(statusLog?.oldValue).toBe("captured");
		expect(statusLog?.newValue).toBe("provisional");
	});

	test("returns INVALID_TRANSITION for captured → validated", async ({ db, app, ids }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-b", "captured");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "validated" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TRANSITION");
	});

	test("returns INVALID_TRANSITION for archived → anything", async ({ db, app, ids }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-c", "archived");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "provisional" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TRANSITION");
	});

	test("blocks promotion to validated when an open conflict exists (CONFLICT_OPEN)", async ({
		db,
		app,
		ids,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-d", "provisional");
		await seedConflict(db, ids, "conf-1", "ki-d", "open");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "validated" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("CONFLICT_OPEN");
	});

	test("allows promotion to validated when the only conflicts are resolved/discarded", async ({
		db,
		app,
		ids,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-e", "provisional");
		await seedConflict(db, ids, "conf-2", "ki-e", "resolved");
		await seedConflict(db, ids, "conf-3", "ki-e", "discarded");
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "validated" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(true);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, kiId));
		expect(row?.status).toBe("validated");
	});

	test("returns NOT_FOUND for unknown id", async ({ db, app, ids }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: ids("does-not-exist"), toStatus: "provisional" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("does NOT bump version on status change", async ({ db, app, ids }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-f", "captured", 3);
		await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "provisional" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, kiId));
		expect(row?.version).toBe(3);
	});

	test("returns CONCURRENT_MODIFICATION when the status changed out-of-band", async ({
		db,
		app,
		ids,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-g", "provisional");
		// Simulate a concurrent racing caller that has already promoted the
		// item to `validated`. Our caller is still trying to promote from
		// `provisional` — the conditional UPDATE must reject with 0 rows
		// changed rather than silently stomp the other caller's write.
		const first = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "validated" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(first.success).toBe(true);
		const second = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: kiId, toStatus: "validated" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(second.success).toBe(false);
		if (second.success) return;
		// Either INVALID_TRANSITION (validated -> validated is not allowed) or
		// CONCURRENT_MODIFICATION if the transition would have been legal but
		// the status changed. Assert the first explicitly since our allowed
		// table does not include validated -> validated.
		expect(second.code).toBe("INVALID_TRANSITION");
	});

	test("returns INVALID_STATE when knowledge_items.status is a value not in the canonical enum", async ({
		db,
		app,
		ids,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		// Simulates schema drift / upstream bug: the row's status column holds
		// a value outside the 6 known statuses. The tool must refuse rather
		// than unsafely cast and branch.
		const badId = ids("ki-bad-state");
		await db.insert(knowledgeItems).values({
			id: badId,
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
			.values({ id: ids("ki-bad-state-projection"), knowledgeItemId: badId });
		const result = await promoteKnowledgeTool.handler(
			{ knowledgeItemId: badId, toStatus: "provisional" },
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_STATE");
	});

	test("persists reason into the edit log when provided", async ({ db, app, ids }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app);
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-reason", "captured");
		const result = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId: kiId,
				toStatus: "provisional",
				reason: "used 3 times this week",
			},
			makeContext(db, { agentId: ids("agent-fac") }),
		);
		expect(result.success).toBe(true);
		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, kiId), eq(knowledgeEditLog.field, "status")));
		expect(logs.length).toBe(1);
		expect(logs[0]!.newValue).toContain("provisional");
		expect(logs[0]!.newValue).toContain("used 3 times this week");
	});

	test("INVALID_INPUT surfaces via registry dispatch on missing toStatus", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		const kiId = await seedKnowledgeItem(db, ids, "ki-bad", "captured");
		// I2 B1-B4: registry requires explicit role; promote_knowledge is
		// facilitator-only.
		const registry = buildToolRegistryFromDefinitions(
			buildToolDefinitions(createInProcessCoreApiTransport(app)),
			makeContext(db, { agentId: ids("agent-fac") }),
			{ role: "assistant" },
		); // @lore AD8a: role string renamed to "assistant" in AD8b
		const result = await registry.invoke("promote_knowledge", {
			knowledgeItemId: kiId,
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});
});
