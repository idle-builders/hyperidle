/**
 * nested-knowledge-items — the promote_knowledge tool's ALLOWED_TRANSITIONS
 * table runs against the collapsed four-value status ladder
 * (architecture.md §2): proposed | active | stale | archived. Migration
 * `0080` is full and destructive — every row is converted, so no legacy
 * value (draft/captured/provisional/validated/needs_human) can ever be read
 * back. `normalizeKnowledgeStatus` therefore has no legacy mapping to
 * perform; it only validates that a stored status is one of the four.
 *
 * Handler-level contract test, following merge-split-knowledge.test.ts's
 * pattern: fake `ToolHandlersPorts`, no DB. `ALLOWED_TRANSITIONS` and
 * `normalizeKnowledgeStatus` are module-private in tool-definitions.ts, so
 * the collapsed ladder is proven through the public handler contract — the
 * same seam every other tool-definitions test in this package uses.
 */
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const FAKE_DB = {} as unknown as HyperIdleDb;

function makeCtx(): ToolContext<HyperIdleDb> {
	return {
		db: FAKE_DB,
		eventBus: new EventBus(),
		agentId: "agent-1",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `promote-knowledge-status-collapse-${Date.now()}`),
		ingestion: { dispose: () => {} },
	};
}

function makePorts(currentStatus: string): ToolHandlersPorts {
	return {
		...STUB_TOOL_HANDLERS_PORTS,
		coreApi: {
			...STUB_TOOL_HANDLERS_PORTS.coreApi,
			findKnowledgeItemStatusById: async () => ({ status: currentStatus }),
			promoteKnowledgeItem: async () => ({ ok: true, fromStatus: currentStatus }),
		},
	};
}

function findPromoteTool(ports: ToolHandlersPorts) {
	const tool = buildToolDefinitions(ports).find((t) => t.name === "promote_knowledge");
	if (!tool) throw new Error("promote_knowledge tool not registered");
	return tool;
}

describe("promote_knowledge: ALLOWED_TRANSITIONS is proposed | active | stale | archived only", () => {
	it("a proposed item can be promoted to active", async () => {
		const tool = findPromoteTool(makePorts("proposed"));
		const result = await tool.handler({ knowledgeItemId: "ki-1", toStatus: "active" }, makeCtx());
		expect(result.success).toBe(true);
	});

	it("a legacy status value ('captured') is no longer a valid stored state and is rejected, not silently normalized", async () => {
		// Migration 0080 converts every row before this tool can ever read it,
		// so a live row reporting 'captured' means the read is stale or the
		// data is corrupt — either way it must not be treated as 'proposed'.
		const tool = findPromoteTool(makePorts("captured"));
		const result = await tool.handler({ knowledgeItemId: "ki-1", toStatus: "active" }, makeCtx());
		expect(result.success).toBe(false);
	});

	it("archived is terminal — no transition out of it is allowed", async () => {
		const tool = findPromoteTool(makePorts("archived"));
		const result = await tool.handler({ knowledgeItemId: "ki-1", toStatus: "active" }, makeCtx());
		expect(result.success).toBe(false);
	});
});
