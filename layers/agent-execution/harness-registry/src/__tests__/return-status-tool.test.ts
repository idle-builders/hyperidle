/**
 * Unit tests for the return_status bridge tool.
 *
 * The tool is a ToolDefinition injected into the per-session registry via
 * buildToolRegistry's extraTools option. It reads ctx.sessionId → enforcement
 * registry → { returned, exempt, forceCount, budgetLeft, forceMessage }.
 *
 * Key semantics:
 *   - returned=true OR exempt=true OR budgetLeft=0 → forceMessage: null (allow end)
 *   - returned=false AND !exempt AND budgetLeft>0 → forceMessage = FORCE_RETURN_MESSAGE
 *   - calling the tool with forceMessage!==null increments forceCount in registry
 *
 * WARN-F1: the tool handler must call shouldForceReturn(gate, forceCount) — the
 * shared adjudication function — so the closed return set stays HyperIdle-owned.
 *
 * Tests FAIL (red) until:
 *   - packages/server/src/tools/return-status-tool.ts is created (green phase Task 3)
 *   - return-enforcement-registry.ts is created (Task 2)
 *   - buildToolRegistry gains extraTools option (Task 3 wiring)
 */

import { FORCE_RETURN_MESSAGE, MAX_FORCE_RETURNS } from "@hyperidle/harness-protocol";
import { createReturnEnforcement } from "@hyperidle/harness-registry";
import { describe, expect, it } from "vitest";
import { returnStatusTool } from "../return-status-tool.js";

const createEnforcementRegistry = () => createReturnEnforcement();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal ToolContext for the return-status tool handler.
 * The handler only needs ctx.sessionId (and the enforcement registry via closure).
 */
function makeCtx(sessionId: string): Parameters<typeof returnStatusTool.handler>[1] {
	return {
		sessionId,
		agentId: "test-agent",
		taskId: "test-task",
		sandboxPath: "/tmp/test",
		// biome-ignore lint/suspicious/noExplicitAny: minimal stub for non-used fields
	} as any;
}

