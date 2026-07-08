import * as os from "node:os";
import * as path from "node:path";
import {
	type HyperIdleDb,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
	users,
} from "@hyperidle/db";
import { setupFts } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import type { ToolContext } from "../tool-registry.js";
import { writeMemoryTool } from "../write-memory.js";

const NOW = new Date().toISOString();

// @lore AD8c: role renamed from practice_facilitator to facilitator
async function seedFacilitator(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "agent-a",
		name: "Agent A",
		role: "facilitator",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

async function seedBuilder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "agent-builder",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, agentId = "agent-a"): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-writemem-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("write_memory tool", () => {
	describe("creates a knowledge item via fabric.create", () => {
		test("inserts a knowledge_items row with version 1", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "pattern",
					title: "New practice",
					body: "Always validate input at the boundary.",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { knowledgeItemId: string; version: number };
			expect(data.knowledgeItemId).toBeTruthy();
			expect(data.version).toBe(1);

			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId));
			expect(row?.title).toBe("New practice");
			expect(row?.body).toBe("Always validate input at the boundary.");
			// O2: layer and kind moved to knowledgeStrategyFabric
			const [fabricRow] = await db
				.select()
				.from(knowledgeStrategyFabric)
				.where(eq(knowledgeStrategyFabric.knowledgeItemId, data.knowledgeItemId));
			expect(fabricRow?.layer).toBe("L3");
			expect(fabricRow?.kind).toBe("pattern");
		});

		test("attributes updatedBy to `agent:<agentId>`", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "reflection",
					title: "Reflection",
					body: "What I learned.",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { knowledgeItemId: string };
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId));
			expect(row?.updatedBy).toBe("agent:agent-a");
		});

		test("creates an edit log entry with editType=create", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "pattern",
					title: "Pattern",
					body: "Body",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { knowledgeItemId: string };
			const log = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, data.knowledgeItemId));
			expect(log).toHaveLength(1);
			expect(log[0]!.editType).toBe("create");
			expect(log[0]!.editor).toBe("agent:agent-a");
		});

		test("accepts optional topic and format/status defaults", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L2",
					kind: "decision",
					title: "Decision",
					body: "Why we chose X",
					topic: "architecture",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { knowledgeItemId: string };
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId));
			expect(row?.topic).toBe("architecture");
			expect(row?.format).toBeDefined();
			expect(row?.status).toBeDefined();
		});

		test("accepts explicit practice scope with role id", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "pattern",
					title: "Role memory",
					body: "Product managers should keep specs small.",
					scopeKind: "practice",
					scopeId: "product_manager",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { knowledgeItemId: string };
			const [row] = await db
				.select({ scopeKind: knowledgeItems.scopeKind, scopeId: knowledgeItems.scopeId })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId));
			expect(row?.scopeKind).toBe("practice");
			expect(row?.scopeId).toBe("product_manager");
		});

		test("accepts explicit filesystem scope", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L2",
					kind: "decision",
					title: "Repo memory",
					body: "This decision belongs to the repo.",
					scopeKind: "filesystem",
					scopeId: "fs-main",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { knowledgeItemId: string };
			const [row] = await db
				.select({ scopeKind: knowledgeItems.scopeKind, scopeId: knowledgeItems.scopeId })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId));
			expect(row?.scopeKind).toBe("filesystem");
			expect(row?.scopeId).toBe("fs-main");
		});

		test("rejects explicit scoped writes without required scopeId", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "pattern",
					title: "Missing role id",
					body: "No role id.",
					scopeKind: "practice",
				},
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
			expect(result.error).toContain("scopeId is required");
		});
	});

	describe("I6: non-facilitator agents restricted to L0-L2", () => {
		test("builder agent writing L3 gets FORBIDDEN", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			await seedBuilder(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "pattern",
					title: "Forbidden pattern",
					body: "Should be rejected.",
				},
				makeContext(db, "agent-builder"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("FORBIDDEN");
			expect(result.error).toContain("insufficient role for L3");
		});

		test("builder agent writing L4 gets FORBIDDEN", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			await seedBuilder(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L4",
					kind: "principle",
					title: "Forbidden principle",
					body: "Should be rejected.",
				},
				makeContext(db, "agent-builder"),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("FORBIDDEN");
			expect(result.error).toContain("insufficient role for L4");
		});

		test("builder agent can write to L0", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			await seedBuilder(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L0",
					kind: "reflection",
					title: "Session note",
					body: "A builder can write L0.",
				},
				makeContext(db, "agent-builder"),
			);
			expect(result.success).toBe(true);
		});

		test("builder agent can write to L2", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			await seedBuilder(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L2",
					kind: "decision",
					title: "Product decision",
					body: "A builder can write L2.",
				},
				makeContext(db, "agent-builder"),
			);
			expect(result.success).toBe(true);
		});

		test("facilitator agent can write to L3", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L3",
					kind: "pattern",
					title: "Allowed pattern",
					body: "A facilitator can write L3.",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
		});

		test("facilitator agent can write to L4", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				{
					layer: "L4",
					kind: "principle",
					title: "Allowed principle",
					body: "A facilitator can write L4.",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT for unknown layer", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ layer: "L42", kind: "pattern", title: "x", body: "y" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for missing title", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ layer: "L3", kind: "pattern", body: "y" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for unknown kind", async ({ db }) => {
			await setupFts(db);
			await seedFacilitator(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ layer: "L3", kind: "rumor", title: "x", body: "y" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
