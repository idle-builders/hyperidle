/**
 * AF9 — AC3b: query_practice tool succeeds at runtime without manual setupFts.
 *
 * RED PHASE: This test fails until Task 3a migration creates `fts_vector`.
 *
 * The existing `query-practice.integration.test.ts` calls `setupFts` manually
 * before each test — that tests the manual-call path and is left untouched.
 * This test proves the migration path: the tool succeeds WITHOUT a manual
 * `setupFts` call, which is what AC3 requires for the production runtime.
 *
 * @lore AF9: The server fixture builds the DB via the drizzle migrator
 * (test-pool). If Task 3a migration exists, fts_vector is in the schema
 * and this test succeeds. Without the migration, ftsSearch throws "column
 * fts_vector does not exist" and this test fails for the right behavioral reason.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { create as createKnowledgeItem } from "@hyperidle/knowledge";
import { EventBus } from "@hyperidle/shared";
import { describe, expect, test } from "../test-fixtures.js";
import { queryPracticeTool } from "../tools/query-practice.js";
import type { ToolContext } from "../tools/tool-registry.js";

function makeContext(db: HyperIdleDb): ToolContext {
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
	test("queryPracticeTool returns success=true without manual setupFts call", async ({ db }) => {
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
	}) => {
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
