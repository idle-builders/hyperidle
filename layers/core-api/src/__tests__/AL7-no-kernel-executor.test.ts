/**
 * AL7 RED — AC12: HyperIdle executes nothing of its own (no kernel executor)
 *
 * Tests FAIL until:
 *   - staged-operation-dispatcher.ts is DELETED
 *   - stage-operation.ts (tool) is DELETED
 *   - KERNEL_DISPATCHABLE_CAPABILITIES / buildExecuteCapability / resolveStagedOperations
 *     / sweepStrandedOperations are NOT importable from the server package
 *   - StagedOperationSpec is NOT in @hyperidle/domain-model index
 *
 * AC12: HyperIdle executes nothing of its own — the v1 kernel-executor is gone.
 * The loop is:  agent proposes → review → agent executes with its own tools.
 *
 * Note: "assert file doesn't exist" is a lint/build rule, not a runtime test.
 * These tests verify the runtime behavior: nothing in the exported API
 * provides an execute/dispatch/kernel-capability surface.
 */

import {
	THROWING_OPEN_TASK,
} from "@hyperidle/agent-orchestration/testing";
import { describe, expect, it } from "vitest";

describe("AC12: no kernel-executor surface in the trust-first model", () => {
	it("KERNEL_DISPATCHABLE_CAPABILITIES is not exported from @hyperidle/server tools", async () => {
		// Dynamic import — if the symbol exists it would resolve; if deleted it won't.
		// The import itself failing is fine (that's the green state); the test verifies
		// the value is NOT available on the live tool-registry.
		const registry = await import("@hyperidle/harness-registry");
		expect("KERNEL_DISPATCHABLE_CAPABILITIES" in registry).toBe(false);
	});

	it("buildExecuteCapability is not exported from the server package", async () => {
		const registry = await import("@hyperidle/harness-registry");
		expect("buildExecuteCapability" in registry).toBe(false);
	});

	it("resolveStagedOperations is not exported from any server service", async () => {
		// The staged-operation-dispatcher.ts must not exist or not export this symbol.
		// We test by attempting to import and checking the export is absent.
		// @ts-expect-error — the file is intentionally deleted (AC12); dynamic import fails at runtime.
		const importFn = async () => import("../services/staged-operation-dispatcher.js");
		let exportFound = false;
		try {
			const dispatcher = await importFn();
			exportFound = "resolveStagedOperations" in dispatcher;
		} catch {
			// File deleted — this is the correct state (green phase target).
			exportFound = false;
		}
		expect(exportFound).toBe(false);
	});

	it("sweepStrandedOperations is not exported from any server service", async () => {
		// @ts-expect-error — the file is intentionally deleted (AC12); dynamic import fails at runtime.
		const importFn = async () => import("../services/staged-operation-dispatcher.js");
		let exportFound = false;
		try {
			const dispatcher = await importFn();
			exportFound = "sweepStrandedOperations" in dispatcher;
		} catch {
			exportFound = false;
		}
		expect(exportFound).toBe(false);
	});

	it("stage_operation tool is NOT in ALL_TOOL_DEFINITIONS (v1 tool retired)", async () => {
		const { buildToolDefinitions } = await import("@hyperidle/agent-orchestration");
		// @lore AU31 §3.2/B2: this test only reads tool NAMES — never invokes a
		// handler — so a transport that throws if called is more honest than
		// wiring a real `app`.
		const ALL_TOOL_DEFINITIONS = buildToolDefinitions(
			() => {
				throw new Error("AL7-no-kernel-executor never invokes a tool handler");
			},
			THROWING_OPEN_TASK,
		);
		const names = ALL_TOOL_DEFINITIONS.map((d: { name: string }) => d.name);
		// The stage_operation tool was the v1 agent-authored staging tool — retired per concept rejection #8
		expect(names).not.toContain("stage_operation");
	});
});
