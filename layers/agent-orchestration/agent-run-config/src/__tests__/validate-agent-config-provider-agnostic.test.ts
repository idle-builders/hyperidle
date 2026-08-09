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
 *
 * @lore AU26 G1: this file moved from `layers/core-api/src/__tests__/` with
 * `validateAgentConfig` itself (architecture §D-L: the validator moves with the
 * columns it validates). It used to build its fixture from a REAL `AdapterPool`;
 * an `agent-orchestration` package may not import `@hyperidle/harness-registry`
 * (Mechanism B, `execution-boundary-guard`), so the fixture is now a structural
 * `HarnessCapabilityReader`. This is the SAME resolution AU26 A2 already applied
 * when it moved `harness-capability-read-model.ts` into `shared`: the
 * reader-vs-real-pool anti-drift link lives in the surviving
 * `const reader: HarnessCapabilityReader = pool` assertion in
 * `core-api/src/services/__tests__/harness-capability-read-model.test.ts`, not in
 * every consumer's fixture. What this file asserts is unchanged: that
 * `validateAgentConfig` reads REGISTRATION metadata (`describe().modelProviders`)
 * and not live capabilities, and that an empty list means provider-agnostic.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { HarnessCapabilityFilter, HarnessCapabilityReader } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { validateAgentConfig } from "../validate-agent-config.js";

// ---------------------------------------------------------------------------
// Structural reader fixture — the four members `HarnessCapabilityReader` names
// ---------------------------------------------------------------------------

function makeDescriptor(
	harnessType: string,
	metaProviders: readonly string[],
	capabilitiesProviders: readonly string[],
): HarnessCapabilityDescriptor {
	return {
		type: harnessType,
		name: harnessType,
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: { kind: "native_cli_login", label: "Log in" },
		discovery: { state: "ready" },
		models: [],
		runtime: {
			// The LIVE capability list — deliberately allowed to diverge from
			// `modelProviders` below, which is the REGISTRATION list. That
			// divergence is the whole POLISH-060 root cause.
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: capabilitiesProviders,
			fileEditing: false,
			toolUse: false,
		},
		returnEnforcement: "none",
		modelProviders: metaProviders,
	};
}

/** A reader holding one registered harness with an explicit meta / capabilities split. */
function makeReaderWith(
	harnessType: string,
	metaProviders: readonly string[],
	capabilitiesProviders: readonly string[],
): HarnessCapabilityReader {
	const descriptor = makeDescriptor(harnessType, metaProviders, capabilitiesProviders);
	return makeReader([descriptor]);
}

function makeReader(descriptors: readonly HarnessCapabilityDescriptor[]): HarnessCapabilityReader {
	return {
		size: descriptors.length,
		list: () => [],
		describe: (options?: HarnessCapabilityFilter) =>
			descriptors.filter((d) => options?.type === undefined || d.type === options.type).slice(),
		refresh: () => Promise.resolve(),
	};
}

describe("validateAgentConfig — provider-agnostic CLI harness", () => {
	it("cli harness with empty meta.modelProviders and anthropic provider is valid", () => {
		// CLI adapters register with meta.modelProviders=[] (provider-agnostic/inherited-login).
		// Registration metadata uses [] for CLI — getCapabilities() also returns [].
		const reader = makeReaderWith("claude-code", [], []);
		const result = validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", reader);
		expect(result).toBeNull();
	});

	it("cli harness with meta.modelProviders=['anthropic'] and anthropic provider is valid", () => {
		// Also valid when meta explicitly lists anthropic (as the actual registration does).
		const reader = makeReaderWith("claude-code", ["anthropic"], []);
		const result = validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", reader);
		expect(result).toBeNull();
	});

	it("reads the REGISTRATION provider list, not the live capability list", () => {
		// The POLISH-060 divergence itself: registration says anthropic is supported,
		// live capabilities say the harness is provider-agnostic ([]). The validator
		// must follow registration — the same source `select()` uses.
		const reader = makeReaderWith("claude-code", ["anthropic"], ["openrouter"]);
		expect(validateAgentConfig("claude-code", "anthropic", null, reader)).toBeNull();
		expect(validateAgentConfig("claude-code", "openrouter", null, reader)?.code).toBe(
			"INCOMPATIBLE_HARNESS_MODEL",
		);
	});

	it("harness with non-empty provider list that excludes requested provider returns INCOMPATIBLE error with non-empty supported list", () => {
		// A harness that explicitly declares ["openrouter"] rejects "anthropic" — and the
		// error must name the supported providers (not an empty string).
		const reader = makeReaderWith("openrouter-harness", ["openrouter"], ["openrouter"]);
		const result = validateAgentConfig("openrouter-harness", "anthropic", null, reader);
		expect(result).not.toBeNull();
		expect(result?.code).toBe("INCOMPATIBLE_HARNESS_MODEL");
		// Error message must contain a non-empty provider list
		expect(result?.error).toContain("openrouter");
	});

	it("INCOMPATIBLE_HARNESS_MODEL error message never ends with empty Supported list", () => {
		// Regression guard: broken path produced "Supported: ." (empty after colon+space).
		const reader = makeReaderWith("openrouter-harness", ["openrouter"], ["openrouter"]);
		const result = validateAgentConfig("openrouter-harness", "anthropic", null, reader);
		if (result?.code === "INCOMPATIBLE_HARNESS_MODEL") {
			expect(result.error).not.toMatch(/Supported:\s*\./);
		}
	});

	it("unregistered harness type returns UNKNOWN_HARNESS error", () => {
		const reader = makeReader([]); // empty pool
		const result = validateAgentConfig("nonexistent-harness", "anthropic", null, reader);
		expect(result?.code).toBe("UNKNOWN_HARNESS");
	});

	it("null pool skips registry checks", () => {
		const result = validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", null);
		expect(result).toBeNull();
	});
});
