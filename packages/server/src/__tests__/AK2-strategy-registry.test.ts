/**
 * AK2 — Strategy registry contract tests (RED phase).
 *
 * AC2: The Kernel's dispatch-time contract with a Strategy is explicit and
 *      documented — a reader can state what the Kernel requires of any Strategy.
 *
 * These tests verify the registry's runtime contract:
 * - setActiveStrategy / getActiveStrategy round-trip (exactly one active Strategy).
 * - getActiveStrategy() throws when no Strategy is registered (fail-loud; a
 *   misboot is a bug, not a silent no-op — per plan §2).
 * - clearActiveStrategy() resets to unregistered state (test teardown helper).
 * - The registry accepts any Strategy<HyperIdleDb>-shaped object without importing
 *   a concrete Strategy itself (structural typing proves the open seam).
 *
 * These tests FAIL until packages/server/src/services/strategy-registry.ts is
 * created (green phase, build task #2).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	Strategy,
} from "@hyperidle/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
	clearActiveStrategy,
	getActiveStrategy,
	setActiveStrategy,
} from "../services/strategy-registry.js";

// ---------------------------------------------------------------------------
// In-test minimal Strategy — does NOT import @hyperidle/strategy-minimal.
// Proves that any conforming object satisfies the port (structural typing).
// ---------------------------------------------------------------------------

function makeInertStrategy(): Strategy<HyperIdleDb> {
	return {
		async assembleContext(
			_req: ContextAssemblyRequest<HyperIdleDb>,
		): Promise<ContextAssemblyOutcome> {
			return { itemCount: 0, durationMs: 0 };
		},
		beginLearningIngestion(_req: IngestionRequest<HyperIdleDb>): IngestionHandle {
			return { dispose() {} };
		},
		// AK6: scaffoldAgents stub — not implemented in registry tests (not under test here)
		async scaffoldAgents(_req) {
			return [];
		},
		// AK7: selectAgent stub — not implemented in registry tests (not under test here)
		async selectAgent(_req) {
			return { agentId: null };
		},
		// AK8: decomposeBet stub — not implemented in registry tests (not under test here)
		async decomposeBet(_req) {
			return { decomposerAgentId: null, tasks: [] };
		},
		// AR4b: formAssistant stub — not implemented in registry tests (not under test here)
		async formAssistant(_req) {
			return { persona: null, assistantDraftSurface: "standard" as const };
		},
	};
}

describe("strategy-registry", () => {
	afterEach(() => {
		clearActiveStrategy();
	});

	it("throws when no Strategy has been registered (fail-loud)", () => {
		// @lore AK2 §2: fail-loud is intentional — a missing registration is a
		// boot bug, not a recoverable state. A silent fallback would mask a wiring
		// regression where the Fabric should be active.
		expect(() => getActiveStrategy()).toThrow("No active Strategy registered");
	});

	it("returns the registered Strategy after setActiveStrategy", () => {
		const strategy = makeInertStrategy();
		setActiveStrategy(strategy);
		expect(getActiveStrategy()).toBe(strategy);
	});

	it("replaces the previously-registered Strategy on second setActiveStrategy", () => {
		const first = makeInertStrategy();
		const second = makeInertStrategy();
		setActiveStrategy(first);
		setActiveStrategy(second);
		expect(getActiveStrategy()).toBe(second);
	});

	it("clearActiveStrategy resets the registry (subsequent getActiveStrategy throws)", () => {
		setActiveStrategy(makeInertStrategy());
		clearActiveStrategy();
		expect(() => getActiveStrategy()).toThrow("No active Strategy registered");
	});

	it("the registered strategy satisfies the Strategy<HyperIdleDb> interface shape", () => {
		const strategy = makeInertStrategy();
		setActiveStrategy(strategy);
		const active = getActiveStrategy();
		// The interface requires exactly two methods.
		expect(typeof active.assembleContext).toBe("function");
		expect(typeof active.beginLearningIngestion).toBe("function");
	});
});
