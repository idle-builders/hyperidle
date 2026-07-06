/**
 * POLISH-060 — validateAgentConfig: provider-agnostic CLI harness fix.
 *
 * Root cause: validateAgentConfig called getCapabilitiesByType() which returns
 * adapter.getCapabilities().modelProviders = [] for CLI adapters (by design —
 * CLI is provider-agnostic). [].includes("anthropic") = false → spurious
 * "Supported: ." (empty list) error.
 *
 * Fix: treat empty modelProviders from registration metadata as "provider-agnostic
 * — no compatibility check". Use registration meta (not live capabilities) because
 * select() already uses meta.modelProviders and that is the authoritative source.
 */

import { describe, expect, it } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { validateAgentConfig } from "../routes/agents.js";

// ---------------------------------------------------------------------------
// Minimal stub adapter — implements only what AdapterPool.register() needs
// ---------------------------------------------------------------------------

function makeStubAdapter(providerList: string[]): import("@hyperidle/shared").HarnessAdapter {
	return {
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: providerList,
			mcpSupport: false,
			returnEnforcement: "none",
		}),
		startSession: () => Promise.resolve({ sessionId: "s1", adapter: null as never }),
		stopSession: () => Promise.resolve(),
		isSessionAlive: () => false,
		setSessionToolRegistry: () => {},
	} as unknown as import("@hyperidle/shared").HarnessAdapter;
}

/** Register an adapter with custom META modelProviders (independent of getCapabilities). */
function makePoolWith(
	harnessType: string,
	metaProviders: readonly string[],
	capabilitiesProviders: readonly string[],
): AdapterPool {
	const pool = new AdapterPool();
	pool.register(`id-${harnessType}`, makeStubAdapter([...capabilitiesProviders]), {
		name: harnessType,
		kind: "local",
		type: harnessType,
		modelProviders: [...metaProviders],
		maxConcurrent: 4,
	});
	return pool;
}

describe("validateAgentConfig — provider-agnostic CLI harness", () => {
	it("cli harness with empty meta.modelProviders and anthropic provider is valid", () => {
		// CLI adapters register with meta.modelProviders=[] (provider-agnostic/inherited-login).
		// Registration metadata uses [] for CLI — getCapabilities() also returns [].
		const pool = makePoolWith("claude-code", [], []);
		const result = validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", pool);
		expect(result).toBeNull();
	});

	it("cli harness with meta.modelProviders=['anthropic'] and anthropic provider is valid", () => {
		// Also valid when meta explicitly lists anthropic (as the actual registration does).
		const pool = makePoolWith("claude-code", ["anthropic"], []);
		const result = validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", pool);
		expect(result).toBeNull();
	});

	it("harness with non-empty provider list that excludes requested provider returns INCOMPATIBLE error with non-empty supported list", () => {
		// A harness that explicitly declares ["openrouter"] rejects "anthropic" — and the
		// error must name the supported providers (not an empty string).
		const pool = makePoolWith("openrouter-harness", ["openrouter"], ["openrouter"]);
		const result = validateAgentConfig("openrouter-harness", "anthropic", null, pool);
		expect(result).not.toBeNull();
		expect(result?.code).toBe("INCOMPATIBLE_HARNESS_MODEL");
		// Error message must contain a non-empty provider list
		expect(result?.error).toContain("openrouter");
	});

	it("INCOMPATIBLE_HARNESS_MODEL error message never ends with empty Supported list", () => {
		// Regression guard: broken path produced "Supported: ." (empty after colon+space).
		const pool = makePoolWith("openrouter-harness", ["openrouter"], ["openrouter"]);
		const result = validateAgentConfig("openrouter-harness", "anthropic", null, pool);
		if (result?.code === "INCOMPATIBLE_HARNESS_MODEL") {
			expect(result.error).not.toMatch(/Supported:\s*\./);
		}
	});

	it("unregistered harness type returns UNKNOWN_HARNESS error", () => {
		const pool = new AdapterPool(); // empty pool
		const result = validateAgentConfig("nonexistent-harness", "anthropic", null, pool);
		expect(result?.code).toBe("UNKNOWN_HARNESS");
	});

	it("null pool skips registry checks", () => {
		const result = validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", null);
		expect(result).toBeNull();
	});
});
