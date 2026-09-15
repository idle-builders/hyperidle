import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { THROWING_OPEN_TASK, THROWING_REVIEW_ACCESSOR } from "@hyperidle/agent-orchestration/testing";
import { type HyperIdleDb, knowledgeEditLog, knowledgeItems, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

/**
 * @lore nested-knowledge-items: full rewrite. `write_memory` dropped
 * `layer`/`kind`/`topic` with the vocabularies they carried, and the
 * layer-keyed authorisation gate (`NON_FACILITATOR_MAX_LAYER`/
 * `FACILITATOR_ROLES`) is DELETED WITH NOTHING REPLACING IT — founder
 * ruling: no authorisation checks; any agent may write anywhere its scope
 * reaches. The old "I6: non-facilitator restricted" describe block tested
 * exactly that gate and is deleted with it, not adapted.
 */

function buildWriteMemoryTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_REVIEW_ACCESSOR, THROWING_OPEN_TASK).find(
		(t) => t.name === "write_memory",
	)!;
}

const NOW = new Date().toISOString();

async function seedAgent(db: HyperIdleDb, id = "agent-a"): Promise<void> {
	await db.insert(users).values({
		id,
		name: "Agent A",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, agentId = "agent-a"): ToolContext<HyperIdleDb> {
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
		test("inserts a knowledge_items row with version 1", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
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
		});

		test("attributes updatedBy to `agent:<agentId>`", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
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

		test("creates an edit log entry with editType=create", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
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

		test("accepts optional format/status and applies defaults otherwise", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
					title: "Decision",
					body: "Why we chose X",
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
			expect(row?.format).toBe("markdown");
			expect(row?.status).toBe("proposed");
		});

		test("accepts explicit team scope with a scopeId", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
					title: "Team memory",
					body: "Product managers should keep specs small.",
					scopeKind: "team",
					scopeId: "team-pm",
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
			expect(row?.scopeKind).toBe("team");
			expect(row?.scopeId).toBe("team-pm");
		});

		test("user scope with no scopeId defaults to the writing agent", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
					title: "Private note",
					body: "Only I should see this.",
					scopeKind: "user",
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
			expect(row?.scopeKind).toBe("user");
			expect(row?.scopeId).toBe("agent-a");
		});

		// @lore nested-knowledge-items: product/practice/task/filesystem are all
		// retired scope kinds — the tool's `z.enum(SCOPE_KINDS)` rejects any of
		// them at the input boundary, same as the AU26 F2 filesystem ruling did.
		test("rejects a retired scope kind", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
					title: "Repo memory",
					body: "This decision belongs to the repo.",
					scopeKind: "practice",
					scopeId: "fe-practice",
				},
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
			expect(await db.select().from(knowledgeItems)).toEqual([]);
		});

		test("rejects team scope without the required scopeId", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				{
					title: "Missing team id",
					body: "No team id.",
					scopeKind: "team",
				},
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
			expect(result.error).toContain("scopeId is required");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT for missing title", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ body: "y" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for missing body", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "x" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for unknown scopeKind", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "x", body: "y", scopeKind: "bogus" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT for unknown format", async ({ db, app }) => {
			const writeMemoryTool = buildWriteMemoryTool(app);
			await seedAgent(db);
			const result = await writeMemoryTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "x", body: "y", format: "pdf" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
