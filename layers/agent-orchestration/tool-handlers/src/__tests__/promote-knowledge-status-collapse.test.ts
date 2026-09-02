/**
 * nested-knowledge-items — the promote_knowledge tool's ALLOWED_TRANSITIONS
 * table collapses onto the four-value status ladder (architecture.md §2):
 * proposed | active | stale | archived. `captured` (a legacy value that
 * collapses into `proposed`, per the mapping table) must transition exactly
 * as `proposed` now does.
 *
 * Handler-level contract test, following merge-split-knowledge.test.ts's
 * pattern: fake `ToolHandlersPorts`, no DB. `ALLOWED_TRANSITIONS` and
 * `isAnyKnowledgeStatus` are module-private in tool-definitions.ts, so the
 * collapsed ladder is proven through the public handler contract — the same
 * seam every other tool-definitions test in this package uses.
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

describe("promote_knowledge: ALLOWED_TRANSITIONS collapses to proposed | active | stale | archived", () => {
	it("a proposed item can be promoted to active", async () => {
		const tool = findPromoteTool(makePorts("proposed"));
		const result = await tool.handler({ knowledgeItemId: "ki-1", toStatus: "active" }, makeCtx());
		expect(result.success).toBe(true);
	});

	it("'captured' — a legacy value the mapping collapses into 'proposed' — transitions to active exactly as 'proposed' now does", async () => {
		// AC: draft/captured/provisional -> proposed. A row an unmigrated read
		// still reports as 'captured' must be promotable straight to 'active',
		// the same as a 'proposed' row — not restricted to captured's old,
		// narrower ALLOWED_TRANSITIONS['captured'] = ['provisional'].
		const tool = findPromoteTool(makePorts("captured"));
		const result = await tool.handler({ knowledgeItemId: "ki-1", toStatus: "active" }, makeCtx());
		expect(result.success).toBe(true);
	});
});
