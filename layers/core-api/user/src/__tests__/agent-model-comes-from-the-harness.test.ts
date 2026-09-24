/**
 * A model the harness offers can be saved on an agent.
 *
 * The editor's model list comes from the harness itself — `haiku`, `opus`,
 * `gpt-5.6-sol`, `composer-2.5`, `openrouter/z-ai/glm-4.7-flash`, each in that
 * harness's own vocabulary. Saving one has to work, or step C of
 * agent → harness → model → settings is a dropdown that throws.
 *
 * It did not. `validateAgentConfig` checked an anthropic-provider model against
 * `MODEL_CATALOG` — a static list of four gateway ids (`claude-haiku-4-5`,
 * `claude-sonnet-4-6`, …) that predates harness-sourced discovery and contains
 * none of the names claude actually accepts. So the editor offered `haiku` and
 * the API answered `UNKNOWN_MODEL`.
 *
 * The check now asks the harness's own descriptor. When the harness publishes a
 * model list, the value must be one of them; when it publishes none — nothing
 * discovered, a probe that failed — anything passes. That asymmetry is
 * deliberate and is the same rule `model-options.ts` follows: an absent list
 * must never reject a value, or a failing probe silently blocks someone's
 * configuration.
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
	it("accepts claude's own name for a model, which no gateway catalog contains", () => {
		const reader = readerFor([
			descriptorWith("claude-code", ["sonnet", "opus", "haiku", "fable"], ["anthropic"]),
		]);
		expect(validateAgentConfig("claude-code", "anthropic", "haiku", reader)).toBeNull();
	});

	it("accepts a bracketed context variant claude lists", () => {
		const reader = readerFor([
			descriptorWith("claude-code", ["sonnet", "sonnet[1m]"], ["anthropic"]),
		]);
		expect(validateAgentConfig("claude-code", "anthropic", "sonnet[1m]", reader)).toBeNull();
	});

	it("accepts a provider-prefixed opencode id", () => {
		const reader = readerFor([
			descriptorWith("opencode", ["openrouter/z-ai/glm-4.7-flash", "big-pickle"]),
		]);
		expect(
			validateAgentConfig("opencode", null, "openrouter/z-ai/glm-4.7-flash", reader),
		).toBeNull();
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

	it("still rejects a harness that is not registered at all", () => {
		const reader = readerFor([descriptorWith("claude-code", ["haiku"], ["anthropic"])]);
		const error = validateAgentConfig("aider", "anthropic", "haiku", reader);
		expect(error?.code).toBe("UNKNOWN_HARNESS");
	});
});
