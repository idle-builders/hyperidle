/**
 * `validateAgentConfig` checks a model against the harness's OWN descriptor
 * (`describe().models`/`.modelProviders` — registration metadata, not live
 * capabilities), never a static gateway catalog: the editor's model list
 * comes from the harness itself (`haiku`, `sonnet[1m]`,
 * `openrouter/z-ai/glm-4.7-flash`, each in that harness's own vocabulary),
 * so the check has to accept whatever name the harness actually publishes.
 * An absent/empty model or provider list means "nothing to check against" —
 * a failed discovery probe must never block a save.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import { type HarnessCapabilityProbe, validateAgentConfig } from "../validate-agent-config.js";

function descriptorWith(
	harnessType: string,
	modelIds: readonly string[],
	modelProviders: readonly string[] = [],
): HarnessCapabilityDescriptor {
	return {
		type: harnessType,
		name: harnessType,
		kind: "local",
		authAction: { kind: "native_cli_login", label: "Log in" },
		discovery: { state: "ready" },
		models: modelIds.map((id) => ({
			id,
			label: id,
			contextWindow: 0,
			selectable: true,
			options: [],
		})),
		returnEnforcement: "none",
		modelProviders,
	};
}

function readerFor(descriptors: readonly HarnessCapabilityDescriptor[]): HarnessCapabilityProbe {
	return {
		describe: (options): HarnessCapabilityDescriptor[] =>
			options?.type ? descriptors.filter((d) => d.type === options.type) : [...descriptors],
	};
}

describe("an agent may be saved with a model its harness offers", () => {
	it.each([
		[
			"claude's own name, which no gateway catalog contains",
			"claude-code",
			["sonnet", "opus", "haiku", "fable"],
			["anthropic"],
			"anthropic",
			"haiku",
		],
		[
			"a bracketed context variant claude lists",
			"claude-code",
			["sonnet", "sonnet[1m]"],
			["anthropic"],
			"anthropic",
			"sonnet[1m]",
		],
		[
			"a provider-prefixed opencode id",
			"opencode",
			["openrouter/z-ai/glm-4.7-flash", "big-pickle"],
			[],
			null,
			"openrouter/z-ai/glm-4.7-flash",
		],
	] as const)("accepts %s", (_desc, harnessType, modelIds, modelProviders, provider, modelId) => {
		const reader = readerFor([descriptorWith(harnessType, modelIds, modelProviders)]);
		expect(validateAgentConfig(harnessType, provider, modelId, reader)).toBeNull();
	});

	it("rejects a model the chosen harness does not offer, and says which harness", () => {
		const reader = readerFor([descriptorWith("claude-code", ["sonnet", "haiku"], ["anthropic"])]);
		const error = validateAgentConfig("claude-code", "anthropic", "gpt-5.6-sol", reader);
		expect(error?.code).toBe("UNKNOWN_MODEL");
		expect(error?.error).toContain("claude-code");
	});

	it("accepts anything when the harness published no models", () => {
		// A probe that failed returns an empty list, indistinguishable from a
		// harness that manages its own models. Rejecting on that would let a
		// network hiccup block a save.
		const reader = readerFor([descriptorWith("cursor-agent", [])]);
		expect(validateAgentConfig("cursor-agent", null, "composer-2.5", reader)).toBeNull();
	});

	it("accepts anything when there is no pool to ask", () => {
		expect(validateAgentConfig("claude-code", "anthropic", "haiku", null)).toBeNull();
	});

	it("rejects a harness that is not registered at all", () => {
		const reader = readerFor([descriptorWith("claude-code", ["haiku"], ["anthropic"])]);
		const error = validateAgentConfig("aider", "anthropic", "haiku", reader);
		expect(error?.code).toBe("UNKNOWN_HARNESS");
	});
});

describe("provider compatibility comes from registration metadata, not live capabilities", () => {
	it("an empty registration provider list is provider-agnostic — any provider is accepted", () => {
		const reader = readerFor([descriptorWith("claude-code", [], [])]);
		expect(validateAgentConfig("claude-code", "anthropic", "claude-sonnet-4-6", reader)).toBeNull();
	});

	it("follows the REGISTRATION provider list even when live capabilities disagree", () => {
		// Registration says anthropic is supported; a live-capabilities read on
		// this same harness could answer something else entirely — the
		// validator must never consult that second source.
		const reader = readerFor([descriptorWith("claude-code", [], ["anthropic"])]);
		expect(validateAgentConfig("claude-code", "anthropic", null, reader)).toBeNull();
	});

	it("a harness with a non-empty provider list rejects one outside it, naming the supported providers", () => {
		const reader = readerFor([descriptorWith("openrouter-harness", [], ["openrouter"])]);
		const result = validateAgentConfig("openrouter-harness", "anthropic", null, reader);
		expect(result?.code).toBe("INCOMPATIBLE_HARNESS_MODEL");
		expect(result?.error).toContain("openrouter");
		expect(result?.error).not.toMatch(/Supported:\s*\./);
	});
});
