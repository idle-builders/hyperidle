/**
 * Integration tests for the `create_artifact` agent tool — new shape.
 *
 * The tool now writes a knowledge item parented to the current task or
 * calling thread, not an artifact row. Input is {title, body}; the tool
 * derives scope from context exactly the same way `write_memory` does.
 *
 * @lore artifacts-become-knowledge: create_artifact tool rewritten to write
 * knowledge_items. Old tests (artifact table, kind/preview, ArtifactCreatedEvent)
 * are fully replaced here.
 *
 * @lore crossing-table-write: agent-orchestration must not insert directly into
 * knowledgeItems (owned by core-api). The stub captures create() call arguments
 * in memory; assertions run against those captured args, not against a DB row.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { CreateKnowledgeItemRequest } from "@hyperidle/api-contract";
import { type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import * as task from "@hyperidle/task";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-09-02T00:00:00.000Z";

/**
 * Module-level mutable db handle the `coreApi` fakes close over —
 * assigned fresh per test in `beforeEach`.
 */
let sharedDb: HyperIdleDb;

/**
 * Per-test capture of the last `coreApi.create` call arguments.
 * Reset in `beforeEach`. Allows assertions on what the tool passed
 * without writing into a table owned by a different service.
 */
let capturedCreate: CreateKnowledgeItemRequest | null = null;

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		openTask: async (id: string) => {
			const row = await task.get(sharedDb, "task", id);
			return row ? { task: { parentTaskId: row.parentTaskId, teamId: row.teamId } } : undefined;
		},
		create: async (input) => {
			capturedCreate = input;
			return { id: "ki-fake-id", version: 1 };
		},
	},
};

const createArtifactTool = buildToolDefinitions(ports).find((t) => t.name === "create_artifact")!;

// --- Helpers ------------------------------------------------------------------

async function seed(db: HyperIdleDb): Promise<{ taskId: string }> {
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: NOW });
	await db.insert(tasks).values({
		id: "task-1",
		parentTaskId: null,
		teamId: "team-1",
		title: "Test task",
		description: null,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId: "task-1" };
}

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	overrides: { taskId?: string; threadId?: string } = {},
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: "session-ak",
		taskId: overrides.taskId ?? "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-ak-createartifact-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
		...(overrides.threadId !== undefined ? { threadId: overrides.threadId } : {}),
	};
}

// --- Tests --------------------------------------------------------------------

describe("create_artifact tool (knowledge item shape)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		capturedCreate = null;
		eventBus = new EventBus();
		await seed(db);
	});

	afterEach(async () => {
		await handle.close();
	});

	// -------------------------------------------------------------------- Happy path — task parent

	describe("task-parented item (ctx.taskId non-empty)", () => {
		it("calls create with parentKind=task and parentId=ctx.taskId", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Analysis report", body: "# Report\n\nAll tests passed." },
				makeContext(db, eventBus, { taskId: "task-1" }),
			);

			expect(result.success).toBe(true);
			expect(capturedCreate).not.toBeNull();
			expect(capturedCreate?.parentKind).toBe("task");
			expect(capturedCreate?.parentId).toBe("task-1");
			expect(capturedCreate?.title).toBe("Analysis report");
			expect(capturedCreate?.body).toContain("All tests passed");
		});

		it("calls create with status=proposed", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Plan", body: "Implementation plan" },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			expect(capturedCreate?.status).toBe("proposed");
		});

		it("resolves scope from task's teamId when ctx.teamId is absent", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Summary", body: "Task summary" },
				makeContext(db, eventBus, { taskId: "task-1" }),
			);

			expect(result.success).toBe(true);
			// task-1 belongs to team-1, so scopeKind=team, scopeId=team-1
			expect(capturedCreate?.scopeKind).toBe("team");
			expect(capturedCreate?.scopeId).toBe("team-1");
		});

		it("prefers ctx.taskId over ctx.threadId as parent", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Result", body: "The result" },
				makeContext(db, eventBus, { taskId: "task-1", threadId: "thread-99" }),
			);

			expect(result.success).toBe(true);
			expect(capturedCreate?.parentKind).toBe("task");
			expect(capturedCreate?.parentId).toBe("task-1");
		});
	});

	// -------------------------------------------------------------------- Happy path — thread parent

	describe("thread-parented item (ctx.taskId empty, ctx.threadId present)", () => {
		it("calls create with parentKind=thread and parentId=ctx.threadId", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Conversation output", body: "Generated content" },
				makeContext(db, eventBus, { taskId: "", threadId: "thread-42" }),
			);

			expect(result.success).toBe(true);
			expect(capturedCreate?.parentKind).toBe("thread");
			expect(capturedCreate?.parentId).toBe("thread-42");
		});
	});

	// -------------------------------------------------------------------- Error: no parent

	describe("no parent available", () => {
		it("returns an error when ctx.taskId is empty and ctx.threadId is absent", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Orphan", body: "No parent" },
				makeContext(db, eventBus, { taskId: "" }),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBeDefined();
		});
	});

	// -------------------------------------------------------------------- Input validation

	describe("input validation", () => {
		it("returns INVALID_INPUT when title is missing", async () => {
			const result = await createArtifactTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ body: "Some body" } as any,
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when body is missing", async () => {
			const result = await createArtifactTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ title: "Title only" } as any,
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when input is empty object", async () => {
			const result = await createArtifactTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("accepts title and body as the only required fields (no kind, label, preview)", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Valid item", body: "Valid body content" },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
		});
	});

	// -------------------------------------------------------------------- Return shape

	describe("return shape", () => {
		it("returns knowledgeItemId (not artifactId or kind)", async () => {
			const result = await createArtifactTool.handler(
				{ title: "Shape test", body: "Check the return shape" },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as Record<string, unknown>;
			expect("knowledgeItemId" in data).toBe(true);
			expect("artifactId" in data).toBe(false);
			expect("kind" in data).toBe(false);
		});
	});
});