describe("return_status tool", () => {
	// ── Tool definition structure ─────────────────────────────────────────

	it("tool has name 'return_status'", () => {
		// FAILS red: returnStatusTool does not exist
		expect(returnStatusTool.name).toBe("return_status");
	});

	it("tool has a description", () => {
		expect(returnStatusTool.description.length).toBeGreaterThan(0);
	});

	it("tool inputSchema accepts empty object (no required args)", async () => {
		const parsed = returnStatusTool.inputSchema.safeParse({});
		expect(parsed.success).toBe(true);
	});

	// ── Handler: forceMessage when not returned and budget left ───────────

	it("returns forceMessage=FORCE_RETURN_MESSAGE when gate.returned=false and budget left", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };
		const sessionId = "test-session-force-1";

		registry.register(sessionId, { gate, forceCount: 0, exempt: false });

		// Wire the tool to use this registry instance.
		// FAILS red: returnStatusTool does not exist / registry not wired yet.
		const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		expect(result.success).toBe(true);
		if (result.success) {
			const data = result.data as Record<string, unknown>;
			expect(data.returned).toBe(false);
			expect(data.exempt).toBe(false);
			expect(data.forceCount).toBe(0);
			expect(data.budgetLeft).toBe(MAX_FORCE_RETURNS);
			expect(data.forceMessage).toBe(FORCE_RETURN_MESSAGE);
		}
	});

	it("calling the tool with forceMessage!==null increments forceCount in the registry", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };
		const sessionId = "test-session-force-2";

		registry.register(sessionId, { gate, forceCount: 0, exempt: false });

		// First call: forceMessage is non-null → registry increments forceCount
		await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		expect(registry.get(sessionId)?.forceCount).toBe(1);
	});

	it("calling the tool a second time decrements budgetLeft", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };
		const sessionId = "test-session-force-3";

		registry.register(sessionId, { gate, forceCount: 0, exempt: false });

		await returnStatusTool.handler({}, makeCtx(sessionId), registry);
		const result2 = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		if (result2.success) {
			const data = result2.data as Record<string, unknown>;
			expect(data.forceCount).toBe(1);
			expect(data.budgetLeft).toBe(MAX_FORCE_RETURNS - 1);
		}
	});

	// ── Handler: forceMessage=null when returned ──────────────────────────

	it("returns forceMessage=null when gate.returned=true", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: true };
		const sessionId = "test-session-returned-1";

		registry.register(sessionId, { gate, forceCount: 0, exempt: false });

		const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		if (result.success) {
			const data = result.data as Record<string, unknown>;
			expect(data.returned).toBe(true);
			expect(data.forceMessage).toBeNull();
		}
	});

	it("returns forceMessage=null when exempt=true", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };
		const sessionId = "test-session-exempt-1";

		registry.register(sessionId, { gate, forceCount: 0, exempt: true });

		const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		if (result.success) {
			const data = result.data as Record<string, unknown>;
			expect(data.exempt).toBe(true);
			expect(data.forceMessage).toBeNull();
		}
	});

	it("returns forceMessage=null when budget exhausted (forceCount>=MAX_FORCE_RETURNS)", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };
		const sessionId = "test-session-budget-1";

		// Start at max force count (budget exhausted)
		registry.register(sessionId, { gate, forceCount: MAX_FORCE_RETURNS, exempt: false });

		const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		if (result.success) {
			const data = result.data as Record<string, unknown>;
			expect(data.budgetLeft).toBe(0);
			expect(data.forceMessage).toBeNull();
		}
	});

	// ── Handler: unknown session ──────────────────────────────────────────

	it("returns an error (not forceMessage) for an unknown sessionId", async () => {
		const registry = createEnforcementRegistry();
		const sessionId = "unknown-session-xyz";

		// The tool should handle unknown sessions gracefully.
		// Could return forceMessage=null (allow end) or an error.
		// Either is acceptable; what's NOT acceptable is throwing.
		const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		// Must not throw.
		expect(result).toBeDefined();
	});

	// ── forceMessage content ──────────────────────────────────────────────

	it("forceMessage names all three return tools", async () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };
		const sessionId = "test-session-msg-1";

		registry.register(sessionId, { gate, forceCount: 0, exempt: false });

		const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

		if (result.success) {
			const data = result.data as Record<string, unknown>;
			const msg = data.forceMessage as string | null;
			expect(msg).not.toBeNull();
			if (msg) {
				expect(msg).toContain("submit_review");
				expect(msg).toContain("handoff_to");
				expect(msg).toContain("send_message");
			}
		}
	});

	// ── AU31 §2.5: the "injectable via buildToolRegistry extraTools" case
	// decomposed OUT of this file. `buildToolRegistry` relocated to
	// `@hyperidle/tool-handlers` (agent-orchestration), so the wiring
	// assertion moved with it — `tool-handlers/src/__tests__/tool-registry.
	// test.ts`'s "extraTools" case proves the same mechanism (a
	// `RegisteredTool` shaped exactly like `returnStatusTool.forRegistry`'s
	// output merges into the built registry) without a harness-registry
	// import. This file keeps every assertion about the tool's own behavior.

	// ── AU27 Increment 3 (Decision 3): requiredReturnActions-aware self-check ──

	describe("requiredReturnActions narrows the self-check", () => {
		it("forceMessage names 'reply' (not the trio) when the registered entry requires ['reply']", async () => {
			const registry = createEnforcementRegistry();
			const gate = { returned: false };
			const sessionId = "test-session-required-reply";
			registry.register(sessionId, {
				gate,
				forceCount: 0,
				exempt: false,
				requiredReturnActions: ["reply"],
			});

			const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as Record<string, unknown>;
			const msg = data.forceMessage as string | null;
			expect(msg).not.toBeNull();
			expect(msg).toContain("reply");
			expect(msg).not.toContain("submit_review");
		});

		it("no requiredReturnActions on the entry ⇒ byte-identical default trio message (unchanged)", async () => {
			const registry = createEnforcementRegistry();
			const gate = { returned: false };
			const sessionId = "test-session-no-required";
			registry.register(sessionId, { gate, forceCount: 0, exempt: false });

			const result = await returnStatusTool.handler({}, makeCtx(sessionId), registry);

			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as Record<string, unknown>;
			expect(data.forceMessage).toBe(FORCE_RETURN_MESSAGE);
		});
	});
});
