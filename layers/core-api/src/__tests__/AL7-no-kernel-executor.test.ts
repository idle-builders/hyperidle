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
	DOCUMENT_ACTIONS,
	PLATFORM_ACTIONS,
	SESSION_ACTIONS,
	TASK_ACTIONS,
	THREAD_ACTIONS,
	USER_ACTIONS,
} from "@hyperidle/domain-model";
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

	it("stage_operation tool is NOT among the declared actions (v1 tool retired)", () => {
		// @lore BC5 T11: `buildToolDefinitions` (the hand-written management
		// catalog) is DELETED with the `CoreApiPort` seam it wrote through —
		// every tool an agent reaches today is the composed action list's own
		// projection, declared here directly with no DB/orchestration wiring
		// needed to read the name set.
		const names = [
			...Object.keys(TASK_ACTIONS),
			...Object.keys(THREAD_ACTIONS),
			...Object.keys(DOCUMENT_ACTIONS),
			...Object.keys(USER_ACTIONS),
			...Object.keys(PLATFORM_ACTIONS),
			...Object.keys(SESSION_ACTIONS),
		];
		// The stage_operation tool was the v1 agent-authored staging tool — retired per concept rejection #8
		expect(names).not.toContain("stage_operation");
	});
});
