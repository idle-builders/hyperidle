/**
 * AF9 — AC3b: query_practice tool succeeds without manual FTS setup.
 *
 * RED PHASE: This test fails until Task 3a migration creates `fts_vector`.
 *
 * Search owns automatic, idempotent FTS initialization. This proves callers
 * need no public setup operation.
 *
 * @lore AF9: The server fixture builds the DB via the drizzle migrator
 * (test-pool). If Task 3a migration exists, fts_vector is in the schema
 * and this test succeeds. Without the migration, ftsSearch throws "column
 * fts_vector does not exist" and this test fails for the right behavioral reason.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { create as createKnowledgeItem } from "@hyperidle/knowledge";
import type { ToolContext } from "@hyperidle/tool-protocol";
import type { Hono } from "hono";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §3.2/B2: `query_practice` reaches `ports.coreApi.search` (the
 * seam) — the tool is built fresh per test off THIS test's own `app`
 * (`createInProcessCoreApiTransport`), never an ambient transport global.
 */
function buildQueryPracticeTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "query_practice",
	)!;
}

function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-af9-fts-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("AF9 AC3b: query_practice tool — migration path (no manual setupFts)", () => {
	test("queryPracticeTool returns success=true without manual setupFts call", async ({
		db,
		app,
	}) => {
		const queryPracticeTool = buildQueryPracticeTool(app);
		// Arrange: create items WITHOUT calling setupFts — the migration must have done it.
		await createKnowledgeItem(db, {
			layer: "L3",
			kind: "pattern",
			topic: "io",
			title: "L3 file handling practice",
			body: "Use streams when handling large files. file handling is best done lazily.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});
		await createKnowledgeItem(db, {
			layer: "L3",
			kind: "pattern",
			topic: "concurrency",
			title: "Concurrency guard",
			body: "Use locks carefully.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});

		// Act: invoke the tool — this calls ftsSearch internally which requires fts_vector.
		const result = await queryPracticeTool.handler({ query: "file handling" }, makeContext(db));

		// Assert: success (not a throw or error result).
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { items: Array<{ title: string; layer: string }> };
		expect(data.items.length).toBeGreaterThanOrEqual(1);
		expect(data.items.map((i) => i.title)).toContain("L3 file handling practice");
		// The concurrency item does not match "file handling".
		expect(data.items.map((i) => i.title)).not.toContain("Concurrency guard");
	});

	test("queryPracticeTool returns empty items for a zero-match query (not an error)", async ({
		db,
		app,
	}) => {
		const queryPracticeTool = buildQueryPracticeTool(app);
		await createKnowledgeItem(db, {
			layer: "L3",
			kind: "pattern",
			topic: "general",
			title: "Unrelated pattern",
			body: "This body has nothing to do with the query.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});

		const result = await queryPracticeTool.handler({ query: "xylophone" }, makeContext(db));

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { items: unknown[] };
		expect(Array.isArray(data.items)).toBe(true);
		expect(data.items.length).toBe(0);
	});
});
