import * as os from "node:os";
import * as path from "node:path";
import type { ToolContext } from "@hyperidle/agent-layer";
import { queryPracticeTool } from "@hyperidle/agent-layer";
import { create as createKnowledgeItem, setupFts } from "@hyperidle/core-app";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-query-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("query_practice tool", () => {
	describe("AC4: searches 'file handling' returns matching L3 practices", () => {
		test("returns L3 patterns whose body matches the query", async ({ db }) => {
			await setupFts(db);
			await createKnowledgeItem(db, {
				layer: "L3",
				kind: "pattern",
				topic: "io",
				title: "L3 file handling pattern",
				body: "Use streams when handling large files. file handling is best done lazily.",
				format: "markdown",
				status: "active",
				updatedBy: "human",
			});
			await createKnowledgeItem(db, {
				layer: "L3",
				kind: "pattern",
				topic: "io",
				title: "Concurrency pattern",
				body: "Use locks carefully.",
				format: "markdown",
				status: "active",
				updatedBy: "human",
			});

			const result = await queryPracticeTool.handler({ query: "file handling" }, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { items: Array<{ id: string; layer: string; title: string }> };
			expect(data.items.length).toBeGreaterThanOrEqual(1);
			const titles = data.items.map((i) => i.title);
			expect(titles).toContain("L3 file handling pattern");
			expect(titles).not.toContain("Concurrency pattern");
		});

		test("excludes L1 items by default (default layer filter is L3)", async ({ db }) => {
			await setupFts(db);
			await createKnowledgeItem(db, {
				layer: "L3",
				kind: "pattern",
				topic: "io",
				title: "L3 file handling",
				body: "file handling at the practice layer",
				format: "markdown",
				status: "active",
				updatedBy: "human",
			});
			await createKnowledgeItem(db, {
				layer: "L1",
				kind: "pattern",
				topic: "io",
				title: "L1 file handling",
				body: "file handling at the product layer",
				format: "markdown",
				status: "active",
				updatedBy: "human",
			});

			const result = await queryPracticeTool.handler({ query: "file handling" }, makeContext(db));
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { items: Array<{ layer: string; title: string }> };
			const layers = data.items.map((i) => i.layer);
			expect(layers).toContain("L3");
			expect(layers).not.toContain("L1");
		});

		test("returns empty list when no items match", async ({ db }) => {
			await setupFts(db);
			const result = await queryPracticeTool.handler(
				{ query: "nothing matches xyz" },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { items: unknown[] };
			expect(data.items).toEqual([]);
		});

		test("respects explicit layer override", async ({ db }) => {
			await setupFts(db);
			await createKnowledgeItem(db, {
				layer: "L1",
				kind: "pattern",
				topic: "io",
				title: "L1 file handling",
				body: "file handling at the product layer",
				format: "markdown",
				status: "active",
				updatedBy: "human",
			});
			const result = await queryPracticeTool.handler(
				{ query: "file handling", layer: "L1" },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { items: Array<{ layer: string }> };
			expect(data.items.length).toBeGreaterThanOrEqual(1);
			expect(data!.items[0]!.layer).toBe("L1");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when query is empty", async ({ db }) => {
			await setupFts(db);
			const result = await queryPracticeTool.handler({ query: "" }, makeContext(db));
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when layer is not a known layer", async ({ db }) => {
			await setupFts(db);
			const result = await queryPracticeTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ query: "x", layer: "L99" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
