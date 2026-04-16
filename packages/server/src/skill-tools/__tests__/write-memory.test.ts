import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, createTestDb, knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { setupFts } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../tool-registry.js";
import { writeMemoryTool } from "../write-memory.js";

function makeDb(): HyperIdleDb {
	const db = createTestDb();
	setupFts(db);
	return db;
}

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-d4-writemem-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("write_memory tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = makeDb();
	});

	describe("creates a knowledge item via fabric.create", () => {
		it("inserts a knowledge_items row with version 1", async () => {
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

			const row = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId))
				.get();
			expect(row?.layer).toBe("L3");
			expect(row?.kind).toBe("pattern");
			expect(row?.title).toBe("New practice");
			expect(row?.body).toBe("Always validate input at the boundary.");
		});

		it("attributes updatedBy to `agent:<agentId>`", async () => {
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
			const row = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId))
				.get();
			expect(row?.updatedBy).toBe("agent:agent-a");
		});

		it("creates an edit log entry with editType=create", async () => {
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
			const log = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, data.knowledgeItemId))
				.all();
			expect(log).toHaveLength(1);
			expect(log[0].editType).toBe("create");
			expect(log[0].editor).toBe("agent:agent-a");
		});

		it("accepts optional topic and format/status defaults", async () => {
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
			const row = db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, data.knowledgeItemId))
				.get();
			expect(row?.topic).toBe("architecture");
			expect(row?.format).toBeDefined();
			expect(row?.status).toBeDefined();
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("returns INVALID_INPUT for unknown layer", async () => {
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ layer: "L42", kind: "pattern", title: "x", body: "y" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT for missing title", async () => {
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ layer: "L3", kind: "pattern", body: "y" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT for unknown kind", async () => {
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
